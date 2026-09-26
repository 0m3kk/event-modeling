import { GRID_SIZE } from "@/constants/canvas";
import type { Viewport } from "@/types";

/** World-space point at the center of the visible viewport region. */
export function getViewportCenter(viewport: Viewport): {
  x: number;
  y: number;
} {
  return {
    x: viewport.x + viewport.screenWidth / 2 / viewport.zoom,
    y: viewport.y + viewport.screenHeight / 2 / viewport.zoom,
  };
}

/**
 * Top-left corner that centers an object of the given size in the viewport,
 * snapped to the canvas grid. Falls back to the viewport corner when the
 * canvas size has not been reported yet (e.g. before the engine initialises).
 */
export function spawnAtViewportCenter(
  viewport: Viewport,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const center = getViewportCenter(viewport);
  return {
    x: Math.round((center.x - width / 2) / GRID_SIZE) * GRID_SIZE,
    y: Math.round((center.y - height / 2) / GRID_SIZE) * GRID_SIZE,
    width,
    height,
  };
}
