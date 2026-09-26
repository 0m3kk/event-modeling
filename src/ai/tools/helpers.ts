import type { CanvasObject } from "@/types";
import type { CanvasStore } from "@/store/types";
import { getViewportCenter as calcViewportCenter } from "@/utils/viewport";

/** Best-effort human label for an object. */
export function objectLabel(obj: CanvasObject): string {
  if (obj.stormData?.name) return obj.stormData.name;
  if (obj.modelData?.name) return obj.modelData.name;
  if (obj.text) return obj.text;
  if (obj.type === "connector") return "connector";
  return obj.type;
}

export interface ObjectRow {
  id: string;
  type: CanvasObject["type"];
  label: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  groupId?: string;
}

export function toObjectRow(
  obj: CanvasObject,
  options: { includeGeometry?: boolean } = {},
): ObjectRow {
  const row: ObjectRow = {
    id: obj.id,
    type: obj.type,
    label: objectLabel(obj),
    ...(obj.groupId ? { groupId: obj.groupId } : {}),
  };
  if (options.includeGeometry) {
    row.x = Math.round(obj.x);
    row.y = Math.round(obj.y);
    row.width = Math.round(obj.width ?? 0);
    row.height = Math.round(obj.height ?? 0);
  }
  return row;
}

export function getViewportCenter(state: CanvasStore): {
  x: number;
  y: number;
} {
  return calcViewportCenter(state.viewport);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getViewportRect(state: CanvasStore): Rect {
  const { viewport } = state;
  const screenWidth = viewport.screenWidth > 0 ? viewport.screenWidth : 1200;
  const screenHeight = viewport.screenHeight > 0 ? viewport.screenHeight : 800;
  return {
    x: viewport.x,
    y: viewport.y,
    width: screenWidth / viewport.zoom,
    height: screenHeight / viewport.zoom,
  };
}

export function getObjectsBounds(
  objects: CanvasObject[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    if (obj.type === "connector") continue;
    minX = Math.min(minX, obj.x);
    minY = Math.min(minY, obj.y);
    maxX = Math.max(maxX, obj.x + (obj.width ?? 0));
    maxY = Math.max(maxY, obj.y + (obj.height ?? 0));
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export const PLACEMENT_PADDING = 40;
const PLACEMENT_STEP = 80;
const MAX_PLACEMENT_RINGS = 25;

export function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

export function getOccupiedRects(objects: CanvasObject[]): Rect[] {
  return objects
    .filter((obj) => obj.type !== "connector")
    .map((obj) => ({
      x: obj.x,
      y: obj.y,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
    }));
}

export function findFreeSpot(
  objects: CanvasObject[],
  size: { width: number; height: number },
  anchor: { x: number; y: number },
  options: { padding?: number; step?: number; maxRings?: number } = {},
): { x: number; y: number } {
  const padding = options.padding ?? PLACEMENT_PADDING;
  const step = options.step ?? PLACEMENT_STEP;
  const maxRings = options.maxRings ?? MAX_PLACEMENT_RINGS;
  const occupied = getOccupiedRects(objects);

  const isFree = (x: number, y: number): boolean => {
    const candidate: Rect = { x, y, width: size.width, height: size.height };
    return !occupied.some((rect) => rectsOverlap(candidate, rect, padding));
  };

  if (isFree(anchor.x, anchor.y)) return { x: anchor.x, y: anchor.y };

  for (let ring = 1; ring <= maxRings; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = anchor.x + dx * step;
        const y = anchor.y + dy * step;
        if (isFree(x, y)) return { x, y };
      }
    }
  }

  const bounds = getObjectsBounds(objects);
  if (!bounds) return { x: anchor.x, y: anchor.y };
  return { x: bounds.maxX + padding, y: bounds.minY };
}
