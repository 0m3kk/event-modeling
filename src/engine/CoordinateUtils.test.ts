import { describe, it, expect } from "vitest";
import {
  screenToWorld,
  worldToScreen,
  snapPointToGrid,
} from "./CoordinateUtils";

describe("CoordinateUtils", () => {
  it("converts screen to world coordinates correctly", () => {
    const vp = { x: 100, y: 50, zoom: 2 };
    // screenX = 300 -> (300 - 100) / 2 = 100
    // screenY = 250 -> (250 - 50) / 2 = 100
    expect(screenToWorld(300, 250, vp)).toEqual({ x: 100, y: 100 });
  });

  it("converts world to screen coordinates correctly", () => {
    const vp = { x: 100, y: 50, zoom: 2 };
    // worldX = 100 -> 100 * 2 + 100 = 300
    // worldY = 100 -> 100 * 2 + 50 = 250
    expect(worldToScreen(100, 100, vp)).toEqual({ x: 300, y: 250 });
  });

  it("snaps point to 10px grid", () => {
    expect(snapPointToGrid(13, 27)).toEqual({ x: 10, y: 30 });
  });
});
