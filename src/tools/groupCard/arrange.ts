import type { CanvasElement } from "@/types";
import { autoColumns, gridLayout, type ElementPatch } from "../common/arrange";
import {
  GROUP_LABEL_HEIGHT,
  GROUP_PADDING,
  GROUP_TYPE,
  getGroupChildren,
  type GroupElement,
} from "./layout";

/**
 * Auto-arrange for the children of a single Group.
 *
 * A Group clusters reusable cards (Object/Enum/Alias, Service, State, Actor) and
 * auto-fits a frame around them. Cards are usually dropped wherever they land, so
 * this packs them back into a compact, roughly square grid — the same grid the
 * Domain arrange uses for its Groups, exposed here so a free-standing Group (or
 * one you want to tidy on its own) can be arranged without touching the Domain.
 *
 * Pure and React / Pixi / store free. The store's normal `applyContainerLayout`
 * pass re-fits the Group frame around the cards we place.
 */

/** Gap kept between cards inside an arranged Group. */
export const GROUP_ARRANGE_ITEM_GAP = 16;

export interface PlanGroupArrangeOptions {
  /** Number of columns. Defaults to a roughly square grid. */
  columns?: number;
  /** Gap between cards. */
  itemGap?: number;
}

/**
 * Plans the arranged positions for a Group's children, anchored at the Group's
 * current top-left so it stays where it is and only its frame is re-fitted.
 * Returns null when the Group does not exist or has no children.
 */
export function planGroupArrange(
  elements: CanvasElement[],
  groupId: string,
  options: PlanGroupArrangeOptions = {},
): ElementPatch[] | null {
  const group = elements.find(
    (el) => el.id === groupId && el.type === GROUP_TYPE,
  ) as GroupElement | undefined;
  if (!group) return null;

  // Order by current position so repeated arranges stay stable.
  const kids = [...getGroupChildren(elements, groupId)].sort(
    (a, b) => a.y - b.y || a.x - b.x,
  );
  if (kids.length === 0) return null;

  const gap = options.itemGap ?? GROUP_ARRANGE_ITEM_GAP;
  const columns = options.columns ?? autoColumns(kids.length);
  const grid = gridLayout(kids, columns, gap);

  const originX = group.x + GROUP_PADDING;
  const originY = group.y + GROUP_LABEL_HEIGHT + GROUP_PADDING;

  return kids.map((kid) => {
    const pos = grid.positions.get(kid.id)!;
    return {
      id: kid.id,
      x: Math.round(originX + pos.x),
      y: Math.round(originY + pos.y),
    };
  });
}
