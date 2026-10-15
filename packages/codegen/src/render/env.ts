/**
 * Nunjucks environment setup for template rendering.
 *
 * Templates are plain `.njk` files. Rendering is synchronous and
 * deterministic: no timestamps, no randomness, no auto-escaping (the output is
 * Rust, not HTML). User templates are searched before the built-in ones, so a
 * file with the same name shadows the default.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import nunjucks from "nunjucks";
import {
  camelCase,
  kebabCase,
  pascalCase,
  snakeCase,
} from "@em/spec";
import type { FilterFn } from "../config";

/** Directory holding the templates shipped with the tool. */
export const builtinTemplatesDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../templates",
);

/** Renders a value as one or more `///` Rust doc lines (empty when absent). */
function docComment(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => `/// ${line}`.trimEnd())
    .join("\n");
}

/** Renders a value as one or more `//!` inner (module-level) doc lines. */
function innerDocComment(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => `//! ${line}`.trimEnd())
    .join("\n");
}

/** Filters registered in every environment (and re-exported for reuse). */
export const builtinFilters: Record<string, FilterFn> = {
  snake: (value: unknown) => snakeCase(value as string),
  pascal: (value: unknown) => pascalCase(value as string),
  camel: (value: unknown) => camelCase(value as string),
  kebab: (value: unknown) => kebabCase(value as string),
  doccomment: (value: unknown) => docComment(value),
  innerdoc: (value: unknown) => innerDocComment(value),
  /** `['a','b'] | joinlines` -> `a\nb`. */
  joinlines: (value: unknown) =>
    Array.isArray(value) ? value.join("\n") : String(value ?? ""),
};

export interface CreateRenderEnvOptions {
  /** Directories searched in order; earlier paths win. */
  searchPaths: string[];
  /** Extra filters from the config, merged over the built-ins. */
  filters?: Record<string, FilterFn>;
}

export interface RenderEnv {
  env: nunjucks.Environment;
  /** Renders `template` (a path within the search paths) against `context`. */
  render(template: string, context: unknown): string;
}

/** Builds a configured Nunjucks environment. */
export function createRenderEnv({ searchPaths, filters }: CreateRenderEnvOptions): RenderEnv {
  const loader = new nunjucks.FileSystemLoader(searchPaths, { noCache: true });
  const env = new nunjucks.Environment(loader, {
    autoescape: false,
    trimBlocks: false,
    lstripBlocks: false,
    throwOnUndefined: false,
  });

  for (const [name, filter] of Object.entries(builtinFilters)) {
    env.addFilter(name, filter as (...args: unknown[]) => unknown);
  }
  for (const [name, filter] of Object.entries(filters ?? {})) {
    env.addFilter(name, filter as (...args: unknown[]) => unknown);
  }

  return {
    env,
    render(template, context) {
      return env.render(template, context as object);
    },
  };
}
