import { describe, it, expect } from "vitest";
import {
  buildSpecification,
  serializeSpecification,
  toYaml,
  specFileName,
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
  it("groups cards by meaning and omits geometry and bookkeeping", () => {
    const elements: CanvasElement[] = [
      el("d1", "domainCard", { name: "Sales" }),
      el("ev", "eventCard", { name: "OrderPlaced", fields: [{ name: "orderId", type: "string" }] }, { domainId: "d1" }),
      el("cmd", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder", inputs: [{ name: "orderId", type: "string" }] }, { domainId: "d1" }),
      el("ob", "objectCard", { name: "Order", fields: [{ name: "id", type: "string", isRequired: true }] }, { domainId: "d1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.name).toBe("Shop");
    // No bookkeeping summary, version or timestamp: just the model.
    expect(spec.summary).toBeUndefined();
    expect(spec.specVersion).toBeUndefined();
    expect(spec.generatedAt).toBeUndefined();

    expect(spec.domains).toEqual([
      { name: "Sales", cards: ["OrderPlaced", "PlaceOrder", "Order"] },
    ]);
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
    // Data containers are collected in the `types` registry, not inline.
    expect(spec.types).toEqual([
      { object: "Order", fields: [{ name: "id", type: "string", required: true }] },
    ]);
    // Geometry is intentionally absent from every definition.
    const yaml = serializeSpecification({ name: "Shop", elements });
    expect(yaml).not.toMatch(/\bx:\s/);
    expect(yaml).not.toMatch(/\bwidth:\s/);
    expect(yaml).not.toMatch(/^summary:/m);
  });

  it("defines a data type once in `types` and references it by name", () => {
    const elements: CanvasElement[] = [
      el("o1", "objectCard", {
        name: "Order",
        fields: [
          { name: "id", type: "string" },
          { name: "total", type: "float" },
        ],
      }),
      el("e1", "eventCard", { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] }),
      el("e2", "eventCard", { name: "OrderShipped", fields: [{ name: "order", type: "Order" }] }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.types).toEqual([
      {
        object: "Order",
        fields: [
          { name: "id", type: "string" },
          { name: "total", type: "float" },
        ],
      },
    ]);
    expect(spec.events).toEqual([
      { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] },
      { name: "OrderShipped", fields: [{ name: "order", type: "Order" }] },
    ]);
  });

  it("collects enum and alias definitions, keeping each reference a plain name", () => {
    const elements: CanvasElement[] = [
      el("en", "enumCard", { name: "Status", fields: [{ name: "pending" }, { name: "paid" }] }),
      el("al", "aliasCard", { name: "OrderId", aliasedType: "string" }),
      el("o1", "objectCard", {
        name: "Order",
        fields: [
          { name: "id", type: "OrderId" },
          { name: "status", type: "Status" },
        ],
      }),
      el("e1", "eventCard", { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    // Board order is preserved across Object / Enum / Alias cards.
    expect(spec.types).toEqual([
      { enum: "Status", values: ["pending", "paid"] },
      { alias: "OrderId", of: "string" },
      {
        object: "Order",
        fields: [
          { name: "id", type: "OrderId" },
          { name: "status", type: "Status" },
        ],
      },
    ]);
    expect(spec.events).toEqual([
      { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] },
    ]);
  });

  it("defines types that reference each other, even cyclically, by name", () => {
    const elements: CanvasElement[] = [
      el("a", "objectCard", { name: "A", fields: [{ name: "b", type: "B" }] }),
      el("b", "objectCard", { name: "B", fields: [{ name: "a", type: "A" }] }),
      el("e1", "eventCard", { name: "E", fields: [{ name: "a", type: "A" }] }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.types).toEqual([
      { object: "A", fields: [{ name: "b", type: "B" }] },
      { object: "B", fields: [{ name: "a", type: "A" }] },
    ]);
    expect(spec.events).toEqual([{ name: "E", fields: [{ name: "a", type: "A" }] }]);
  });

  it("lists every data card in `types`, even when no field references it", () => {
    const elements: CanvasElement[] = [
      el("o1", "objectCard", { name: "Unused", fields: [{ name: "id", type: "string" }] }),
      el("e1", "eventCard", { name: "E", fields: [{ name: "id", type: "string" }] }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });
    expect(spec.types).toEqual([
      { object: "Unused", fields: [{ name: "id", type: "string" }] },
    ]);
  });

  it("lists a type card in its domain's cards", () => {
    const elements: CanvasElement[] = [
      el("d1", "domainCard", { name: "Sales" }),
      el("o1", "objectCard", { name: "Order", fields: [{ name: "id", type: "string" }] }, { domainId: "d1" }),
      el("e1", "eventCard", { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] }, { domainId: "d1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.domains).toEqual([{ name: "Sales", cards: ["Order", "OrderPlaced"] }]);
    expect(spec.types).toEqual([
      { object: "Order", fields: [{ name: "id", type: "string" }] },
    ]);
  });

  it("lists a type card in the group that holds it", () => {
    const elements: CanvasElement[] = [
      el("d1", "domainCard", { name: "Sales" }),
      el("g1", "groupCard", { name: "Sales Types" }, { domainId: "d1" }),
      // A card in a group carries the group, not the domain.
      el("o1", "objectCard", { name: "Order", fields: [{ name: "id", type: "string" }] }, { groupId: "g1" }),
      el("e1", "eventCard", { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] }, { domainId: "d1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.domains).toEqual([
      { name: "Sales", groups: ["Sales Types"], cards: ["OrderPlaced"] },
    ]);
    expect(spec.groups).toEqual([
      { name: "Sales Types", domain: "Sales", cards: ["Order"] },
    ]);
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

  it("labels an untyped lane with the type of the card it holds", () => {
    const elements: CanvasElement[] = [
      el("s1", "sliceCard", { name: "Place order", lanes: [{ id: "l1" }] }),
      el("c1", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder" }, { sliceId: "s1", laneId: "l1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });
    expect(spec.slices).toEqual([
      { name: "Place order", lanes: [{ type: "Command", cards: ["PlaceOrder"] }] },
    ]);
  });

  it("reports a reference copy's source type in an untyped lane", () => {
    const elements: CanvasElement[] = [
      el("s1", "sliceCard", { name: "Place order", lanes: [{ id: "l1" }] }),
      el("c1", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder", referenceId: "r1", isOriginal: true }),
      el("c2", "commandCard", { name: "PlaceOrder", action: "sales:placeOrder", referenceId: "r1", isOriginal: false }, { sliceId: "s1", laneId: "l1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });
    expect(spec.slices).toEqual([
      { name: "Place order", lanes: [{ type: "Command", cards: ["PlaceOrder"] }] },
    ]);
  });

  it("appends the executed method to a service method-execution copy in a lane", () => {
    const elements: CanvasElement[] = [
      el("svc", "serviceCard", {
        name: "OrderService",
        methods: [
          { id: "m1", name: "place", params: [], returns: [] },
          { id: "m2", name: "cancel", params: [], returns: [] },
        ],
      }),
      el("s1", "sliceCard", { name: "Place order", lanes: [{ id: "l1" }] }),
      el("c1", "serviceCard", {
        name: "OrderService",
        methods: [{ id: "m1", name: "place", params: [], returns: [] }],
        methodRef: { serviceId: "svc", methodId: "m1" },
      }, { sliceId: "s1", laneId: "l1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });
    expect(spec.slices).toEqual([
      { name: "Place order", lanes: [{ type: "Service", cards: ["OrderService.place"] }] },
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
