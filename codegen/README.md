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
                           [--templates DIR] [--force] [--dry-run]
em-codegen templates [--lang rust] --out DIR [--force]
em-codegen languages
```

| Flag | Meaning |
| --- | --- |
| `--lang` | Target language. Defaults to `rust`. |
| `--out` | Output directory. Defaults to `generated/<package-name>`. |
| `--name` | Override the generated package/crate name. |
| `--templates` | Directory with template overrides (same layout as the defaults). |
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
    domain_event.rs      # DomainEvent trait implemented by every event
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
- **Events** — one struct per event implementing `DomainEvent`. There is no
  central event enum.
- **Commands / Queries** — an input/params struct plus a response struct. Each
  input/params struct implements the `Action` trait so its permission string is
  available without knowing the concrete type.
- **States / Views** — one struct per projection, holding both its params and
  its projected fields. Each struct gets a `new(params...)` factory that
  initialises the projected fields with `Default::default()`. A reducer trait
  carries one `on_*` handler per event type an in-memory state reads, while a
  `Store` trait carries the asynchronous handlers for a view stored in a
  database. States are rebuilt on every rehydration; views are persisted. A
  domain only gets a `views.rs` module when it actually owns View cards. The
  query sources and tags are recorded in the doc comments.
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

The generated `src/domain_event.rs` contains:

```rust
pub trait DomainEvent: Serialize + DeserializeOwned + Send + Sync + 'static {
    fn event_type() -> &'static str;
    fn tags(&self) -> Vec<String>;
    fn to_store_event(&self) -> Result<Event, serde_json::Error>;
    fn to_store_event_with_metadata<M: Serialize>(
        &self,
        metadata: &M,
    ) -> Result<Event, serde_json::Error>;
}
```

Every event struct implements `event_type()` and `tags()`; tags come from the
fields marked with a `tag` in the spec. The `Event` type is **not** generated:
the crate depends on [`event-store`](https://github.com/0m3kk/backend-kit) from
`backend-kit` and re-exports `Event` from the crate root. That dependency is
already in the generated `Cargo.toml`, so the trait can rely on
`Event::new()` and `Event::with_metadata()` directly.

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

- `CrateCtx` for root files: spec metadata, counts, `domains`, `shared`,
  `has_shared`, `actors` and dependency flags
  (`uses_json`, `uses_chrono`, `uses_uuid`, `uses_regex`).
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

This generator produces the **typed skeleton** of the domain: DTOs, the event
contract, service traits, projection structs with their reducer/store handler
traits and metadata. It deliberately does not generate command handlers or
event-store persistence. `serde` derives are included so the output can be used
directly with an event store.
