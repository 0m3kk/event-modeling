import type { CanvasElement, Point } from "@/types";
import {
  DOMAIN_LABEL_HEIGHT,
  DOMAIN_PADDING,
  DOMAIN_TYPE,
} from "@/tools/domainCard/layout";
import {
  GROUP_LABEL_HEIGHT,
  GROUP_PADDING,
  GROUP_TYPE,
} from "@/tools/groupCard/layout";
import { SLICE_TYPE } from "@/tools/sliceCard/layout";

/**
 * Whole-board "tidy up" layout.
 *
 * The messy part of a board is that cards and their containers end up scattered
 * wherever they were created. This module computes a compact grid that packs
 * everything back together:
 *
 *  - A *unit* is a top-level thing that cannot live inside anything else: a
 *    Domain, a free-standing Group, a free-standing Slice, or a lone card. A
 *    Domain/Group unit carries its whole subtree (nested Groups, Slices and
 *    cards) with it.
 *  - Units are arranged top-to-bottom, left-to-right in a grid. Inside every
 *    container the same grid is applied to its direct children, so the contents
 *    are tidy too, not just the outer boxes.
 *  - Slice lane cards are left alone: a Slice is treated as one fixed block and
 *    the store re-lays its lanes out from the Slice's position.
 *
 * The math is pure and React/Pixi free so the store, renderer and AI bridge can
 * reuse it and it can be unit-tested on its own.
 */

/** Default spacing kept between arranged units. */
export const ARRANGE_GAP = 40;

export interface ArrangeOptions {
  /** Fixed number of units per row at the top level. Defaults to ~√n. */
  columns?: number;
  /** Spacing between arranged units (px). */
  gap?: number;
  /** Top-left world point the arrangement starts from. Defaults to the board's current top-left. */
  origin?: Point;
}

export interface ArrangedPosition {
  id: string;
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface LayoutNode {
  element: CanvasElement;
  children: LayoutNode[];
}

const CONTAINER_TYPES: ReadonlySet<string> = new Set([DOMAIN_TYPE, GROUP_TYPE]);

function isContainerElement(element: CanvasElement): boolean {
  return CONTAINER_TYPES.has(element.type);
}

/** Padding + label band a container reserves around its children. */
function containerChrome(type: string): { padding: number; labelHeight: number } {
  return type === DOMAIN_TYPE
    ? { padding: DOMAIN_PADDING, labelHeight: DOMAIN_LABEL_HEIGHT }
    : { padding: GROUP_PADDING, labelHeight: GROUP_LABEL_HEIGHT };
}

/**
 * Splits the board into a forest of units. Every element is attached to its
 * container parent (Slice lane cards are skipped — slices own their layout).
 * Elements with no resolvable parent become roots, in board order.
 */
function buildForest(elements: CanvasElement[]): LayoutNode[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const childrenByParent = new Map<string, CanvasElement[]>();
  const roots: CanvasElement[] = [];

  for (const el of elements) {
    const parentId = el.sliceId ?? el.groupId ?? el.domainId;
    const parent = parentId ? byId.get(parentId) : undefined;

    if (!parentId || !parent) {
      roots.push(el);
      continue;
    }
    // Lane cards are positioned by the slice reflow, not by this layout.
    if (parent.type === SLICE_TYPE) continue;
    // Only Groups and Domains hold tree children; anything else is a root.
    if (!isContainerElement(parent)) {
      roots.push(el);
      continue;
    }

    const list = childrenByParent.get(parent.id);
    if (list) list.push(el);
    else childrenByParent.set(parent.id, [el]);
  }

  const nodeFor = (el: CanvasElement): LayoutNode => ({
    element: el,
    children: (childrenByParent.get(el.id) ?? []).map(nodeFor),
  });

  return roots.map(nodeFor);
}

/**
 * Lays out `sizes` in reading order, `columns` per row. Each row is as tall as
 * its tallest member; rows only advance once the whole row is placed. Returns
 * the top-left of every item plus the block's total size.
 */
function gridLayout(sizes: Size[], columns: number, gap: number): { positions: Point[]; width: number; height: number } {
  const count = sizes.length;
  if (count === 0) return { positions: [], width: 0, height: 0 };

  const cols = Math.max(1, Math.min(Math.floor(columns) || count, count));
  const positions: Point[] = [];
  let y = 0;
  let widest = 0;

  for (let start = 0; start < count; start += cols) {
    const row = sizes.slice(start, start + cols);
    const rowHeight = Math.max(...row.map((s) => s.height));
    let x = 0;
    for (const size of row) {
      positions.push({ x, y });
      x += size.width + gap;
    }
    widest = Math.max(widest, x - gap);
    y += rowHeight + gap;
  }

  return { positions, width: widest, height: y - gap };
}

/** Auto column count for `count` items: an approximate square. */
function autoColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

/**
 * Size a node needs once its own children are arranged. A container is sized
 * from its arranged children; a leaf (including an empty container) keeps its
 * current size.
 */
function measureNode(node: LayoutNode, gap: number): Size {
  if (!isContainerElement(node.element) || node.children.length === 0) {
    return { width: node.element.width, height: node.element.height };
  }

  const childSizes = node.children.map((child) => measureNode(child, gap));
  const grid = gridLayout(childSizes, autoColumns(node.children.length), gap);
  const { padding, labelHeight } = containerChrome(node.element.type);

  return {
    width: grid.width + padding * 2,
    height: grid.height + padding * 2 + labelHeight,
  };
}

/**
 * Records where every leaf in the subtree should go for a node whose own
 * top-left is `(x, y)`. Containers are not recorded: the store re-fits their
 * frame from the children we place here.
 */
function placeNode(
  node: LayoutNode,
  x: number,
  y: number,
  gap: number,
  patches: ArrangedPosition[],
): void {
  if (!isContainerElement(node.element) || node.children.length === 0) {
    patches.push({ id: node.element.id, x: Math.round(x), y: Math.round(y) });
    return;
  }

  const { padding, labelHeight } = containerChrome(node.element.type);
  const contentX = x + padding;
  const contentY = y + padding + labelHeight;
  const childSizes = node.children.map((child) => measureNode(child, gap));
  const grid = gridLayout(childSizes, autoColumns(node.children.length), gap);

  node.children.forEach((child, index) => {
    const position = grid.positions[index];
    placeNode(child, contentX + position.x, contentY + position.y, gap, patches);
  });
}

/** Current top-left of everything on the board, used as the default origin. */
function boardOrigin(elements: CanvasElement[]): Point {
  let minX = Infinity;
  let minY = Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY } : { x: 0, y: 0 };
}

/**
 * Computes new top-left positions that pack the whole board into a tidy grid.
 * Returns one patch per card that must move (containers with children are
 * repositioned by the store's container reflow). Returns an empty array when
 * there is nothing to arrange.
 */
export function arrangeBoard(
  elements: CanvasElement[],
  options: ArrangeOptions = {},
): ArrangedPosition[] {
  if (elements.length < 2) return [];

  const forest = buildForest(elements);
  if (forest.length === 0) return [];

  const gap = options.gap ?? ARRANGE_GAP;
  const columns = options.columns ?? autoColumns(forest.length);
  const sizes = forest.map((node) => measureNode(node, gap));
  const grid = gridLayout(sizes, columns, gap);
  const origin = options.origin ?? boardOrigin(elements);

  const patches: ArrangedPosition[] = [];
  forest.forEach((node, index) => {
    const position = grid.positions[index];
    placeNode(node, origin.x + position.x, origin.y + position.y, gap, patches);
  });

  return patches;
}
