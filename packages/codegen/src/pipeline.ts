/**
 * The generation pipeline.
 *
 *   load config -> read + parse spec -> hoist types -> build IR -> run passes
 *   -> plan render jobs -> render templates -> rustfmt -> write + manifest
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
import { formatRust, rustfmtAvailable } from "./postprocess/rustfmt";
import { builtinTemplatesDir, createRenderEnv } from "./render/env";

export interface GeneratedFile {
  /** Path relative to the crate root, POSIX-separated. */
  path: string;
  content: string;
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

  const byPath = new Map<string, GeneratedFile>();
  for (const job of jobs) {
    const outPath = job.outPath.split(path.sep).join("/");
    let content = renderEnv.render(job.template, job.context);
    if (!content.endsWith("\n")) content += "\n";
    byPath.set(outPath, { path: outPath, content });
  }

  let files = Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));

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

  if (options.check) {
    for (const file of files) {
      const abs = path.join(outDir, file.path);
      let existing: string | undefined;
      try {
        existing = await fs.readFile(abs, "utf8");
      } catch {
        existing = undefined;
      }
      if (existing !== file.content) result.drifted.push(file.path);
    }
    return result;
  }

  const manifest = await readManifest(loaded.manifestFile);
  const next: Manifest = { version: 1, files: {} };

  for (const file of files) {
    const abs = path.join(outDir, file.path);
    const newHash = hashContent(file.content);
    let existing: string | undefined;
    try {
      existing = await fs.readFile(abs, "utf8");
    } catch {
      existing = undefined;
    }

    if (existing === undefined) {
      await writeFileEnsured(abs, file.content);
      next.files[file.path] = newHash;
      result.written.push(file.path);
      continue;
    }

    if (hashContent(existing) === newHash) {
      next.files[file.path] = newHash;
      result.unchanged.push(file.path);
      continue;
    }

    const recorded = manifest.files[file.path];
    if (recorded && hashContent(existing) !== recorded && !options.force) {
      // Edited by hand since the last run: leave it, keep the old record.
      next.files[file.path] = recorded;
      result.skipped.push(file.path);
      continue;
    }

    await writeFileEnsured(abs, file.content);
    next.files[file.path] = newHash;
    result.written.push(file.path);
  }

  await writeManifest(loaded.manifestFile, next);
  return result;
}
