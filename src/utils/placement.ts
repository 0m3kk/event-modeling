import type { CanvasObject, GroupBounds } from "@/types";

// ============================================================================
// Free-spot placement
// ============================================================================
//
// AI tools (flows/slices, model nodes, loose cards) and the store (reference
// copies) all need to drop new content into empty space. Keeping the geometry
// here — instead of in the AI tool layer — lets both call the exact same
// collision rules.
//
// Two kinds of obstacles matter:
//   - individual objects (cards, notes, text boxes)
//   - Section frames (`customBounds`) — without these a new flow happily lands
//     inside an existing group, in the whitespace between its members.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum gap kept between new content and anything already on the board. */
export const PLACEMENT_PADDING = 40;
const PLACEMENT_STEP = 80;
const MAX_PLACEMENT_RINGS = 40;

export function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

/** Occupied rectangles for every measurable, non-connector object. */
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

/**
 * Section frames as obstacle rectangles. Groups without cached bounds are
 * skipped — they have no measurable area to collide with.
 *
 * `excludeIds` lets a caller place content *into* a group (the target group and
 * its ancestors must not block their own members).
 */
export function getGroupObstacleRects(
  groups: { id: string; customBounds?: GroupBounds }[],
  excludeIds?: Iterable<string>,
): Rect[] {
  const exclude = excludeIds ? new Set(excludeIds) : undefined;
  const rects: Rect[] = [];
  for (const group of groups) {
    if (exclude?.has(group.id)) continue;
    const bounds = group.customBounds;
    if (!bounds) continue;
    rects.push({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  }
  return rects;
}

function unionBounds(rects: Rect[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Find the empty spot closest to `anchor` that fits `size` without colliding
 * with any object or extra obstacle (e.g. Section frames).
 *
 * Searches outward in expanding rings so the result stays visually near the
 * anchor (domain proximity); when no ring fits, falls back to the right of
 * everything that is already occupied.
 */
export function findFreeSpot(
  objects: CanvasObject[],
  size: { width: number; height: number },
  anchor: { x: number; y: number },
  options: {
    padding?: number;
    step?: number;
    maxRings?: number;
    /** Extra rectangles to avoid, such as Section frames. */
    obstacles?: Rect[];
  } = {},
): { x: number; y: number } {
  const padding = options.padding ?? PLACEMENT_PADDING;
  const step = options.step ?? PLACEMENT_STEP;
  const maxRings = options.maxRings ?? MAX_PLACEMENT_RINGS;
  const occupied = [...getOccupiedRects(objects), ...(options.obstacles ?? [])];

  const isFree = (x: number, y: number): boolean => {
    const candidate: Rect = { x, y, width: size.width, height: size.height };
    return !occupied.some((rect) => rectsOverlap(candidate, rect, padding));
  };

  if (isFree(anchor.x, anchor.y)) return { x: anchor.x, y: anchor.y };

  for (let ring = 1; ring <= maxRings; ring++) {
    // Walk only the ring's perimeter; every cell here is the same distance
    // from the anchor, so the order within a ring does not matter.
    const offset = ring * step;
    for (let d = -ring; d <= ring; d++) {
      const along = d * step;
      const candidates = [
        { x: anchor.x + along, y: anchor.y - offset },
        { x: anchor.x + along, y: anchor.y + offset },
        { x: anchor.x - offset, y: anchor.y + along },
        { x: anchor.x + offset, y: anchor.y + along },
      ];
      for (const candidate of candidates) {
        if (isFree(candidate.x, candidate.y)) return candidate;
      }
    }
  }

  const bounds = unionBounds(occupied);
  if (!bounds) return { x: anchor.x, y: anchor.y };
  return { x: bounds.x + bounds.width + padding, y: bounds.y };
}
