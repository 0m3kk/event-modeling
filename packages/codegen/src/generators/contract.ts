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
  /**
   * `"managed"` (default) files are recorded in the manifest and protected from
   * silent clobbering. `"create-only"` files are written once (when missing) and
   * then owned by the project: never overwritten, recorded or reported as drift.
   */
  ownership?: "managed" | "create-only";
}

export interface GeneratorContext {
  crate: IrCrate;
  config: CodegenConfig;
}

export interface Generator {
  name: GeneratorName;
  generate(ctx: GeneratorContext): RenderJob[];
}
