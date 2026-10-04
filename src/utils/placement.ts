import type { CanvasObject, GroupBounds, GroupInfo } from "@/types";
import { getObjectUnionBounds, groupAndAncestorIds } from "./groupBounds";

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

// ============================================================================
// Group member snapping
// ============================================================================

/**
 * Distance a member may sit from its group's existing cluster before it is
 * pulled back next to the cluster. Keeps a Section frame compact: a member
 * added far away no longer stretches the boundary across the canvas.
 */
export const GROUP_SNAP_MARGIN = 240;

function unionRect(a: Rect, b: Rect): Rect {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Snap members joining a group back next to the group's existing cluster.
 *
 * Members already within `GROUP_SNAP_MARGIN` of the cluster are left where they
 * are; ones beyond it are re-placed in the nearest free spot to the right of
 * the (growing) cluster, clear of other objects and of foreign Section frames.
 * Lines and connectors are ignored. Returns only the members that moved.
 */
export function snapMembersNearGroup(
  existingObjects: CanvasObject[],
  groups: GroupInfo[],
  groupId: string,
  members: CanvasObject[],
): Map<string, { x: number; y: number }> {
  const snapped = new Map<string, { x: number; y: number }>();

  const movable = members.filter(
    (o) => o.type !== "connector" && o.type !== "line",
  );
  if (movable.length === 0) return snapped;

  const cluster = getObjectUnionBounds(
    existingObjects.filter(
      (o) =>
        o.groupId === groupId && o.type !== "connector" && o.type !== "line",
    ),
  );
  if (!cluster) return snapped;

  const obstacles = getGroupObstacleRects(
    groups,
    groupAndAncestorIds(groupId, groups),
  );
  const placed: CanvasObject[] = [];

  let running: Rect = cluster;
  for (const member of movable) {
    const rect: Rect = {
      x: member.x,
      y: member.y,
      width: member.width ?? 0,
      height: member.height ?? 0,
    };
    // Distance between the member and the cluster on each axis (0 when they
    // overlap). A member within the margin on the dominant axis is "near" and
    // is left where it is; anything farther is pulled back next to the cluster.
    const gapX = Math.max(
      running.x - (rect.x + rect.width),
      rect.x - (running.x + running.width),
    );
    const gapY = Math.max(
      running.y - (rect.y + rect.height),
      rect.y - (running.y + running.height),
    );
    if (Math.max(gapX, gapY) <= GROUP_SNAP_MARGIN) {
      running = unionRect(running, rect);
      continue;
    }

    const anchor = {
      x: running.x + running.width + PLACEMENT_PADDING,
      y: running.y,
    };
    const spot = findFreeSpot(
      [...existingObjects, ...placed],
      { width: rect.width, height: rect.height },
      anchor,
      { obstacles },
    );
    snapped.set(member.id, spot);
    const placedRect = { ...rect, x: spot.x, y: spot.y };
    running = unionRect(running, placedRect);
    placed.push({ ...member, x: spot.x, y: spot.y });
  }

  return snapped;
}
