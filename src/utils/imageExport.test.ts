import { describe, expect, it } from "vitest";
import {
  computeCanvasBounds,
  escapeXml,
  exportCanvasToSvg,
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
});
