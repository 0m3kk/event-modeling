import type { CanvasObject } from "@/types";
import type { CanvasStore } from "@/store/types";
import { getViewportCenter as calcViewportCenter } from "@/utils/viewport";
import type { Rect } from "@/utils/placement";

// Placement geometry lives in `@/utils/placement` so the store (reference
// copies) and the AI tools share one set of collision rules. Re-exported here
// for the existing tool imports.
export {
  PLACEMENT_PADDING,
  findFreeSpot,
  getGroupObstacleRects,
  getOccupiedRects,
  rectsOverlap,
} from "@/utils/placement";
export type { Rect } from "@/utils/placement";

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
  kind?: string;
  domain?: string;
  action?: string;
  sourceId?: string;
  targetId?: string;
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
  const kind = obj.stormData?.kind ?? obj.modelData?.kind;
  if (kind) row.kind = kind;
  if (obj.domain) row.domain = obj.domain;
  if (obj.stormData?.action) row.action = obj.stormData.action;
  if (obj.connectorData) {
    row.sourceId = obj.connectorData.start.objectId;
    row.targetId = obj.connectorData.end.objectId;
  }
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
