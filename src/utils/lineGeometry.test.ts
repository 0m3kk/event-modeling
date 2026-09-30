import { describe, expect, it } from "vitest";
import {
  createLineObject,
  distanceToSegment,
  getLineEndpoints,
  lineIntersectsRect,
  normalizeLineGeometry,
  segmentIntersectsRect,
} from "./lineGeometry";

describe("lineGeometry", () => {
  it("creates a line with a bounding box derived from its endpoints", () => {
    const line = createLineObject("l1", { x: 100, y: 50 }, { x: 40, y: 10 });

    expect(line.type).toBe("line");
    expect(line.x).toBe(40);
    expect(line.y).toBe(10);
    expect(line.width).toBe(60);
    expect(line.height).toBe(40);
    expect(line.lineData).toMatchObject({
      start: { x: 60, y: 40 },
      end: { x: 0, y: 0 },
      strokeWidth: 2,
      lineStyle: "solid",
      arrowEnd: false,
    });
  });

  it("round-trips local endpoints back to world coordinates", () => {
    const line = createLineObject("l1", { x: 10, y: 20 }, { x: 60, y: 90 });
    const ends = getLineEndpoints(line);

    expect(ends).toEqual({
      start: { x: 10, y: 20 },
      end: { x: 60, y: 90 },
    });
  });

  it("returns null endpoints for non-line objects", () => {
    expect(
      getLineEndpoints({ id: "s", type: "stickyNote", x: 0, y: 0, width: 1, height: 1 }),
    ).toBeNull();
  });

  it("measures the distance to a segment, clamping to its endpoints", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };

    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3);
    // Past the end of the segment the distance is to the endpoint, not the line.
    expect(distanceToSegment({ x: 20, y: 0 }, a, b)).toBeCloseTo(10);
    expect(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(
      Math.hypot(5, 5),
    );
  });

  it("detects a segment crossing an axis-aligned rectangle", () => {
    const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const hits = (ax: number, ay: number, bx: number, by: number) =>
      segmentIntersectsRect(
        { x: ax, y: ay },
        { x: bx, y: by },
        rect.minX,
        rect.minY,
        rect.maxX,
        rect.maxY,
      );

    // Fully inside
    expect(hits(2, 2, 8, 8)).toBe(true);
    // Crosses the rectangle
    expect(hits(-5, 5, 15, 5)).toBe(true);
    // Grazes a single corner (10, 10)
    expect(hits(15, 5, 5, 15)).toBe(true);
    // Entirely outside
    expect(hits(20, 0, 20, 20)).toBe(false);
    // Bypasses the rectangle vertically
    expect(hits(-5, -5, -5, 15)).toBe(false);
  });

  it("matches a line against a marquee rectangle by its stroke, not its bbox", () => {
    // A long diagonal line whose bounding box is big, but whose stroke passes
    // through only part of it.
    const line = createLineObject("l1", { x: 0, y: 0 }, { x: 100, y: 100 });

    expect(lineIntersectsRect(line, 40, 40, 60, 60)).toBe(true);
    // A rectangle in the line's bbox corner but away from the stroke misses.
    expect(lineIntersectsRect(line, 90, 0, 100, 10)).toBe(false);
    // Non-line objects never match.
    expect(
      lineIntersectsRect(
        { id: "s", type: "stickyNote", x: 0, y: 0, width: 1, height: 1 },
        0,
        0,
        10,
        10,
      ),
    ).toBe(false);
  });

  it("rebases endpoints when geometry is normalized", () => {
    const patch = normalizeLineGeometry(
      { x: 200, y: 100 },
      { x: 150, y: 180 },
      { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, stroke: "#2563eb" },
    );

    expect(patch).toMatchObject({
      x: 150,
      y: 100,
      width: 50,
      height: 80,
      lineData: {
        start: { x: 50, y: 0 },
        end: { x: 0, y: 80 },
        stroke: "#2563eb",
      },
    });
  });
});
