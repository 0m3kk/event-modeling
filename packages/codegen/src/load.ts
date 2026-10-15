/**
 * Loads and resolves `codegen.config.ts`.
 *
 * The config is TypeScript, read through `jiti` so no build step is needed.
 * Every path in the config is resolved relative to the config file, not the
 * process cwd, so the tool behaves the same wherever it is invoked from.
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import type { CodegenConfig } from "./config";

const CONFIG_NAMES = [
  "codegen.config.ts",
  "codegen.config.mts",
  "codegen.config.js",
  "codegen.config.mjs",
  "codegen.config.cjs",
];

export interface LoadedConfig {
  config: CodegenConfig;
  /** Absolute path of the config file. */
  configPath: string;
  /** Directory containing the config file; path base for spec/out/templates. */
  configDir: string;
  /** Absolute path of the spec file. */
  specPath: string;
  /** Absolute output directory of the crate. */
  outDir: string;
  /** Absolute template directories, user first, built-in searched by the env. */
  templatesDirs: string[];
  /** Absolute path of the manifest file. */
  manifestFile: string;
}

/** Finds a config file in `dir`, or returns undefined. */
export function findConfigFile(dir: string): string | undefined {
  for (const name of CONFIG_NAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function assertString(value: unknown, field: string, configPath: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${configPath}: \`${field}\` must be a non-empty string`);
  }
}

export interface LoadConfigOptions {
  /** Directory to search for the config file. */
  cwd: string;
  /** Explicit config path (relative to cwd or absolute). */
  configPath?: string;
}

/** Loads, validates and path-resolves the config file. */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const configPath = options.configPath
    ? path.resolve(options.cwd, options.configPath)
    : findConfigFile(options.cwd);

  if (!configPath || !fs.existsSync(configPath)) {
    throw new Error(
      `No codegen config found in ${options.cwd}. Run \`em-codegen init\` to create one.`,
    );
  }

  const jiti = createJiti(configPath, { interopDefault: true });
  const mod = (await jiti.import(configPath)) as
    | (CodegenConfig & { default?: CodegenConfig })
    | undefined;
  const config = (mod?.default ?? mod) as CodegenConfig | undefined;

  if (!config || typeof config !== "object") {
    throw new Error(`${configPath}: expected a default export of a config object`);
  }
  assertString(config.spec, "spec", configPath);
  assertString(config.out, "out", configPath);

  const configDir = path.dirname(configPath);
  const specPath = path.resolve(configDir, config.spec);
  const outDir = path.resolve(configDir, config.out);

  const templatesDirs: string[] = [];
  if (config.templatesDir) templatesDirs.push(path.resolve(configDir, config.templatesDir));
  templatesDirs.push(path.resolve(configDir, ".codegen", "templates"));

  return {
    config,
    configPath,
    configDir,
    specPath,
    outDir,
    templatesDirs,
    manifestFile: path.resolve(configDir, ".codegen", "manifest.json"),
  };
}
