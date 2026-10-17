/**
 * The generator registry.
 *
 * Built-in generators are looked up by name and toggled through config. The
 * `v1` surface is intentionally small and declarative — a generator maps IR to
 * render jobs — but the interface is the seam where a future plugin system
 * would add new generators.
 */
import type { CodegenConfig, GeneratorName } from "../config";
import { apiGenerator } from "./api";
import { cargoGenerator } from "./cargo";
import { commandsGenerator } from "./commands";
import { eventsGenerator } from "./events";
import { libGenerator } from "./lib";
import { queriesGenerator } from "./queries";
import { servicesGenerator } from "./services";
import { statesGenerator } from "./states";
import { typesGenerator } from "./types";
import { viewsGenerator } from "./views";
import type { Generator, GeneratorContext, RenderJob } from "./contract";

/** Every built-in generator, keyed by name. */
export const generators: Record<GeneratorName, Generator> = {
  cargo: cargoGenerator,
  lib: libGenerator,
  types: typesGenerator,
  events: eventsGenerator,
  commands: commandsGenerator,
  queries: queriesGenerator,
  views: viewsGenerator,
  states: statesGenerator,
  services: servicesGenerator,
  api: apiGenerator,
};

/** Which generators run when the config does not say. */
export const DEFAULT_ENABLED: Record<GeneratorName, boolean> = {
  cargo: true,
  lib: true,
  types: true,
  events: true,
  commands: true,
  queries: false,
  views: false,
  states: false,
  services: false,
  api: false,
};

/** Stable generation order (also roughly the reading order of the crate). */
const ORDER: GeneratorName[] = [
  "cargo",
  "lib",
  "types",
  "events",
  "commands",
  "queries",
  "views",
  "states",
  "services",
  "api",
];

/** Resolves which generators are enabled from the config. */
export function resolveEnabled(config: CodegenConfig): Set<GeneratorName> {
  const enabled = new Set<GeneratorName>();
  for (const name of ORDER) {
    const setting = config.generators?.[name];
    if (typeof setting === "boolean") {
      if (setting) enabled.add(name);
    } else if (setting && typeof setting === "object") {
      if (setting.enabled !== false) enabled.add(name);
    } else if (DEFAULT_ENABLED[name]) {
      enabled.add(name);
    }
  }
  return enabled;
}

/** Plans every render job for the enabled generators, in stable order. */
export function planJobs(ctx: GeneratorContext): RenderJob[] {
  const enabled = resolveEnabled(ctx.config);
  const jobs: RenderJob[] = [];
  for (const name of ORDER) {
    if (!enabled.has(name)) continue;
    jobs.push(...generators[name].generate(ctx));
  }
  return jobs;
}

export * from "./contract";
