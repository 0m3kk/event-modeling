import type { CanvasElement, Point, Rect } from "@/types";
import { findFreeSpot } from "@/utils/placement";

/**
 * Pure geometry + data helpers for the Domain tool.
 *
 * A Domain is the loosest container: a dashed frame that can hold any card
 * (commands, queries, events, objects, even Slices). It has a name and
 * auto-fits a dashed rectangle around its direct children. Unlike a Slice it
 * has no lanes and imposes no type rules.
 *
 * Membership is stored on the child as `domainId`. This module keeps the math
 * free of React / Pixi / store imports so the store, renderer and drag
 * interaction can all reuse it.
 */

export const DOMAIN_TYPE = "domainCard";
/** Gap between the frame and its children. */
export const DOMAIN_PADDING = 14;
/** Top band reserved for the domain name. */
export const DOMAIN_LABEL_HEIGHT = 24;
export const DOMAIN_DEFAULT_WIDTH = 260;
export const DOMAIN_DEFAULT_HEIGHT = 160;

export interface DomainData {
  name: string;
  color?: string;
}

export type DomainElement = CanvasElement<DomainData>;

export function isDomainElement(element: CanvasElement | null | undefined): element is DomainElement {
  return Boolean(element && element.type === DOMAIN_TYPE);
}

/** Direct children of a domain (any card type). */
export function getDomainChildren(elements: CanvasElement[], domainId: string): CanvasElement[] {
  return elements.filter((el) => el.domainId === domainId);
}

/** Domains cannot hold another domain (no nesting). */
export function isNestableInDomain(type: string): boolean {
  return type !== DOMAIN_TYPE;
}

export interface DomainBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box that encloses every child, plus padding and a label band. */
export function computeDomainBounds(children: CanvasElement[]): DomainBounds | null {
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
    x: Math.round(minX - DOMAIN_PADDING),
    y: Math.round(minY - DOMAIN_PADDING - DOMAIN_LABEL_HEIGHT),
    width: Math.round(maxX - minX + DOMAIN_PADDING * 2),
    height: Math.round(maxY - minY + DOMAIN_PADDING * 2 + DOMAIN_LABEL_HEIGHT),
  };
}

/**
 * Reconciles domains with their children: drops invalid membership, then
 * auto-fits every domain to its (post-slice) children. Returns the same array
 * reference when nothing changed.
 *
 * Run this AFTER `reflowSlices` so a domain that wraps a Slice sees the
 * Slice's final size.
 */
export function reflowDomains(elements: CanvasElement[]): CanvasElement[] {
  const domainById = new Map<string, DomainElement>();
  for (const el of elements) {
    if (el.type === DOMAIN_TYPE) domainById.set(el.id, el as DomainElement);
  }

  // 1. Drop membership that points nowhere, nests a domain, or clashes with a
  //    slice lane or a group (lane/group membership and direct domain
  //    membership are exclusive — a group child sits in the domain via its
  //    group frame).
  let changed = false;
  const normalized = elements.map((el) => {
    if (!el.domainId) return el;
    const domain = domainById.get(el.domainId);
    const valid =
      Boolean(domain) &&
      el.id !== el.domainId &&
      isNestableInDomain(el.type) &&
      !el.sliceId &&
      !el.groupId;
    if (valid) return el;
    changed = true;
    const { domainId: _domainId, ...rest } = el;
    return rest as CanvasElement;
  });

  if (domainById.size === 0) {
    return changed ? normalized : elements;
  }

  // 2. Fit each domain to its children.
  const patches = new Map<string, Partial<CanvasElement>>();
  for (const domain of domainById.values()) {
    const kids = normalized.filter((el) => el.domainId === domain.id);
    const bounds = computeDomainBounds(kids);
    if (!bounds) continue;
    if (
      domain.x !== bounds.x ||
      domain.y !== bounds.y ||
      domain.width !== bounds.width ||
      domain.height !== bounds.height
    ) {
      patches.set(domain.id, bounds);
    }
  }

  if (!changed && patches.size === 0) return elements;

  return normalized.map((el) => {
    const patch = patches.get(el.id);
    return patch ? { ...el, ...patch } : el;
  });
}

export interface DomainDropTarget {
  domainId: string;
  rect: Rect;
}

/** Minimum spacing kept between cards auto-placed in a domain. */
export const DOMAIN_CHILD_GAP = 16;

interface SizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Picks a spot for a card entering a domain. Delegates to the shared
 * {@link findFreeSpot} so domains and AI spawns place cards the same way: the
 * dropped position is used when free, otherwise the nearest free slot beside
 * the existing children is chosen (the domain frame then grows to fit).
 */
export function findDomainFreeSpot(
  children: CanvasElement[],
  dropped: SizedRect,
  gap = DOMAIN_CHILD_GAP,
): Point {
  return findFreeSpot(children, dropped, gap);
}

/** Finds the top-most domain frame under a world point during a drag. */
export function findDomainDropTarget(
  elements: CanvasElement[],
  worldPoint: Point,
  draggedId: string,
  draggedType: string,
): DomainDropTarget | null {
  if (!isNestableInDomain(draggedType)) return null;

  let best: DomainElement | null = null;
  for (const element of elements) {
    if (element.type !== DOMAIN_TYPE || element.id === draggedId) continue;
    const inside =
      worldPoint.x >= element.x &&
      worldPoint.x <= element.x + element.width &&
      worldPoint.y >= element.y &&
      worldPoint.y <= element.y + element.height;
    if (inside) best = element as DomainElement;
  }

  if (!best) return null;
  return {
    domainId: best.id,
    rect: { x: best.x, y: best.y, width: best.width, height: best.height },
  };
}
