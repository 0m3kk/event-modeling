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
 *  - the reusable definition Groups (Types / States / Services) stack in a
 *    single column on the left, each one a compact vertical list of its cards;
 *  - the Slices line up in a horizontal row beside them, left-to-right in the
 *    Domain's stored {@link DomainData.sliceOrder};
 *  - loose cards (not in a Group or Slice) get a row of their own under the
 *    Slices.
 *
 * The math is pure and React / Pixi / store free so the store button, the drag
 * interaction and the unit tests all reuse it. It only ever returns *patches*;
 * the store's normal `applyContainerLayout` pass then fits the Group frames and
 * the Domain around the cards we place.
 */

/** Vertical gap between the stacked Groups (and the loose-card row). */
export const DOMAIN_ARRANGE_GAP = 28;
/** Horizontal gap between the left Group column and the Slice row. */
export const DOMAIN_ARRANGE_COLUMN_GAP = 44;
/** Gap between cards sharing a container (Group children, Slices, loose cards). */
export const DOMAIN_ARRANGE_ITEM_GAP = 20;

export type ElementPatch = { id: string } & Partial<CanvasElement>;

/**
 * Sort rank for the standard definition Groups, so the left column always reads
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
  /** Vertical gap between stacked Groups / the loose-card row. */
  gap?: number;
  /** Gap between the Group column and the Slice row. */
  columnGap?: number;
  /** Gap between cards inside a container. */
  itemGap?: number;
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

  // --- Left column: definition Groups stacked vertically. ---
  let frameTop = contentTop;
  let leftWidth = 0;

  for (const group of orderedGroups) {
    const kids = [...getGroupChildren(elements, group.id)].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    );

    let contentWidth = 0;
    let contentHeight = 0;
    kids.forEach((kid, i) => {
      contentWidth = Math.max(contentWidth, kid.width);
      contentHeight += kid.height + (i > 0 ? itemGap : 0);
    });

    // An empty Group keeps its own size (the store leaves it unfitted).
    const frameWidth = kids.length ? contentWidth + GROUP_PADDING * 2 : group.width;
    const frameHeight = kids.length
      ? contentHeight + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT
      : group.height;

    patches.push({ id: group.id, x: Math.round(contentLeft), y: Math.round(frameTop) });

    let childY = frameTop + GROUP_LABEL_HEIGHT + GROUP_PADDING;
    for (const kid of kids) {
      patches.push({
        id: kid.id,
        x: Math.round(contentLeft + GROUP_PADDING),
        y: Math.round(childY),
      });
      childY += kid.height + itemGap;
    }

    frameTop += frameHeight + gap;
    leftWidth = Math.max(leftWidth, frameWidth);
  }

  // --- Right area: Slices in a row, loose cards on their own row below. ---
  const rightLeft =
    orderedGroups.length > 0 ? contentLeft + leftWidth + columnGap : contentLeft;

  let x = rightLeft;
  let rowHeight = 0;
  for (const slice of orderedSlices) {
    patches.push({ id: slice.id, x: Math.round(x), y: Math.round(contentTop) });
    x += slice.width + itemGap;
    rowHeight = Math.max(rowHeight, slice.height);
  }

  if (loose.length > 0) {
    const looseTop =
      orderedSlices.length > 0 ? contentTop + rowHeight + gap : contentTop;
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
