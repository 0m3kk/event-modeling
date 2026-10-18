/** Small scaffolding helpers for `init` and `new-template`. */
import fs from "node:fs/promises";
import path from "node:path";
import { builtinTemplatesDir } from "./render/env";

/** Default contents of a freshly created `codegen.config.ts`. */
export const defaultConfigSource = `import { defineConfig } from "@em/codegen";

export default defineConfig({
  // Path to the exported domain specification, relative to this file.
  spec: "board.spec.yaml",
  // Where the Rust crate is written, relative to this file.
  out: "crates/domain",

  crate: {
    // name: "domain",   // defaults to the spec name in snake_case
    edition: "2024",
    // Add dependencies the generated code needs and the detector cannot infer:
    // deps: [{ name: "tracing", version: "0.1" }],
    // A git checkout uses "git" (optionally with "branch"/"tag"/"rev") instead
    // of a registry "version":
    // deps: [{ name: "event-store", git: "https://github.com/0m3kk/backend-kit.git" }],
  },

  // Map spec primitives/format presets to Rust types. uuid and time are
  // pre-wired so ids and timestamps are typed from the start.
  typeMap: {
    uuid: "uuid::Uuid",
    datetime: "time::OffsetDateTime",
    date: "time::Date",
    time: "time::Time",
  },

  // Every built-in generator runs by default; disable any of them here.
  generators: {
    queries: true,
    // View read models. Add \`migrations: true\` to also emit sqlx SQL migrations:
    views: { enabled: true, migrations: true },
    states: true,
    services: true,
    // The HTTP API (axum) generates a handler registry plus the transport,
    // and an OpenAPI document via utoipa.
    api: { enabled: true, prefix: "/api", openapi: true },
  },

  // Drop templates into ".codegen/templates" (see \`em-codegen eject\`) to
  // override the built-ins, then point this at them.
  // templatesDir: ".codegen/templates",

  // Emit a Cargo workspace around the crate: a workspace manifest, an
  // application crate (handler/reducer/service implementations) and a server
  // binary. Files are written once and then owned by the project; existing
  // files are never overwritten.
  scaffold: {
    enabled: true,
    // app: { crate: "domain-app" },
    // server: { crate: "domain-server" },
    // templates: true,
  },
});
`;

/** A minimal starter template for `new-template`. */
export function starterTemplate(name: string): string {
  return `{#
  ${name} — a user template.

  Available filters: snake, pascal, camel, kebab, doccomment, innerdoc, joinlines.
  The context typically carries \`crate\` and, for per-item templates,
  \`artifact\` (or \`dir\` for mod files).
#}
// Generated from template: ${name}
`;
}

/** Writes the default config file. Returns the path written. */
export async function initConfig(dir: string, fileName = "codegen.config.ts"): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, fileName);
  await fs.writeFile(target, defaultConfigSource, { encoding: "utf8", flag: "wx" });
  return target;
}

/** Writes a starter user template. Returns the path written. */
export async function newTemplate(name: string, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  let file = name;
  if (file.endsWith(".njk")) {
    // keep the explicit template name
  } else if (file.endsWith(".rs")) {
    file += ".njk";
  } else {
    file += ".rs.njk";
  }
  const target = path.join(dir, file);
  await fs.writeFile(target, starterTemplate(name), { encoding: "utf8", flag: "wx" });
  return target;
}

/** Path of the built-in templates directory (for `eject`). */
export function builtinTemplatesPath(): string {
  return builtinTemplatesDir;
}
