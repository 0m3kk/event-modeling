import { describe, it, expect } from "vitest";
import { snapToGrid, calculateSnapping } from "./snapping";

describe("snapping", () => {
  it("snaps value to grid correctly", () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(4)).toBe(0);
    expect(snapToGrid(6)).toBe(10);
    expect(snapToGrid(15)).toBe(20);
    expect(snapToGrid(24, 10)).toBe(20);
    expect(snapToGrid(25, 20)).toBe(20);
    expect(snapToGrid(35, 20)).toBe(40);
  });

  it("calculates magnetic alignment when edges are within threshold", () => {
    const target = { x: 100, y: 100, width: 200, height: 100 }; // left: 100, center: 200, right: 300
    // Moving box left is at 103 (within 6px of 100)
    const moving = { x: 103, y: 300, width: 200, height: 100 };

    const result = calculateSnapping(moving, [target], 6, false);
    expect(result.x).toBe(100);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]).toEqual({ axis: "x", position: 100 });
  });

  it("calculates center alignment", () => {
    const target = { x: 100, y: 100, width: 300, height: 100 }; // center X: 250
    // Moving box center is at 248 (x=148, width=200 -> center=248)
    const moving = { x: 148, y: 300, width: 200, height: 100 };

    const result = calculateSnapping(moving, [target], 5, false);
    expect(result.x).toBe(150); // 250 - 100 = 150
    expect(result.guides).toContainEqual({ axis: "x", position: 250 });
  });

  it("falls back to grid snap when outside magnetic threshold", () => {
    const target = { x: 100, y: 100, width: 200, height: 100 };
    // Moving box is at 153 (far from 100, 200, 300)
    const moving = { x: 153, y: 254, width: 200, height: 100 };

    const result = calculateSnapping(moving, [target], 6, true);
    expect(result.x).toBe(150);
    expect(result.y).toBe(250);
    expect(result.guides).toHaveLength(0);
  });
});
