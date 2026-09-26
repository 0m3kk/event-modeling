import type { CardinalAnchor, Point } from "@/types";

export interface ElbowRoutingOptions {
  clearance?: number;
  cornerRadius?: number;
  /** Gap between the path start and the source anchor, so the line does not touch the card. */
  startGap?: number;
  /** Gap between the path end and the destination anchor. */
  endGap?: number;
}

/**
 * Calculates a clean orthogonal (90-degree) path between two anchor points.
 */
export function computeElbowPath(
  start: Point,
  startDir: CardinalAnchor,
  end: Point,
  endDir: CardinalAnchor,
  options: ElbowRoutingOptions = {},
): Point[] {
  const clearance = options.clearance ?? 20;
  const startGap = options.startGap ?? 0;
  const endGap = options.endGap ?? 0;

  // Offset point out from cardinal anchor
  const getExitPoint = (
    pt: Point,
    dir: CardinalAnchor,
    dist: number,
  ): Point => {
    switch (dir) {
      case "top":
        return { x: pt.x, y: pt.y - dist };
      case "bottom":
        return { x: pt.x, y: pt.y + dist };
      case "left":
        return { x: pt.x - dist, y: pt.y };
      case "right":
        return { x: pt.x + dist, y: pt.y };
    }
  };

  const p1 = getExitPoint(start, startDir, startGap);
  const p2 = getExitPoint(start, startDir, clearance);
  const p4 = getExitPoint(end, endDir, clearance);
  const p5 = getExitPoint(end, endDir, endGap);

  // Simplest case: direct horizontal or vertical link if aligned
  if (p2.x === p4.x || p2.y === p4.y) {
    return simplifyPoints([p1, p2, p4, p5]);
  }

  // Orthogonal route between p2 and p4
  const bends: Point[] = [];

  const isStartHorizontal = startDir === "left" || startDir === "right";
  const isEndHorizontal = endDir === "left" || endDir === "right";

  if (isStartHorizontal && isEndHorizontal) {
    // Both horizontal (e.g. right -> left)
    const midX = (p2.x + p4.x) / 2;
    // Check if simple Z-bend is valid
    if (
      (startDir === "right" && p2.x <= p4.x) ||
      (startDir === "left" && p2.x >= p4.x)
    ) {
      bends.push({ x: midX, y: p2.y }, { x: midX, y: p4.y });
    } else {
      // Loop-around routing
      const midY = (p2.y + p4.y) / 2;
      bends.push({ x: p2.x, y: midY }, { x: p4.x, y: midY });
    }
  } else if (!isStartHorizontal && !isEndHorizontal) {
    // Both vertical (e.g. bottom -> top)
    const midY = (p2.y + p4.y) / 2;
    if (
      (startDir === "bottom" && p2.y <= p4.y) ||
      (startDir === "top" && p2.y >= p4.y)
    ) {
      bends.push({ x: p2.x, y: midY }, { x: p4.x, y: midY });
    } else {
      const midX = (p2.x + p4.x) / 2;
      bends.push({ x: midX, y: p2.y }, { x: midX, y: p4.y });
    }
  } else if (isStartHorizontal && !isEndHorizontal) {
    // Horizontal start, vertical end (L-shape or S-shape)
    bends.push({ x: p4.x, y: p2.y });
  } else {
    // Vertical start, horizontal end
    bends.push({ x: p2.x, y: p4.y });
  }

  return simplifyPoints([p1, p2, ...bends, p4, p5]);
}

/**
 * Eliminates redundant collinear points (points lying on the same line segment).
 */
export function simplifyPoints(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  const result: Point[] = [points[0]!];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    // Check collinearity
    const isCollinearX = prev.x === curr.x && curr.x === next.x;
    const isCollinearY = prev.y === curr.y && curr.y === next.y;

    if (!isCollinearX && !isCollinearY) {
      result.push(curr);
    }
  }

  result.push(points[points.length - 1]!);
  return result;
}

/**
 * Returns the exact coordinates of a cardinal anchor on a rectangular bounding box.
 */
export function getCardinalAnchorPoint(
  bounds: { x: number; y: number; width: number; height: number },
  anchor: CardinalAnchor,
): Point {
  switch (anchor) {
    case "top":
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case "right":
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    case "bottom":
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    case "left":
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  }
}

const CARDINAL_ANCHORS: CardinalAnchor[] = ["top", "right", "bottom", "left"];

/** Extra score (px) charged per bend so a straighter path wins close calls. */
const CONNECTOR_BEND_PENALTY = 10;

function polylineLength(points: Point[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(
      points[i + 1]!.x - points[i]!.x,
      points[i + 1]!.y - points[i]!.y,
    );
  }
  return length;
}

/**
 * Chooses the cardinal anchor on each box that gives the shortest, simplest
 * elbow path between them. Since the attach points follow the relative
 * positions of the two boxes, a connector keeps leaving/entering on the sides
 * that face each other — e.g. if B is dragged from above A to below A, B's
 * anchor flips from "bottom" to "top" instead of the path looping across B.
 *
 * The stored `connectorData` anchors are treated as the user's initial intent;
 * this resolver overrides them at render time so connectors stay correct as
 * objects move.
 */
export function resolveConnectionAnchors(
  startBounds: { x: number; y: number; width: number; height: number },
  endBounds: { x: number; y: number; width: number; height: number },
  options: ElbowRoutingOptions = {},
): { start: CardinalAnchor; end: CardinalAnchor } {
  let best: { start: CardinalAnchor; end: CardinalAnchor } = {
    start: "right",
    end: "left",
  };
  let bestScore = Infinity;

  for (const start of CARDINAL_ANCHORS) {
    const startPoint = getCardinalAnchorPoint(startBounds, start);
    for (const end of CARDINAL_ANCHORS) {
      const endPoint = getCardinalAnchorPoint(endBounds, end);
      const points = computeElbowPath(
        startPoint,
        start,
        endPoint,
        end,
        options,
      );
      const score =
        polylineLength(points) +
        Math.max(0, points.length - 2) * CONNECTOR_BEND_PENALTY;

      if (score < bestScore) {
        bestScore = score;
        best = { start, end };
      }
    }
  }

  return best;
}

/**
 * Returns all 4 cardinal anchor points for an object or group bounding box.
 */
export function getAllCardinalAnchors(
  objectId: string,
  bounds: { x: number; y: number; width: number; height: number },
): { objectId: string; anchor: CardinalAnchor; point: Point }[] {
  const anchors: CardinalAnchor[] = ["top", "right", "bottom", "left"];
  return anchors.map((anchor) => ({
    objectId,
    anchor,
    point: getCardinalAnchorPoint(bounds, anchor),
  }));
}

/**
 * Returns the opposite cardinal direction.
 */
export function getOppositeAnchor(anchor: CardinalAnchor): CardinalAnchor {
  switch (anchor) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

/**
 * Shortest distance from a point to a polyline (perpendicular distance to the
 * nearest segment, with segment endpoints clamped).
 */
export function distanceToPolyline(point: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    const only = points[0]!;
    return Math.hypot(point.x - only.x, point.y - only.y);
  }

  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    let t = 0;
    if (lengthSq > 0) {
      t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    min = Math.min(min, Math.hypot(point.x - projX, point.y - projY));
  }

  return min;
}

/**
 * Finds the closest anchor to a target point within maxDistance threshold.
 */
export function findClosestAnchor<
  T extends { objectId: string; anchor: CardinalAnchor; point: Point },
>(target: Point, candidateAnchors: T[], maxDistance: number = 25): T | null {
  let closest: T | null = null;
  let minDist = maxDistance;

  for (const item of candidateAnchors) {
    const dist = Math.hypot(item.point.x - target.x, item.point.y - target.y);
    if (dist < minDist) {
      minDist = dist;
      closest = item;
    }
  }

  return closest;
}
