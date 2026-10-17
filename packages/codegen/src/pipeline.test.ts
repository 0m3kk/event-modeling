import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./pipeline";

const SPEC = [
  "name: Shop",
  "domains:",
  "  - name: Sales",
  "    cards: [PlaceOrder, OrderPlaced]",
  "events:",
  "  - name: OrderPlaced",
  "    fields:",
  "      - name: orderId",
  "        type: string",
  "commands:",
  "  - name: PlaceOrder",
  "    action: sales:placeOrder",
  "    inputs:",
  "      - name: orderId",
  "        type: string",
  "        required: true",
  "",
].join("\n");

const CONFIG = `export default { spec: "board.spec.yaml", out: "crates/shop" };\n`;

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "em-codegen-"));
  await fs.writeFile(path.join(dir, "board.spec.yaml"), SPEC, "utf8");
  await fs.writeFile(path.join(dir, "codegen.config.ts"), CONFIG, "utf8");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFile(path.join(dir, "crates/shop", rel), "utf8");
const readFromRoot = (rel: string) => fs.readFile(path.join(dir, rel), "utf8");

describe("run", () => {
  it("generates the crate tree and writes a manifest", async () => {
    const result = await run({ cwd: dir, rustfmt: false });

    expect(result.written).toContain("src/lib.rs");
    expect(result.written).toContain("src/sales/events/order_placed.rs");
    expect(result.written).toContain("Cargo.toml");
    expect(await read("src/lib.rs")).toContain("pub mod sales;");

    const manifest = JSON.parse(await readFromRoot(".codegen/manifest.json"));
    expect(Object.keys(manifest.files)).toContain("Cargo.toml");
  });

  it("emits a validation module only for formats validator cannot express", async () => {
    // The default SPEC carries no format validation.
    await run({ cwd: dir, rustfmt: false });
    expect(await read("src/lib.rs")).not.toContain("pub mod validation;");

    const spec = [
      "name: Val",
      "events:",
      "  - name: Item",
      "    fields:",
      "      - name: id",
      "        type: string",
      "        validation: { format: uuid }",
      "      - name: email",
      "        type: string",
      "        validation: { format: email }",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");

    const result = await run({ cwd: dir, rustfmt: false, force: true });
    expect(result.written).toContain("src/validation.rs");
    expect(await read("src/lib.rs")).toContain("pub mod validation;");
    expect(await read("src/validation.rs")).toContain("pub fn validate_uuid");
    expect(await read("src/common/events/item.rs")).toContain(
      'custom(function = "crate::validation::validate_uuid")',
    );
  });

  it("generates the DomainEvent trait and implements it per event", async () => {
    const spec = [
      "name: Shop",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "        tag: order",
      "      - name: placedAt",
      "        type: string",
      "  - name: OrderShipped",
      "    fields:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");

    await run({ cwd: dir, rustfmt: false });

    const lib = await read("src/lib.rs");
    expect(lib).toContain("pub trait DomainEvent: Serialize + DeserializeOwned + Send + Sync + 'static");
    expect(lib).toContain("fn event_type() -> &'static str;");
    expect(lib).toContain("fn tags(&self) -> Vec<String>;");

    const placed = await read("src/common/events/order_placed.rs");
    expect(placed).toContain("impl crate::DomainEvent for OrderPlaced");
    expect(placed).toContain('"order_placed"');
    // Tagged, required, scalar field -> a `tag:value` string.
    expect(placed).toContain('vec![format!("order:{}", self.order_id), ]');

    // Untagged event still implements the trait, with an empty tag list.
    const shipped = await read("src/common/events/order_shipped.rs");
    expect(shipped).toContain("impl crate::DomainEvent for OrderShipped");
    expect(shipped).toContain("vec![]");
  });

  it("normalizes DCB tags to snake_case in generated code", async () => {
    const spec = [
      "name: Shop",
      "domains:",
      "  - name: Sales",
      "    cards: [OrderPlaced, OrderState]",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: orderItemId",
      "        type: string",
      "        required: true",
      "        tag: orderItem",
      "states:",
      "  - name: OrderState",
      "    params:",
      "      - name: orderItemId",
      "        type: string",
      "    query:",
      "      - types: [OrderPlaced]",
      "        tags:",
      "          - tag: orderItem",
      "            field: orderItemId",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", generators: { states: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    const placed = await read("src/sales/events/order_placed.rs");
    expect(placed).toContain('vec![format!("order_item:{}", self.order_item_id), ]');
    const state = await read("src/sales/states/order_state.rs");
    expect(state).toContain('format!("order_item:{}", self.order_item_id)');
  });

  it("is idempotent on a second run", async () => {
    await run({ cwd: dir, rustfmt: false });
    const second = await run({ cwd: dir, rustfmt: false });
    expect(second.written).toEqual([]);
    expect(second.unchanged.length).toBe(second.files.length);
  });

  it("leaves hand-edited files alone unless forced", async () => {
    await run({ cwd: dir, rustfmt: false });
    const target = "src/lib.rs";
    const abs = path.join(dir, "crates/shop", target);
    await fs.appendFile(abs, "// hand edit\n", "utf8");

    const skippedRun = await run({ cwd: dir, rustfmt: false });
    expect(skippedRun.skipped).toEqual([target]);
    expect(await fs.readFile(abs, "utf8")).toContain("// hand edit");

    const forcedRun = await run({ cwd: dir, rustfmt: false, force: true });
    expect(forcedRun.written).toContain(target);
    expect(await fs.readFile(abs, "utf8")).not.toContain("// hand edit");
  });

  it("reports drift under --check", async () => {
    await run({ cwd: dir, rustfmt: false });
    expect((await run({ cwd: dir, rustfmt: false, check: true })).drifted).toEqual([]);

    await fs.appendFile(path.join(dir, "crates/shop/src/lib.rs"), "// drift\n", "utf8");
    expect((await run({ cwd: dir, rustfmt: false, check: true })).drifted).toEqual(["src/lib.rs"]);
  });

  it("fails on a spec that does not match the contract", async () => {
    await fs.writeFile(path.join(dir, "board.spec.yaml"), "events: nope\n", "utf8");
    await expect(run({ cwd: dir, rustfmt: false })).rejects.toThrow();
  });

  it("applies custom IR passes before rendering", async () => {
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, ` +
        `passes: [(crate) => ({ ...crate, name: "renamed" })] };\n`,
      "utf8",
    );
    await run({ cwd: dir });
    expect(await read("Cargo.toml")).toContain('name = "renamed"');
  });

  it("renders with an overridden template and a custom filter", async () => {
    await fs.mkdir(path.join(dir, "tpl"), { recursive: true });
    await fs.writeFile(path.join(dir, "tpl", "Cargo.toml.njk"), 'name = "{{ crate.name | shout }}"', "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, ` +
        `templatesDir: "tpl", filters: { shout: (s) => String(s).toUpperCase() } };\n`,
      "utf8",
    );
    await run({ cwd: dir });
    expect(await read("Cargo.toml")).toBe('name = "SHOP"\n');
  });

  it("renders a State projection wired to the event store", async () => {
    const spec = [
      "name: Shop",
      "domains:",
      "  - name: Sales",
      "    cards: [OrderPlaced, OrderState]",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "        tag: order",
      "states:",
      "  - name: OrderState",
      "    params:",
      "      - name: orderId",
      "        type: string",
      "    query:",
      "      - types: [OrderPlaced]",
      "        tags:",
      "          - tag: order",
      "            field: orderId",
      "    states:",
      "      - name: status",
      "        type: string",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", generators: { states: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    const file = await read("src/sales/states/order_state.rs");
    expect(file).not.toContain("#[async_trait::async_trait]");
    expect(file).toContain("pub struct OrderState");
    expect(file).toContain("pub order_id: String,");
    expect(file).toContain("pub trait OrderStateReducer");
    expect(file).not.toContain("type Error;");
    expect(file).toContain("fn on_order_placed(&self, state: &mut OrderState, event: &OrderPlaced);");
    expect(file).toContain("pub fn new(");
    expect(file).toContain("OrderStateError<E::Error>");
    expect(file).not.toContain("Reducer(");
    expect(file).toContain("OrderPlaced::event_type().to_string()");
    expect(file).not.toContain('"order_placed".to_string()');
    expect(file).toContain('format!("order:{}", self.order_id)');
    expect(file).toContain("pub async fn load<E, R>");
    expect(file).toContain("use crate::DomainEvent;");
    expect(file).toContain("use crate::sales::events::{OrderPlaced};");
    expect(file).toContain("if event.event_type == OrderPlaced::event_type() {");
    expect(file).not.toContain("event.event_type.as_str()");

    const cargo = await read("Cargo.toml");
    expect(cargo).toContain('event-store = { git = "https://github.com/0m3kk/backend-kit.git" }');
    expect(cargo).not.toContain("async-trait");
    expect(cargo).toContain('futures-util = { version = "0.3" }');
    expect(cargo).toContain('serde_json = { version = "1" }');
  });

  it("renders a View projection with an async fallible reducer", async () => {
    const spec = [
      "name: Shop",
      "domains:",
      "  - name: Sales",
      "    cards: [OrderPlaced, OrderListView]",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "        tag: order",
      "views:",
      "  - name: OrderListView",
      "    params:",
      "      - name: orderId",
      "        type: string",
      "    query:",
      "      - types: [OrderPlaced]",
      "        tags:",
      "          - tag: order",
      "            field: orderId",
      "    states:",
      "      - name: status",
      "        type: string",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", generators: { views: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    const file = await read("src/sales/views/order_list_view.rs");
    expect(file).toContain("#[async_trait::async_trait]");
    expect(file).toContain("pub trait OrderListViewReducer");
    expect(file).toContain("type Error;");
    expect(file).toContain(
      "async fn on_order_placed(&self, state: &mut OrderListView, event: &OrderPlaced) -> Result<(), Self::Error>;",
    );
    expect(file).toContain("OrderListViewError<E::Error, R::Error>");
    expect(file).toContain(".map_err(OrderListViewError::Reducer)?;");
    expect(file).toContain("use crate::DomainEvent;");
    expect(file).toContain("if event.event_type == OrderPlaced::event_type() {");

    expect(await read("Cargo.toml")).toContain('async-trait = { version = "0.1" }');
  });

  it("renders path and git dependencies from the config", async () => {
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, ` +
        `crate: { deps: [` +
        `{ name: "tracing", path: "../tracing" }, ` +
        `{ name: "event-store", git: "https://github.com/0m3kk/backend-kit.git", branch: "main" } ] } };\n`,
      "utf8",
    );
    await run({ cwd: dir });
    const cargo = await read("Cargo.toml");
    expect(cargo).toContain('tracing = { path = "../tracing" }');
    expect(cargo).toContain(
      'event-store = { git = "https://github.com/0m3kk/backend-kit.git", branch = "main" }',
    );
  });

  it("renders an empty projection (no params, no query) safely", async () => {
    const spec = ["name: Shop", "states:", "  - name: Empty", ""].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, generators: { states: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    const file = await read("src/common/states/empty.rs");
    expect(file).toContain("pub fn new(");
    expect(file).toContain("Query::from_items(Vec::<QueryItem>::new())");
    expect(file).toContain("let _ = reducer;");
    expect(file).not.toContain("use crate::DomainEvent;");
  });

  it("uses the Rust struct name (not the spec name) in projection docs", async () => {
    const spec = [
      "name: Shop",
      "states:",
      "  - name: accountList",
      "    params:",
      "      - name: accountId",
      "        type: string",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, generators: { states: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    const file = await read("src/common/states/account_list.rs");
    expect(file).toContain("pub struct AccountList");
    expect(file).toContain("/// DCB projection for `AccountList`.");
    expect(file).toContain("/// Project-specific projection logic for `AccountList`.");
    expect(file).not.toContain("`accountList`");
  });

  it("derives Default for object and enum data types", async () => {
    const spec = [
      "name: Shop",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: order",
      "        type:",
      "          object: Order",
      "          fields:",
      "            - name: id",
      "              type: string",
      "      - name: status",
      "        type:",
      "          enum: Status",
      "          values: [pending, paid]",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");

    await run({ cwd: dir, rustfmt: false, force: true });

    expect(await read("src/common/types/order.rs")).toContain("Default");
    const status = await read("src/common/types/status.rs");
    expect(status).toContain("Default");
    expect(status).toContain("#[default]");
  });

  it("generates a factory and with_ builders for commands, queries, events and types", async () => {
    const spec = [
      "name: Shop",
      "domains:",
      "  - name: Sales",
      "    cards: [PlaceOrder, OrderPlaced, GetOrder, Order]",
      "events:",
      "  - name: OrderPlaced",
      "    fields:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "      - name: order",
      "        type:",
      "          object: Order",
      "          fields:",
      "            - name: id",
      "              type: string",
      "              required: true",
      "            - name: total",
      "              type: float",
      "commands:",
      "  - name: PlaceOrder",
      "    inputs:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "      - name: items",
      "        type: string",
      "        array: true",
      "    responses:",
      "      - name: total",
      "        type: float",
      "        required: true",
      "queries:",
      "  - name: GetOrder",
      "    params:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, generators: { queries: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    // Command: required fields are params, optional/array fields default to `None`.
    const command = await read("src/sales/commands/place_order.rs");
    expect(command).toContain("pub fn new(order_id: String) -> Self {");
    expect(command).toContain("items: None,");
    // `with_` for a required field replaces the value.
    expect(command).toContain("pub fn with_order_id(mut self, value: String) -> Self {");
    expect(command).toContain("self.order_id = value;");
    // `with_` for an optional field takes the inner type and wraps it in `Some`.
    expect(command).toContain("pub fn with_items(mut self, value: Vec<String>) -> Self {");
    expect(command).toContain("self.items = Some(value);");
    // The response struct gets its own factory.
    const response = command.slice(command.indexOf("pub struct PlaceOrderResponse"));
    expect(response).toContain("pub fn new(total: f64) -> Self {");
    expect(response).toContain("pub fn with_total(mut self, value: f64) -> Self {");

    // Query.
    expect(await read("src/sales/queries/get_order.rs")).toContain(
      "pub fn new(order_id: String) -> Self {",
    );

    // Event: mixes a required field with optional ones.
    const event = await read("src/sales/events/order_placed.rs");
    expect(event).toContain("pub fn new(order_id: String) -> Self {");
    expect(event).toContain("pub fn with_order(mut self, value: Order) -> Self {");
    expect(event).toContain("self.order = Some(value);");
    // The `DomainEvent` impl still follows the generated factory.
    expect(event).toContain("impl crate::DomainEvent for OrderPlaced");

    // Object type.
    const type = await read("src/sales/types/order.rs");
    expect(type).toContain("pub fn new(id: String) -> Self {");
    expect(type).toContain("total: None,");
    expect(type).toContain("pub fn with_total(mut self, value: f64) -> Self {");
    expect(type).toContain("self.total = Some(value);");
  });

  it("generates async handler traits for commands and queries", async () => {
    const spec = [
      "name: Shop",
      "domains:",
      "  - name: Sales",
      "    cards: [PlaceOrder, CancelOrder, GetOrder]",
      "commands:",
      "  - name: PlaceOrder",
      "    inputs:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "    responses:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "  - name: CancelOrder",
      "    inputs:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "queries:",
      "  - name: GetOrder",
      "    params:",
      "      - name: orderId",
      "        type: string",
      "        required: true",
      "    responses:",
      "      - name: total",
      "        type: float",
      "        required: true",
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "board.spec.yaml"), spec, "utf8");
    await fs.writeFile(
      path.join(dir, "codegen.config.ts"),
      `export default { spec: "board.spec.yaml", out: "crates/shop", rustfmt: false, generators: { queries: true } };\n`,
      "utf8",
    );

    await run({ cwd: dir, rustfmt: false });

    // A command with responses returns its response struct.
    const command = await read("src/sales/commands/place_order.rs");
    expect(command).toContain("use crate::ExecutionContext;");
    expect(command).toContain("#[async_trait::async_trait]");
    expect(command).toContain("pub trait PlaceOrderHandler {");
    expect(command).toContain("type Error;");
    expect(command).toContain("ctx: &ExecutionContext,");
    expect(command).toContain("command: PlaceOrder,");
    expect(command).toContain("-> Result<PlaceOrderResponse, Self::Error>;");

    // A command without responses returns the unit type.
    const cancel = await read("src/sales/commands/cancel_order.rs");
    expect(cancel).toContain("pub trait CancelOrderHandler {");
    expect(cancel).toContain("-> Result<(), Self::Error>;");

    // Queries get the same shape, with the query as the argument.
    const query = await read("src/sales/queries/get_order.rs");
    expect(query).toContain("#[async_trait::async_trait]");
    expect(query).toContain("pub trait GetOrderHandler {");
    expect(query).toContain("ctx: &ExecutionContext,");
    expect(query).toContain("query: GetOrder,");
    expect(query).toContain("-> Result<GetOrderResponse, Self::Error>;");

    // The execution context module is generated and wired through the crate.
    expect(await read("src/lib.rs")).toContain("pub mod execution_context;");
    expect(await read("src/lib.rs")).toContain("pub use execution_context::ExecutionContext;");
    const context = await read("src/execution_context.rs");
    expect(context).toContain("pub struct ExecutionContext {");
    expect(context).toContain("pub fn with_tenant_id(mut self, tenant_id: impl Into<String>) -> Self {");
    expect(context).toContain("pub fn to_metadata_at(&self, timestamp: OffsetDateTime) -> EventMetadata {");
    expect(context).toContain("pub fn create_store_events<'a, E: DomainEvent + 'a>(");
    // No HTTP extraction in the generated context.
    expect(context).not.toContain("from_headers");
    expect(await read("src/lib.rs")).toContain("fn to_store_event_with_metadata(");

    // Async handler traits and the context pull in their dependencies.
    const cargo = await read("Cargo.toml");
    expect(cargo).toContain('async-trait = { version = "0.1" }');
    expect(cargo).toContain('time = { version = "0.3" }');
    expect(cargo).toContain('event-store = { git = "https://github.com/0m3kk/backend-kit.git" }');
  });
});
