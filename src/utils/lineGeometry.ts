import type { CanvasObject, LineData, Point } from "@/types";

/** Default stroke color of a freshly drawn line. */
export const DEFAULT_LINE_STROKE = "#475569";

/**
 * World-space endpoints of a line object, or null when it carries no line
 * payload. The stored endpoints are local offsets, so the object's x/y is
 * added back to place them on the board.
 */
export function getLineEndpoints(
  obj: CanvasObject,
): { start: Point; end: Point } | null {
  if (obj.type !== "line" || !obj.lineData) return null;
  return {
    start: { x: obj.x + obj.lineData.start.x, y: obj.y + obj.lineData.start.y },
    end: { x: obj.x + obj.lineData.end.x, y: obj.y + obj.lineData.end.y },
  };
}

/**
 * World-space midpoint of a line object's segment, or null when it carries no
 * line payload. Used to decide whether a separator sits inside a section.
 */
export function getLineMidpoint(obj: CanvasObject): Point | null {
  const ends = getLineEndpoints(obj);
  if (!ends) return null;
  return {
    x: (ends.start.x + ends.end.x) / 2,
    y: (ends.start.y + ends.end.y) / 2,
  };
}

/**
 * True when the segment a→b touches the axis-aligned rectangle. Uses the
 * Liang–Barsky slab clip so a segment fully inside, fully crossing, or merely
 * grazing a corner all count as a hit.
 */
export function segmentIntersectsRect(
  a: Point,
  b: Point,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const clip = (p: number, q: number): boolean => {
    // Parallel to this edge: inside only when q keeps it within the slab.
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, a.x - minX) &&
    clip(dx, maxX - a.x) &&
    clip(-dy, a.y - minY) &&
    clip(dy, maxY - a.y)
  );
}

/**
 * True when a line object's segment crosses an axis-aligned rectangle. Used by
 * marquee selection, where lines are matched by their actual stroke rather than
 * a bounding box.
 */
export function lineIntersectsRect(
  obj: CanvasObject,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const ends = getLineEndpoints(obj);
  if (!ends) return false;
  return segmentIntersectsRect(ends.start, ends.end, minX, minY, maxX, maxY);
}

/** Shortest distance from a point to the segment a→b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Geometry patch for a line whose world endpoints are start/end. Recomputes
 * the bounding box and rebases the endpoints to local offsets so the object
 * and its content stay consistent (used when drawing and endpoint dragging).
 */
export function normalizeLineGeometry(
  start: Point,
  end: Point,
  base: LineData = { start, end },
): Pick<CanvasObject, "x" | "y" | "width" | "height" | "lineData"> {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    lineData: {
      ...base,
      start: { x: start.x - x, y: start.y - y },
      end: { x: end.x - x, y: end.y - y },
    },
  };
}

/** Builds a line object from two world-space endpoints. */
export function createLineObject(
  id: string,
  start: Point,
  end: Point,
  style: Partial<LineData> = {},
): CanvasObject {
  const geometry = normalizeLineGeometry(start, end, {
    start,
    end,
    stroke: DEFAULT_LINE_STROKE,
    strokeWidth: 2,
    lineStyle: "solid",
    arrowStart: false,
    arrowEnd: false,
    ...style,
  });
  return {
    id,
    type: "line",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    lineData: geometry.lineData,
  };
}

/** Parses a `#rrggbb` string into a Pixi color number. */
export function parseLineColor(
  stroke: string | undefined,
  fallback: number = 0x475569,
): number {
  if (!stroke) return fallback;
  const parsed = parseInt(stroke.replace("#", ""), 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}
