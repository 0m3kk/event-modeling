import type { Viewport } from "@/types";
import { GRID_SIZE } from "@/constants/canvas";

type PanZoom = Pick<Viewport, "x" | "y" | "zoom">;

export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: PanZoom,
): { x: number; y: number } {
  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: PanZoom,
): { x: number; y: number } {
  return {
    x: worldX * viewport.zoom + viewport.x,
    y: worldY * viewport.zoom + viewport.y,
  };
}

export function snapPointToGrid(
  x: number,
  y: number,
  gridSize: number = GRID_SIZE,
): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}
