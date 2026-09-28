import { describe, expect, it } from "vitest";
import {
  computeElbowPath,
  computeElbowPathWithBends,
  segmentIntersectsRect,
  doesPathCutNodes,
  computeResolvedConnectorPoints,
  simplifyPoints,
  getCardinalAnchorPoint,
  getAllCardinalAnchors,
  findClosestAnchor,
  distanceToPolyline,
  resolveConnectionAnchors,
} from "./elbowRouting";
import type { CanvasObject } from "@/types";

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

  describe("computeElbowPathWithBends", () => {
    it("routes through user-defined intermediate waypoints orthogonally", () => {
      const start = { x: 100, y: 100 };
      const end = { x: 500, y: 500 };
      const waypoints = [
        { id: "b1", x: 200, y: 300 },
        { id: "b2", x: 400, y: 300 },
      ];

      const path = computeElbowPathWithBends(
        start,
        "right",
        end,
        "left",
        waypoints,
      );

      // Verify all segments are orthogonal
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i]!;
        const p2 = path[i + 1]!;
        expect(p1.x === p2.x || p1.y === p2.y).toBe(true);
      }

      // Verify path passes through waypoints
      expect(path.some((p) => p.x === 200 && p.y === 300)).toBe(true);
      expect(path.some((p) => p.x === 400 && p.y === 300)).toBe(true);
    });
  });

  describe("segmentIntersectsRect & doesPathCutNodes", () => {
    const card = { x: 100, y: 100, width: 200, height: 120 };

    it("does not intersect when segment originates on border and heads outward", () => {
      // Right anchor at (300, 160), heads right to (320, 160)
      const p1 = { x: 300, y: 160 };
      const p2 = { x: 320, y: 160 };
      expect(segmentIntersectsRect(p1, p2, card)).toBe(false);
    });

    it("intersects when segment cuts through interior horizontally", () => {
      const p1 = { x: 50, y: 160 };
      const p2 = { x: 350, y: 160 };
      expect(segmentIntersectsRect(p1, p2, card)).toBe(true);
    });

    it("intersects when segment cuts through interior vertically", () => {
      const p1 = { x: 200, y: 50 };
      const p2 = { x: 200, y: 250 };
      expect(segmentIntersectsRect(p1, p2, card)).toBe(true);
    });

    it("does not intersect when segment is outside", () => {
      const p1 = { x: 50, y: 50 };
      const p2 = { x: 80, y: 50 };
      expect(segmentIntersectsRect(p1, p2, card)).toBe(false);
    });

    it("detects obstacle node cut along a path", () => {
      const startBounds = { x: 0, y: 100, width: 100, height: 100 };
      const endBounds = { x: 500, y: 100, width: 100, height: 100 };
      const obstacle = { x: 200, y: 80, width: 100, height: 100 };

      // Straight horizontal path from 100 to 500 at y=150 cuts through obstacle
      const path = [
        { x: 100, y: 150 },
        { x: 500, y: 150 },
      ];
      expect(doesPathCutNodes(path, startBounds, endBounds, [obstacle])).toBe(
        true,
      );
    });
  });

  describe("computeResolvedConnectorPoints (User Intent vs Auto-Route)", () => {
    const cardA = { x: 100, y: 100, width: 100, height: 100 };
    const cardB = { x: 300, y: 100, width: 100, height: 100 };

    it("follows the exact anchors user chose when path does NOT cut nodes", () => {
      const conn: CanvasObject = {
        id: "c1",
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: { objectId: "a", anchor: "top" },
          end: { objectId: "b", anchor: "top" },
        },
      };

      const points = computeResolvedConnectorPoints(conn, cardA, cardB, []);
      expect(points).not.toBeNull();
      // Should leave Card A from top (y=100) and enter Card B from top (y=100)
      expect(points![0]!.y).toBeLessThanOrEqual(100);
      expect(points![points!.length - 1]!.y).toBeLessThanOrEqual(100);
    });

    it("auto-routes only when moving a node causes the path to cut through a node", () => {
      // Card A is at (100, 100). User originally set start: right, end: left.
      // But now Card B is moved to the left of Card A at (-200, 100).
      // Keeping start: right and end: left would cause the line to cut through Card A.
      const cardBMovedLeft = { x: -200, y: 100, width: 100, height: 100 };
      const conn: CanvasObject = {
        id: "c1",
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: { objectId: "a", anchor: "right" },
          end: { objectId: "b", anchor: "left" },
        },
      };

      const points = computeResolvedConnectorPoints(
        conn,
        cardA,
        cardBMovedLeft,
        [],
      );
      expect(points).not.toBeNull();

      // Because the original right->left path would cut through Card A,
      // it must auto-route so it exits Card A left and enters Card B right cleanly.
      expect(doesPathCutNodes(points!, cardA, cardBMovedLeft, [])).toBe(false);
    });

    it("preserves user waypoints when they do not cut nodes", () => {
      const conn: CanvasObject = {
        id: "c1",
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: { objectId: "a", anchor: "bottom" },
          end: { objectId: "b", anchor: "bottom" },
          bends: [{ id: "b1", x: 250, y: 350 }],
        },
      };

      const points = computeResolvedConnectorPoints(conn, cardA, cardB, []);
      expect(points).not.toBeNull();
      expect(distanceToPolyline({ x: 250, y: 350 }, points!)).toBe(0);
    });

    it("updates route when start or end endpoint is modified after creation", () => {
      const cardBeside = { x: 400, y: 100, width: 100, height: 100 };
      const conn: CanvasObject = {
        id: "c1",
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: { objectId: "a", anchor: "top" },
          end: { objectId: "b", anchor: "top" },
        },
      };

      const pointsBefore = computeResolvedConnectorPoints(conn, cardA, cardBeside, []);
      expect(pointsBefore![0]!.y).toBe(100); // Card A top edge (y=100)

      // User changes start endpoint to right, and end to left
      conn.connectorData = {
        ...conn.connectorData,
        start: { objectId: "a", anchor: "right" },
        end: { objectId: "b", anchor: "left" },
      };

      const pointsAfter = computeResolvedConnectorPoints(conn, cardA, cardBeside, []);
      expect(pointsAfter![0]!.x).toBe(200); // Card A right edge (x=100+100)
      expect(pointsAfter![0]!.y).toBe(150); // Card A middle Y (y=100+50)
      expect(pointsAfter![pointsAfter!.length - 1]!.x).toBe(400); // Card B left edge (x=400)
    });
  });
});
