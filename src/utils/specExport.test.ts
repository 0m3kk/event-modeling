import { describe, it, expect } from "vitest";
import {
  buildSpecification,
  serializeSpecification,
  toYaml,
  specFileName,
  SPEC_VERSION,
} from "./specExport";
import type { CanvasElement } from "@/types";

function el(
  id: string,
  type: string,
  data: Record<string, unknown>,
  extra: Partial<CanvasElement> = {},
): CanvasElement {
  return { id, type, x: 0, y: 0, width: 100, height: 60, data, ...extra };
}

describe("toYaml", () => {
  it("emits scalars, quoting values that would otherwise change type", () => {
    expect(toYaml("OrderPlaced")).toBe("OrderPlaced");
    expect(toYaml("true")).toBe('"true"');
    expect(toYaml("sales:placeOrder")).toBe("sales:placeOrder");
    expect(toYaml("has: space")).toBe('"has: space"');
    expect(toYaml(42)).toBe("42");
    expect(toYaml(true)).toBe("true");
    expect(toYaml(null)).toBe("null");
  });

  it("emits nested objects and arrays in block style", () => {
    const yaml = toYaml({
      name: "Order",
      fields: [
        { name: "id", type: "string" },
        { name: "items", type: "Item", array: true },
      ],
    });
    expect(yaml).toBe(
      [
        "name: Order",
        "fields:",
        "  - name: id",
        "    type: string",
        "  - name: items",
        "    type: Item",
        "    array: true",
      ].join("\n"),
    );
  });

  it("omits undefined keys and renders empty containers inline", () => {
    expect(toYaml({ a: undefined, b: 1 })).toBe("b: 1");
    expect(toYaml({ a: [], b: {} })).toBe("a: []\nb: {}");
  });
});

describe("buildSpecification", () => {
  it("groups cards by meaning and omits geometry", () => {
    const elements: CanvasElement[] = [
      el("d1", "domainCard", { name: "Sales" }),
      el("ev", "eventCard", { name: "OrderPlaced", fields: [{ name: "orderId", type: "string" }] }, { domainId: "d1" }),
      el("cmd", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder", inputs: [{ name: "orderId", type: "string" }] }, { domainId: "d1" }),
      el("ob", "objectCard", { name: "Order", fields: [{ name: "id", type: "string", isRequired: true }] }, { domainId: "d1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements, generatedAt: "2026-01-01T00:00:00.000Z" });

    expect(spec.specVersion).toBe(SPEC_VERSION);
    expect(spec.name).toBe("Shop");
    expect(spec.generatedAt).toBe("2026-01-01T00:00:00.000Z");

    expect(spec.domains).toEqual([{ name: "Sales", cards: ["OrderPlaced", "PlaceOrder", "Order"] }]);
    expect(spec.events).toEqual([
      { name: "OrderPlaced", fields: [{ name: "orderId", type: "string" }] },
    ]);
    expect(spec.commands).toEqual([
      {
        name: "PlaceOrder",
        action: "sales:placeOrder",
        inputs: [{ name: "orderId", type: "string" }],
      },
    ]);
    expect(spec.types).toEqual({
      objects: [{ name: "Order", fields: [{ name: "id", type: "string", required: true }] }],
    });

    // Geometry is intentionally absent from every definition.
    const yaml = serializeSpecification({ name: "Shop", elements, generatedAt: "2026-01-01T00:00:00.000Z" });
    expect(yaml).not.toMatch(/\bx:\s/);
    expect(yaml).not.toMatch(/\bwidth:\s/);
  });

  it("de-duplicates mirror copies but keeps them in slice lanes", () => {
    const elements: CanvasElement[] = [
      el("s1", "sliceCard", { name: "Place order", lanes: [{ id: "l1", childType: "commandCard" }] }),
      el("c1", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder" }, { sliceId: "s1", laneId: "l1" }),
      el("c2", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder", referenceId: "r1" }, { sliceId: "s1", laneId: "l1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });
    expect((spec.commands as unknown[]).length).toBe(1);
    expect(spec.slices).toEqual([
      { name: "Place order", lanes: [{ type: "Command", cards: ["PlaceOrder", "PlaceOrder"] }] },
    ]);
  });

  it("excludes service method-execution copies from service definitions", () => {
    const elements: CanvasElement[] = [
      el("svc", "serviceCard", { name: "OrderService", methods: [{ id: "m1", name: "place", params: [], returns: [] }] }),
      el("copy", "serviceCard", { name: "OrderService", methods: [], methodRef: { serviceId: "svc", methodId: "m1" } }),
    ];
    const spec = buildSpecification({ name: "Shop", elements });
    expect((spec.services as unknown[]).length).toBe(1);
    expect(spec.services).toEqual([
      { name: "OrderService", methods: [{ name: "place" }] },
    ]);
  });

  it("includes DCB tags derived from events and actor permissions", () => {
    const elements: CanvasElement[] = [
      el("ev", "eventCard", {
        name: "OrderPlaced",
        fields: [{ name: "orderId", type: "OrderId", tag: "order" }],
      }),
      el("ac", "actorCard", { name: "Admin", permissions: [{ action: "sales:*" }] }),
    ];
    const spec = buildSpecification({ name: "Shop", elements });
    expect(spec.tags).toEqual([{ tag: "order", types: ["OrderId"], fromEvents: ["OrderPlaced"] }]);
    expect(spec.actors).toEqual([{ name: "Admin", permissions: ["sales:*"] }]);
  });
});

describe("specFileName", () => {
  it("slugs the board name", () => {
    expect(specFileName("My Domain!")).toBe("my_domain.spec.yaml");
    expect(specFileName("")).toBe("board.spec.yaml");
  });
});
