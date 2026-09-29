import { describe, expect, it } from "vitest";
import {
  computeCanvasBounds,
  escapeXml,
  exportCanvasToSvg,
  wrapTextLines,
} from "./imageExport";
import type { CanvasObject, GroupInfo } from "@/types";

describe("imageExport", () => {
  it("escapes XML special characters", () => {
    expect(escapeXml('<script alert("xss")>&\'')).toBe(
      "&lt;script alert(&quot;xss&quot;)&gt;&amp;&apos;",
    );
  });

  it("computes canvas bounds correctly with padding", () => {
    const objects: CanvasObject[] = [
      { id: "1", type: "storm", x: 100, y: 100, width: 200, height: 150 },
      { id: "2", type: "model", x: 400, y: 200, width: 200, height: 100 },
    ];
    const bounds = computeCanvasBounds(objects, [], 20);

    expect(bounds.minX).toBe(100 - 20);
    expect(bounds.minY).toBe(100 - 20);
    expect(bounds.maxX).toBe(600 + 20);
    expect(bounds.maxY).toBe(300 + 20);
    expect(bounds.width).toBe(540);
    expect(bounds.height).toBe(240);
  });

  it("exports valid SVG with cards, groups, and connectors", () => {
    const objects: CanvasObject[] = [
      {
        id: "s1",
        type: "storm",
        x: 100,
        y: 100,
        width: 200,
        height: 120,
        stormData: {
          kind: "event",
          name: "OrderPlaced",
          fields: [
            { id: "f1", name: "orderId", fieldType: "uuid", required: true, tag: "ord" },
          ],
        },
      },
      {
        id: "s2",
        type: "storm",
        x: 400,
        y: 100,
        width: 200,
        height: 120,
        stormData: {
          kind: "command",
          name: "ProcessPayment",
          action: "payment:process:admin",
          fields: [],
        },
      },
      {
        id: "c1",
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: { objectId: "s1", anchor: "right" },
          end: { objectId: "s2", anchor: "left" },
        },
      },
    ];

    const groups: GroupInfo[] = [
      {
        id: "g1",
        name: "Ordering Domain",
        lineStyle: "dashed",
        customBounds: { x: 50, y: 50, width: 600, height: 250 },
      },
    ];

    const svg = exportCanvasToSvg(objects, groups);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("OrderPlaced");
    expect(svg).toContain("ProcessPayment");
    expect(svg).toContain("Ordering Domain");
    expect(svg).toContain("path d=");
    expect(svg).toContain("marker-end=\"url(#arrow)\"");
  });

  it("exports the full body of every storm card kind", () => {
    const objects: CanvasObject[] = [
      {
        id: "state1",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 200,
        stormData: {
          kind: "state",
          name: "Order",
          fields: [],
          inputFields: [
            { id: "f1", name: "orderId", fieldType: "uuid", tag: "order" },
          ],
          outputFields: [
            { id: "o1", name: "status", fieldType: "string" },
          ],
          queryItems: [
            { id: "q1", types: ["OrderPlaced"], tagFieldIds: ["f1"] },
          ],
        },
      },
      {
        id: "actor1",
        type: "storm",
        x: 320,
        y: 0,
        width: 260,
        height: 120,
        stormData: {
          kind: "actor",
          name: "Admin",
          fields: [],
          permissions: ["order:*"],
        },
      },
      {
        id: "query1",
        type: "storm",
        x: 640,
        y: 0,
        width: 260,
        height: 160,
        stormData: {
          kind: "query",
          name: "OrderSummary",
          fields: [{ id: "p1", name: "orderId", fieldType: "uuid" }],
          responseFields: [{ id: "r1", name: "total", fieldType: "money" }],
        },
      },
      {
        id: "con1",
        type: "storm",
        x: 0,
        y: 260,
        width: 260,
        height: 160,
        stormData: {
          kind: "constraint",
          name: "OrderLimit",
          fields: [],
          constraints: [{ id: "c1", text: "Total must be below 10k" }],
        },
      },
    ];

    const svg = exportCanvasToSvg(objects, []);

    // Field names and tags must appear (previously only the header rendered).
    expect(svg).toContain("orderId");
    expect(svg).toContain("#order");
    expect(svg).toContain("QUERY ITEMS");
    expect(svg).toContain("OrderPlaced");
    expect(svg).toContain("order:orderId");
    expect(svg).toContain("PARAMS");
    expect(svg).toContain("FIELDS");
    expect(svg).toContain("status");
    expect(svg).toContain("RESPONSE");
    expect(svg).toContain("total");
    expect(svg).toContain("CONSTRAINTS");
    expect(svg).toContain("Total must be below 10k");
    expect(svg).toContain("Admin");
    expect(svg).toContain("order:*");
  });

  it("exports array and wrap model node item types", () => {
    const objects: CanvasObject[] = [
      {
        id: "arr1",
        type: "model",
        x: 0,
        y: 0,
        width: 240,
        height: 100,
        modelData: { kind: "array", name: "Lines", itemType: "Line" },
      },
      {
        id: "wrap1",
        type: "model",
        x: 300,
        y: 0,
        width: 240,
        height: 100,
        modelData: { kind: "wrap", name: "Maybe", innerType: "Order" },
      },
    ];

    const svg = exportCanvasToSvg(objects, []);

    expect(svg).toContain("Array of: Line[]");
    expect(svg).toContain("Wrap: Order");
  });

  it("wraps text to the requested width", () => {
    // Non-DOM measurement assumes ~0.6em per char: 60px ≈ 10 chars per line.
    const lines = wrapTextLines("aaaa bbbb cccc dddd", 60, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(11);
    }
    expect(lines.join(" ")).toBe("aaaa bbbb cccc dddd");
  });

  it("wraps long constraint rules instead of overflowing the card", () => {
    const objects: CanvasObject[] = [
      {
        id: "con1",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 160,
        stormData: {
          kind: "constraint",
          name: "OrderLimit",
          fields: [],
          constraints: [
            {
              id: "c1",
              text: "The order total must never exceed ten thousand dollars or the command is rejected outright.",
            },
          ],
        },
      },
    ];

    const svg = exportCanvasToSvg(objects, []);

    // A long rule breaks across several lines (each extra line uses dy="14").
    const lineBreaks = (svg.match(/dy="14"/g) ?? []).length;
    expect(lineBreaks).toBeGreaterThanOrEqual(2);
    // The full rule text is preserved, split across tspans.
    expect(svg.replace(/\s+/g, " ")).toContain("never exceed");
    expect(svg.replace(/\s+/g, " ")).toContain("rejected outright");
  });
});