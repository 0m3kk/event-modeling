/**
 * The generator's configuration contract, authored in `codegen.config.ts`.
 *
 * `defineConfig` is a typed identity helper: it exists so editors can autocomplete
 * and check the file, and so the config can `import { defineConfig } from
 * "@em/codegen"` without pulling in any runtime side effects.
 */
import type { IrCrate } from "./ir/types";

export type GeneratorName =
  | "cargo"
  | "lib"
  | "types"
  | "events"
  | "commands"
  | "queries"
  | "views"
  | "states"
  | "services"
  | "api";

/** A crate dependency, rendered into `Cargo.toml`. */
export interface DepSpec {
  name: string;
  /** Registry version, e.g. `"0.1"`. Ignored when `path` or `git` is set. */
  version?: string;
  /** Local path dependency, relative to the generated `Cargo.toml`. */
  path?: string;
  /** Git repository URL, e.g. `"https://github.com/0m3kk/backend-kit.git"`. */
  git?: string;
  /** Git branch to pin. */
  branch?: string;
  /** Git tag to pin. */
  tag?: string;
  /** Git revision to pin. */
  rev?: string;
  features?: string[];
}

export interface CrateOptions {
  /** Package name. Defaults to the spec name in snake_case. */
  name?: string;
  /** Rust edition. Defaults to `2024`. */
  edition?: string;
  /** Package version. Defaults to `0.1.0`. */
  version?: string;
  /** Extra dependencies, merged with the ones detected from the IR. */
  deps?: DepSpec[];
}

/** Either a bare on/off switch or an options object for a generator. */
export type GeneratorConfig = boolean | ({ enabled?: boolean } & Record<string, unknown>);

/** Options for the HTTP API generator (axum transport + OpenAPI). */
export interface ApiGeneratorConfig {
  enabled?: boolean;
  /** HTTP framework. Only `"axum"` is supported. Defaults to `"axum"`. */
  framework?: "axum";
  /** Route prefix applied to every generated route. Defaults to `"/api"`. */
  prefix?: string;
  /**
   * Generate the utoipa `ToSchema` derives and the OpenAPI document.
   * Defaults to `true`.
   */
  openapi?: boolean;
}

/** A Nunjucks filter: `value | myFilter(arg)`. */
export type FilterFn = (...args: unknown[]) => unknown;

/** Context handed to IR lowering passes and custom render helpers. */
export interface IrContext {
  crateName: string;
  typeMap: Record<string, string>;
}

/** A lowering pass: receives the crate IR and returns a (possibly new) crate IR. */
export type IrPass = (crate: IrCrate, ctx: IrContext) => IrCrate;

export interface CodegenConfig {
  /** Path to the spec file, relative to this config file. */
  spec: string;
  /** Output directory for the generated crate, relative to this config file. */
  out: string;
  crate?: CrateOptions;
  /** Primitive type mapping, e.g. `{ string: "String", integer: "i64" }`. */
  typeMap?: Record<string, string>;
  /** Toggle or configure each built-in generator. */
  generators?: Omit<Partial<Record<GeneratorName, GeneratorConfig>>, "api"> & {
    api?: boolean | ApiGeneratorConfig;
  };
  /** Directory of user templates, searched before the built-in ones. */
  templatesDir?: string;
  /** Run `rustfmt` over generated `.rs` files. Defaults to true. */
  rustfmt?: boolean;
  /** Custom Nunjucks filters, available in every template. */
  filters?: Record<string, FilterFn>;
  /** Custom IR lowering passes, run after the built-in build. */
  passes?: IrPass[];
}

/** Typed identity helper for `codegen.config.ts`. */
export function defineConfig(config: CodegenConfig): CodegenConfig {
  return config;
}
