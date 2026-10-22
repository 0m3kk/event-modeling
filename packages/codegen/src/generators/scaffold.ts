/**
 * Scaffolds the repository around the generated contract crate.
 *
 * When `config.scaffold.enabled` is set, this generator emits a Cargo
 * workspace: a workspace `Cargo.toml`, an application crate (the command,
 * query, state, view and service implementations) and a server binary crate.
 * With `config.scaffold.worker` it also emits a projection worker — either a
 * standalone binary crate or a background task inside the server.
 *
 * The layout mirrors the contract crate: one folder per domain, one folder per
 * kind, and one self-contained module directory per item
 * (`domains/<domain>/commands/<use_case>/`). Each item is a single `mod.rs`:
 * a command or query holds its handler, a view or state its reducer (plus the
 * View catch-up driver when the worker is on), and a service its implementation.
 * The generated types and traits are imported from the contract crate rather
 * than duplicated or re-exported, so the parent `mod.rs` files only wire child
 * modules.
 *
 * Every file the scaffold emits uses one of three strategies (see
 * {@link RenderJob.strategy}):
 *
 *  - pure wiring (`lib.rs`, `register.rs`, wiring `mod.rs`, re-exports) is
 *    **overwritten** on every run; project code belongs in `src/extension/`;
 *  - implementation and configurable wiring files are **three-way merged**, so
 *    generator changes are applied while project edits survive;
 *  - extension files and docs are **create-only**: written once and owned by the
 *    project.
 */
import path from "node:path";
import type { CodegenConfig, DepSpec, ScaffoldCrateConfig, WorkerScaffoldConfig } from "../config";
import { EVENT_STORE_GIT, artifactDomain } from "../ir/build";
import type { IrArtifact, IrCrate, IrEventRef, IrMethod } from "../ir/types";
import { planRoutes, resolveApiOptions } from "./api";
import type { FileStrategy, Generator, RenderJob } from "./contract";

/**
 * Infrastructure dependencies the application crate needs, merged into
 * `scaffold.app.deps`. An entry the config names explicitly wins, so a local
 * path checkout can replace the git source.
 */
const APP_DEFAULT_DEPS: DepSpec[] = [{ name: "event-store", git: EVENT_STORE_GIT }];

/** Infrastructure dependencies the server crate needs, merged into `server.deps`. */
const SERVER_DEFAULT_DEPS: DepSpec[] = [
  { name: "event-store", git: EVENT_STORE_GIT },
  { name: "http-server", git: EVENT_STORE_GIT },
  { name: "jwt", git: EVENT_STORE_GIT },
  { name: "postgres-db", git: EVENT_STORE_GIT },
  { name: "snapshot-store", git: EVENT_STORE_GIT },
  { name: "telemetry", git: EVENT_STORE_GIT },
  { name: "url", version: "2" },
];

/** Infrastructure dependencies a standalone worker crate needs, merged into `worker.deps`. */
const WORKER_DEFAULT_DEPS: DepSpec[] = [
  { name: "event-store", git: EVENT_STORE_GIT },
  { name: "postgres-db", git: EVENT_STORE_GIT },
  { name: "snapshot-store", git: EVENT_STORE_GIT },
  { name: "telemetry", git: EVENT_STORE_GIT },
  { name: "url", version: "2" },
];

/** Merges `defaults` under `userDeps`; a dependency the user names wins. */
function mergeDeps(userDeps: DepSpec[], defaults: DepSpec[]): DepSpec[] {
  const byName = new Map(userDeps.map((dep) => [dep.name, dep]));
  for (const dep of defaults) {
    if (!byName.has(dep.name)) byName.set(dep.name, dep);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Runtime defaults baked into the generated worker's `WorkerOptions`. */
interface WorkerSettings {
  intervalMs: number;
  debounceMs: number;
  channel: string;
  leaderLockId: number;
}

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
  worker: boolean;
  workerPackage: "separate" | "server";
  workerCrate: string;
  workerDeps: DepSpec[];
  workerOptions: WorkerSettings;
}

/** Resolves the scaffold options from the config, or `undefined` when off. */
function resolveScaffold(config: CodegenConfig, crate: IrCrate): ScaffoldOptions | undefined {
  const setting = config.scaffold;
  if (!setting || setting.enabled !== true) return undefined;

  const app = setting.app;
  const server = setting.server;
  const worker = setting.worker;
  const appOn = app === undefined ? true : app !== false;
  const serverOn = server === undefined ? true : server !== false;
  const appOptions: ScaffoldCrateConfig = typeof app === "object" ? app : {};
  const serverOptions: ScaffoldCrateConfig = typeof server === "object" ? server : {};
  const workerOptions: WorkerScaffoldConfig =
    typeof worker === "object" && worker !== null ? worker : {};
  const workerOn = worker !== undefined && worker !== false && workerOptions.enabled !== false;

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
    worker: workerOn,
    workerPackage: workerOptions.package === "server" ? "server" : "separate",
    workerCrate: workerOptions.crate?.trim() || `${crate.name}-worker`,
    workerDeps: workerOptions.deps ?? [],
    workerOptions: {
      intervalMs: workerOptions.intervalMs ?? 5000,
      debounceMs: workerOptions.debounceMs ?? 50,
      channel: workerOptions.channel?.trim() || "events_appended",
      leaderLockId: workerOptions.leaderLockId ?? 987654321,
    },
  };
}

/** One command or query use case, rendered as its own module directory. */
interface UseCaseItem {
  domain: string;
  /** Directory / module name (snake_case file name). */
  fileName: string;
  rustName: string;
  /** Response struct name, absent when the spec declares no responses. */
  responseType?: string;
  /** Generated handler trait, e.g. `PlaceOrderHandler`. */
  handlerType: string;
  /** Scaffolded use-case struct, e.g. `PlaceOrderUseCase`. */
  useCaseType: string;
  /** Contract module path re-exported by the use case, e.g. `["domains","sales","commands"]`. */
  contractModulePath: string[];
  /** Request file name inside the use-case directory. */
  typeFile: "command" | "query";
  /** App-crate module path, e.g. `domains::sales::commands::place_order`. */
  appPath: string;
  doc?: string;
}

/** One state or view projection the app crate implements a reducer for. */
interface ProjectionItem {
  domain: string;
  fileName: string;
  rustName: string;
  /** Generated reducer trait, e.g. `OrderStateReducer`. */
  reducerType: string;
  /** Scaffolded reducer implementation, e.g. `OrderStateReducerImpl`. */
  implType: string;
  contractModulePath: string[];
  projectionEvents: IrEventRef[];
  typeFile: "view" | "state";
  /** Views are async and fallible; states are sync. */
  async: boolean;
  doc?: string;
}

/** One service the app crate implements. */
interface ServiceItem {
  domain: string;
  fileName: string;
  rustName: string;
  implType: string;
  contractModulePath: string[];
  methods: IrMethod[];
  usesPrelude?: boolean;
  doc?: string;
}

/** Everything the app crate scaffolds for one domain module. */
interface AppDomain {
  module: string;
  commands: UseCaseItem[];
  queries: UseCaseItem[];
  views: ProjectionItem[];
  states: ProjectionItem[];
  services: ServiceItem[];
}

/** Builds a command/query use-case entry from its artifact. */
function toUseCase(artifact: IrArtifact, config: CodegenConfig): UseCaseItem {
  const domain = artifactDomain(artifact);
  const typeFile = artifact.kind === "command" ? "command" : "query";
  const group = typeFile === "command" ? "commands" : "queries";
  return {
    domain,
    fileName: artifact.fileName,
    rustName: artifact.rustName,
    responseType:
      (artifact.responses ?? []).length > 0 ? `${artifact.rustName}Response` : undefined,
    handlerType: `${artifact.rustName}Handler`,
    useCaseType: `${artifact.rustName}UseCase`,
    contractModulePath: artifact.modulePath,
    typeFile,
    appPath: `domains::${domain}::${group}::${artifact.fileName}`,
    doc: artifact.doc,
  };
}

/** Builds a state/view projection entry from its artifact. */
function toProjection(artifact: IrArtifact, kind: "view" | "state"): ProjectionItem {
  const domain = artifactDomain(artifact);
  return {
    domain,
    fileName: artifact.fileName,
    rustName: artifact.rustName,
    reducerType: `${artifact.rustName}Reducer`,
    implType: `${artifact.rustName}ReducerImpl`,
    contractModulePath: artifact.modulePath,
    projectionEvents: artifact.projectionEvents ?? [],
    typeFile: kind,
    async: kind === "view",
    doc: artifact.doc,
  };
}

/** Builds a service entry from its artifact. */
function toService(artifact: IrArtifact): ServiceItem {
  return {
    domain: artifactDomain(artifact),
    fileName: artifact.fileName,
    rustName: artifact.rustName,
    implType: `${artifact.rustName}Impl`,
    contractModulePath: artifact.modulePath,
    methods: artifact.methods ?? [],
    usesPrelude: artifact.usesPrelude,
    doc: artifact.doc,
  };
}

/** Groups the crate's app-facing artifacts by domain module. */
function buildDomains(crate: IrCrate, config: CodegenConfig): AppDomain[] {
  const byModule = new Map<string, AppDomain>();
  const domain = (module: string): AppDomain => {
    let entry = byModule.get(module);
    if (!entry) {
      entry = { module, commands: [], queries: [], views: [], states: [], services: [] };
      byModule.set(module, entry);
    }
    return entry;
  };

  for (const artifact of crate.artifacts) {
    const module = artifactDomain(artifact);
    switch (artifact.kind) {
      case "command":
        domain(module).commands.push(toUseCase(artifact, config));
        break;
      case "query":
        domain(module).queries.push(toUseCase(artifact, config));
        break;
      case "view":
        domain(module).views.push(toProjection(artifact, "view"));
        break;
      case "state":
        domain(module).states.push(toProjection(artifact, "state"));
        break;
      case "service":
        domain(module).services.push(toService(artifact));
        break;
      default:
        break;
    }
  }

  const byFileName = (a: { fileName: string }, b: { fileName: string }) =>
    a.fileName.localeCompare(b.fileName);
  for (const entry of byModule.values()) {
    entry.commands.sort(byFileName);
    entry.queries.sort(byFileName);
    entry.views.sort(byFileName);
    entry.states.sort(byFileName);
    entry.services.sort(byFileName);
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

    const domains = buildDomains(crate, config);
    const appCratePath = options.appCrate.replace(/-/g, "_");
    const serverCratePath = options.serverCrate.replace(/-/g, "_");
    const commands = domains.flatMap((entry) => entry.commands);
    const queries = domains.flatMap((entry) => entry.queries);

    // Map each command/query to the API registry setter suffix.
    const methodByRustName = new Map<string, string>();
    for (const route of planRoutes(crate, resolveApiOptions(config))) {
      methodByRustName.set(route.requestType, route.method);
    }
    const handlers = [...commands, ...queries].map((item) => ({
      ...item,
      method: methodByRustName.get(item.rustName) ?? item.fileName,
    }));

    const posix = (value: string) => value.split(path.sep).join("/");
    const relative = (from: string, to: string) => posix(path.relative(from, to)) || ".";
    const baseDir = config.out.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
    const appDir = `crates/${options.appCrate}`;
    const serverDir = `crates/${options.serverCrate}`;

    const workspaceMembers = [baseDir];
    if (options.app) workspaceMembers.push(appDir);
    if (options.server) workspaceMembers.push(serverDir);

    const domainNames = domains.map((entry) => entry.module);
    const hasGroup = (group: keyof AppDomain) =>
      domains.some((entry) => (entry[group] as unknown[]).length > 0);

    const hasViews = hasGroup("views");
    // The worker projects the View read models, so it needs at least one view,
    // the application crate that holds the projection registry, and — when it
    // is folded into the server rather than standalone — the server crate too.
    const workerActive =
      options.worker &&
      hasViews &&
      options.app &&
      (options.workerPackage === "separate" || options.server);
    const workerDir = `crates/${options.workerCrate}`;
    const workerCratePath = options.workerCrate.replace(/-/g, "_");
    if (workerActive && options.workerPackage === "separate") workspaceMembers.push(workerDir);

    // One entry per View, used to generate the projection registry and the
    // per-view catch-up driver.
    const projectionViews = domains.flatMap((entry) =>
      entry.views.map((view) => ({
        domain: entry.module,
        fileName: view.fileName,
        rustName: view.rustName,
      })),
    );

    // The generated CI only needs a PostgreSQL service when the workspace
    // actually runs against one: a server, the projection worker, or an app
    // with persisted Views.
    const database =
      (options.app && hasViews) || workerActive || (options.server && options.app);

    const context = {
      crate,
      domains,
      domainNames,
      commands,
      queries,
      handlers,
      methodByRustName,
      stubs: options.stubs,
      appCrate: options.appCrate,
      appCratePath,
      serverCrate: options.serverCrate,
      serverCratePath,
      appDeps: mergeDeps(options.appDeps, APP_DEFAULT_DEPS).map(depLine),
      serverDeps: mergeDeps(options.serverDeps, SERVER_DEFAULT_DEPS).map(depLine),
      baseFromApp: relative(appDir, baseDir),
      baseFromServer: relative(serverDir, baseDir),
      appFromServer: relative(serverDir, appDir),
      workspaceMembers,
      hasCommands: hasGroup("commands"),
      hasQueries: hasGroup("queries"),
      hasViews,
      hasStates: hasGroup("states"),
      hasServices: hasGroup("services"),
      hasDomains: domains.length > 0,
      database,
      worker: workerActive,
      workerPackage: options.workerPackage,
      workerCrate: options.workerCrate,
      workerCratePath,
      workerDeps: mergeDeps(options.workerDeps, WORKER_DEFAULT_DEPS).map(depLine),
      workerIntervalMs: options.workerOptions.intervalMs,
      workerDebounceMs: options.workerOptions.debounceMs,
      workerChannel: options.workerOptions.channel,
      workerLeaderLockId: options.workerOptions.leaderLockId,
      projectionViews,
      baseFromWorker: relative(workerDir, baseDir),
      appFromWorker: relative(workerDir, appDir),
    };

    const jobs: RenderJob[] = [];
    const emit = (
      template: string,
      outPath: string,
      strategy: FileStrategy,
      extra: Record<string, unknown> = {},
      bannerHint?: string,
    ) =>
      jobs.push({
        template,
        outPath,
        base: "root",
        strategy,
        bannerHint,
        context: { ...context, ...extra },
      });
    const root = (template: string, outPath: string, strategy: FileStrategy) =>
      emit(template, outPath, strategy);
    const app = (
      template: string,
      outPath: string,
      strategy: FileStrategy,
      extra: Record<string, unknown> = {},
      bannerHint?: string,
    ) => emit(template, `${appDir}/${outPath}`, strategy, extra, bannerHint);
    const server = (
      template: string,
      outPath: string,
      strategy: FileStrategy,
      bannerHint?: string,
    ) => emit(template, `${serverDir}/${outPath}`, strategy, {}, bannerHint);

    // `lib.rs` and `register.rs` are regenerated wiring; they point project
    // code at these extension files, which survive every run.
    const extensionHint = "Add project code under `src/extension/` instead.";
    const authHint =
      "Add a middleware module of your own and wire it from `src/router.rs` instead.";

    if (options.workspace) {
      root("workspace_cargo.toml.njk", "Cargo.toml", "merge");
      // Merged rather than overwritten: Dependabot bumps the pinned toolchain
      // channel, and rerunning the generator must not reset it to the template's
      // version.
      root("rust_toolchain.toml.njk", "rust-toolchain.toml", "merge");
      root("workspace_gitignore.njk", ".gitignore", "merge");
      root("readme.md.njk", "README.md", "create-only");
      root("config_example.yaml.njk", "config.example.yaml", "merge");
      root("secrets_example.yaml.njk", "secrets.example.yaml", "merge");
      root("env_example.njk", ".env.example", "merge");
      root("dependabot.yml.njk", ".github/dependabot.yml", "merge");
      root("workflow_ci.yml.njk", ".github/workflows/ci.yml", "merge");
    }

    if (options.app) {
      app("app_cargo.toml.njk", "Cargo.toml", "merge");
      app("app_lib.rs.njk", "src/lib.rs", "overwrite", {}, extensionHint);
      app("app_error.rs.njk", "src/error.rs", "merge");
      app("app_state.rs.njk", "src/state.rs", "merge");
      app("app_extension_mod.rs.njk", "src/extension/mod.rs", "create-only");
      app("app_extension_register.rs.njk", "src/extension/register.rs", "merge");
      if (hasViews) {
        // Checkpoints and the shared error bridge used by View reducers and
        // their catch-up drivers. Pure infrastructure, so it is regenerated.
        app("app_views.rs.njk", "src/views.rs", "overwrite", {}, extensionHint);
      }
      if (crate.api) {
        app("app_register.rs.njk", "src/register.rs", "overwrite", {}, extensionHint);
      }
      if (workerActive) app("app_projections_mod.rs.njk", "src/projections/mod.rs", "merge");

      // The app crate is grouped by domain, exactly like the contract crate:
      // `domains/<domain>/<kind>/<item>/`. Each level only wires its children;
      // per-item files keep the same shape as before.
      const groups: Array<{ key: keyof AppDomain; dir: string }> = [
        { key: "commands", dir: "commands" },
        { key: "queries", dir: "queries" },
        { key: "views", dir: "views" },
        { key: "states", dir: "states" },
        { key: "services", dir: "services" },
      ];
      if (domains.length > 0) {
        app("app_domains_mod.rs.njk", "src/domains/mod.rs", "overwrite", {
          domainModules: domainNames,
        });
      }
      for (const entry of domains) {
        const populated = groups.filter(
          (group) => (entry[group.key] as unknown[]).length > 0,
        );
        app("app_domain_hub_mod.rs.njk", `src/domains/${entry.module}/mod.rs`, "overwrite", {
          groupModules: populated.map((group) => group.dir),
        });
        for (const group of populated) {
          const items = entry[group.key] as Array<UseCaseItem | ProjectionItem | ServiceItem>;
          app(
            "app_domain_mod.rs.njk",
            `src/domains/${entry.module}/${group.dir}/mod.rs`,
            "overwrite",
            {
              moduleNames: items.map((item) => item.fileName),
            },
          );
          scaffoldGroup(group.key, group.dir, entry, items);
        }
      }
    }

    // The server wires the application crate, so it only exists alongside it.
    if (options.server && options.app) {
      server("server_cargo.toml.njk", "Cargo.toml", "merge");
      server("server_config.rs.njk", "src/config.rs", "merge");
      server("server_state.rs.njk", "src/state.rs", "merge");
      if (crate.api) {
        // The router, middleware and server-level handlers wrap the generated
        // API transport.
        server("server_middleware_mod.rs.njk", "src/middleware/mod.rs", "merge");
        server("server_middleware_auth.rs.njk", "src/middleware/auth.rs", "overwrite", authHint);
        server("server_handlers_mod.rs.njk", "src/handlers/mod.rs", "merge");
        server("server_router.rs.njk", "src/router.rs", "merge");
      }
      server("server_main.rs.njk", "src/main.rs", "merge");
    }

    // A standalone worker crate. With `worker.package: "server"` the worker is
    // emitted into the server crate instead (see `server_main.rs.njk` and
    // `worker_mod.rs.njk`).
    if (workerActive && options.workerPackage === "separate") {
      const worker = (template: string, outPath: string, strategy: FileStrategy) =>
        emit(template, `${workerDir}/${outPath}`, strategy);
      worker("worker_cargo.toml.njk", "Cargo.toml", "merge");
      worker("worker_lib.rs.njk", "src/lib.rs", "merge");
      worker("worker_config.rs.njk", "src/config.rs", "merge");
      worker("worker_main.rs.njk", "src/main.rs", "merge");
      worker("worker_mod.rs.njk", "src/worker/mod.rs", "merge");
      worker("worker_leader.rs.njk", "src/worker/leader.rs", "merge");
      worker("worker_readme.md.njk", "README.md", "create-only");
    }

    // With `package: "server"` the worker loop lives in the server crate and
    // `main.rs` spawns it as a background task.
    if (workerActive && options.workerPackage === "server") {
      server("worker_mod.rs.njk", "src/worker/mod.rs", "merge");
      server("worker_leader.rs.njk", "src/worker/leader.rs", "merge");
    }

    return jobs;

    /** Emits the per-item files of one group within one domain. */
    function scaffoldGroup(
      group: keyof AppDomain,
      dir: string,
      entry: AppDomain,
      items: Array<UseCaseItem | ProjectionItem | ServiceItem>,
    ): void {
      for (const item of items) {
        const base = `src/domains/${entry.module}/${dir}/${item.fileName}`;
        if (group === "commands" || group === "queries") {
          const useCase = item as UseCaseItem;
          // One file per use case: the module itself holds the handler. The
          // request/response types and the handler trait are imported straight
          // from the contract crate instead of being re-exported here.
          app("app_use_case_handler.rs.njk", `${base}/mod.rs`, "merge", { item: useCase });
        } else if (group === "views" || group === "states") {
          const projection = item as ProjectionItem;
          // One file per projection: the reducer (and, for Views, the catch-up
          // driver) lives in `mod.rs`; the generated type and trait are
          // imported from the contract crate.
          app("app_projection_handler.rs.njk", `${base}/mod.rs`, "merge", {
            item: projection,
          });
        } else {
          const service = item as ServiceItem;
          // One file per service: the module implements the generated trait.
          app("app_service_handler.rs.njk", `${base}/mod.rs`, "merge", { item: service });
        }
      }
    }
  },
};
