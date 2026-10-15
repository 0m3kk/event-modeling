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
});
