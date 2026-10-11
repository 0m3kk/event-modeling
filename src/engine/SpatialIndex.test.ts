import { describe, it, expect } from "vitest";
import { SpatialIndex } from "./SpatialIndex";
import type { CanvasElement } from "@/types";

describe("SpatialIndex", () => {
  it("hits elements by point", () => {
    const index = new SpatialIndex();
    const elements: CanvasElement[] = [
      {
        id: "box1",
        type: "stickyNote",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: {},
      },
      {
        id: "box2",
        type: "stickyNote",
        x: 200,
        y: 200,
        width: 50,
        height: 50,
        data: {},
      },
    ];

    index.rebuild(elements);

    expect(index.hitTest({ x: 50, y: 50 })).toBe("box1");
    expect(index.hitTest({ x: 210, y: 210 })).toBe("box2");
    expect(index.hitTest({ x: 150, y: 150 })).toBeNull();
  });

  it("searches elements within marquee rectangle", () => {
    const index = new SpatialIndex();
    const elements: CanvasElement[] = [
      { id: "box1", type: "a", x: 10, y: 10, width: 20, height: 20, data: {} },
      { id: "box2", type: "b", x: 50, y: 50, width: 20, height: 20, data: {} },
      { id: "box3", type: "c", x: 200, y: 200, width: 20, height: 20, data: {} },
    ];
    index.rebuild(elements);

    const hit = index.searchRect({ x: 0, y: 0, width: 80, height: 80 });
    expect(hit.sort()).toEqual(["box1", "box2"].sort());
  });
});
