import { describe, expect, it } from "vitest";
import {
  computeElbowPath,
  simplifyPoints,
  getCardinalAnchorPoint,
  getAllCardinalAnchors,
  findClosestAnchor,
  distanceToPolyline,
  resolveConnectionAnchors,
} from "./elbowRouting";

describe("elbowRouting", () => {
  it("computes orthogonal right -> left elbow path", () => {
    const start = { x: 100, y: 50 };
    const end = { x: 300, y: 150 };

    const path = computeElbowPath(start, "right", end, "left", {
      clearance: 20,
    });
    expect(path[0]).toEqual(start);
    expect(path[path.length - 1]).toEqual(end);

    // Verify all segments are orthogonal (either dx === 0 or dy === 0)
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i]!;
      const p2 = path[i + 1]!;
      const isOrthogonal = p1.x === p2.x || p1.y === p2.y;
      expect(isOrthogonal).toBe(true);
    }
  });

  it("computes orthogonal bottom -> top elbow path", () => {
    const start = { x: 100, y: 50 };
    const end = { x: 200, y: 250 };

    const path = computeElbowPath(start, "bottom", end, "top", {
      clearance: 20,
    });
    expect(path[0]).toEqual(start);
    expect(path[path.length - 1]).toEqual(end);

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i]!;
      const p2 = path[i + 1]!;
      expect(p1.x === p2.x || p1.y === p2.y).toBe(true);
    }
  });

  it("insets the path endpoints by the contact gap", () => {
    const start = { x: 100, y: 50 };
    const end = { x: 300, y: 150 };

    const path = computeElbowPath(start, "right", end, "left", {
      startGap: 5,
      endGap: 5,
    });

    // The line stops 5px away from each anchor (right/left directions).
    expect(path[0]).toEqual({ x: 105, y: 50 });
    expect(path[path.length - 1]).toEqual({ x: 295, y: 150 });

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i]!;
      const p2 = path[i + 1]!;
      expect(p1.x === p2.x || p1.y === p2.y).toBe(true);
    }
  });

  it("simplifies collinear points along horizontal and vertical lines", () => {
    const collinear = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 20 },
      { x: 50, y: 40 },
    ];
    const simplified = simplifyPoints(collinear);
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
    ]);
  });

  it("calculates cardinal anchor positions on bounds accurately", () => {
    const bounds = { x: 100, y: 100, width: 200, height: 100 };
    expect(getCardinalAnchorPoint(bounds, "top")).toEqual({ x: 200, y: 100 });
    expect(getCardinalAnchorPoint(bounds, "right")).toEqual({ x: 300, y: 150 });
    expect(getCardinalAnchorPoint(bounds, "bottom")).toEqual({
      x: 200,
      y: 200,
    });
    expect(getCardinalAnchorPoint(bounds, "left")).toEqual({ x: 100, y: 150 });

    const allAnchors = getAllCardinalAnchors("card-1", bounds);
    expect(allAnchors).toHaveLength(4);

    const closest = findClosestAnchor({ x: 305, y: 148 }, allAnchors, 20);
    expect(closest?.anchor).toBe("right");

    const none = findClosestAnchor({ x: 500, y: 500 }, allAnchors, 20);
    expect(none).toBeNull();
  });

  it("measures the shortest distance from a point to a polyline", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    // On the first segment
    expect(distanceToPolyline({ x: 50, y: 0 }, path)).toBe(0);
    // Perpendicular to the first segment
    expect(distanceToPolyline({ x: 50, y: 12 }, path)).toBe(12);
    // Near the corner/bend
    expect(distanceToPolyline({ x: 103, y: 3 }, path)).toBeCloseTo(3, 5);
    // Clamped to the nearest endpoint
    expect(distanceToPolyline({ x: -10, y: 0 }, path)).toBe(10);
    // Empty polyline is unreachable
    expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  describe("resolveConnectionAnchors", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };

    it("faces bottom/top when the target is below", () => {
      const b = { x: 0, y: 250, width: 100, height: 100 };
      expect(resolveConnectionAnchors(a, b)).toEqual({
        start: "bottom",
        end: "top",
      });
    });

    it("faces right/left when the target is beside", () => {
      const b = { x: 250, y: 0, width: 100, height: 100 };
      expect(resolveConnectionAnchors(a, b)).toEqual({
        start: "right",
        end: "left",
      });
    });

    it("flips the target anchor when it moves past the source", () => {
      const bAbove = { x: 0, y: -250, width: 100, height: 100 };
      const bBelow = { x: 0, y: 250, width: 100, height: 100 };

      // Stored intent was the bottom of B; once B sits below A the resolver
      // must switch to the top of B so the line does not cross the card.
      expect(resolveConnectionAnchors(a, bAbove).end).toBe("bottom");
      expect(resolveConnectionAnchors(a, bBelow).end).toBe("top");
    });

    it("routes above the target card instead of across it", () => {
      const b = { x: 0, y: 250, width: 100, height: 100 };
      const { start, end } = resolveConnectionAnchors(a, b, {
        startGap: 5,
        endGap: 5,
      });
      const points = computeElbowPath(
        getCardinalAnchorPoint(a, start),
        start,
        getCardinalAnchorPoint(b, end),
        end,
        { startGap: 5, endGap: 5 },
      );

      // Every path point stays above the target's top edge.
      for (const p of points) {
        expect(p.y).toBeLessThanOrEqual(b.y);
      }
    });
  });
});
