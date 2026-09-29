import { describe, expect, it } from "vitest";
import { ElbowConnectorLayer } from "./ElbowConnectorLayer";
import type { CanvasObject, LineStyle } from "@/types";

function card(id: string, x: number, y: number): CanvasObject {
  return { id, type: "storm", x, y, width: 200, height: 100 };
}

function connector(lineStyle?: LineStyle): CanvasObject {
  return {
    id: "conn-1",
    type: "connector",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    connectorData: {
      start: { objectId: "a", anchor: "right" },
      end: { objectId: "b", anchor: "left" },
      lineStyle,
    },
  };
}

describe("ElbowConnectorLayer", () => {
  const objects = [card("a", 0, 0), card("b", 400, 0)];

  it.each<[LineStyle]>([["solid"], ["dashed"], ["dotted"]])(
    "renders a %s connector without throwing",
    (lineStyle) => {
      const layer = new ElbowConnectorLayer();
      const conn = connector(lineStyle);
      expect(() =>
        layer.renderConnectors([...objects, conn], [], [conn.id]),
      ).not.toThrow();
      expect(layer.getConnectorPoints(conn, objects, [])).not.toBeNull();
      layer.destroy();
    },
  );

  it("renders with start and end arrows toggled on", () => {
    const layer = new ElbowConnectorLayer();
    const conn = connector("dashed");
    conn.connectorData = {
      ...conn.connectorData!,
      arrowStart: true,
      arrowEnd: true,
    };
    expect(() =>
      layer.renderConnectors([...objects, conn], [], []),
    ).not.toThrow();
    layer.destroy();
  });
});
