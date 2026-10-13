import type { CanvasElement } from "@/types";
import { nameKey } from "@/utils/naming";
import {
  GROUP_LABEL_HEIGHT,
  GROUP_PADDING,
  getGroupChildren,
  isGroupElement,
} from "../groupCard/layout";
import { isSliceElement } from "../sliceCard/layout";
import {
  autoColumns,
  gridLayout,
  type ElementPatch,
  type MeasuredGrid,
} from "../common/arrange";
import {
  DOMAIN_LABEL_HEIGHT,
  DOMAIN_PADDING,
  DOMAIN_TYPE,
  getDomainChildren,
  type DomainData,
  type DomainElement,
} from "./layout";

/**
 * Auto-arrange layout for the *direct children* of a single Domain.
 *
 * The shape mirrors how a bounded context reads on a whiteboard:
 *
 *  - the reusable definition Groups (Types / States / Services) sit on the left
 *    as one or more columns of compact card grids;
 *  - the Slices line up in a horizontal row beside them, left-to-right in the
 *    Domain's stored {@link DomainData.sliceOrder};
 *  - loose cards (not in a Group or Slice) get a row of their own under the
 *    Slices.
 *
 * "Smarter" than a fixed stack: each Group's cards are packed into a small grid
 * (so a Group with many definitions is not a tall strip), and the Groups are
 * split into as many columns as it takes to bring the left side's height down to
 * the Slice row — the split that gives the smallest bounding box wins. That
 * keeps a Domain from being stretched tall by a long Group column and leaving a
 * big empty area under the Slices.
 *
 * The math is pure and React / Pixi / store free so the store button, the drag
 * interaction and the unit tests all reuse it. It only ever returns *patches*;
 * the store's normal `applyContainerLayout` pass then fits the Group frames and
 * the Domain around the cards we place.
 */

/** Vertical gap between Groups stacked in a column (and above the loose row). */
export const DOMAIN_ARRANGE_GAP = 28;
/** Horizontal gap between Group columns, and between them and the Slice row. */
export const DOMAIN_ARRANGE_COLUMN_GAP = 44;
/** Gap between cards sharing a container (Group children, Slices, loose cards). */
export const DOMAIN_ARRANGE_ITEM_GAP = 20;

/** A Group measured with its children laid out in a compact grid. */
interface GroupBox {
  group: CanvasElement;
  kids: CanvasElement[];
  grid: MeasuredGrid;
  frameWidth: number;
  frameHeight: number;
}

/** Size of one stacked column of Group boxes. */
function measureColumn(boxes: GroupBox[], gap: number): { width: number; height: number } {
  let width = 0;
  let height = 0;
  boxes.forEach((box, i) => {
    width = Math.max(width, box.frameWidth);
    height += box.frameHeight + (i > 0 ? gap : 0);
  });
  return { width, height };
}

/**
 * Sort rank for the standard definition Groups, so the left side always reads
 * Types → States → Services (whatever the Domain is called). Anything else lands
 * after them. Matches both "Account Types" and "AccountTypes" spellings.
 */
export function groupKindRank(group: CanvasElement): number {
  const words = nameKey(group.data?.name ?? "").split(" ");
  const last = words[words.length - 1] ?? "";
  if (last === "type" || last === "types") return 0;
  if (last === "state" || last === "states") return 1;
  if (last === "service" || last === "services") return 2;
  return 3;
}

/** Groups in display order: kind rank, then current vertical position, then name. */
export function orderGroups(groups: CanvasElement[]): CanvasElement[] {
  return [...groups].sort(
    (a, b) =>
      groupKindRank(a) - groupKindRank(b) ||
      a.y - b.y ||
      a.x - b.x ||
      nameKey(a.data?.name ?? "").localeCompare(nameKey(b.data?.name ?? "")),
  );
}

/**
 * Slices in display order. Any id already in `storedOrder` keeps that slot (so a
 * manual drag survives a re-arrange); the rest follow in current left-to-right
 * position. Ids that no longer exist are ignored.
 */
export function orderSlices(
  slices: CanvasElement[],
  storedOrder?: string[],
): CanvasElement[] {
  const byId = new Map(slices.map((slice) => [slice.id, slice]));
  const ordered: CanvasElement[] = [];
  const seen = new Set<string>();

  for (const id of storedOrder ?? []) {
    const slice = byId.get(id);
    if (slice && !seen.has(id)) {
      ordered.push(slice);
      seen.add(id);
    }
  }

  const remaining = slices
    .filter((slice) => !seen.has(slice.id))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  return [...ordered, ...remaining];
}

/**
 * New Slice order after dropping `draggedId` at world x `droppedCenterX`: the
 * dragged Slice is inserted before the first sibling whose centre sits to its
 * right. Returns every sibling id plus the dragged one, in order.
 */
export function reorderSlices(
  elements: CanvasElement[],
  domainId: string,
  draggedId: string,
  droppedCenterX: number,
): string[] {
  const domain = elements.find(
    (el) => el.id === domainId && el.type === DOMAIN_TYPE,
  ) as DomainElement | undefined;
  const slices = getDomainChildren(elements, domainId).filter(isSliceElement);
  const ordered = orderSlices(slices, domain?.data?.sliceOrder).filter(
    (slice) => slice.id !== draggedId,
  );

  const ids = ordered.map((slice) => slice.id);
  let insertAt = ids.length;
  for (let i = 0; i < ordered.length; i++) {
    if (droppedCenterX < ordered[i].x + ordered[i].width / 2) {
      insertAt = i;
      break;
    }
  }
  ids.splice(insertAt, 0, draggedId);
  return ids;
}

export interface PlanDomainArrangeOptions {
  /** Explicit Slice order to apply instead of the Domain's stored one. */
  sliceOrder?: string[];
  /** Vertical gap between Groups stacked in a column / the loose-card row. */
  gap?: number;
  /** Gap between Group columns, and between them and the Slice row. */
  columnGap?: number;
  /** Gap between cards inside a container. */
  itemGap?: number;
}

/**
 * Splits the ordered Group boxes into contiguous columns. Every cut pattern is
 * tried and the one that yields the smallest Domain bounding box wins (ties go
 * to fewer columns, then a shorter box), which keeps the left side as short as
 * the Slice row without spreading it wider than necessary.
 */
function splitIntoColumns(
  boxes: GroupBox[],
  gap: number,
  columnGap: number,
  rightWidth: number,
  rightHeight: number,
  hasRight: boolean,
): GroupBox[][] {
  const n = boxes.length;
  if (n === 0) return [];
  // Guards against a combinatorial blow-up on an absurd number of Groups.
  if (n > 14) return [boxes];

  let best: GroupBox[][] = [boxes];
  let bestArea = Infinity;
  let bestColumns = 1;
  let bestHeight = Infinity;

  const patterns = 1 << Math.max(0, n - 1);
  for (let mask = 0; mask < patterns; mask++) {
    const columns: GroupBox[][] = [];
    let current: GroupBox[] = [boxes[0]];
    for (let i = 1; i < n; i++) {
      if (mask & (1 << (i - 1))) {
        columns.push(current);
        current = [];
      }
      current.push(boxes[i]);
    }
    columns.push(current);

    let leftWidth = 0;
    let leftHeight = 0;
    columns.forEach((column, index) => {
      const size = measureColumn(column, gap);
      leftWidth += size.width + (index > 0 ? columnGap : 0);
      leftHeight = Math.max(leftHeight, size.height);
    });

    const domainWidth = leftWidth + (hasRight ? columnGap : 0) + rightWidth;
    const domainHeight = Math.max(leftHeight, rightHeight);
    const area = domainWidth * domainHeight;

    const better =
      area < bestArea - 0.5 ||
      (Math.abs(area - bestArea) <= 0.5 &&
        (columns.length < bestColumns ||
          (columns.length === bestColumns && domainHeight < bestHeight)));

    if (better) {
      best = columns;
      bestArea = area;
      bestColumns = columns.length;
      bestHeight = domainHeight;
    }
  }

  return best;
}

/**
 * Plans the arranged positions for a Domain's children. Returns one patch per
 * moved card plus a final patch writing the new `sliceOrder` onto the Domain
 * data. Returns null when the Domain does not exist or has no children to place.
 */
export function planDomainArrange(
  elements: CanvasElement[],
  domainId: string,
  options: PlanDomainArrangeOptions = {},
): ElementPatch[] | null {
  const domain = elements.find(
    (el) => el.id === domainId && el.type === DOMAIN_TYPE,
  ) as DomainElement | undefined;
  if (!domain) return null;

  const children = getDomainChildren(elements, domainId);
  if (children.length === 0) return null;

  const groups = children.filter(isGroupElement);
  const slices = children.filter(isSliceElement);
  const loose = children.filter((el) => !isGroupElement(el) && !isSliceElement(el));

  const orderedGroups = orderGroups(groups);
  const orderedSlices = orderSlices(
    slices,
    options.sliceOrder ?? (domain.data as DomainData | undefined)?.sliceOrder,
  );

  const gap = options.gap ?? DOMAIN_ARRANGE_GAP;
  const columnGap = options.columnGap ?? DOMAIN_ARRANGE_COLUMN_GAP;
  const itemGap = options.itemGap ?? DOMAIN_ARRANGE_ITEM_GAP;

  const contentLeft = domain.x + DOMAIN_PADDING;
  const contentTop = domain.y + DOMAIN_PADDING + DOMAIN_LABEL_HEIGHT;

  const patches: ElementPatch[] = [];

  // --- Measure each Group with its children in a compact grid. ---
  const boxes: GroupBox[] = orderedGroups.map((group) => {
    const kids = [...getGroupChildren(elements, group.id)].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    );
    const grid = gridLayout(kids, autoColumns(kids.length), itemGap);
    // An empty Group keeps its own size (the store leaves it unfitted).
    const frameWidth = kids.length ? grid.width + GROUP_PADDING * 2 : group.width;
    const frameHeight = kids.length
      ? grid.height + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT
      : group.height;
    return { group, kids, grid, frameWidth, frameHeight };
  });

  // --- Measure the right area: a Slice row, then a loose-card row under it. ---
  let sliceRowWidth = 0;
  let sliceRowHeight = 0;
  orderedSlices.forEach((slice, i) => {
    sliceRowWidth += slice.width + (i > 0 ? itemGap : 0);
    sliceRowHeight = Math.max(sliceRowHeight, slice.height);
  });

  let looseRowWidth = 0;
  let looseRowHeight = 0;
  loose.forEach((card, i) => {
    looseRowWidth += card.width + (i > 0 ? itemGap : 0);
    looseRowHeight = Math.max(looseRowHeight, card.height);
  });

  const rightWidth = Math.max(sliceRowWidth, looseRowWidth);
  const rightHeight =
    sliceRowHeight + (loose.length > 0 ? gap + looseRowHeight : 0);
  const hasRight = orderedSlices.length > 0 || loose.length > 0;

  // --- Balance the Group columns against the right area. ---
  const columns = splitIntoColumns(
    boxes,
    gap,
    columnGap,
    rightWidth,
    rightHeight,
    hasRight,
  );

  let leftX = contentLeft;
  for (const column of columns) {
    const size = measureColumn(column, gap);
    let y = contentTop;
    for (const box of column) {
      patches.push({ id: box.group.id, x: Math.round(leftX), y: Math.round(y) });
      const originX = leftX + GROUP_PADDING;
      const originY = y + GROUP_LABEL_HEIGHT + GROUP_PADDING;
      for (const kid of box.kids) {
        const pos = box.grid.positions.get(kid.id)!;
        patches.push({
          id: kid.id,
          x: Math.round(originX + pos.x),
          y: Math.round(originY + pos.y),
        });
      }
      y += box.frameHeight + gap;
    }
    leftX += size.width + columnGap;
  }

  // --- Right area: Slices in a row, loose cards on their own row below. ---
  const rightLeft = boxes.length > 0 ? leftX : contentLeft;

  let x = rightLeft;
  for (const slice of orderedSlices) {
    patches.push({ id: slice.id, x: Math.round(x), y: Math.round(contentTop) });
    x += slice.width + itemGap;
  }

  if (loose.length > 0) {
    const looseTop =
      orderedSlices.length > 0 ? contentTop + sliceRowHeight + gap : contentTop;
    x = rightLeft;
    for (const card of loose) {
      patches.push({ id: card.id, x: Math.round(x), y: Math.round(looseTop) });
      x += card.width + itemGap;
    }
  }

  // Persist the Slice order so a later arrange (or reload) keeps it.
  patches.push({
    id: domainId,
    data: { ...domain.data, sliceOrder: orderedSlices.map((slice) => slice.id) },
  });

  return patches;
}
