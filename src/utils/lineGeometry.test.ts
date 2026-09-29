import { describe, expect, it } from "vitest";
import {
  createLineObject,
  distanceToSegment,
  getLineEndpoints,
  normalizeLineGeometry,
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
