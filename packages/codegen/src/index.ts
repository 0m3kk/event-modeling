/**
 * `@em/codegen` — public API.
 *
 * Everything the config file and embedders need: the typed config contract,
 * the IR types, the pipeline entry point and the generator/render building
 * blocks. Kept free of CLI side effects so it can be imported from a config.
 */
export * from "./config";
export * from "./ir/types";
export {
  buildIr,
  renderRustType,
  artifactDomain,
  DEFAULT_TYPE_MAP,
  COMMON_MODULE,
  KIND_FOLDER,
  DOMAINS_FOLDER,
} from "./ir/build";
export * from "./generators";
export * from "./render/env";
export { run, type GeneratedFile, type RunOptions, type RunResult } from "./pipeline";
export { loadConfig, findConfigFile, type LoadedConfig } from "./load";
export { hashContent, readManifest, writeManifest, type Manifest } from "./manifest";
export { ejectTemplates } from "./eject";
export { builtinTemplatesPath, defaultConfigSource, initConfig, newTemplate } from "./scaffold";
