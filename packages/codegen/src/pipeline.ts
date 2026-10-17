/**
 * The generation pipeline.
 *
 *   load config -> read + parse spec -> hoist types -> build IR -> run passes
 *   -> plan render jobs -> render templates -> stamp banner -> rustfmt
 *   -> write + manifest
 *
 * `run` is the single entry point used by the CLI and by tests.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { hoistTypes, parseSpecification } from "@em/spec";
import type { IrContext } from "./config";
import { planJobs } from "./generators";
import { buildIr } from "./ir/build";
import { loadConfig, type LoadedConfig } from "./load";
import { hashContent, readManifest, writeManifest, type Manifest } from "./manifest";
import { withBanner } from "./postprocess/banner";
import { formatRust, rustfmtAvailable } from "./postprocess/rustfmt";
import { builtinTemplatesDir, createRenderEnv } from "./render/env";

export interface GeneratedFile {
  /** Path relative to the file's base directory, POSIX-separated. */
  path: string;
  content: string;
  /** Base directory the path is relative to: the generated crate or the workspace root. */
  base: "out" | "root";
  /** Whether the file is manifest-managed or project-owned (create-only). */
  ownership: "managed" | "create-only";
}

export interface RunOptions {
  /** Directory to search for the config file. */
  cwd: string;
  /** Explicit config path. */
  configPath?: string;
  /** Override the spec path from the config. */
  specOverride?: string;
  /** Override the output directory from the config. */
  outOverride?: string;
  /** Render everything but write nothing. */
  dryRun?: boolean;
  /** Do not write; report files that are missing or out of date. */
  check?: boolean;
  /** Overwrite files that were edited since the last run. */
  force?: boolean;
  /** Override `config.rustfmt`. */
  rustfmt?: boolean;
  log?: (message: string) => void;
}

export interface RunResult {
  config: LoadedConfig;
  files: GeneratedFile[];
  written: string[];
  unchanged: string[];
  /** Files left alone because they were edited by hand (use `--force`). */
  skipped: string[];
  /** Files that differ from disk under `--check`. */
  drifted: string[];
}

async function writeFileEnsured(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

/** Stable key for a file across both output roots (crate-relative out files keep their path). */
function fileKey(base: "out" | "root", outPath: string): string {
  return base === "out" ? outPath : `@root/${outPath}`;
}

/** Runs the full pipeline. */
export async function run(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? (() => {});
  const loaded = await loadConfig({ cwd: options.cwd, configPath: options.configPath });
  const { config } = loaded;

  const specPath = options.specOverride
    ? path.resolve(options.cwd, options.specOverride)
    : loaded.specPath;
  const outDir = options.outOverride
    ? path.resolve(options.cwd, options.outOverride)
    : loaded.outDir;
  const rootDir = loaded.configDir;

  const source = await fs.readFile(specPath, "utf8");
  const spec = parseSpecification(source);
  const { spec: hoisted, types } = hoistTypes(spec);
  const { crate, typeMap } = buildIr({ spec: hoisted, types, config });

  // Lowering passes are the scriptable extension point over the IR.
  const irContext: IrContext = { crateName: crate.name, typeMap };
  let finalCrate = crate;
  for (const pass of config.passes ?? []) finalCrate = pass(finalCrate, irContext);

  const jobs = planJobs({ crate: finalCrate, config });

  const searchPaths = [...loaded.templatesDirs, builtinTemplatesDir];
  const renderEnv = createRenderEnv({ searchPaths, filters: config.filters });

  const byKey = new Map<string, GeneratedFile>();
  for (const job of jobs) {
    const base = job.base ?? "out";
    const outPath = job.outPath.split(path.sep).join("/");
    let content = renderEnv.render(job.template, job.context);
    if (!content.endsWith("\n")) content += "\n";
    content = withBanner(outPath, content);
    const key = fileKey(base, outPath);
    byKey.set(key, {
      path: outPath,
      content,
      base,
      ownership: job.ownership ?? "managed",
    });
  }

  let files = Array.from(byKey.values()).sort((a, b) => {
    if (a.base !== b.base) return a.base.localeCompare(b.base);
    return a.path.localeCompare(b.path);
  });

  const wantRustfmt = options.rustfmt ?? config.rustfmt ?? true;
  const hasRust = files.some((file) => file.path.endsWith(".rs"));
  if (wantRustfmt && hasRust) {
    if (rustfmtAvailable()) {
      files = files.map((file) =>
        file.path.endsWith(".rs")
          ? { ...file, content: formatRust(file.content, finalCrate.edition) }
          : file,
      );
    } else {
      log("rustfmt not found on PATH; writing unformatted Rust.");
    }
  }

  const result: RunResult = {
    config: loaded,
    files,
    written: [],
    unchanged: [],
    skipped: [],
    drifted: [],
  };

  if (options.dryRun) return result;

  const absFor = (file: GeneratedFile): string =>
    path.join(file.base === "out" ? outDir : rootDir, file.path);

  if (options.check) {
    for (const file of files) {
      // Create-only files are owned by the project; they are never checked.
      if (file.ownership === "create-only") continue;
      let existing: string | undefined;
      try {
        existing = await fs.readFile(absFor(file), "utf8");
      } catch {
        existing = undefined;
      }
      if (existing !== file.content) result.drifted.push(fileKey(file.base, file.path));
    }
    return result;
  }

  const manifest = await readManifest(loaded.manifestFile);
  const next: Manifest = { version: 1, files: {} };

  for (const file of files) {
    const key = fileKey(file.base, file.path);
    const abs = absFor(file);
    const newHash = hashContent(file.content);
    let existing: string | undefined;
    try {
      existing = await fs.readFile(abs, "utf8");
    } catch {
      existing = undefined;
    }

    if (file.ownership === "create-only") {
      // Write once, then the project owns it. Never recorded, never reported.
      if (existing === undefined) {
        await writeFileEnsured(abs, file.content);
        result.written.push(key);
      }
      continue;
    }

    if (existing === undefined) {
      await writeFileEnsured(abs, file.content);
      next.files[key] = newHash;
      result.written.push(key);
      continue;
    }

    if (hashContent(existing) === newHash) {
      next.files[key] = newHash;
      result.unchanged.push(key);
      continue;
    }

    const recorded = manifest.files[key];
    if (recorded && hashContent(existing) !== recorded && !options.force) {
      // Edited by hand since the last run: leave it, keep the old record.
      next.files[key] = recorded;
      result.skipped.push(key);
      continue;
    }

    await writeFileEnsured(abs, file.content);
    next.files[key] = newHash;
    result.written.push(key);
  }

  await writeManifest(loaded.manifestFile, next);
  return result;
}
