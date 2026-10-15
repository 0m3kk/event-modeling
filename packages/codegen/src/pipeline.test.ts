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
    expect(file).toContain("pub struct OrderState");
    expect(file).toContain("pub order_id: String,");
    expect(file).toContain("pub trait OrderStateReducer");
    expect(file).toContain("fn on_order_placed(&self, state: &mut OrderState, event: &OrderPlaced);");
    expect(file).toContain("pub fn new(");
    expect(file).toContain('"order_placed".to_string()');
    expect(file).toContain('format!("order:{}", self.order_id)');
    expect(file).toContain("pub async fn load<E, R>");
    expect(file).toContain("use crate::sales::events::{OrderPlaced};");

    const cargo = await read("Cargo.toml");
    expect(cargo).toContain('event-store = { git = "https://github.com/0m3kk/backend-kit.git" }');
    expect(cargo).toContain('futures-util = { version = "0.3" }');
    expect(cargo).toContain('serde_json = { version = "1" }');
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
});
