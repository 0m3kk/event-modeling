import { describe, it, expect } from "vitest";
import {
  getRoundedRectPerimeterPoints,
  calculateDashedSegments,
} from "./dashedGraphics";

describe("dashedGraphics", () => {
  it("generates closed perimeter points for a rounded rectangle", () => {
    const points = getRoundedRectPerimeterPoints(0, 0, 100, 100, 10);
    expect(points.length).toBeGreaterThan(10);
    // First point should be at x+r, y
    expect(points[0]).toEqual({ x: 10, y: 0 });
    // Should have points near right, bottom, left corners
    expect(points.some((p) => Math.abs(p.x - 100) < 1)).toBe(true);
    expect(points.some((p) => Math.abs(p.y - 100) < 1)).toBe(true);
  });

  it("calculates dashed segments along a square perimeter", () => {
    // 100x100 square with r=0
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Dash 10, gap 10
    const segments = calculateDashedSegments(square, 10, 10);
    expect(segments.length).toBeGreaterThan(0);

    // Each segment should have length approx 10
    for (const seg of segments) {
      const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
      expect(len).toBeCloseTo(10, 1);
    }

    // Total perimeter is 400. With 10 dash + 10 gap, there should be approx 20 dash segments
    expect(segments.length).toBe(20);
  });

  it("handles dotted mode with short dashes and small gaps", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ];
    const segments = calculateDashedSegments(square, 2, 4);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
      expect(len).toBeCloseTo(2, 1);
    }
  });
});
