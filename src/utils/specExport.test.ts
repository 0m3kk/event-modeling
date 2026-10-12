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

    expect(spec.domains).toEqual([{ name: "Sales", cards: ["OrderPlaced", "PlaceOrder"] }]);
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
    // Data containers are not listed in their own section.
    expect(spec.types).toBeUndefined();
    // Geometry is intentionally absent from every definition.
    const yaml = serializeSpecification({ name: "Shop", elements });
    expect(yaml).not.toMatch(/\bx:\s/);
    expect(yaml).not.toMatch(/\bwidth:\s/);
    expect(yaml).not.toMatch(/^summary:/m);
  });

  it("inlines a data definition at its first reference, then references by name", () => {
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

    expect(spec.events).toEqual([
      {
        name: "OrderPlaced",
        fields: [
          {
            name: "order",
            type: {
              object: "Order",
              fields: [
                { name: "id", type: "string" },
                { name: "total", type: "float" },
              ],
            },
          },
        ],
      },
      { name: "OrderShipped", fields: [{ name: "order", type: "Order" }] },
    ]);
  });

  it("inlines enum and alias definitions and expands nested references once", () => {
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

    expect(spec.events).toEqual([
      {
        name: "OrderPlaced",
        fields: [
          {
            name: "order",
            type: {
              object: "Order",
              fields: [
                { name: "id", type: { alias: "OrderId", of: "string" } },
                { name: "status", type: { enum: "Status", values: ["pending", "paid"] } },
              ],
            },
          },
        ],
      },
    ]);
  });

  it("survives cyclic data references", () => {
    const elements: CanvasElement[] = [
      el("a", "objectCard", { name: "A", fields: [{ name: "b", type: "B" }] }),
      el("b", "objectCard", { name: "B", fields: [{ name: "a", type: "A" }] }),
      el("e1", "eventCard", { name: "E", fields: [{ name: "a", type: "A" }] }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.events).toEqual([
      {
        name: "E",
        fields: [
          {
            name: "a",
            type: {
              object: "A",
              fields: [
                {
                  name: "b",
                  type: {
                    object: "B",
                    fields: [{ name: "a", type: "A" }],
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  it("omits data containers from domain and group membership lists", () => {
    const elements: CanvasElement[] = [
      el("d1", "domainCard", { name: "Sales" }),
      el("g1", "groupCard", { name: "Sales Types" }, { domainId: "d1" }),
      el("o1", "objectCard", { name: "Order", fields: [{ name: "id", type: "string" }] }, { domainId: "d1", groupId: "g1" }),
      el("svc", "serviceCard", { name: "OrderService", methods: [] }, { domainId: "d1", groupId: "g1" }),
      el("e1", "eventCard", { name: "OrderPlaced", fields: [{ name: "order", type: "Order" }] }, { domainId: "d1" }),
    ];

    const spec = buildSpecification({ name: "Shop", elements });

    expect(spec.domains).toEqual([{ name: "Sales", groups: ["Sales Types"], cards: ["OrderService", "OrderPlaced"] }]);
    expect(spec.groups).toEqual([{ name: "Sales Types", domain: "Sales", cards: ["OrderService"] }]);
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
