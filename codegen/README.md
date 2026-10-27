# `em-codegen`

Template-driven code generator for the event-modeling `*.spec.yaml` documents
produced by the board.

The generator parses and normalises a spec, builds a language-independent model
(domains, types, events, commands, queries, states, services, actors, tags...)
and renders it through per-language MiniJinja templates. **Rust is the first
target**; adding another language means adding a new `Generator` implementation
and a template tree.

## Quick start

```sh
cd codegen

# Generate a Rust crate from the sample spec
cargo run -p em-codegen -- generate samples/authentication.spec.yaml \
  --out generated/authentication

# Verify the generated crate
cd generated/authentication
cargo check
```

`em-codegen` builds to `target/debug/em-codegen`, so after one build you can
also run it directly:

```sh
cargo build
./target/debug/em-codegen generate samples/authentication.spec.yaml \
  --out generated/authentication
```

## CLI

```text
em-codegen generate <SPEC> [--lang rust] [--out DIR] [--name NAME]
                           [--domain NAME] [--templates DIR]
                           [--migrations DIR] [--force] [--dry-run]
em-codegen templates [--lang rust] --out DIR [--force]
em-codegen languages
```

| Flag | Meaning |
| --- | --- |
| `--lang` | Target language. Defaults to `rust`. |
| `--out` | Output directory. Defaults to `generated/<package-name>`. |
| `--name` | Override the generated package/crate name. |
| `--domain` | Generate only this domain (plus the items it depends on). |
| `--templates` | Directory with template overrides (same layout as the defaults). |
| `--migrations` | Directory for generated SQL migrations. Defaults to `<out>/migrations`. |
| `--force` | Allow writing into a non-empty output directory. |
| `--dry-run` | List the files that would be written, without writing them. |

`templates` dumps the embedded defaults so they can be edited:

```sh
cargo run -p em-codegen -- templates --out my-templates
# edit my-templates/rust/...
cargo run -p em-codegen -- generate samples/authentication.spec.yaml \
  --templates my-templates --out generated/authentication
```

Override files replace the embedded template with the same relative name. Any
template you don't override keeps using the embedded default, so you can
customise one file without copying the whole tree.

## Generating a single domain

Pass `--domain` to generate a crate for one domain instead of the whole spec:

```sh
cargo run -p em-codegen -- generate samples/authentication.spec.yaml \
  --domain password --out generated/authentication_password
```

The domain's modules are written directly under `src/` (`commands.rs`,
`events.rs`, `queries.rs`, `services.rs`, `states.rs`, `types.rs`, and
`views.rs` when the domain has views) instead of nesting them under
`domains/`. Types and events that the domain needs from other domains are
emitted under `src/shared` and referenced as `crate::shared::...`, so the crate
still compiles on its own. The generator prints a warning when it pulls such
items in. Unassigned spec items keep going to `shared` as usual.

Without `--name`, the package is named `<spec>_<domain>` (for example
`authentication_password`), and the default output directory follows it:
`generated/authentication_password`. Actors are still generated at the crate
root; `DomainEvent` and `Event` are imported directly from `event-store`.

## Views and migrations

A `View` card describes a persisted read model backed by a PostgreSQL table. In
addition to the usual `query` and `states`, a view may declare its table shape:

```yaml
views:
  - name: productList
    table: product_list_view     # optional; defaults to <view>_view
    key: [productId]             # primary key, supports composite keys
    indexes:
      - columns: [name]
      - columns: [price, status]
        unique: false
        name: idx_product_list_price_status
    query:
      - types: [productCreated, productUpdated, productDeleted]
    states:
      - name: productId
        type: string
        required: true
```

For each view the Rust generator emits:

- A row struct with the projected fields. Views do **not** get a `new()` factory
  or `Default` implementation; an empty row is not a valid table row.
- A `ViewDefinition` type plus a `<VIEW>_VIEW` constant exposing the table name
  and primary-key columns.
- An asynchronous `<View>Store` trait with one `on_*` method per event type,
  receiving the typed event and its sequence position. The application layer
  implements these methods with SQL.
- One migration per view:
  `<version>_<domain>_<table>.sql`. The version is derived deterministically from
  the domain and table, so regenerating does not create duplicate migrations.
  The migration creates the table, primary key, declared indexes, and the
  standard `last_event_position`, `created_at`, and `updated_at` columns.

Pass `--migrations` to write migrations to the service's root migration
directory:

```sh
cargo run -p em-codegen -- generate samples/authentication.spec.yaml \
  --out generated/authentication --migrations migrations
```

Generated migrations describe the initial table shape. Once a migration has
been applied, add a manual migration for later schema changes instead of
rewriting the applied file.

Rust types map to PostgreSQL types as follows: `String` → `TEXT`, `i64` →
`BIGINT`, `f64` → `DOUBLE PRECISION`, `bool` → `BOOLEAN`, `json` → `JSONB`,
`date` → `DATE`, `time` → `TIME`, `datetime` → `TIMESTAMPTZ`, `uuid` → `UUID`,
and enums/aliases resolve to their underlying type (`TEXT` for enums).

## Generated Rust layout

The crate is split by **domain**. Each domain owns its types, events, commands,
queries, states, views and services. The generated crate uses **Rust edition
2024**:

```text
<package>/
  Cargo.toml
  README.md
  src/
    lib.rs
    actors.rs            # actors + permissions (outside the domains)
    action.rs            # Action trait mapping commands/queries to permissions
    domains/
      mod.rs
      identity/
        mod.rs           # pub mod + re-exports
        commands.rs
        events.rs
        queries.rs
        services.rs
        states.rs
        types.rs
        views.rs         # only when the spec declares views
      totp/
        ...
    shared/              # only when the spec has unassigned items
      mod.rs
      commands.rs
      events.rs
      queries.rs
      services.rs
      states.rs
      types.rs
      views.rs         # only when the spec declares views
```

Slices and constraints are **not** emitted as Rust modules. They are still
parsed and used internally to assign types, events, commands, queries, states,
views and services to domains.

With `--domain`, the selected domain's modules sit at the crate root (`src/`),
with no `domains/` folder. Types and events owned by other domains that the
selected domain references are written to `shared/` and referenced as
`crate::shared::...`, so the crate stays self-contained.

Every generated file starts with a do-not-edit header. The comment syntax
follows the file type (`//` for Rust, `#` for TOML and dotfiles, `<!-- -->` for
Markdown).

What is generated:

- **Types** — objects become structs, enums become Rust enums with a spec-name
  `as_str()`, aliases become serde-transparent newtypes. All generated types
  derive `Default` (enums default to their first variant) so projection
  factories can initialise unset fields. `date` maps to `chrono::NaiveDate`,
  `time` to `chrono::NaiveTime`, `datetime` to `chrono::DateTime<Utc>`, and
  `uuid` (or `format: uuid`) to `uuid::Uuid`.
- **Events** — one struct per event implementing `event_store::DomainEvent`.
  There is no central event enum and no generated event-contract module.
- **Commands / Queries** — an input/params struct plus a response struct. Each
  input/params struct implements the `Action` trait so its permission string is
  available without knowing the concrete type.
- **States / Views** — one struct per projection, holding both its params and
  its projected fields. States get a `new(params...)` factory that initialises
  the projected fields with `Default::default()`; a state without params also
  implements `Default`. A reducer trait carries one `on_*` handler per event type
  an in-memory state reads. A state with handlers also gets an `apply` method
  that dispatches on the stored event type, deserializes the payload, and calls
  the matching reducer method. `StateError` covers deserialization and
  unexpected event types; reducer errors must implement `From<StateError>`.
  Views are persisted table contracts: they get a `ViewDefinition` constant and
  a `Store` trait whose handlers receive the typed event and its sequence
  position; the application layer implements them with SQL. A domain only gets a
  `views.rs` module when it actually owns View cards. The query sources and tags
  are recorded in the doc comments.
- **Services** — one trait per `serviceName`, with `Params`/`Returns` structs,
  generated inside the domain whose slices call the service. Methods return
  `impl Future<Output = ...> + Send`, so implementations can use `async fn`
  without an `async-trait` dependency and without an `allow` attribute.
- **Actors** — an `Actor` enum, permission lists, `Actor::can()` with
  `domain:*` wildcard support, and `Actor::can_execute::<A>()` for any `Action`.
- **Validation** — validation is generated only for **command input structs** and
  **query params structs**. Other generated items (types, events, states,
  services, aliases) carry no `validator` derive or `Validate` impl. Constraints
  declared on an alias are inlined as a `custom` validator function in the
  command/query module, so value-object rules still run at the boundary.

Cross-domain references are emitted as fully-qualified paths such as
`crate::domains::identity::types::Email`. Optional fields become `Option<T>`
with `#[serde(default, skip_serializing_if = "Option::is_none")]`.

### Naming

All serialized names are `snake_case`:

- `event_type()` values (`account_registered`)
- JSON field names (`account_id`, `expires_at`)
- enum wire values (`cross_platform`)
- tag names (`password_reset`)
- actor names and permissions (`account_owner`, `identity:register_account`)

Rust struct/trait/enum identifiers remain `PascalCase`, and Rust
fields/functions/modules remain `snake_case`, matching Rust conventions. No
`#[serde(rename = ...)]` attributes are emitted; serde uses the Rust field names
directly.

### Validation

`validator` is a generated dependency, but validation is emitted **only for
command input structs and query params structs**. Responses, events, states,
services, types and aliases do not derive/implement `Validate`.

| Spec | Generated |
| --- | --- |
| `minLength` / `maxLength` | `#[validate(length(min = ..., max = ...))]` |
| `minItems` / `maxItems` | `#[validate(length(...))]` on the array |
| `format: email` | `#[validate(email)]` |
| `format: url` | `#[validate(url)]` |
| `pattern` | a `LazyLock<Regex>` static + `#[validate(regex(path = *STATIC))]` |
| `min` / `max` | `#[validate(range(min = ..., max = ...))]` |
| field of alias type | a generated `custom(function = "validate_...")` that applies the alias constraints |
| `rule` | documentation only |

When a command/query field uses an alias with constraints (for example `Email`
with `format: email` or `TotpCode` with a pattern), the generator writes a
`validate_*` function in the same command/query module. The alias itself stays a
plain newtype. Regex statics are emitted in the module that uses them. The
generator does not emit `allow(...)` attributes.

### Domain event contract

The `DomainEvent` trait and the `tag_value` helper come from the
[`event-store`](https://github.com/0m3kk/backend-kit) crate in `backend-kit`.
The generator does **not** emit a local `src/domain_event.rs` and does not
re-export the trait. Import it from the dependency directly:

```rust
use event_store::DomainEvent;
```

Every event struct implements `event_store::DomainEvent`, providing
`event_type()` and `tags()`; tags come from the fields marked with a `tag` in
the spec. The trait's default methods use `Event::new()` and
`Event::with_metadata()` from the same crate, so the generated `Cargo.toml`
already depends on `event-store`.

### Actions and authorization

The `action` declared on a command or query is the permission checked against
actor permissions. Each command input struct and query params struct implements
`Action`:

```rust
pub trait Action {
    fn action() -> &'static str;
}

impl crate::action::Action for RegisterAccount {
    fn action() -> &'static str {
        "identity:register_account"
    }
}
```

The action string is normalised to `snake_case`, matching
`Actor::permissions()` (`identity:register_account`, `totp:*`, ...). Use it
directly or through the helper:

```rust
use authentication::{Action, Actor};
use authentication::domains::identity::commands::RegisterAccount;

assert!(Actor::Guest.can_execute::<RegisterAccount>());
```

When a command or query has no `action` in the spec, no `Action` impl is
generated, since there is no permission to compare against. The action is also
recorded as `Action: \`...\`` in the struct's doc comment.

## How cards are assigned to domains

The spec does not store a domain on every card, so the normaliser derives it:

1. `domains[].cards` — explicit membership.
2. `groups[].cards` — the group's `domain` (or the domain that lists the group).
3. `slices[].domain` — the domain of every card in that slice's lanes.
4. A service method joins the domain of the **first slice** that calls it.
5. Anything still unassigned goes to `shared/`.

A domain referenced by a group or slice but missing from `domains` is generated
anyway, with a warning. Duplicate definition names and duplicate service methods
are dropped with a warning rather than failing the run.

## Template context

Rust templates receive one of two contexts:

- `CrateCtx` for root files: spec metadata, counts, `domain` (the `--domain`
  selector, when used), `domains`, `shared`, `has_shared`, `actors` and
  dependency flags (`uses_json`, `uses_chrono`, `uses_uuid`, `uses_regex`).
- `DomainCtx` for each `domains/<domain>/` file: `name`, `module`,
  `module_ident`, and the `types`, `events`, `commands`, `queries`, `states`,
  `views`, `services` and `pub_uses` owned by that domain.

Built-in filters: `pascal`, `camel`, `snake`, `kebab`, `shouty_snake` and
`str_lit` (a quoted, escaped Rust/TOML string literal).

## Workspace

| Crate | Purpose |
| --- | --- |
| `crates/core` | Spec contract, normalisation, domain assignment, template engine, `Generator` trait. |
| `crates/rust` | Rust context builder, embedded templates and `RustGenerator`. |
| `crates/cli` | The `em-codegen` binary. |

### Adding a language

1. Create `crates/<lang>` implementing `em_codegen_core::generator::Generator`.
2. Embed your templates (or load them from disk) and render them from the
   normalised `Model`.
3. Register the generator in `crates/cli/src/main.rs`:

```rust
fn generators() -> Vec<Box<dyn Generator>> {
    vec![Box::new(RustGenerator), Box::new(MyGenerator)]
}
```

## Current scope

This generator produces the **typed skeleton** of the domain: DTOs, event
types implementing `event_store::DomainEvent`, service traits, projection
structs with their reducer/store handler traits and metadata. It deliberately
does not generate command handlers or event-store persistence. `serde` derives
are included so the output can be used directly with an event store.
