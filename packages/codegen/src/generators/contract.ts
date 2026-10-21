/**
 * Generator contracts.
 *
 * A generator turns part of the IR into a list of {@link RenderJob}s. A job
 * names a template, an output path (relative to the crate root) and the
 * context to render it with. Generators never touch the filesystem — the
 * pipeline renders and writes.
 */
import type { GeneratorName, CodegenConfig } from "../config";
import type { IrCrate } from "../ir/types";

/**
 * How the pipeline treats a file that already exists on disk.
 *
 *  - `"overwrite"` (default): generator-owned. Regenerated on every run, with a
 *    do-not-edit banner. Hand edits are protected by the manifest unless
 *    `--force` is used. Project-specific code belongs in an extension file.
 *  - `"merge"`: generator-owned but expected to be edited. A three-way merge
 *    (`git merge-file`) replays the generator's changes on top of the project's
 *    edits and leaves conflict markers when both touched the same lines.
 *  - `"create-only"`: written once, then owned entirely by the project. Never
 *    overwritten, recorded or reported as drift.
 */
export type FileStrategy = "overwrite" | "merge" | "create-only";

export interface RenderJob {
  /** Template path within the render search paths. */
  template: string;
  /** Output path relative to the job's base directory, POSIX-separated. */
  outPath: string;
  /** Data passed to the template. */
  context: Record<string, unknown>;
  /**
   * Where `outPath` is resolved from. `"out"` (default) is the generated crate
   * directory (`config.out`), `"root"` is the directory holding the config
   * (the workspace root when scaffolding is enabled).
   */
  base?: "out" | "root";
  /** Existing-file handling. Defaults to `"overwrite"`. */
  strategy?: FileStrategy;
  /**
   * Extra line appended to an overwrite banner, e.g. pointing at the extension
   * module project code should use instead of editing the generated file.
   */
  bannerHint?: string;
}

export interface GeneratorContext {
  crate: IrCrate;
  config: CodegenConfig;
}

export interface Generator {
  name: GeneratorName;
  generate(ctx: GeneratorContext): RenderJob[];
}
