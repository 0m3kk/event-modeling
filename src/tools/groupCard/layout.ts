import type { CanvasElement, Point, Rect } from "@/types";
import { findFreeSpot } from "@/utils/placement";
import { memoizeArray } from "@/utils/memo";

/**
 * Pure geometry + data helpers for the Group tool.
 *
 * A Group is a *light* container: a solid rounded frame with a name chip that
 * clusters related reusable cards — Objects, Enums, Aliases, Services or
 * States. It is deliberately narrower than a Domain (which holds anything) and
 * a Slice (which stacks typed lanes of behavior cards). A Group usually lives
 * inside a Domain, but it can also stand on its own.
 *
 * Membership is stored on the child as `groupId`. This module keeps the math
 * free of React / Pixi / store imports so the store, the renderer and the drag
 * interaction can all reuse it.
 */

export const GROUP_TYPE = "groupCard";
/** Gap between the frame and its children. */
export const GROUP_PADDING = 12;
/** Top band reserved for the group's name chip. */
export const GROUP_LABEL_HEIGHT = 26;
export const GROUP_DEFAULT_WIDTH = 240;
export const GROUP_DEFAULT_HEIGHT = 130;

export interface GroupData {
  name: string;
  color?: string;
  description?: string;
}

export type GroupElement = CanvasElement<GroupData>;

/**
 * Card types a Group may cluster. Definition cards (Object/Enum/Alias), Services
 * and States are the reusable building blocks that read best pulled together;
 * behavior cards (events, commands, …) belong to a Slice lane instead.
 *
 * A domain usually has one Group for its type definitions, one for its Services
 * and one wrapping its States.
 */
export const GROUP_ELIGIBLE_CHILD_TYPES: ReadonlySet<string> = new Set([
  "objectCard",
  "enumCard",
  "aliasCard",
  "serviceCard",
  "stateCard",
]);

/** Whether a card type is allowed inside a Group. */
export function isGroupEligibleChild(type: string): boolean {
  return GROUP_ELIGIBLE_CHILD_TYPES.has(type);
}

export function isGroupElement(element: CanvasElement | null | undefined): element is GroupElement {
  return Boolean(element && element.type === GROUP_TYPE);
}

/** Shared empty result so a missing container does not allocate each call. */
const EMPTY_CHILDREN: CanvasElement[] = [];

/**
 * Children grouped by `groupId`, built once per board version (see
 * {@link memoizeArray}) so rendering every Group is O(elements) rather than
 * O(groups × elements).
 */
const groupChildrenIndex = memoizeArray((elements: CanvasElement[]) => {
  const index = new Map<string, CanvasElement[]>();
  for (const el of elements) {
    if (!el.groupId) continue;
    const list = index.get(el.groupId);
    if (list) list.push(el);
    else index.set(el.groupId, [el]);
  }
  return index;
});

/** Direct children of a group. */
export function getGroupChildren(elements: CanvasElement[], groupId: string): CanvasElement[] {
  return groupChildrenIndex(elements).get(groupId) ?? EMPTY_CHILDREN;
}

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box that encloses every child, plus padding and a label band. */
export function computeGroupBounds(children: CanvasElement[]): GroupBounds | null {
  if (children.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }

  return {
    x: Math.round(minX - GROUP_PADDING),
    y: Math.round(minY - GROUP_PADDING - GROUP_LABEL_HEIGHT),
    width: Math.round(maxX - minX + GROUP_PADDING * 2),
    height: Math.round(maxY - minY + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT),
  };
}

/**
 * Reconciles groups with their children: detaches membership that points to a
 * missing group, nests an ineligible card, or clashes with slice membership,
 * then auto-fits every group to its children. Returns the same array reference
 * when nothing changed.
 *
 * Run this AFTER `reflowSlices` (a card in a lane leaves its group) and BEFORE
 * `reflowDomains` (a Domain must see the Group's final size).
 */
export function reflowGroups(elements: CanvasElement[]): CanvasElement[] {
  const groupById = new Map<string, GroupElement>();
  for (const el of elements) {
    if (el.type === GROUP_TYPE) groupById.set(el.id, el as GroupElement);
  }

  // 1. Drop invalid membership. Slice-lane membership wins (lane and group are
  //    mutually exclusive), and only eligible card types may stay.
  let changed = false;
  const normalized = elements.map((el) => {
    if (!el.groupId) return el;
    const group = groupById.get(el.groupId);
    const valid =
      Boolean(group) &&
      el.id !== el.groupId &&
      isGroupEligibleChild(el.type) &&
      !el.sliceId;
    if (valid) return el;
    changed = true;
    const { groupId: _groupId, ...rest } = el;
    return rest as CanvasElement;
  });

  if (groupById.size === 0) {
    return changed ? normalized : elements;
  }

  // 2. Fit each group to its children.
  const patches = new Map<string, Partial<CanvasElement>>();
  for (const group of groupById.values()) {
    const kids = getGroupChildren(normalized, group.id);
    const bounds = computeGroupBounds(kids);
    if (!bounds) continue;
    if (
      group.x !== bounds.x ||
      group.y !== bounds.y ||
      group.width !== bounds.width ||
      group.height !== bounds.height
    ) {
      patches.set(group.id, bounds);
    }
  }

  if (!changed && patches.size === 0) return elements;

  return normalized.map((el) => {
    const patch = patches.get(el.id);
    return patch ? { ...el, ...patch } : el;
  });
}

export interface GroupDropTarget {
  groupId: string;
  rect: Rect;
}

/** Minimum spacing kept between cards auto-placed in a group. */
export const GROUP_CHILD_GAP = 16;

interface SizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Picks a spot for a card entering a group. Delegates to the shared
 * {@link findFreeSpot} so groups and AI spawns place cards the same way: the
 * dropped position is used when free, otherwise the nearest free slot beside
 * the existing children is chosen (the frame then grows to fit).
 */
export function findGroupFreeSpot(
  children: CanvasElement[],
  dropped: SizedRect,
  gap = GROUP_CHILD_GAP,
): Point {
  return findFreeSpot(children, dropped, gap);
}

/** Finds the top-most group frame under a world point during a drag. */
export function findGroupDropTarget(
  elements: CanvasElement[],
  worldPoint: Point,
  draggedId: string,
  draggedType: string,
): GroupDropTarget | null {
  if (!isGroupEligibleChild(draggedType)) return null;

  let best: GroupElement | null = null;
  for (const element of elements) {
    if (element.type !== GROUP_TYPE || element.id === draggedId) continue;
    const inside =
      worldPoint.x >= element.x &&
      worldPoint.x <= element.x + element.width &&
      worldPoint.y >= element.y &&
      worldPoint.y <= element.y + element.height;
    if (inside) best = element as GroupElement;
  }

  if (!best) return null;
  return {
    groupId: best.id,
    rect: { x: best.x, y: best.y, width: best.width, height: best.height },
  };
}
