import { describe, it, expect } from "vitest";
import { findFreeSpot, rectsOverlap, type SizedRect } from "./placement";

const rect = (x: number, y: number, width = 200, height = 100): SizedRect => ({
  x,
  y,
  width,
  height,
});

describe("findFreeSpot", () => {
  it("keeps the requested position when nothing is there", () => {
    expect(findFreeSpot([], rect(400, 0))).toEqual({ x: 400, y: 0 });
    expect(findFreeSpot([rect(0, 0)], rect(400, 0))).toEqual({ x: 400, y: 0 });
  });

  it("moves a colliding card beside the existing one", () => {
    expect(findFreeSpot([rect(0, 0)], rect(0, 0), 16)).toEqual({ x: 216, y: 0 });
  });

  it("never returns a position that overlaps any existing card", () => {
    const occupied = [rect(0, 0), rect(216, 0), rect(432, 0)];
    const spot = findFreeSpot(occupied, rect(0, 0), 16);
    const next = rect(spot.x, spot.y);
    for (const o of occupied) {
      expect(rectsOverlap(next, o, 0)).toBe(false);
    }
  });

  it("spreads a batch of cards without overlapping", () => {
    const placed: SizedRect[] = [];
    for (let i = 0; i < 6; i++) {
      const spot = findFreeSpot(placed, rect(0, 0));
      const next = { x: spot.x, y: spot.y, width: 200, height: 100 };
      for (const o of placed) {
        expect(rectsOverlap(next, o, 1)).toBe(false);
      }
      placed.push(next);
    }
  });
});
