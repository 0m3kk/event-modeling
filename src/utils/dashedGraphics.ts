import type { Graphics } from "pixi.js";

export interface Point {
  x: number;
  y: number;
}

export interface DashedStrokeOptions {
  dashLength?: number;
  gapLength?: number;
  color?: number;
  width?: number;
  alpha?: number;
}

/**
 * Generates sample vertices around the perimeter of a rounded rectangle.
 */
export function getRoundedRectPerimeterPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  arcSegments: number = 6,
): Point[] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const points: Point[] = [];

  // Top edge (left to right)
  points.push({ x: x + r, y });
  points.push({ x: x + width - r, y });

  // Top-right corner arc (-PI/2 to 0)
  const trCenter = { x: x + width - r, y: y + r };
  for (let i = 1; i <= arcSegments; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
    points.push({
      x: trCenter.x + r * Math.cos(angle),
      y: trCenter.y + r * Math.sin(angle),
    });
  }

  // Right edge (top to bottom)
  points.push({ x: x + width, y: y + height - r });

  // Bottom-right corner arc (0 to PI/2)
  const brCenter = { x: x + width - r, y: y + height - r };
  for (let i = 1; i <= arcSegments; i++) {
    const angle = 0 + (Math.PI / 2) * (i / arcSegments);
    points.push({
      x: brCenter.x + r * Math.cos(angle),
      y: brCenter.y + r * Math.sin(angle),
    });
  }

  // Bottom edge (right to left)
  points.push({ x: x + r, y: y + height });

  // Bottom-left corner arc (PI/2 to PI)
  const blCenter = { x: x + r, y: y + height - r };
  for (let i = 1; i <= arcSegments; i++) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
    points.push({
      x: blCenter.x + r * Math.cos(angle),
      y: blCenter.y + r * Math.sin(angle),
    });
  }

  // Left edge (bottom to top)
  points.push({ x, y: y + r });

  // Top-left corner arc (PI to 3*PI/2)
  const tlCenter = { x: x + r, y: y + r };
  for (let i = 1; i <= arcSegments; i++) {
    const angle = Math.PI + (Math.PI / 2) * (i / arcSegments);
    points.push({
      x: tlCenter.x + r * Math.cos(angle),
      y: tlCenter.y + r * Math.sin(angle),
    });
  }

  return points;
}

export interface LineSegment {
  p1: Point;
  p2: Point;
}

/**
 * Breaks a polyline of perimeter points into dashed or dotted visible line segments.
 */
export function calculateDashedSegments(
  points: Point[],
  dashLength: number,
  gapLength: number,
): LineSegment[] {
  if (points.length < 2) return [];

  const segments: LineSegment[] = [];
  let isDash = true;
  let remainingCurrent = dashLength;
  let currentPos: Point = { ...points[0] };

  for (let i = 0; i < points.length; i++) {
    const nextIdx = (i + 1) % points.length;
    const targetPoint = points[nextIdx];

    let segDx = targetPoint.x - currentPos.x;
    let segDy = targetPoint.y - currentPos.y;
    let segDist = Math.hypot(segDx, segDy);

    while (segDist > 0.001) {
      if (segDist <= remainingCurrent) {
        if (isDash) {
          segments.push({
            p1: { ...currentPos },
            p2: { ...targetPoint },
          });
        }
        remainingCurrent -= segDist;
        currentPos = { ...targetPoint };
        segDist = 0;

        if (remainingCurrent <= 0.001) {
          isDash = !isDash;
          remainingCurrent = isDash ? dashLength : gapLength;
        }
      } else {
        // Step partially along the segment
        const fraction = remainingCurrent / segDist;
        const stepPoint: Point = {
          x: currentPos.x + segDx * fraction,
          y: currentPos.y + segDy * fraction,
        };

        if (isDash) {
          segments.push({
            p1: { ...currentPos },
            p2: { ...stepPoint },
          });
        }

        currentPos = { ...stepPoint };
        segDx = targetPoint.x - currentPos.x;
        segDy = targetPoint.y - currentPos.y;
        segDist = Math.hypot(segDx, segDy);

        isDash = !isDash;
        remainingCurrent = isDash ? dashLength : gapLength;
      }
    }
  }

  return segments;
}

/**
 * Draws a dashed, dotted, or solid rounded rectangle onto Pixi Graphics.
 */
export function drawStyledRoundRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: "solid" | "dashed" | "dotted" = "solid",
  options: DashedStrokeOptions = {},
): void {
  const color = options.color ?? 0x6366f1;
  const strokeWidth = options.width ?? 2;
  const alpha = options.alpha ?? 1;

  if (style === "solid") {
    graphics
      .roundRect(x, y, width, height, radius)
      .stroke({ color, width: strokeWidth, alpha });
    return;
  }

  const dashLength =
    options.dashLength ?? (style === "dotted" ? 3 : 8);
  const gapLength =
    options.gapLength ?? (style === "dotted" ? 4 : 6);

  const perimeter = getRoundedRectPerimeterPoints(x, y, width, height, radius);
  const segments = calculateDashedSegments(perimeter, dashLength, gapLength);

  for (const seg of segments) {
    graphics.moveTo(seg.p1.x, seg.p1.y);
    graphics.lineTo(seg.p2.x, seg.p2.y);
  }

  graphics.stroke({ color, width: strokeWidth, alpha });
}
