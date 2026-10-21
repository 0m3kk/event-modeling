/**
 * The generation pipeline.
 *
 *   load config -> read + parse spec -> hoist types -> build IR -> run passes
 *   -> plan render jobs -> render templates -> stamp banner -> rustfmt
 *   -> write (overwrite / 3-way merge / create-only) + manifest
 *
 * `run` is the single entry point used by the CLI and by tests.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { hoistTypes, parseSpecification } from "@em/spec";
import { listBaseline, readBaseline, removeBaseline, writeBaseline } from "./baseline";
import type { IrContext } from "./config";
import { planJobs } from "./generators";
import type { FileStrategy } from "./generators/contract";
import { buildIr } from "./ir/build";
import { loadConfig, type LoadedConfig } from "./load";
import { hashContent, readManifest, writeManifest, type Manifest } from "./manifest";
import { hasConflictMarkers, merge3 } from "./merge";
import { withBanner } from "./postprocess/banner";
import { formatRust, rustfmtAvailable } from "./postprocess/rustfmt";
import { builtinTemplatesDir, createRenderEnv } from "./render/env";

export interface GeneratedFile {
  /** Path relative to the file's base directory, POSIX-separated. */
  path: string;
  content: string;
  /** Base directory the path is relative to: the generated crate or the workspace root. */
  base: "out" | "root";
  /** How an existing file is handled. */
  strategy: FileStrategy;
  /** Extra banner line for overwrite files (where project code belongs). */
  bannerHint?: string;
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
  /** Overwrite files that were edited since the last run; take the generated version of merge files. */
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
  /** Merge files updated cleanly, keeping project edits. */
  merged: string[];
  /** Merge files written with `<<<<<<<` markers that need resolving. */
  conflicted: string[];
  /** Merge files kept because no merge base exists yet (use `--force` to adopt). */
  unbased: string[];
  /** Merge files kept because the merge tool failed (see the log). */
  unmerged: string[];
  /** Generator-owned core files deleted because the spec no longer emits them. */
  removed: string[];
  /** Files that exist on disk but are no longer generated. Scaffold files are kept. */
  orphaned: string[];
}

async function writeFileEnsured(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

/** Stable key for a file across both output roots (crate-relative out files keep their path). */
function fileKey(base: "out" | "root", outPath: string): string {
  return base === "out" ? outPath : `@root/${outPath}`;
}

/** Removes `dir` and its now-empty parents, stopping at (and keeping) `stopDir`. */
async function pruneEmptyDirs(startDir: string, stopDir: string): Promise<void> {
  let dir = startDir;
  const boundary = stopDir.endsWith(path.sep) ? stopDir : stopDir + path.sep;
  while (dir.startsWith(boundary)) {
    try {
      await fs.rmdir(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
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
    const strategy = job.strategy ?? "overwrite";
    let content = renderEnv.render(job.template, job.context);
    if (!content.endsWith("\n")) content += "\n";
    content = withBanner(outPath, content, strategy, job.bannerHint);
    const key = fileKey(base, outPath);
    byKey.set(key, {
      path: outPath,
      content,
      base,
      strategy,
      bannerHint: job.bannerHint,
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

  /**
   * Formats a merged file before it is written, so generated lines inserted by
   * a clean merge end up with the same layout as the rest of the generated
   * code. Conflict files are skipped: rustfmt cannot parse the markers.
   */
  const formatMerged = (content: string, relPath: string, conflicts: number): string =>
    conflicts === 0 && wantRustfmt && relPath.endsWith(".rs")
      ? formatRust(content, finalCrate.edition)
      : content;

  const result: RunResult = {
    config: loaded,
    files,
    written: [],
    unchanged: [],
    skipped: [],
    drifted: [],
    merged: [],
    conflicted: [],
    unbased: [],
    unmerged: [],
    removed: [],
    orphaned: [],
  };

  if (options.dryRun) return result;

  const absFor = (file: GeneratedFile): string =>
    path.join(file.base === "out" ? outDir : rootDir, file.path);

  const previous = await readManifest(loaded.manifestFile);
  const currentKeys = new Set(files.map((file) => fileKey(file.base, file.path)));

  if (options.check) {
    let mergeFailureLogged = false;
    for (const file of files) {
      // Create-only files are owned by the project; they are never checked.
      if (file.strategy === "create-only") continue;
      const key = fileKey(file.base, file.path);
      const existing = await readIfExists(absFor(file));

      if (file.strategy === "overwrite") {
        if (existing !== file.content) result.drifted.push(key);
        continue;
      }

      if (existing === undefined) {
        result.drifted.push(key);
        continue;
      }
      if (hasConflictMarkers(existing)) {
        result.drifted.push(key);
        result.conflicted.push(key);
        continue;
      }
      const base = await readBaseline(loaded.configDir, file.base, file.path);
      if (base === undefined) {
        // No merge base (fresh workspace or CI without .codegen/): cannot tell
        // whether the project edited the file, so leave it out of the check.
        result.unbased.push(key);
        continue;
      }
      if (existing === file.content || base === file.content) continue;
      if (existing === base) {
        result.drifted.push(key);
        continue;
      }

      const merged = await merge3(existing, base, file.content);
      if (!merged.ok) {
        if (!mergeFailureLogged) {
          log(merged.reason);
          mergeFailureLogged = true;
        }
        result.unmerged.push(key);
        continue;
      }
      if (merged.conflicts > 0) {
        result.drifted.push(key);
        result.conflicted.push(key);
      } else if (formatMerged(merged.content, file.path, merged.conflicts) !== existing) {
        result.drifted.push(key);
      }
    }

    // A generator-owned core file that is no longer emitted is drift too.
    for (const key of Object.keys(previous.files)) {
      if (currentKeys.has(key) || key.startsWith("@root/")) continue;
      if ((await readIfExists(path.join(outDir, key))) !== undefined) {
        result.drifted.push(key);
      }
    }
    return result;
  }

  const next: Manifest = { version: 1, files: {} };
  let mergeFailureLogged = false;
  const noteMergeFailure = (reason: string): void => {
    if (mergeFailureLogged) return;
    mergeFailureLogged = true;
    log(reason);
  };

  for (const file of files) {
    const key = fileKey(file.base, file.path);
    const abs = absFor(file);
    const newHash = hashContent(file.content);
    const existing = await readIfExists(abs);

    if (file.strategy === "create-only") {
      // Write once, then the project owns it. Never recorded, never reported.
      if (existing === undefined) {
        await writeFileEnsured(abs, file.content);
        result.written.push(key);
      }
      continue;
    }

    if (file.strategy === "merge") {
      if (existing === undefined) {
        await writeFileEnsured(abs, file.content);
        await writeBaseline(loaded.configDir, file.base, file.path, file.content);
        next.files[key] = newHash;
        result.written.push(key);
        continue;
      }

      if (options.force) {
        // --force means "trust the generator": discard project edits and seed
        // the baseline with the new output.
        if (existing === file.content) {
          await writeBaseline(loaded.configDir, file.base, file.path, file.content);
          next.files[key] = newHash;
          result.unchanged.push(key);
        } else {
          await writeFileEnsured(abs, file.content);
          await writeBaseline(loaded.configDir, file.base, file.path, file.content);
          next.files[key] = newHash;
          result.written.push(key);
        }
        continue;
      }

      const base = await readBaseline(loaded.configDir, file.base, file.path);
      if (base === undefined) {
        // No base to merge against: never guess. The project can adopt the new
        // generated content explicitly with --force.
        result.unbased.push(key);
        if (previous.files[key]) next.files[key] = previous.files[key];
        continue;
      }

      if (existing === file.content) {
        await writeBaseline(loaded.configDir, file.base, file.path, file.content);
        next.files[key] = newHash;
        result.unchanged.push(key);
        continue;
      }

      if (base === file.content) {
        // The generator did not change this file; keep the project's edits.
        next.files[key] = newHash;
        result.unchanged.push(key);
        continue;
      }

      if (existing === base) {
        // Fast-forward: the project never touched the file, so the new
        // generated content can replace it without invoking the merge tool.
        await writeFileEnsured(abs, file.content);
        await writeBaseline(loaded.configDir, file.base, file.path, file.content);
        next.files[key] = newHash;
        result.written.push(key);
        continue;
      }

      const merged = await merge3(existing, base, file.content);
      if (!merged.ok) {
        noteMergeFailure(merged.reason);
        result.unmerged.push(key);
        if (previous.files[key]) next.files[key] = previous.files[key];
        continue;
      }

      await writeFileEnsured(
        abs,
        formatMerged(merged.content, file.path, merged.conflicts),
      );
      await writeBaseline(loaded.configDir, file.base, file.path, file.content);
      next.files[key] = newHash;
      if (merged.conflicts > 0) result.conflicted.push(key);
      else result.merged.push(key);
      continue;
    }

    // Overwrite: generator-owned. The manifest protects hand edits, and a new
    // command/query in the spec is expected to replace these files wholesale.
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

    const recorded = previous.files[key];
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

  // Files that the spec no longer emits. Core output is generator-owned, so an
  // untouched stale file is removed; scaffold code belongs to the project and
  // is only reported (and its merge base retained, so re-adding the item can
  // restore the project's implementation).
  for (const key of Object.keys(previous.files)) {
    if (currentKeys.has(key)) continue;
    if (key.startsWith("@root/")) {
      const rel = key.slice("@root/".length);
      if ((await readIfExists(path.join(rootDir, rel))) !== undefined) {
        result.orphaned.push(key);
        // Keep the record so the file is reported again on the next run (and
        // dropped automatically if the project deletes it).
        next.files[key] = previous.files[key];
      } else {
        await removeBaseline(loaded.configDir, "root", rel);
      }
      continue;
    }
    const abs = path.join(outDir, key);
    const existing = await readIfExists(abs);
    if (existing === undefined) continue;
    const recorded = previous.files[key];
    if (recorded && hashContent(existing) !== recorded && !options.force) {
      result.orphaned.push(key);
      next.files[key] = recorded;
      continue;
    }
    await fs.rm(abs, { force: true });
    await pruneEmptyDirs(path.dirname(abs), outDir);
    result.removed.push(key);
  }

  // A baseline without a manifest record can still be a stale scaffold merge
  // file (for example after an interrupted run). Report it while the file still
  // exists; clean up the base when the project deleted it.
  for (const relPath of await listBaseline(loaded.configDir, "root")) {
    const key = fileKey("root", relPath);
    if (currentKeys.has(key)) continue;
    if ((await readIfExists(path.join(rootDir, relPath))) !== undefined) {
      result.orphaned.push(key);
    } else {
      await removeBaseline(loaded.configDir, "root", relPath);
    }
  }

  result.orphaned = Array.from(new Set(result.orphaned)).sort();
  await writeManifest(loaded.manifestFile, next);
  return result;
}
