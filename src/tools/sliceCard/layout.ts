import { nanoid } from "nanoid";
import type { CanvasElement, Point, Rect } from "@/types";

/**
 * Pure geometry + data helpers for the Slice tool.
 *
 * A Slice is a container element that groups *real* canvas cards into stacked
 * horizontal lanes. Each lane holds cards of a single tool type (the type is
 * inferred from the first card dropped in). Cards stay independent elements on
 * the board: they carry `sliceId` + `laneId`, and this module computes where
 * they sit inside the slice so the store can keep everything laid out.
 *
 * Keeping the math here (free of React / Pixi / store imports) lets the store,
 * the Pixi renderer and the drag interaction all reuse it without cycles.
 */

export const SLICE_TYPE = "sliceCard";

/** Height of the slice's colored header banner. */
export const SLICE_HEADER_HEIGHT = 34;
/** Height of a lane's small type label band. */
export const SLICE_LANE_LABEL_HEIGHT = 20;
/** Padding between a lane's edges and its cards. */
export const SLICE_LANE_PADDING = 12;
/** Horizontal gap between cards in the same lane. */
export const SLICE_CHILD_GAP = 12;
/** Minimum height reserved for a lane's card row. */
export const SLICE_LANE_MIN_CONTENT_HEIGHT = 64;
/** Default / minimum slice width. */
export const SLICE_DEFAULT_WIDTH = 320;

/** A lane inside a slice. Optionally reserved for one card type. */
export interface SliceLane {
  id: string;
  /**
   * Tool type this lane is reserved for. Set by AI/spec-created lanes and
   * enforced on drop; manual lanes leave it unset and adopt the first card
   * dropped in (and revert to "any" once emptied).
   */
  childType?: string | null;
}

export interface SliceData {
  name: string;
  color?: string;
  description?: string;
  lanes: SliceLane[];
}

export type SliceElement = CanvasElement<SliceData>;

export function createSliceLane(childType?: string | null): SliceLane {
  const lane: SliceLane = { id: `lane-${nanoid(6)}` };
  if (childType) lane.childType = childType;
  return lane;
}

/**
 * The type a lane currently accepts. A reserved lane (`childType`) always wins;
 * otherwise the lane adopts the type of its left-most card, or null when empty
 * (meaning it accepts anything).
 */
export function laneEffectiveType(lane: SliceLane, children: CanvasElement[]): string | null {
  if (lane.childType) return lane.childType;
  return children[0]?.type ?? null;
}

/**
 * Card types that cannot live inside a slice lane. Type-definition cards
 * (Enum/Object/Alias) describe reusable shapes rather than behavior, so they
 * stay outside slices.
 */
export const SLICE_EXCLUDED_CHILD_TYPES: ReadonlySet<string> = new Set([
  "enumCard",
  "objectCard",
  "aliasCard",
]);

/** Whether a card type is allowed to be dropped into a slice lane. */
export function isSliceEligibleChild(type: string): boolean {
  if (type === SLICE_TYPE) return false;
  return !SLICE_EXCLUDED_CHILD_TYPES.has(type);
}

export function isSliceElement(element: CanvasElement | null | undefined): element is SliceElement {
  return Boolean(element && element.type === SLICE_TYPE);
}

/** Every child element currently assigned to a slice. */
export function getSliceChildren(elements: CanvasElement[], sliceId: string): CanvasElement[] {
  return elements.filter((el) => el.sliceId === sliceId);
}

/** Children of one lane, ordered left-to-right. */
export function getLaneChildren(
  elements: CanvasElement[],
  sliceId: string,
  laneId: string,
): CanvasElement[] {
  return elements
    .filter((el) => el.sliceId === sliceId && el.laneId === laneId)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

export interface SliceLaneLayout {
  laneId: string;
  laneIndex: number;
  /** Top of the lane band, relative to the slice origin. */
  top: number;
  /** Full height of the lane band (label + padding + card row). */
  height: number;
  /** Top of the card row, relative to the slice origin. */
  contentTop: number;
  /** Height of the card row (at least `SLICE_LANE_MIN_CONTENT_HEIGHT`). */
  contentHeight: number;
  /** Total width of this lane's cards (gaps included). */
  contentWidth: number;
  /** Tool type of this lane's cards, or null while the lane is empty. */
  childType: string | null;
  /** Cards in this lane, left-to-right. */
  children: CanvasElement[];
}

export interface SliceLayout {
  width: number;
  height: number;
  lanes: SliceLaneLayout[];
  /** World-space top-left for each child, keyed by element id. */
  placements: Map<string, Point>;
}

/**
 * Lays out a slice's lanes and cards. `children` may include only the cards
 * that legitimately belong to this slice; anything not matching a lane is
 * ignored.
 */
export function computeSliceLayout(
  slice: SliceElement,
  children: CanvasElement[],
): SliceLayout {
  const lanes = slice.data?.lanes ?? [];

  if (lanes.length === 0) {
    return {
      width: SLICE_DEFAULT_WIDTH,
      height:
        SLICE_HEADER_HEIGHT + SLICE_LANE_LABEL_HEIGHT + SLICE_LANE_PADDING * 2 + SLICE_LANE_MIN_CONTENT_HEIGHT,
      lanes: [],
      placements: new Map(),
    };
  }

  const byLane = new Map<string, CanvasElement[]>();
  for (const lane of lanes) byLane.set(lane.id, []);
  for (const child of children) {
    const laneId = child.laneId;
    if (laneId && byLane.has(laneId)) byLane.get(laneId)!.push(child);
  }
  for (const kids of byLane.values()) {
    kids.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  // Floor the content width at the default so an empty slice keeps a stable size.
  let widestContent = 0;
  const laneLayouts: SliceLaneLayout[] = [];
  let y = SLICE_HEADER_HEIGHT;

  lanes.forEach((lane, laneIndex) => {
    const kids = byLane.get(lane.id) ?? [];

    let contentWidth = 0;
    let contentHeight = SLICE_LANE_MIN_CONTENT_HEIGHT;
    kids.forEach((kid, i) => {
      contentWidth += kid.width + (i > 0 ? SLICE_CHILD_GAP : 0);
      contentHeight = Math.max(contentHeight, kid.height);
    });

    const top = y;
    const height = SLICE_LANE_LABEL_HEIGHT + SLICE_LANE_PADDING * 2 + contentHeight;
    const contentTop = top + SLICE_LANE_LABEL_HEIGHT + SLICE_LANE_PADDING;

    laneLayouts.push({
      laneId: lane.id,
      laneIndex,
      top,
      height,
      contentTop,
      contentHeight,
      contentWidth,
      childType: laneEffectiveType(lane, kids),
      children: kids,
    });

    widestContent = Math.max(widestContent, contentWidth);
    y += height;
  });

  const width = Math.max(
    SLICE_DEFAULT_WIDTH,
    Math.round(SLICE_LANE_PADDING * 2 + widestContent),
  );

  // Center each lane's cards within the widest lane's content width, so narrower
  // lanes line up with the widest one.
  const placements = new Map<string, Point>();
  laneLayouts.forEach((lane) => {
    let x = slice.x + SLICE_LANE_PADDING + (widestContent - lane.contentWidth) / 2;
    for (const kid of lane.children) {
      placements.set(kid.id, {
        x: Math.round(x),
        y: Math.round(slice.y + lane.contentTop + (lane.contentHeight - kid.height) / 2),
      });
      x += kid.width + SLICE_CHILD_GAP;
    }
  });

  return {
    width,
    height: Math.round(y),
    lanes: laneLayouts,
    placements,
  };
}

/** Content-driven size for a slice (used by create/computeSize/a11y paths). */
export function computeSliceCardSize(
  data: SliceData,
  width = SLICE_DEFAULT_WIDTH,
): { width: number; height: number } {
  const slice: SliceElement = {
    id: "__slice_size__",
    type: SLICE_TYPE,
    x: 0,
    y: 0,
    width,
    height: 0,
    data,
  };
  const layout = computeSliceLayout(slice, []);
  return { width: layout.width, height: layout.height };
}

export interface SliceDropTarget {
  sliceId: string;
  laneId: string;
  laneIndex: number;
  /** Lane band in world coordinates, for the drag highlight. */
  rect: Rect;
  allowed: boolean;
  expectedType: string | null;
}

/**
 * Finds the slice lane under a world point while a single card is being
 * dragged. The dragged card is excluded from the layout so its lane does not
 * stretch toward the pointer. Returns null when the point is not over a lane.
 */
export function findSliceDropTarget(
  elements: CanvasElement[],
  worldPoint: Point,
  draggedId: string,
  draggedType: string,
): SliceDropTarget | null {
  if (!isSliceEligibleChild(draggedType)) return null;

  for (const element of elements) {
    if (element.type !== SLICE_TYPE) continue;
    const slice = element as SliceElement;

    if (
      worldPoint.x < slice.x ||
      worldPoint.x > slice.x + slice.width ||
      worldPoint.y < slice.y ||
      worldPoint.y > slice.y + slice.height
    ) {
      continue;
    }

    const kids = elements.filter((el) => el.sliceId === slice.id && el.id !== draggedId);
    const layout = computeSliceLayout(slice, kids);
    const localY = worldPoint.y - slice.y;

    for (const lane of layout.lanes) {
      if (localY >= lane.top && localY < lane.top + lane.height) {
        const expectedType = lane.childType;
        return {
          sliceId: slice.id,
          laneId: lane.laneId,
          laneIndex: lane.laneIndex,
          rect: {
            x: slice.x,
            y: slice.y + lane.top,
            width: slice.width,
            height: lane.height,
          },
          allowed: expectedType === null || expectedType === draggedType,
          expectedType,
        };
      }
    }
  }

  return null;
}

/** Local-point hit test for lane sub-selection (options bar target). */
export function hitSliceLane(
  slice: SliceElement,
  children: CanvasElement[],
  localPoint: Point,
): { laneId: string; laneIndex: number } | null {
  const layout = computeSliceLayout(slice, children);
  for (const lane of layout.lanes) {
    if (localPoint.y >= lane.top && localPoint.y < lane.top + lane.height) {
      return { laneId: lane.laneId, laneIndex: lane.laneIndex };
    }
  }
  return null;
}

/**
 * Order used for rendering and hit-testing: slices first, so their children
 * (rendered after) always sit on top of the slice background. Relative order of
 * everything else is preserved.
 */
export function orderForRender(elements: CanvasElement[]): CanvasElement[] {
  let hasSlice = false;
  for (const el of elements) {
    if (el.type === SLICE_TYPE) {
      hasSlice = true;
      break;
    }
  }
  if (!hasSlice) return elements;

  const slices: CanvasElement[] = [];
  const rest: CanvasElement[] = [];
  for (const el of elements) {
    (el.type === SLICE_TYPE ? slices : rest).push(el);
  }
  return [...slices, ...rest];
}

/** Repairs a slice's lane list (unique, well-formed ids, valid reserved types). */
export function normalizeSliceData(data: SliceData): SliceData {
  const lanes = Array.isArray(data.lanes) ? data.lanes : [];
  const seen = new Set<string>();
  const normalized: SliceLane[] = [];

  for (const lane of lanes) {
    if (!lane || typeof lane.id !== "string" || lane.id.length === 0 || seen.has(lane.id)) {
      continue;
    }
    seen.add(lane.id);
    const childType =
      typeof lane.childType === "string" && lane.childType.length > 0 ? lane.childType : undefined;
    normalized.push(childType ? { id: lane.id, childType } : { id: lane.id });
  }

  if (
    normalized.length === lanes.length &&
    normalized.every((lane, i) => {
      const original = lanes[i];
      return original && lane.id === original.id && (lane.childType ?? null) === (original.childType ?? null);
    })
  ) {
    return data;
  }
  return { ...data, lanes: normalized };
}

/**
 * Reconciles every slice with its children: detaches cards whose slice/lane no
 * longer exists (or whose type violates the lane's single-type rule), then
 * re-sizes slices and repositions cards. Returns the same array reference when
 * nothing changed so callers can skip redundant renders.
 */
export function reflowSlices(elements: CanvasElement[]): CanvasElement[] {
  const sliceById = new Map<string, SliceElement>();
  for (const el of elements) {
    if (el.type === SLICE_TYPE) sliceById.set(el.id, el as SliceElement);
  }

  // No slices: any lingering membership is dangling.
  if (sliceById.size === 0) {
    if (!elements.some((el) => el.sliceId || el.laneId)) return elements;
    return elements.map(detachFromSlice);
  }

  // Build the set of legitimately-contained cards. Each lane enforces a single
  // type: a reserved lane uses its `childType`, an untyped lane adopts the type
  // of its left-most card.
  const validChildren = new Map<string, CanvasElement[]>();
  const validIds = new Set<string>();

  for (const slice of sliceById.values()) {
    const sliceKids = elements.filter((el) => el.sliceId === slice.id);
    const kept: CanvasElement[] = [];

    for (const lane of slice.data.lanes ?? []) {
      const laneKids = sliceKids
        .filter((el) => el.laneId === lane.id)
        .sort((a, b) => a.x - b.x || a.y - b.y);
      const enforced = laneEffectiveType(lane, laneKids);

      for (const kid of laneKids) {
        if (!isSliceEligibleChild(kid.type)) continue;
        if (enforced !== null && kid.type !== enforced) continue;
        kept.push(kid);
        validIds.add(kid.id);
      }
    }

    validChildren.set(slice.id, kept);
  }

  let changed = false;
  const normalized = elements.map((el) => {
    if (!el.sliceId && !el.laneId) return el;
    if (validIds.has(el.id)) return el;
    changed = true;
    return detachFromSlice(el);
  });

  const patches = new Map<string, Partial<CanvasElement>>();

  for (const slice of sliceById.values()) {
    const kids = validChildren.get(slice.id) ?? [];
    const layout = computeSliceLayout(slice, kids);

    if (slice.width !== layout.width || slice.height !== layout.height) {
      patches.set(slice.id, { width: layout.width, height: layout.height });
    }

    for (const [childId, pos] of layout.placements) {
      const child = elements.find((el) => el.id === childId);
      if (child && (child.x !== pos.x || child.y !== pos.y)) {
        patches.set(childId, { x: pos.x, y: pos.y });
      }
    }
  }

  if (!changed && patches.size === 0) return elements;

  return normalized.map((el) => {
    const patch = patches.get(el.id);
    return patch ? { ...el, ...patch } : el;
  });
}

/** Strips slice membership from an element, preserving everything else. */
function detachFromSlice(element: CanvasElement): CanvasElement {
  if (!element.sliceId && !element.laneId) return element;
  const { sliceId: _sliceId, laneId: _laneId, ...rest } = element;
  return rest as CanvasElement;
}
