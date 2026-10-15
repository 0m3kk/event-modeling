# `@em/codegen`

Generate a Rust crate from an event-modeling **specification** (`*.spec.yaml`)
exported by the board.

The tool is deliberately small and **extensible**: parsing and validation live
in the shared `@em/spec` package, generation is a five-stage pipeline over a
Rust-flavoured intermediate representation (IR), and every file is rendered
from a Nunjucks template you can override.

## Quick start

```bash
# 1. Export the board spec to board.spec.yaml, then:
pnpm --filter @em/codegen codegen init     # writes codegen.config.ts
# edit codegen.config.ts (spec + out) if needed
pnpm --filter @em/codegen codegen gen      # writes the crate
```

Or call the binary directly:

```bash
node packages/codegen/bin/em-codegen.mjs gen
```

## CLI

```
em-codegen init [dir]                  Create codegen.config.ts
em-codegen gen [spec] [options]        Generate the crate
em-codegen eject [dir]                 Copy the built-in templates out for editing
em-codegen new-template <name>         Create a starter user template
```

`gen` options:

| Flag | Meaning |
| --- | --- |
| `-o, --out <dir>` | Override the output directory |
| `-c, --config <file>` | Use a specific config file |
| `--spec <file>` | Override the spec path |
| `--dry-run` | Render without writing |
| `--check` | Report files that are missing or out of date (CI); exits `1` on drift |
| `--force` | Overwrite files that were edited since the last run |
| `--no-rustfmt` | Skip `rustfmt` post-processing |

## Pipeline

```
spec.yaml -> parse (zod) -> hoist types -> build IR -> run passes
          -> plan render jobs -> render (Nunjucks) -> rustfmt -> write + manifest
```

- **parse** uses `@em/spec`: YAML -> validated document.
- **hoist** lifts the inline Object/Enum/Alias definitions the document expands
  at first reference into a single `types` registry, so downstream everything
  refers to a type by name.
- **build IR** maps spec primitives to Rust types, renders field types and
  identifiers, decides each item's module path and detects crate dependencies.
- **passes** are scriptable IR transforms (see below).
- **render** runs each generator's jobs through Nunjucks.
- **write** respects the manifest so hand edits are never clobbered silently.

## Output layout

One folder per domain (plus `common`), one folder per kind, one file per item:

```
crates/shop/
  Cargo.toml
  .gitignore
  src/
    lib.rs
    prelude.rs                 # flat re-exports of every data type
    validation.rs              # helpers for formats validator has no check for
    <domain>/
      mod.rs
      events/    mod.rs + <event>.rs
      commands/  mod.rs + <command>.rs
      queries/   mod.rs + <query>.rs
      views/     mod.rs + <view>.rs
      states/    mod.rs + <state>.rs
      services/  mod.rs + <service>.rs
      types/     mod.rs + <type>.rs
    common/  ...                 # items that belong to no domain / are shared
```

A data type is placed in the single domain that uses it; a type used by several
domains (or none) goes to `common/types`. A card's domain is resolved from, in
order: `domains[].cards`, the cards of a group that belongs to a domain
(`groups[].cards`), then the cards named in a slice lane
(`slices[].lanes[].cards`) — because boards usually attach cards to slices and
groups rather than to the domain directly.

Commands and queries generate two structs: the request (`PlaceOrder`) from the
inputs/params and, when the spec declares responses, a `PlaceOrderResponse`.
Generated `struct`s and `enum`s serialize with `#[serde(rename_all =
"snake_case")]`, so field and variant names are snake_case on the wire.

## Validation

Field validation from the spec is turned into [`validator`](https://docs.rs/validator)
attributes, and the `validator` dependency is added automatically when any field
needs it (the struct also derives `Validate`):

| Spec validation | Generated attribute |
| --- | --- |
| `minLength` / `maxLength` (string) | `#[validate(length(min = .., max = ..))]` |
| `minItems` / `maxItems` (array) | `#[validate(length(min = .., max = ..))]` |
| `min` / `max` (integer / float) | `#[validate(range(min = .., max = ..))]` |
| `format: email` / `url` | `#[validate(email)]` / `#[validate(url)]` |
| `format: ipv4` / `ipv6` | `#[validate(ip(v4 = true))]` / `#[validate(ip(v6 = true))]` |
| `format: uuid` / `date` / `datetime` / `time` | `#[validate(custom(function = "crate::validation::validate_.."))]` |

`validator` has no built-in check for `uuid`, `date`, `datetime` and `time`, so
those presets are enforced by a small **self-support module** the generator
writes to `src/validation.rs` (and exposes as `pub mod validation;` in `lib.rs`)
whenever a field uses one of them. The module only depends on `validator` itself
and validates real calendar dates, times with optional fractional seconds and
zone offsets (`Z` / `±HH:MM`), and canonical UUIDs. Like every generated file it
is tracked by the manifest, so you can adapt the bodies and the tool will leave
your edits alone.

Rules `validator` cannot express from the spec alone are **left as a comment and
skipped**, never dropped silently:

- `pattern` (needs a compiled `Regex`, so no inline pattern),
- a `format` that is neither a built-in nor one of the presets above,
- a free-text `rule`,
- validation on an alias (`type X = String` cannot carry attributes).

## Config reference

```ts
import { defineConfig } from "@em/codegen";

export default defineConfig({
  spec: "board.spec.yaml",         // relative to this file
  out: "crates/shop",
  crate: {
    name: "shop",                  // defaults to spec name in snake_case
    edition: "2024",
    version: "0.1.0",
    deps: [{ name: "tracing", version: "0.1" }], // merged with detected deps
  },
  typeMap: { uuid: "uuid::Uuid", datetime: "chrono::DateTime<chrono::Utc>" },
  generators: {
    queries: true,                 // false by default
    services: true,
    // every generator can take an options object instead of a boolean
  },
  templatesDir: ".codegen/templates",
  rustfmt: true,
  filters: { shout: (s) => String(s).toUpperCase() },
  passes: [myPass],
});
```

Primitives map to `String`, `i64`, `f64`, `bool` by default and can be extended
or overridden through `typeMap`. A required field renders as the bare type; an
optional field (no `required: true` in the spec) wraps in `Option`, and an
`array` field in `Vec`.

## Templates

Templates are plain `.njk` files. They are looked up in this order, so a file
with the same name in an earlier directory shadows the later ones:

1. `config.templatesDir`
2. `<config dir>/.codegen/templates`
3. the built-in templates shipped with the tool

Run `em-codegen eject` to copy the built-ins into `.codegen/templates` and edit
them. Each job passes `crate` and, for per-item templates, `artifact` (or `dir`
for `mod.rs`).

Built-in filters: `snake`, `pascal`, `camel`, `kebab`, `doccomment`,
`joinlines` — plus any `filters` you register in the config.

Useful `artifact` fields: `rustName`, `fileName`, `modulePath`, `doc`, `fields`
(each with `rustName`, `rustType`, `optional`, `array`, `needsRename`, `doc`),
`variants` (enums), `aliasOf` (aliases), `methods` (services), `action`.

## Extending

Three extension points, in increasing power:

1. **Templates** — override or add `.njk` files (no code).
2. **Custom filters** — add `filters` in the config; usable from any template.
3. **IR passes** — add `passes` to transform the crate IR before rendering:

```ts
import type { IrPass } from "@em/codegen";

const addServerDerive: IrPass = (crate) => crate; // mutate/clone as needed
```

For whole new output targets, add a generator module implementing the
`Generator` interface (`{ name, generate(ctx) }`) and register it. The
`Generator`/`RenderJob`/`IrCrate` types are exported from the package.

## Manifest and safe regeneration

Every run records a content hash per file in
`<config dir>/.codegen/manifest.json`. On the next run:

- a file that matches its recorded hash is overwritten;
- a file whose contents drifted from the record (edited by hand) is **left
  alone** and reported — pass `--force` to overwrite;
- `--check` never writes and exits non-zero if any file is missing or stale.

## Development

```bash
pnpm --filter @em/codegen typecheck
pnpm test                       # from the repo root, runs these tests too
```

The example under `examples/shop` is a runnable end-to-end fixture.
