import { describe, it, expect } from "vitest";
import {
  getRoundedRectPerimeterPoints,
  calculateDashedSegments,
  calculateDashedPolyline,
  getRoundedPolylinePoints,
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

  it("dashes an open polyline without wrapping end to start", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const segments = calculateDashedPolyline(line, 10, 10, false);
    // 100px with 10 dash / 10 gap -> dashes at 0-10, 20-30, 40-50, 60-70,
    // 80-90. No wrap-around closing segment back to (0,0).
    expect(segments.length).toBe(5);
    expect(segments[0].p1).toEqual({ x: 0, y: 0 });
    expect(segments[segments.length - 1].p2).toEqual({ x: 90, y: 0 });
  });

  it("keeps closed behavior when requested", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(calculateDashedPolyline(square, 5, 5, true)).toEqual(
      calculateDashedSegments(square, 5, 5),
    );
  });

  it("flattens rounded corners on an open polyline", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ];
    const points = getRoundedPolylinePoints(corner, 8, 6);
    expect(points.length).toBeGreaterThan(corner.length);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 50, y: 50 });
    // The sharp corner itself is replaced by an arc.
    expect(points.some((p) => p.x === 50 && p.y === 0)).toBe(false);
    // Arc tangent points sit on each adjacent edge.
    expect(points.some((p) => Math.abs(p.x - 42) < 0.01 && p.y === 0)).toBe(
      true,
    );
    expect(points.some((p) => p.x === 50 && Math.abs(p.y - 8) < 0.01)).toBe(
      true,
    );
  });

  it("passes straight-through vertices through unchanged", () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(getRoundedPolylinePoints(straight, 8)).toEqual(straight);
  });
});
