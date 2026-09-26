import { describe, it, expect } from "vitest";
import { getViewportCenter, spawnAtViewportCenter } from "./viewport";
import type { Viewport } from "@/types";

function makeViewport(overrides: Partial<Viewport> = {}): Viewport {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    screenWidth: 1000,
    screenHeight: 800,
    ...overrides,
  };
}

describe("getViewportCenter", () => {
  it("returns the world point at the middle of the screen", () => {
    expect(getViewportCenter(makeViewport())).toEqual({ x: 500, y: 400 });
  });

  it("accounts for pan and zoom", () => {
    const viewport = makeViewport({ x: 100, y: 50, zoom: 2 });
    // corner (100,50) + (1000/2)/2 = 350, (50) + (800/2)/2 = 250
    expect(getViewportCenter(viewport)).toEqual({ x: 350, y: 250 });
  });
});

describe("spawnAtViewportCenter", () => {
  it("places the object's center at the viewport center", () => {
    expect(spawnAtViewportCenter(makeViewport(), 260, 100)).toEqual({
      x: 370,
      y: 350,
      width: 260,
      height: 100,
    });
  });

  it("snaps the top-left corner to the grid", () => {
    const bounds = spawnAtViewportCenter(
      makeViewport({ screenWidth: 1003, screenHeight: 801 }),
      260,
      100,
    );
    expect(bounds.x % 10).toBe(0);
    expect(bounds.y % 10).toBe(0);
  });
});
