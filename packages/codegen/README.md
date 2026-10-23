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
em-codegen gen [spec] [options]        Generate the crate (and the workspace scaffold when enabled)
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
| `--force` | Overwrite hand-edited files; take the generated version of merge files |
| `--no-rustfmt` | Skip `rustfmt` post-processing |

## Pipeline

```
spec.yaml -> parse (zod) -> hoist types -> build IR -> run passes
          -> plan render jobs -> render (Nunjucks) -> stamp banner -> rustfmt
          -> write (overwrite / 3-way merge / create-only) + manifest
```

- **parse** uses `@em/spec`: YAML -> validated document.
- **hoist** normalises the Object/Enum/Alias definitions into a single `types`
  registry (lifting any legacy inline definitions), so downstream everything
  refers to a type by name.
- **build IR** maps spec primitives to Rust types, renders field types and
  identifiers, decides each item's module path and detects crate dependencies.
- **passes** are scriptable IR transforms (see below).
- **render** runs each generator's jobs through Nunjucks.
- **banner** prepends the header that matches the file's strategy (see
  [Generated file header](#generated-file-header)).
- **write** applies the strategy: overwrite (manifest-protected), three-way
  merge against `.codegen/baseline/`, or create-only. Core files the spec no
  longer emits are pruned; scaffold files are kept and reported.

## Output layout

Every domain module lives under `domains/`, one folder per domain (plus
`common`), one folder per kind, one file per item. The axum HTTP transport, when
generated, lives under `transports/`:

```
crates/shop/
  Cargo.toml
  .gitignore
  src/
    lib.rs
    prelude.rs                 # flat re-exports of every data type
    validation.rs              # helpers for formats validator has no check for
    domains/                   # every domain module lives under here
      mod.rs
      <domain>/
        mod.rs
        events/    mod.rs + <event>.rs
        commands/  mod.rs + <command>.rs
        queries/   mod.rs + <query>.rs
        views/     mod.rs + <view>.rs
        states/    mod.rs + <state>.rs
        services/  mod.rs + <service>.rs
        types/     mod.rs + <type>.rs
      common/  ...             # items that belong to no domain / are shared
    transports/                # the axum HTTP transport (api generator)
      mod.rs                   # the Api handler registry
      router.rs                # axum::Router + one dispatch handler per item
      extract.rs               # ExecutionContext from request headers
      error.rs                 # ApiError (default error type)
      openapi.rs               # utoipa ApiDoc + openapi() (when openapi is on)
  migrations/                  # sqlx up/down migrations, with `views.migrations` on
    <version>_create_<table>.up.sql
    <version>_create_<table>.down.sql
```

A data type is placed in the domain that lists it — in `domains[].cards` or,
through a group, in `groups[].cards`. A type that is not listed anywhere falls
back to the single domain that uses it, or `domains/common/types` when used by
several (or none). A card's domain is resolved from, in order: `domains[].cards`, the
cards of a group that belongs to a domain (`groups[].cards`), then the cards
named in a slice lane (`slices[].lanes[].cards`) — because boards usually attach
cards to slices and groups rather than to the domain directly.

Commands and queries generate two structs: the request (`PlaceOrder`) from the
inputs/params and, when the spec declares responses, a `PlaceOrderResponse`.
Generated `struct`s and `enum`s serialize with `#[serde(rename_all =
"snake_case")]`, so field and variant names are snake_case on the wire.

Every generated struct — command/query requests and responses, events and object
types — also carries a constructor and fluent setters:

```rust
pub struct PlaceOrder {
    pub order_id: OrderId,          // required: true in the spec
    pub items: Option<Vec<String>>, // optional in the spec
}

impl PlaceOrder {
    /// Create with the required fields set and the optional fields `None`.
    pub fn new(order_id: OrderId) -> Self { /* … */ }

    /// Set `items` (takes the inner `Vec<String>` and wraps it in `Some`).
    pub fn with_items(mut self, value: Vec<String>) -> Self { /* … */ }
}
```

`new` takes the required fields (a field without `required: true` is optional)
as parameters and leaves the optional ones `None`. A `with_<field>` method is
generated for every field: for optional fields it accepts the unwrapped type and
stores `Some(value)`, for required fields it replaces the value directly. A
request then reads as `PlaceOrder::new(order_id).with_items(items)`.

### Data types and aliases

Object types render as structs and enum types as enums (both derive `Default`,
which projections rely on). An **Alias** renders as a transparent **newtype** by
default, so an id stays distinct from any other string and alias validation is
enforceable:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct OrderId(pub String);

impl OrderId {
    pub fn new(value: impl Into<String>) -> Self { /* … */ }
    pub fn as_inner(&self) -> &String { /* … */ }
    pub fn into_inner(self) -> String { /* … */ }
}
// Plus From<inner>/From<OrderId> for inner, AsRef, Deref and Display.
```

An alias of `uuid` (with `typeMap: { uuid: "uuid::Uuid" }`) gets a time-ordered
constructor: `OrderId::new()` returns `OrderId(Uuid::now_v7())` (the crate then
depends on `uuid` with the `v7` feature). Set `crate.aliases: "alias"` to render
a bare `pub type OrderId = String;` instead.

### Services

Each Service method becomes an **async** trait method. The return type follows
the declared `returns`:

- none -> `()`;
- one -> that field's type;
- more than one -> a generated `<Service><Method>Result` struct (with the same
  constructor/`with_*` builders as every other generated struct), returned by
  the method.

```rust
#[async_trait::async_trait]
pub trait OrderService {
    async fn place(&self, order_id: OrderId) -> OrderId;
    async fn quote(&self) -> OrderServiceQuoteResult;
}
```

`async-trait` is added to the crate whenever a Service exists.

### Handler traits

Each command and query file also declares an async handler trait to implement in
your own module:

```rust
/// Implement this in your own module; the generated request and response types
/// are fixed and never edited by hand.
#[async_trait::async_trait]
pub trait PlaceOrderHandler {
    /// Error returned when the command cannot be handled.
    type Error;

    async fn handle(
        &self,
        ctx: &ExecutionContext,
        command: PlaceOrder,
    ) -> Result<PlaceOrderResponse, Self::Error>;
}
```

The request struct is passed by value (as `command` for a command and `query`
for a query), alongside a borrowed [`ExecutionContext`](#execution-context); the
result is the generated `...Response` struct, or `()` when the spec declares no
responses. `async-trait` is added to the crate whenever a command or query
exists (the same dependency Views use).

### Execution context

When the crate declares at least one command or query, the generator emits
`src/execution_context.rs` (re-exported as `crate::ExecutionContext`): request
metadata (actor, tenant, correlation/causation ids, trace/span ids, client IP,
user-agent, plus free-form `extra`) carried into handlers. It is a builder with
`with_*` setters and bridges to the event store:

```rust
let ctx = ExecutionContext::new()
    .with_actor_id("user-1")
    .with_correlation_id("corr-1");

let event = OrderPlaced::new().with_order(order);
let store_event = ctx.create_store_event(&event)?;   // event + EventMetadata
let events = ctx.create_store_events([&event])?;
```

`to_metadata()` / `to_metadata_at(ts)` produce an `event-store::EventMetadata`;
`create_store_event` / `create_store_events` wrap one or more `DomainEvent`s into
`event-store::Event`s carrying that metadata. To support this, the generated
`DomainEvent` trait gains a default `to_store_event_with_metadata` method. The
crate pulls in `event-store`, `serde_json` and `time` whenever the execution
context is generated.

## HTTP API (axum)

Turn on the `api` generator to get an axum transport for every command and
query, plus an [utoipa](https://docs.rs/utoipa) OpenAPI document. You register a
handler for each command and query; the generator writes the routing, JSON I/O,
header extraction and OpenAPI wiring.

```ts
generators: {
  queries: true, // queries are off by default
  api: true,     // or { enabled: true, prefix: "/api", openapi: true }
}
```

The generator writes:

```
src/transports/
  mod.rs       # the Api handler registry (build it, then pass it to router)
  router.rs    # axum::Router + one dispatch handler per command/query
  extract.rs   # ExecutionContext from request headers
  error.rs     # ApiError (default error type)
  openapi.rs   # utoipa ApiDoc + openapi() (when openapi is on)
```

### Registering handlers

Each command and query already has a generated handler trait (see
[Handler traits](#handler-traits)). Implement those traits, then register them on
the generated registry:

```rust
// Implement the generated traits — one per command/query.
impl PlaceOrderHandler for PlaceOrderImpl {
    type Error = shop::transports::ApiError;
    async fn handle(&self, ctx: &ExecutionContext, command: PlaceOrder)
        -> Result<PlaceOrderResponse, Self::Error> { /* ... */ }
}

let api = shop::transports::Api::new()
    .with_place_order(PlaceOrderImpl { /* ... */ })
    .with_get_order(GetOrderImpl { /* ... */ });

let app = shop::transports::router(api);
// axum::serve(listener, app).await?;
```

`Api` is generic over the error type the handlers return (default it to
`ApiError` or use your own `IntoResponse` type). Every registered handler must
share that error type. A route whose handler was not registered answers
`500 Internal Server Error`, so register every route the spec declares. The
`ExecutionContext` is built from the request headers
(`x-actor-id`, `x-tenant-id`, `x-correlation-id`, `x-causation-id`,
`traceparent` / `x-trace-id` / `x-span-id`, `x-forwarded-for` / `x-real-ip`,
`user-agent`).

### Routes

Commands are `POST` endpoints with a JSON body. Queries are `GET` endpoints and
receive their params from the query string (axum `Query<T>`); a query whose
params cannot round-trip through a URL (an array or an object field) falls back
to `POST` with a JSON body. The path comes from the item's `action`, so
`action: sales:placeOrder` becomes `POST /api/sales/place-order` (the `prefix`,
default `/api`, is configurable). When an item has no `action`, the path falls
back to `/api/commands/<name>` or `/api/queries/<name>`. Colliding paths get a
numeric suffix. Command and query routes without responses answer
`204 No Content`.

### OpenAPI

With `openapi` on (the default) every generated request, response, event and
data type derives `utoipa::ToSchema`, and the crate exposes the document:

```rust
let doc = shop::transports::openapi(); // utoipa::openapi::OpenApi (3.1)
```

Serve or dump it wherever you like (for example mount the `utoipa-swagger-ui`
router in your own `main`). Set `api: { openapi: false }` to skip the utoipa
derive and the document.

### Errors

`src/transports/error.rs` defines a ready-to-use `ApiError` with `bad_request`,
`not_found`, `conflict` and `internal` constructors. It renders as JSON
`{"error":{"code":"...","message":"..."}}` with the matching status code. Use it
as the handlers' `Error` type, or set the registry's error type to any type
implementing `axum::response::IntoResponse`.

The API generator pulls in `axum`, `tokio` and (with `openapi`) `utoipa`
automatically.

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
- validation on an alias **is** enforced, because aliases render as newtypes
  (with `crate.aliases: "alias"` the alias is a bare `type X = String` again and
  its validation is skipped with a note).

## State and View projections

A **State** card is an in-memory decision model and a **View** card is a read
model; both are DCB projections over the same three sections — `params`
(identity / query inputs), `query` (event `types` plus DCB `tags` bound to
params) and `states` (the projected fields). The generator emits one
self-contained file per card; State and View share the same shape and differ
only in whether the reducer is async:

```rust
pub struct OrderState {          // params + projected fields share the struct
    pub order_id: OrderId,       // params are the identity, always required
    pub status: Option<Status>,  // projected fields keep the spec's optionality
}

/// Implement this in your own module — the generated file is never edited.
/// A **State** folds in memory, so the reducer is a plain sync trait.
pub trait OrderStateReducer {
    fn on_order_placed(&self, state: &mut OrderState, event: &OrderPlaced);
}
```

Each file also carries an error enum and an `impl` with a factory, the DCB
query, and a `load` driver:

- `OrderState::new(<params>)` — factory that sets the params and defaults the
  projected fields (generated data types derive `Default`).
- `fn query(&self) -> event_store::Query` — one `QueryItem` per spec query item;
  each event `type` becomes `<Event>::event_type()` (falling back to a literal
  snake_case string when it does not resolve to a generated event) and each
  `tag` (normalized to snake_case) renders as `format!("{tag}:{}", self.<param>)`.
- `fn stream_query() -> event_store::Query` — **Views only**: the same query
  with the tags dropped, so a materialized View can replay every entity at once
  instead of filtering on one instance's params.
- `fn matches_event_type(event_type) -> bool` — **Views only**: static check
  used by the projection worker to skip views that an appended event cannot
  affect.
- `const TABLE_NAME` — **Views only**: the physical table a View is materialized
  into (and its checkpoint key).
- `async fn load(self, store, reducer)` — reads every matching event from an
  `event_store::EventStore`, folds it through the reducer, and returns the
  projection **and the [`SequencePosition`] of the last event folded** so the
  caller can build an `AppendCondition` for optimistic concurrency.
- `async fn load_since(self, store, reducer, from)` — the same fold starting at
  an inclusive position, returning `(projection, last_position, applied_count)`
  so a catch-up can resume from a checkpoint and report progress.
- `async fn load_stream_since(self, store, reducer, from)` — **Views only**: the
  whole-read-model variant used by the worker; it folds `stream_query()` rather
  than the instance query.

Use it as:

```rust
let (state, position) = OrderState::new(order_id).load(&store, &app).await?;
let events = ctx.create_store_events([&OrderPlaced::new(/* … */)])?;
store
    .append(events, Some(AppendCondition::new(state.query(), position)))
    .await?;
```

Projections add the `event-store`, `futures-util` and `serde_json` dependencies
automatically (plus `async-trait` when a View is present); `event-store` is
pulled from `https://github.com/0m3kk/backend-kit.git`. Override it (for example
with a local checkout) through `crate.deps`:

```ts
crate: { deps: [{ name: "event-store", path: "../backend-kit/crates/event-store" }] }
```

A **State** is folded in memory, so its reducer methods are plain, sync and
infallible (`fn on_...(...)`), and its error enum is `<Name>Error<E>`. A
**View** persists (or otherwise performs side effects) while folding, so its
reducer is `#[async_trait::async_trait]` with an associated `Error` type and
`async fn ...(state, event, position) -> Result<(), Self::Error>` methods; its
error enum is `<Name>Error<E, R>` with an extra `Reducer` variant, and
`async-trait` is added to the crate. The `position` lets a handler store the
applied event's sequence position in the row.

### Materializing a View

A View is a **persisted read model**, so the scaffold turns it into a working
catch-up pipeline rather than a stub:

- the application crate gains `src/views.rs` with `last_position` /
  `update_position`, backed by a `view_checkpoints` table;
- each View's reducer implementation carries the shared `AppState`, so its
  `on_<event>` methods can reach the PostgreSQL pool (`self.state.pool()`) and
  idempotently upsert rows using `<View>::TABLE_NAME` and the folded event's
  `position`;
- each View's `catchup` driver reads the checkpoint, calls
  `load_stream_since`, folds every matching event, advances the checkpoint and
  returns the projected event count;
- `AppState` gains an optional pool (`with_pool` / `pool`), wired by the server
  and the worker; `src/views.rs` also exposes `internal(error)` so reducers can
  map infrastructure failures onto the application error type.

Only the business mapping — which event fields land in which columns, and how a
delete removes a row — stays in the reducer implementation. The generated code
owns the resume position, batching loop, event decoding and checkpoint
monotonicity (the `UPDATE … WHERE position < EXCLUDED.position` guard means a
replayed event can never rewind a view).

Events named in a query that are not in the spec, and tags that do not bind to a
param, are dropped and reported as `// note:` comments at the top of the file —
never generated as broken code.

### View migrations

Set `views.migrations` to also emit a SQL migration for every View read model.
Each View becomes a reversible [sqlx](https://docs.rs/sqlx) migration under
`<out>/migrations/` — a `<version>_create_<table>.up.sql` and a matching
`.down.sql`:

```ts
generators: {
  views: { enabled: true, migrations: true },
}
```

```
crates/shop/migrations/
  20240101000000_create_view_checkpoints.up.sql
  20240101000000_create_view_checkpoints.down.sql
  20240109603210_create_order_shipping_view.up.sql
  20240109603210_create_order_shipping_view.down.sql
```

```sql
-- @generated by @em/codegen. Do not edit by hand.
-- Edit the spec or the templates, then rerun `em-codegen gen`.

-- Shipping details of an order.
-- Generated from the `OrderShippingView` view by @em/codegen.
-- The schema mirrors the generated read model; tracked in the manifest.

CREATE TABLE IF NOT EXISTS "order_shipping_view" (
    "order_id" text NOT NULL,
    "shipped_at" text,
    "last_event_position" bigint NOT NULL DEFAULT 0,
    "created_at" timestamptz NOT NULL DEFAULT NOW(),
    "updated_at" timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("order_id")
);

CREATE INDEX IF NOT EXISTS "idx_order_shipping_view_last_event_pos" ON "order_shipping_view" ("last_event_position");
```

```sql
-- @generated by @em/codegen. Do not edit by hand.
-- Edit the spec or the templates, then rerun `em-codegen gen`.

-- Shipping details of an order.
-- Generated from the `OrderShippingView` view by @em/codegen.
DROP TABLE IF EXISTS "order_shipping_view";
```

The schema mirrors the generated Rust struct, targeting **PostgreSQL**:

- the View's `params` (its identity) are the primary key and are always
  `NOT NULL`;
- projected fields keep the spec's optionality (`NOT NULL` when `required:
  true`, nullable otherwise), using the snake_case field names;
- every root table also carries the backend read-model bookkeeping columns:
  `last_event_position` (advanced by the reducer and used to reject stale
  events), `created_at` and `updated_at`, plus an index on the position. A
  spec column with one of those names wins and the generated column is skipped
  with a `-- note:`;
- a single `view_checkpoints` table (`view_name`, `position`, `updated_at`) is
  emitted once per migration set, pinned to the version epoch so it always
  applies before the tables it serves;
- types map to `text`, `boolean`, `smallint` / `integer` / `bigint`, `real` /
  `double precision`; `json` fields become `jsonb`; `uuid`, `timestamptz`,
  `date` and `time` are recognised from the configured `typeMap` (for example
  `uuid: "uuid::Uuid"`), and arrays keep their scalar element type (`text[]`,
  `uuid[]`, …);
- **object fields are flattened** rather than stored as JSON. A `profile` of
  type `AccountProfile { firstName, lastName }` becomes the columns
  `profile_first_name` and `profile_last_name`, recursing through nested
  objects; a flattened column is `NOT NULL` only when both it and every object
  on the way to it are required;
- an **array of objects becomes a child table** (one row per element), because a
  list cannot fit in a single row. The child table is named
  `<view_table>_<field>`, carries the parent's primary key columns as a foreign
  key, and adds a `<field>_index` column that preserves the array order — so it
  has its own `up`/`down` migration pair, versioned after the parent.

Only types with no scalar mapping at all (for example an unknown named type)
fall back to `jsonb`, with a `-- note:` in the header.

A View's version prefix is derived from its table name and a child table sits in
the version slot right after its parent, so file names and the parent-before-
child order are stable across runs and `--check` stays quiet. Because sqlx runs
down migrations in reverse version order, the child (higher version) is dropped
before the parent it references. Like every generated file, migrations are
tracked by the manifest: edit one by hand and the generator will report the
drift instead of clobbering it.

## Workspace scaffold

Set `scaffold.enabled` to have the generator emit a Cargo workspace around the
contract crate: a workspace `Cargo.toml`, an **application crate** (the command,
query, state, view and service implementations) and a **server binary**.

```ts
scaffold: {
  enabled: true,
  workspace: true,                 // workspace Cargo.toml + rust-toolchain + .gitignore
  app: { crate: "shop-app" },      // defaults to "<crate>-app"
  server: { crate: "shop-server" },// defaults to "<crate>-server"
  worker: true,                    // projection worker; defaults to off
  templates: true,                 // eject the templates into templatesDir
  stubs: "todo",                   // "todo" (default) or "unimplemented"
}
```

The application crate mirrors the contract crate's layout — one folder per
domain, one folder per kind, and a self-contained module directory per item:

```
crates/shop-app/src/
  lib.rs                 # module tree (regenerated)
  error.rs               # AppError (the generated ApiError)
  state.rs               # AppState<E>, generic over the event store (and pool)
  views.rs               # View checkpoints + error bridge (when Views exist)
  register.rs            # registers every handler on the generated Api
  extension/
    mod.rs               # create-only: declare your own modules here
    register.rs          # add project routes after the generated ones
  domains/               # same grouping as the contract crate
    mod.rs               # the domains the app implements (regenerated)
    sales/
      mod.rs             # kinds this domain has: commands, states, ...
      commands/
        mod.rs
        place_order/
          mod.rs         # the PlaceOrderUseCase handler (the todo!() you fill in)
      queries/...
      states/
        order_state/
          mod.rs         # the OrderStateReducerImpl implementation
    shipping/
      commands/... views/
        order_shipping_view/
          mod.rs         # reducer + catch-up driver (when the worker is on)
    common/              # items that belong to no declared domain
      services/...
```

Every item is a single `mod.rs`: a command/query holds the handler, a view or
state the reducer (and the View catch-up driver), a service its implementation.
The generated types and traits are imported straight from the contract crate,
so neither the item modules nor their parent `mod.rs` files re-export them —
only `pub mod` wiring is generated. Only the implementation is a `todo!()`.

The technical plumbing is generated too, and is kept free of domain logic:

- `AppState<E, S = ()>` holds the shared event store (`Arc<E>`) and an optional
  snapshot store (`Option<Arc<S>>`) and is generic over both, so the same
  handlers run against the PostgreSQL stores in production and mock stores in
  tests.
- The **server binary** ships the infrastructure wiring:
  - `config.rs` — `AppConfig` (`http`, `telemetry`, `jwt`, `postgres`) and
    `AppSecret` (`telemetry`, `jwt`, `postgres`), loaded from a file,
    `CONFIG_FILE`/`SECRET_FILE` or the environment; `DATABASE_URL` overrides the
    connection host/port/database and credentials.
  - `state.rs` — builds the pool with `postgres_db::init_pool` (which also
    starts the background pool-metrics monitor), applies the pending event-store
    and snapshot-store migrations, and builds the concrete `PostgresEventStore`
    and `PostgresSnapshotStore` into the shared state.
  - `middleware/auth.rs` — `require_auth`, which verifies the bearer token with
    the configured `JwtService` (rejecting invalid/expired tokens) and forwards
    the verified `sub` claim to the generated `ExecutionContext`.
  - `handlers/mod.rs` — a place for your own server-level handlers.
  - `router.rs` — `create_router`, which merges the generated API routes and the
    base routes, applies `require_auth` to the `protected` router (add the
    routes that need an authenticated caller there), and wraps everything in
    `http_server::apply_middleware` (request id, tracing, metrics, timeouts,
    compression, CORS, security headers).
  - `main.rs` — initializes telemetry, builds the JWT service and the state,
    assembles the router and serves.
- `register` is generic over the store, so the server is what fixes the
  concrete type.

The app and server manifests get the infrastructure dependencies they need —
`event-store`; on the server also `http-server`, `jwt`, `postgres-db`,
`snapshot-store`, `telemetry` and `url` — merged in automatically. An entry you
list in `app.deps` / `server.deps` with the same name wins, so a local checkout
can replace the git source.

The workspace also ships example infrastructure files to copy and edit:
`config.example.yaml` (HTTP/CORS/security headers, telemetry, JWT, database),
`secrets.example.yaml` (JWT secret, OTLP credentials) and `.env.example`
(`DATABASE_URL`, `CONFIG_FILE`, `SECRET_FILE`). The generated `.gitignore`
already excludes `config.yaml`, `secrets.yaml` and `.env`.

It also emits repository automation under `.github/`:

- `dependabot.yml` — weekly grouped Cargo, Rust toolchain and GitHub Actions
  updates with a cooldown window (mirroring the backend-kit setup); the emitted
  `rust-toolchain.toml` pins a versioned channel (`1.99.0` instead of `stable`)
  so the toolchain updater can actually bump it;
- `workflows/ci.yml` — `cargo fmt --check`, Clippy with `-D warnings`, `cargo
  check` and `cargo test` on every push/PR. The test job boots PostgreSQL only
  when the generated workspace runs against one (a server, the View worker, or
  an app with persisted Views) and exports `DATABASE_URL` for it.

Scaffold files use three regeneration strategies:

- **Wiring is overwritten.** `lib.rs`, `register.rs`, `views.rs`,
  `domains/mod.rs` and every domain/kind `mod.rs` are regenerated on every run
  and carry the do-not-edit banner. Project code belongs in `src/extension/`:
  - `extension/mod.rs` (create-only) — declare your own modules.
  - `extension/register.rs` (merge) — add routes after the generated ones;
    `register.rs` calls it last.
- **Implementation and configurable wiring are three-way merged.** `Cargo.toml`,
  `rust-toolchain.toml`, `AppError`, `AppState`, every item `mod.rs`
  (handler/reducer/service), the server
  `config.rs`/`state.rs`/`router.rs`/`main.rs`, the worker files, the workspace
  manifest and the generated `.github/` automation. The generator stores its
  last output in `.codegen/baseline/`; on the next run it merges the new output
  over your edits with `git merge-file`. Non-overlapping changes apply silently;
  overlapping edits produce `<<<<<<<` markers and a `conflicted` report.
  Resolve them, then rerun.
- **Extension files and docs are create-only.** Written once and never touched
  again: `src/extension/mod.rs` and the READMEs.

The baseline is local tool state; `.codegen/` is ignored by the generated
`.gitignore`. A merge file with no baseline (for example after upgrading from an
older version) is left untouched and reported as `unbased`; run
`em-codegen gen --force` once to adopt the generated version, or delete the file
to have it recreated.

Rust files are formatted with `rustfmt` before they are written. A clean
three-way merge is formatted again before it is written, so inserted generated
lines never leave the project with an unrelated formatting diff. This formats
the whole merged file, including project code, which keeps later merges stable.
Conflict files are not formatted: rustfmt cannot parse the markers — resolve
them, format the file, then rerun. Set `rustfmt: false` (or pass
`--no-rustfmt`) to opt out entirely.

Adding a command to the spec rewrites the wiring and creates the new
implementation files; existing `handler.rs` bodies stay in place. Editing a
wiring file by hand is protected by the manifest like the contract crate: the
run reports it as `skipped` until `--force`.

Stale files are handled differently by strategy:

- core output that the spec no longer emits is deleted automatically when its
  content still matches the manifest (`--force` removes hand-edited stragglers
  too);
- scaffold files are never deleted. They are reported as `orphaned`, and both
  the file and its merge base are kept — re-adding the item to the spec later
  merges the new generated code over your existing implementation. The report
  repeats until you delete the stale file (deleting it also drops its base).
  A stale core file that was hand-edited is also reported as orphaned and only
  removed by `--force`.

The application crate's `register` lists every command and query, so a route can
never silently answer `500` because its handler was forgotten:

```rust
pub fn register<E, S>(api: Api<AppError>, state: AppState<E, S>) -> Api<AppError>
where
    E: Send + Sync + 'static,
    S: Send + Sync + 'static,
{
    let api = api.with_place_order(PlaceOrderUseCase::new(state.clone()));
    crate::extension::register::register(api, state)
}
```

Run `em-codegen gen` with `scaffold.enabled` to write the workspace. The
contract crate (the `out` directory) is still manifest-managed, so
`em-codegen gen --check` in CI catches drift there. Scaffold wiring is checked
too; merge files are checked against their baseline (a project edit alone is not
drift), and files without a baseline are skipped.

### Projection worker

Set `scaffold.worker` to also scaffold a **projection worker** that keeps the
View read models up to date. It mirrors the backend service: a PostgreSQL
`LISTEN`/`NOTIFY` subscription for near real-time sync, a periodic polling
fallback ticker, a debounce window that coalesces notification bursts, and
active-passive leader election through an advisory lock (only one replica
projects at a time).

The worker is emitted **only when the spec declares at least one View** — it has
nothing to project otherwise. It builds on the application crate, which gains a
`projections` module:

- `src/projections/mod.rs` — `ProjectionRegistry<E, S>`, a generated list of the
  view catch-up drivers. `catchup_all()` runs them all; `catchup_on_event()`
  filters through each View's `matches_event_type` so a notification for one
  event type only replays the views that subscribe to it.
- `src/domains/<domain>/views/<view>/mod.rs` — a generated `catchup<E, S>(state)`
  driver per View: it reads `view_checkpoints`, folds `load_stream_since`, writes
  the checkpoint and returns the projected count. Only the reducer's
  `on_<event>` bodies (the row upserts) are left for the project.
- `src/views.rs` — shared `last_position` / `update_position` helpers over
  `view_checkpoints`, plus `internal(error)` for reducers.

```ts
scaffold: {
  enabled: true,
  worker: true,                       // or an options object
  // worker: { package: "server" },
  // worker: { crate: "shop-worker", intervalMs: 5000, debounceMs: 50 },
}
```

`worker` accepts these options:

| Option | Meaning |
| --- | --- |
| `enabled` | Turn the worker on/off (it is off unless `worker` is set). |
| `package` | `"separate"` (default) emits a standalone `crates/<spec>-worker` binary crate; `"server"` folds the worker into the server crate as a background task. |
| `crate` | Worker crate name for `package: "separate"`. Defaults to `<spec>-worker`. |
| `deps` | Extra dependencies merged into the worker crate's `Cargo.toml`. |
| `intervalMs` | Polling fallback ticker, baked into the generated defaults. Defaults to `5000`. |
| `debounceMs` | Notification debounce window (`0` disables). Defaults to `50`. |
| `channel` | PostgreSQL NOTIFY channel. Defaults to `"events_appended"`. |
| `leaderLockId` | Advisory lock id for leader election (`0` disables). Defaults to `987654321`. |

With `package: "separate"` the workspace gains a `crates/<spec>-worker` crate
(`config.rs`, `lib.rs`, `src/worker/` and a `main`) with its own
`WorkerConfig`/`WorkerSecret` and `event-store`, `postgres-db`,
`snapshot-store`, `telemetry` and `sqlx` dependencies. Run it with
`cargo run -p <spec>-worker`.

With `package: "server"` no extra crate is emitted; the server crate gains
`src/worker/` and its `main` spawns the worker as a background task alongside
the HTTP server (it builds its own pool, so one process serves the API and
projects the views).

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
    aliases: "newtype",            // "newtype" (default) or "alias"
    // Merged with the detected deps. A dep may point at a local checkout with
    // `path` instead of a registry `version`.
    deps: [{ name: "tracing", version: "0.1" }],
  },
  typeMap: { uuid: "uuid::Uuid", datetime: "chrono::DateTime<chrono::Utc>" },
  generators: {
    queries: true,                 // false by default
    services: true,
    views: { migrations: true },   // View read models + sqlx SQL migrations
    api: { prefix: "/api" },       // axum transport + OpenAPI; false by default
    // every generator can take an options object instead of a boolean
  },
  scaffold: { enabled: true, worker: true }, // Cargo workspace + app/server crates (+ a worker)
  templatesDir: ".codegen/templates",
  rustfmt: true,
  filters: { shout: (s) => String(s).toUpperCase() },
  passes: [myPass],
});
```

Primitives map to `String`, `i64`, `f64`, `bool` and `serde_json::Value` (for
`json`) by default and can be extended or overridden through `typeMap`. A
required field renders as the bare type; an optional field (no `required: true`
in the spec) wraps in `Option`, and an `array` field in `Vec`.

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
`innerdoc`, `joinlines` — plus any `filters` you register in the config.

Useful `artifact` fields: `rustName`, `fileName`, `modulePath`, `doc`, `fields`
(each with `rustName`, `rustType`, `valueType`, `optional`, `array`,
`needsRename`, `doc`), `variants` (enums), `aliasOf` (aliases), `methods`
(services), `action`. State and View artifacts also expose `params`,
`queryItems`, `projectionEvents`, `eventImports`, `projectionNotes`,
`queryEventTypes` and `matchesAnyEventType` (the inputs of the static
event-type matcher).

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

## Generated file header

Every file the pipeline writes opens with a banner whose wording matches its
generation strategy.

**Overwrite** files (the contract crate and scaffold wiring) are regenerated on
every run, so they are marked as generated:

```rust
// @generated by @em/codegen. Do not edit by hand.
// Edit the spec or the templates, then rerun `em-codegen gen`.
// Add project code under `src/extension/` instead.

```

**Merge** files (scaffold implementations and configurable wiring) are
generated but expected to be edited, so their banner marks them as generated
without an edit instruction; `em-codegen` reports merges and conflicts:

```rust
// @generated by @em/codegen. Generated lines are updated on rerun.

```

**Create-only** files (extension modules and docs) are written once and then
owned by the project, so they get an edit-me notice instead — deliberately
*without* the `@generated` marker, since hand-editing them is the intended use:

```rust
// Scaffolded by @em/codegen. This file is yours to edit.
// It is written once and never overwritten by `em-codegen gen`.

```

The comment syntax follows the file type — `//` for Rust, `#` for
`Cargo.toml`, YAML and `.gitignore`, `--` for SQL migrations — and `@generated`
is the marker editors and code hosts use to flag generated files. The banner is
stamped by the pipeline rather than by individual templates, so files rendered
from your own templates carry it too. It is part of the file content, so for
managed and merge files it is tracked by the manifest/baseline like everything
else (see below).

## Manifest and safe regeneration

Every run records a content hash per file in
`<config dir>/.codegen/manifest.json`. On the next run:

- an overwrite file that matches its recorded hash is regenerated; one whose
  contents drifted from the record (edited by hand) is **left alone** and
  reported — pass `--force` to overwrite;
- a merge file is regenerated from `<config dir>/.codegen/baseline/`: a clean
  three-way merge applies the generator's changes and keeps project edits; an
  overlap writes conflict markers and reports the file;
- a generator-owned core file that the spec no longer emits is removed (unless
  it was edited by hand, in which case it is reported as orphaned);
- scaffold files that are no longer generated are kept and reported as
  orphaned; their merge base is retained so re-adding the item restores the
  project implementation;
- `--check` never writes and exits non-zero if any overwrite file is missing or
  stale, or if a merge file has pending generated changes or conflict markers.

## Development

```bash
pnpm --filter @em/codegen typecheck
pnpm test                       # from the repo root, runs these tests too
```

The example under `examples/shop` is a runnable end-to-end fixture.
