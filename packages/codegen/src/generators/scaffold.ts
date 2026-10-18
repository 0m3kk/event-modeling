/**
 * Scaffolds the repository around the generated contract crate.
 *
 * When `config.scaffold.enabled` is set, this generator emits a Cargo
 * workspace: a workspace `Cargo.toml`, an application crate (the command,
 * query, state, view and service implementations) and a server binary crate.
 *
 * Every file the scaffold emits is **create-only** (see {@link RenderJob}):
 * written once, when missing, and from then on owned by the project. The
 * generator never overwrites or reports them, so re-running `em-codegen gen`
 * leaves an existing workspace untouched. New files (a handler stub for a
 * command just added to the spec) are still created.
 */
import type { CodegenConfig, DepSpec, ScaffoldCrateConfig } from "../config";
import type { IrArtifact, IrCrate } from "../ir/types";
import { planRoutes, resolveApiOptions } from "./api";
import type { Generator, RenderJob } from "./contract";
import path from "node:path";

/** Resolved scaffold options. */
interface ScaffoldOptions {
  workspace: boolean;
  app: boolean;
  server: boolean;
  templates: boolean;
  stubs: string;
  appCrate: string;
  serverCrate: string;
  appDeps: DepSpec[];
  serverDeps: DepSpec[];
}

/** Resolves the scaffold options from the config, or `undefined` when off. */
function resolveScaffold(config: CodegenConfig, crate: IrCrate): ScaffoldOptions | undefined {
  const setting = config.scaffold;
  if (!setting || setting.enabled !== true) return undefined;

  const app = setting.app;
  const server = setting.server;
  const appOn = app === undefined ? true : app !== false;
  const serverOn = server === undefined ? true : server !== false;
  const appOptions: ScaffoldCrateConfig = typeof app === "object" ? app : {};
  const serverOptions: ScaffoldCrateConfig = typeof server === "object" ? server : {};

  return {
    workspace: setting.workspace !== false,
    app: appOn,
    server: serverOn,
    templates: setting.templates === true,
    stubs: setting.stubs === "unimplemented" ? "unimplemented" : "todo",
    appCrate: appOptions.crate?.trim() || `${crate.name}-app`,
    serverCrate: serverOptions.crate?.trim() || `${crate.name}-server`,
    appDeps: appOptions.deps ?? [],
    serverDeps: serverOptions.deps ?? [],
  };
}

/** Maps each command/query request type to its API registry setter suffix. */
function methodToRoute(crate: IrCrate, config: CodegenConfig): Map<string, string> {
  const map = new Map<string, string>();
  if (!crate.api) return map;
  for (const route of planRoutes(crate, resolveApiOptions(config))) {
    map.set(route.requestType, route.method);
  }
  return map;
}

/** A handler (command/query) the application crate implements and registers. */
export interface ScaffoldHandler {
  domain: string;
  /** `"commands"` or `"queries"`. */
  dir: "commands" | "queries";
  subject: "command" | "query";
  /** API registry setter suffix (`with_<method>`), unique per crate. */
  method: string;
  /** snake_case file name of the stub. */
  fileName: string;
  rustName: string;
  useCaseName: string;
  handlerType: string;
  requestType: string;
  responseType?: string;
  modulePath: string[];
  doc?: string;
}

/** One application module (mirrors a generated domain folder). */
interface ScaffoldDomain {
  module: string;
  dirs: Array<{ name: "commands" | "queries"; files: string[] }>;
  files: Array<"states" | "views" | "services">;
  handlers: ScaffoldHandler[];
  states: IrArtifact[];
  views: IrArtifact[];
  services: IrArtifact[];
}

/** Derives a handler entry from a command/query artifact. */
function toHandler(artifact: IrArtifact, method: string): ScaffoldHandler {
  const subject = artifact.kind as "command" | "query";
  return {
    domain: artifact.modulePath[0] ?? "common",
    dir: subject === "command" ? "commands" : "queries",
    subject,
    method,
    fileName: artifact.fileName,
    rustName: artifact.rustName,
    useCaseName: `${artifact.rustName}UseCase`,
    handlerType: `${artifact.rustName}Handler`,
    requestType: artifact.rustName,
    responseType:
      (artifact.responses ?? []).length > 0 ? `${artifact.rustName}Response` : undefined,
    modulePath: artifact.modulePath,
    doc: artifact.doc,
  };
}

/** Groups the crate's app-facing artifacts by domain module. */
function buildDomains(crate: IrCrate, methodByRustName: Map<string, string>): ScaffoldDomain[] {
  const byModule = new Map<string, ScaffoldDomain>();
  const domain = (module: string): ScaffoldDomain => {
    let entry = byModule.get(module);
    if (!entry) {
      entry = { module, dirs: [], files: [], handlers: [], states: [], views: [], services: [] };
      byModule.set(module, entry);
    }
    return entry;
  };

  for (const artifact of crate.artifacts) {
    const module = artifact.modulePath[0] ?? "common";
    if (artifact.kind === "command" || artifact.kind === "query") {
      const entry = domain(module);
      entry.handlers.push(
        toHandler(artifact, methodByRustName.get(artifact.rustName) ?? artifact.fileName),
      );
    } else if (artifact.kind === "state") {
      domain(module).states.push(artifact);
    } else if (artifact.kind === "view") {
      domain(module).views.push(artifact);
    } else if (artifact.kind === "service") {
      domain(module).services.push(artifact);
    }
  }

  for (const entry of byModule.values()) {
    const commands = entry.handlers.filter((h) => h.dir === "commands").map((h) => h.fileName);
    const queries = entry.handlers.filter((h) => h.dir === "queries").map((h) => h.fileName);
    entry.dirs = [];
    if (commands.length > 0) entry.dirs.push({ name: "commands", files: commands.sort() });
    if (queries.length > 0) entry.dirs.push({ name: "queries", files: queries.sort() });
    entry.files = [];
    if (entry.states.length > 0) entry.files.push("states");
    if (entry.views.length > 0) entry.files.push("views");
    if (entry.services.length > 0) entry.files.push("services");
  }

  return Array.from(byModule.values()).sort((a, b) => a.module.localeCompare(b.module));
}

/** Renders a dependency line for a crate manifest. */
function depLine(dep: DepSpec): string {
  const parts: string[] = [];
  if (dep.path) parts.push(`path = "${dep.path}"`);
  else if (dep.git) {
    parts.push(`git = "${dep.git}"`);
    if (dep.branch) parts.push(`branch = "${dep.branch}"`);
    if (dep.tag) parts.push(`tag = "${dep.tag}"`);
    if (dep.rev) parts.push(`rev = "${dep.rev}"`);
  } else parts.push(`version = "${dep.version ?? "*"}"`);
  if (dep.features && dep.features.length > 0) {
    parts.push(`features = [${dep.features.map((f) => `"${f}"`).join(", ")}]`);
  }
  return `${dep.name} = { ${parts.join(", ")} }`;
}

export const scaffoldGenerator: Generator = {
  name: "scaffold",
  generate({ crate, config }): RenderJob[] {
    const options = resolveScaffold(config, crate);
    if (!options) return [];

    const domains = buildDomains(crate, methodToRoute(crate, config));
    const appCratePath = options.appCrate.replace(/-/g, "_");
    const serverCratePath = options.serverCrate.replace(/-/g, "_");
    const handlers = domains.flatMap((entry) => entry.handlers);

    const posix = (value: string) => value.split(path.sep).join("/");
    const relative = (from: string, to: string) => posix(path.relative(from, to)) || ".";
    const baseDir = config.out.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
    const appDir = `crates/${options.appCrate}`;
    const serverDir = `crates/${options.serverCrate}`;

    const workspaceMembers = [baseDir];
    if (options.app) workspaceMembers.push(appDir);
    if (options.server) workspaceMembers.push(serverDir);

    const context = {
      crate,
      domains,
      handlers,
      stubs: options.stubs,
      appCrate: options.appCrate,
      appCratePath,
      serverCrate: options.serverCrate,
      serverCratePath,
      appDeps: options.appDeps.map(depLine),
      serverDeps: options.serverDeps.map(depLine),
      baseFromApp: relative(appDir, baseDir),
      baseFromServer: relative(serverDir, baseDir),
      appFromServer: relative(serverDir, appDir),
      workspaceMembers,
    };

    // Every scaffold file is create-only: written once, then owned by the
    // project.
    const jobs: RenderJob[] = [];
    const emit = (
      template: string,
      outPath: string,
      extra: Record<string, unknown> = {},
    ) =>
      jobs.push({
        template,
        outPath,
        base: "root",
        ownership: "create-only",
        context: { ...context, ...extra },
      });
    const root = (template: string, outPath: string) => emit(template, outPath);
    const app = (template: string, outPath: string, extra: Record<string, unknown> = {}) =>
      emit(template, `crates/${options.appCrate}/${outPath}`, extra);
    const server = (template: string, outPath: string) =>
      emit(template, `crates/${options.serverCrate}/${outPath}`);

    if (options.workspace) {
      root("workspace_cargo.toml.njk", "Cargo.toml");
      root("rust_toolchain.toml.njk", "rust-toolchain.toml");
      root("gitignore.njk", ".gitignore");
      root("readme.md.njk", "README.md");
    }

    if (options.app) {
      app("app_cargo.toml.njk", "Cargo.toml");
      app("app_lib.rs.njk", "src/lib.rs");
      app("app_error.rs.njk", "src/error.rs");
      app("app_state.rs.njk", "src/state.rs");
      if (crate.api) app("app_register.rs.njk", "src/register.rs");

      for (const entry of domains) {
        app("app_domain_mod.rs.njk", `src/${entry.module}/mod.rs`, { modDir: entry });
        for (const dir of entry.dirs) {
          app("app_leaf_mod.rs.njk", `src/${entry.module}/${dir.name}/mod.rs`, {
            modFiles: dir.files,
          });
        }
        for (const handler of entry.handlers) {
          app("app_handler_stub.rs.njk", `src/${entry.module}/${handler.dir}/${handler.fileName}.rs`, {
            handler,
          });
        }
        if (entry.states.length > 0) {
          app("app_states_stub.rs.njk", `src/${entry.module}/states.rs`, {
            artifacts: entry.states,
          });
        }
        if (entry.views.length > 0) {
          app("app_views_stub.rs.njk", `src/${entry.module}/views.rs`, {
            artifacts: entry.views,
          });
        }
        if (entry.services.length > 0) {
          app("app_services_stub.rs.njk", `src/${entry.module}/services.rs`, {
            artifacts: entry.services,
            stubPrelude: entry.services.some((service) => service.usesPrelude),
          });
        }
      }
    }

    // The server wires the application crate, so it only exists alongside it.
    if (options.server && options.app) {
      server("server_cargo.toml.njk", "Cargo.toml");
      server("server_main.rs.njk", "src/main.rs");
    }

    return jobs;
  },
};
