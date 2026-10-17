/**
 * Renders the axum HTTP API for commands and queries.
 *
 * The generator emits a single trait ([`Api`]) the application implements with
 * its command and query logic, and the transport around it: the axum router,
 * JSON request/response handling, an `ExecutionContext` extractor and (when
 * `openapi` is on) the utoipa OpenAPI document. Routes are derived from each
 * item's `action`, falling back to the kind folder when no action is declared.
 */
import { kebabCase } from "@em/spec";
import type { ApiGeneratorConfig, CodegenConfig } from "../config";
import type { IrArtifact, IrCrate } from "../ir/types";
import type { Generator, RenderJob } from "./contract";

/** Effective options for the API generator, resolved from the config. */
export interface ApiOptions {
  enabled: boolean;
  framework: "axum";
  /** Normalized prefix: empty or a leading-slash, no-trailing-slash string. */
  prefix: string;
  openapi: boolean;
}

/** Normalizes a route prefix to `""` or `/foo/bar` (no trailing slash). */
function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
}

/** Resolves the API generator options from the config (disabled by default). */
export function resolveApiOptions(config: CodegenConfig): ApiOptions {
  const setting = config.generators?.api;
  if (setting === undefined) {
    return { enabled: false, framework: "axum", prefix: "/api", openapi: true };
  }
  if (typeof setting === "boolean") {
    return { enabled: setting, framework: "axum", prefix: "/api", openapi: true };
  }
  const options = setting as ApiGeneratorConfig;
  return {
    enabled: options.enabled !== false,
    framework: "axum",
    prefix: normalizePrefix(options.prefix ?? "/api"),
    openapi: options.openapi !== false,
  };
}

/** A single HTTP route planned from a command or query artifact. */
export interface ApiRoute {
  /** snake_case route handler function name (also the registry setter suffix). */
  method: string;
  subject: "command" | "query";
  /** Trait method parameter name (`command` / `query`). */
  argName: string;
  /** Request struct type. */
  requestType: string;
  /** Generated handler trait for this item, e.g. `PlaceOrderHandler`. */
  handlerType: string;
  /** Response struct type, absent when the spec declares no responses. */
  responseType?: string;
  /** Full route path, including the prefix. */
  path: string;
  /** OpenAPI tag: the artifact's domain module. */
  tag: string;
  /** Module path of the request/response types. */
  modulePath: string[];
  doc?: string;
}

/** Derives a route path from an item's `action`, falling back to its kind. */
function routePath(artifact: IrArtifact, subject: "command" | "query"): string {
  const segments = (artifact.action ?? "")
    .split(":")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => kebabCase(segment))
    .filter(Boolean);
  if (segments.length > 0) return segments.join("/");
  const folder = subject === "command" ? "commands" : "queries";
  return `${folder}/${kebabCase(artifact.fileName)}`;
}

/** Makes a full path unique by appending a numeric suffix on collision. */
function uniquePath(prefix: string, route: string, used: Set<string>): string {
  let path = `${prefix}/${route}`;
  let suffix = 2;
  while (used.has(path)) {
    path = `${prefix}/${route}-${suffix}`;
    suffix += 1;
  }
  used.add(path);
  return path;
}

/** Makes a method name unique by appending a numeric suffix on collision. */
function uniqueMethod(name: string, used: Set<string>): string {
  let method = name;
  let suffix = 2;
  while (used.has(method)) {
    method = `${name}_${suffix}`;
    suffix += 1;
  }
  used.add(method);
  return method;
}

/** Plans one route per command and query, in artifact order. */
export function planRoutes(crate: IrCrate, options: ApiOptions): ApiRoute[] {
  const usedPaths = new Set<string>();
  const usedMethods = new Set<string>();
  const routes: ApiRoute[] = [];

  for (const artifact of crate.artifacts) {
    if (artifact.kind !== "command" && artifact.kind !== "query") continue;
    const subject = artifact.kind;
    const responseType = (artifact.responses ?? []).length > 0
      ? `${artifact.rustName}Response`
      : undefined;
    routes.push({
      method: uniqueMethod(artifact.fileName, usedMethods),
      subject,
      argName: subject,
      requestType: artifact.rustName,
      handlerType: `${artifact.rustName}Handler`,
      responseType,
      path: uniquePath(options.prefix, routePath(artifact, subject), usedPaths),
      tag: artifact.modulePath[0] ?? "common",
      modulePath: artifact.modulePath,
      doc: artifact.doc,
    });
  }

  return routes;
}

/** A grouped `use crate::...::{A, B};`. */
export interface ApiImport {
  path: string;
  names: string[];
}

/** Groups names selected from each route by their module, for imports. */
function collectImports(routes: ApiRoute[], select: (route: ApiRoute) => string[]): ApiImport[] {
  const byModule = new Map<string, Set<string>>();
  for (const route of routes) {
    const path = `crate::${route.modulePath.join("::")}`;
    const names = byModule.get(path) ?? new Set<string>();
    for (const name of select(route)) names.add(name);
    byModule.set(path, names);
  }
  return Array.from(byModule.entries())
    .map(([path, names]) => ({ path, names: Array.from(names).sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export const apiGenerator: Generator = {
  name: "api",
  generate({ crate, config }): RenderJob[] {
    if (!crate.api) return [];
    const options = resolveApiOptions(config);
    const routes = planRoutes(crate, options);
    if (routes.length === 0) return [];

    const context = {
      crate,
      routes,
      // The registry stores handler trait objects; the router also names the
      // request/response structs it deserializes and serializes.
      handlerImports: collectImports(routes, (route) => [route.handlerType]),
      typeImports: collectImports(routes, (route) =>
        route.responseType ? [route.requestType, route.responseType] : [route.requestType],
      ),
    };
    const jobs: RenderJob[] = [
      { template: "api_mod.rs.njk", outPath: "src/apis/mod.rs", context },
      { template: "api_router.rs.njk", outPath: "src/apis/router.rs", context },
      { template: "api_extract.rs.njk", outPath: "src/apis/extract.rs", context },
      { template: "api_error.rs.njk", outPath: "src/apis/error.rs", context },
    ];
    if (crate.openapi) {
      jobs.push({ template: "api_openapi.rs.njk", outPath: "src/apis/openapi.rs", context });
    }
    return jobs;
  },
};
