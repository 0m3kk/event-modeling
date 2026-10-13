import type { CanvasElement } from "@/types";

/**
 * Shared arrangement primitives used by the Domain and Group auto-arrange
 * planners. Kept pure and free of React / Pixi / store imports so both tools —
 * and their unit tests — reuse one definition of "lay cards out in a grid".
 */

/** A position patch for one element, applied through the store's updateElements. */
export type ElementPatch = { id: string } & Partial<CanvasElement>;

export interface GridPoint {
  x: number;
  y: number;
}

export interface MeasuredGrid {
  width: number;
  height: number;
  /** Top-left of each item, relative to the grid origin. */
  positions: Map<string, GridPoint>;
}

/** Column count for `count` items: a roughly square grid. */
export function autoColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

/**
 * Lays `items` out row-major into `columns` columns, sizing each column to its
 * widest item and each row to its tallest, with `gap` between them. Positions are
 * relative to the grid's top-left.
 */
export function gridLayout(
  items: readonly CanvasElement[],
  columns: number,
  gap: number,
): MeasuredGrid {
  const positions = new Map<string, GridPoint>();
  if (items.length === 0) return { width: 0, height: 0, positions };

  const cols = Math.max(1, Math.min(columns, items.length));
  const rows = Math.ceil(items.length / cols);

  const colWidths = new Array<number>(cols).fill(0);
  const rowHeights = new Array<number>(rows).fill(0);
  items.forEach((item, i) => {
    colWidths[i % cols] = Math.max(colWidths[i % cols], item.width);
    rowHeights[Math.floor(i / cols)] = Math.max(rowHeights[Math.floor(i / cols)], item.height);
  });

  const colX = new Array<number>(cols).fill(0);
  for (let c = 1; c < cols; c++) colX[c] = colX[c - 1] + colWidths[c - 1] + gap;
  const rowY = new Array<number>(rows).fill(0);
  for (let r = 1; r < rows; r++) rowY[r] = rowY[r - 1] + rowHeights[r - 1] + gap;

  items.forEach((item, i) => {
    positions.set(item.id, { x: colX[i % cols], y: rowY[Math.floor(i / cols)] });
  });

  return {
    width: colX[cols - 1] + colWidths[cols - 1],
    height: rowY[rows - 1] + rowHeights[rows - 1],
    positions,
  };
}
