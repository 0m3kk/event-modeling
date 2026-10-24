import { nanoid } from "nanoid";
import type { CanvasElement } from "@/types";

export interface ReferenceCopyResult {
  sourcePatch: { id: string; referenceId: string; isOriginal?: boolean };
  copy: CanvasElement;
}

/**
 * Creates a linked reference copy of a source element.
 * If source has no referenceId, generates a new one.
 * The source is marked as Original (isOriginal: true),
 * and the copy is marked as Copy (isOriginal: false).
 * The copy shares the referenceId, domain data, and dimensions,
 * but has a new id and offset canvas coordinates (x+30, y+30).
 */
export function createReferenceCopy(source: CanvasElement): ReferenceCopyResult {
  const refId = source.referenceId || `ref-${nanoid(8)}`;
  const copy: CanvasElement = {
    ...source,
    id: `${source.type}-${nanoid(6)}`,
    referenceId: refId,
    isOriginal: false,
    x: source.x + 30,
    y: source.y + 30,
    data: JSON.parse(JSON.stringify(source.data)),
  };

  return {
    sourcePatch: { id: source.id, referenceId: refId, isOriginal: true },
    copy,
  };
}

/**
 * Synchronizes domain properties (data, width, height) across all elements
 * sharing the same referenceId.
 */
export function syncReferenceUpdates(
  elements: CanvasElement[],
  updatedId: string,
  patch: Partial<CanvasElement>,
): CanvasElement[] {
  const target = elements.find((el) => el.id === updatedId);
  if (!target || !target.referenceId) {
    return elements.map((el) => (el.id === updatedId ? { ...el, ...patch } : el));
  }

  const refId = target.referenceId;
  const syncData = patch.data !== undefined;
  const syncWidth = patch.width !== undefined;
  const syncHeight = patch.height !== undefined;

  // If nothing to sync across references, just update target
  if (!syncData && !syncWidth && !syncHeight) {
    return elements.map((el) => (el.id === updatedId ? { ...el, ...patch } : el));
  }

  return elements.map((el) => {
    if (el.id === updatedId) {
      return { ...el, ...patch };
    }
    if (el.referenceId === refId) {
      return {
        ...el,
        ...(syncData ? { data: JSON.parse(JSON.stringify(patch.data)) } : {}),
        ...(syncWidth ? { width: patch.width } : {}),
        ...(syncHeight ? { height: patch.height } : {}),
      };
    }
    return el;
  });
}

/**
 * Synchronizes batch updates across elements sharing referenceIds.
 */
export function syncBatchReferenceUpdates(
  elements: CanvasElement[],
  patches: Array<{ id: string } & Partial<CanvasElement>>,
): CanvasElement[] {
  const patchMap = new Map(patches.map((p) => [p.id, p]));

  // Map referenceId -> synced properties
  const refSyncMap = new Map<string, { data?: any; width?: number; height?: number }>();
  for (const patch of patches) {
    const el = elements.find((item) => item.id === patch.id);
    if (el?.referenceId) {
      const existing = refSyncMap.get(el.referenceId) || {};
      if (patch.data !== undefined) existing.data = JSON.parse(JSON.stringify(patch.data));
      if (patch.width !== undefined) existing.width = patch.width;
      if (patch.height !== undefined) existing.height = patch.height;
      refSyncMap.set(el.referenceId, existing);
    }
  }

  return elements.map((el) => {
    const patch = patchMap.get(el.id);
    if (patch) {
      return { ...el, ...patch };
    }
    if (el.referenceId && refSyncMap.has(el.referenceId)) {
      const synced = refSyncMap.get(el.referenceId)!;
      return {
        ...el,
        ...(synced.data !== undefined ? { data: JSON.parse(JSON.stringify(synced.data)) } : {}),
        ...(synced.width !== undefined ? { width: synced.width } : {}),
        ...(synced.height !== undefined ? { height: synced.height } : {}),
      };
    }
    return el;
  });
}

/**
 * Removes dangling referenceIds if fewer than 2 elements share that referenceId.
 * Cleans up referenceId and isOriginal if orphaned.
 * If the original member was deleted, promotes the first remaining member to isOriginal: true.
 */
export function pruneDanglingReferences(elements: CanvasElement[]): CanvasElement[] {
  const counts = new Map<string, number>();
  for (const el of elements) {
    if (el.referenceId) {
      counts.set(el.referenceId, (counts.get(el.referenceId) || 0) + 1);
    }
  }

  // Check if an original exists in groups with >= 2 members
  const hasOriginal = new Set<string>();
  for (const el of elements) {
    if (el.referenceId && (counts.get(el.referenceId) || 0) > 1 && el.isOriginal) {
      hasOriginal.add(el.referenceId);
    }
  }

  const firstMemberPromoted = new Set<string>();
  let changed = false;

  const result = elements.map((el) => {
    if (el.referenceId && (counts.get(el.referenceId) || 0) <= 1) {
      changed = true;
      const { referenceId: _, isOriginal: __, ...rest } = el;
      return rest as CanvasElement;
    }
    // If original was deleted, promote first remaining member
    if (
      el.referenceId &&
      !hasOriginal.has(el.referenceId) &&
      !firstMemberPromoted.has(el.referenceId)
    ) {
      firstMemberPromoted.add(el.referenceId);
      changed = true;
      return { ...el, isOriginal: true };
    }
    return el;
  });

  return changed ? result : elements;
}

/**
 * Checks whether an element is the Original (Master) in a reference set.
 */
export function isElementOriginal(
  element: CanvasElement,
  allElements?: CanvasElement[],
): boolean {
  if (!element.referenceId) return false;
  if (element.isOriginal !== undefined) return element.isOriginal;
  if (allElements) {
    const first = allElements.find((el) => el.referenceId === element.referenceId);
    return first?.id === element.id;
  }
  return false;
}
