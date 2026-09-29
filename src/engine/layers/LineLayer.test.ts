import { describe, expect, it } from "vitest";
import { LineLayer } from "./LineLayer";
import { createLineObject } from "@/utils/lineGeometry";
import type { LineStyle } from "@/types";

function line(lineStyle?: LineStyle) {
  const obj = createLineObject(
    "line-1",
    { x: 0, y: 0 },
    { x: 120, y: 80 },
    { lineStyle },
  );
  return obj;
}

describe("LineLayer", () => {
  it.each<[LineStyle]>([["solid"], ["dashed"], ["dotted"]])(
    "renders a %s line without throwing",
    (lineStyle) => {
      const layer = new LineLayer();
      const obj = line(lineStyle);
      expect(() => layer.renderLines([obj], [obj.id])).not.toThrow();
      layer.destroy();
    },
  );

  it("renders arrowheads on both ends", () => {
    const layer = new LineLayer();
    const obj = line();
    obj.lineData = {
      ...obj.lineData!,
      arrowStart: true,
      arrowEnd: true,
    };
    expect(() => layer.renderLines([obj], [])).not.toThrow();
    layer.destroy();
  });

  it("renders a live preview without throwing", () => {
    const layer = new LineLayer();
    expect(() =>
      layer.renderPreview({ start: { x: 0, y: 0 }, end: { x: 40, y: 40 } }),
    ).not.toThrow();
    expect(() => layer.renderPreview(null)).not.toThrow();
    layer.destroy();
  });
});
