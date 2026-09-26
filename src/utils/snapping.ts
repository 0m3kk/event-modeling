import { GRID_SIZE } from "@/constants/canvas";
import type { AlignmentGuide } from "@/store/types";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnappingResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

export function snapToGrid(
  value: number,
  gridSize: number = GRID_SIZE,
): number {
  return Math.round(value / gridSize) * gridSize;
}

export function calculateSnapping(
  movingBox: Box,
  targetBoxes: Box[],
  threshold: number = 6,
  enableGridSnap: boolean = true,
): SnappingResult {
  let snappedX = movingBox.x;
  let snappedY = movingBox.y;
  const guides: AlignmentGuide[] = [];

  let minDeltaX = Infinity;
  let guideX: number | null = null;

  let minDeltaY = Infinity;
  let guideY: number | null = null;

  const movingLeft = movingBox.x;
  const movingCenterX = movingBox.x + movingBox.width / 2;
  const movingRight = movingBox.x + movingBox.width;

  const movingTop = movingBox.y;
  const movingMiddleY = movingBox.y + movingBox.height / 2;
  const movingBottom = movingBox.y + movingBox.height;

  for (const target of targetBoxes) {
    const targetLeft = target.x;
    const targetCenterX = target.x + target.width / 2;
    const targetRight = target.x + target.width;

    // Check X alignments
    const xChecks = [
      { movingVal: movingLeft, targetVal: targetLeft, offset: 0 },
      { movingVal: movingLeft, targetVal: targetCenterX, offset: 0 },
      { movingVal: movingLeft, targetVal: targetRight, offset: 0 },
      {
        movingVal: movingCenterX,
        targetVal: targetLeft,
        offset: -movingBox.width / 2,
      },
      {
        movingVal: movingCenterX,
        targetVal: targetCenterX,
        offset: -movingBox.width / 2,
      },
      {
        movingVal: movingCenterX,
        targetVal: targetRight,
        offset: -movingBox.width / 2,
      },
      {
        movingVal: movingRight,
        targetVal: targetLeft,
        offset: -movingBox.width,
      },
      {
        movingVal: movingRight,
        targetVal: targetCenterX,
        offset: -movingBox.width,
      },
      {
        movingVal: movingRight,
        targetVal: targetRight,
        offset: -movingBox.width,
      },
    ];

    for (const check of xChecks) {
      const delta = Math.abs(check.movingVal - check.targetVal);
      if (delta <= threshold && delta < minDeltaX) {
        minDeltaX = delta;
        snappedX = check.targetVal + check.offset;
        guideX = check.targetVal;
      }
    }

    // Check Y alignments
    const targetTop = target.y;
    const targetMiddleY = target.y + target.height / 2;
    const targetBottom = target.y + target.height;

    const yChecks = [
      { movingVal: movingTop, targetVal: targetTop, offset: 0 },
      { movingVal: movingTop, targetVal: targetMiddleY, offset: 0 },
      { movingVal: movingTop, targetVal: targetBottom, offset: 0 },
      {
        movingVal: movingMiddleY,
        targetVal: targetTop,
        offset: -movingBox.height / 2,
      },
      {
        movingVal: movingMiddleY,
        targetVal: targetMiddleY,
        offset: -movingBox.height / 2,
      },
      {
        movingVal: movingMiddleY,
        targetVal: targetBottom,
        offset: -movingBox.height / 2,
      },
      {
        movingVal: movingBottom,
        targetVal: targetTop,
        offset: -movingBox.height,
      },
      {
        movingVal: movingBottom,
        targetVal: targetMiddleY,
        offset: -movingBox.height,
      },
      {
        movingVal: movingBottom,
        targetVal: targetBottom,
        offset: -movingBox.height,
      },
    ];

    for (const check of yChecks) {
      const delta = Math.abs(check.movingVal - check.targetVal);
      if (delta <= threshold && delta < minDeltaY) {
        minDeltaY = delta;
        snappedY = check.targetVal + check.offset;
        guideY = check.targetVal;
      }
    }
  }

  // If magnetic snap occurred, record guide lines
  if (guideX !== null) {
    guides.push({ axis: "x", position: guideX });
  } else if (enableGridSnap) {
    snappedX = snapToGrid(snappedX);
  }

  if (guideY !== null) {
    guides.push({ axis: "y", position: guideY });
  } else if (enableGridSnap) {
    snappedY = snapToGrid(snappedY);
  }

  return {
    x: snappedX,
    y: snappedY,
    guides,
  };
}
