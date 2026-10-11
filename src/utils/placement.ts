import type { Point } from "@/types";

/**
 * Pure rectangle helpers shared by every auto-placer (domains, AI spawns).
 *
 * Keeping this free of React / Pixi / store imports lets the store, the
 * renderer and the AI bridge reuse the same placement math.
 */

export interface SizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Default spacing kept between auto-placed cards. */
export const DEFAULT_PLACEMENT_GAP = 16;

/** True when two rectangles overlap once inflated by `gap` on every side. */
export function rectsOverlap(a: SizedRect, b: SizedRect, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Picks a top-left spot for `dropped` that does not collide with any of the
 * `occupied` rectangles.
 *
 * The requested position is honoured when it is already free; otherwise the
 * nearest free slot beside the existing cards is chosen, filling to the right
 * and wrapping to the next row. Existing cards are never moved, so a user's own
 * arrangement is preserved.
 */
export function findFreeSpot(
  occupied: SizedRect[],
  dropped: SizedRect,
  gap = DEFAULT_PLACEMENT_GAP,
): Point {
  const collides = (rect: SizedRect) => occupied.some((o) => rectsOverlap(rect, o, gap));

  if (occupied.length === 0 || !collides(dropped)) {
    return { x: dropped.x, y: dropped.y };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  for (const o of occupied) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxRight = Math.max(maxRight, o.x + o.width);
    maxBottom = Math.max(maxBottom, o.y + o.height);
  }

  // Anchors next to existing cards (and at the content origin). Sorting by
  // row-then-column makes cards fill to the right, then wrap below.
  const candidates: Point[] = [
    { x: minX, y: minY },
    { x: maxRight + gap, y: minY },
    { x: minX, y: maxBottom + gap },
  ];
  for (const o of occupied) {
    candidates.push({ x: o.x + o.width + gap, y: o.y });
    candidates.push({ x: o.x, y: o.y + o.height + gap });
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);

  for (const candidate of candidates) {
    if (candidate.x < minX) continue;
    const rect = { x: candidate.x, y: candidate.y, width: dropped.width, height: dropped.height };
    if (!collides(rect)) {
      return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
    }
  }

  // Fallback: extend a fresh column to the right of everything.
  return { x: Math.round(maxRight + gap), y: Math.round(minY) };
}
