import { describe, expect, it } from "vitest";
import type { CanvasObject } from "@/types";
import {
  findFreeSpot,
  getGroupObstacleRects,
  getOccupiedRects,
  rectsOverlap,
} from "./placement";

const card = (overrides: Partial<CanvasObject> = {}): CanvasObject => ({
  id: "c1",
  type: "storm",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  ...overrides,
});

describe("getOccupiedRects", () => {
  it("ignores connectors but keeps every measurable object", () => {
    const rects = getOccupiedRects([
      card(),
      card({ id: "conn", type: "connector", width: 0, height: 0 }),
    ]);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});

describe("getGroupObstacleRects", () => {
  it("returns cached Section bounds and skips boundaries without bounds", () => {
    const rects = getGroupObstacleRects([
      { id: "g1", customBounds: { x: 10, y: 20, width: 300, height: 200 } },
      { id: "g2" },
    ]);
    expect(rects).toEqual([{ x: 10, y: 20, width: 300, height: 200 }]);
  });

  it("excludes the target group and its ancestors", () => {
    const rects = getGroupObstacleRects(
      [
        { id: "g1", customBounds: { x: 0, y: 0, width: 100, height: 100 } },
        { id: "g2", customBounds: { x: 0, y: 0, width: 200, height: 200 } },
      ],
      new Set(["g2"]),
    );
    expect(rects).toEqual([{ x: 0, y: 0, width: 100, height: 100 }]);
  });
});

describe("findFreeSpot", () => {
  it("finds the nearest spot not colliding with a card", () => {
    const spot = findFreeSpot(
      [card()],
      { width: 200, height: 100 },
      { x: 0, y: 0 },
    );
    expect(spot).not.toEqual({ x: 0, y: 0 });
    expect(
      rectsOverlap(
        { x: spot.x, y: spot.y, width: 200, height: 100 },
        { x: 0, y: 0, width: 200, height: 100 },
        40,
      ),
    ).toBe(false);
  });

  it("steers around Section frames passed as obstacles", () => {
    const groups = [
      { id: "g1", customBounds: { x: -50, y: -50, width: 300, height: 300 } },
    ];
    const spot = findFreeSpot(
      [card()],
      { width: 200, height: 100 },
      { x: 0, y: 0 },
      { obstacles: getGroupObstacleRects(groups) },
    );
    // The frame covers 0,0, so the result must fall outside it.
    expect(
      rectsOverlap(
        { x: spot.x, y: spot.y, width: 200, height: 100 },
        { x: -50, y: -50, width: 300, height: 300 },
        40,
      ),
    ).toBe(false);
  });

  it("falls back to the right of everything when no ring fits", () => {
    const huge = card({ x: -5000, y: -5000, width: 10000, height: 10000 });
    const spot = findFreeSpot(
      [huge],
      { width: 100, height: 100 },
      { x: 0, y: 0 },
      { maxRings: 1 },
    );
    expect(spot.x).toBeGreaterThanOrEqual(5000);
  });
});
