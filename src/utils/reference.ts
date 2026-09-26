import { nanoid } from "nanoid";
import type { CanvasObject, ModelData, StormData } from "@/types";

// ============================================================================
// Reference Copies (Linked Duplicates)
// ============================================================================
//
// Objects that share a `referenceId` form a reference set. They are NOT
// independent entities: content, style, and size stay in sync across the set.
// Editing any member pulls its synced fields onto every other member.
//
// Deliberately NOT synced (each copy stays independent):
//   - Position (x/y) — copies can be placed freely
//   - Lock state and group membership (groupId)
//
// Precedent: `referenceId` is symmetric (shared by every member), so nothing
// breaks when a member is deleted — no back-reference cleanup is needed.
//
// The same pattern exists in the main event-whiteboard app
// (src/utils/reference.ts); this is the storm-app port scoped to the object
// types the board actually uses.

/**
 * Fields that stay in sync across a reference set (content + style + size).
 */
const SYNCED_REFERENCE_FIELDS = [
  "width",
  "height",
  "text",
  "fill",
  "stroke",
  "stormData",
  "modelData",
] as const satisfies readonly (keyof CanvasObject)[];

const syncableFields = new Set<keyof CanvasObject>(SYNCED_REFERENCE_FIELDS);

/**
 * True when a patch touches at least one synced field. Geometry-only batches
 * (drag/align/distribute) return false so they skip reference propagation.
 */
export function touchesSyncedReferenceField(
  patch: Partial<CanvasObject>,
): boolean {
  for (const field of syncableFields) {
    if (patch[field] !== undefined) return true;
  }
  return false;
}

/** Offset applied when creating a reference copy (like paste placement). */
export const REFERENCE_COPY_OFFSET = 32;

/**
 * Deep clone for synced values. Synced siblings must never share nested object
 * references — some code paths may mutate in place, and a shared reference
 * would silently corrupt every member of the set.
 */
function cloneModelData(data: ModelData): ModelData {
  return {
    ...data,
    ...(data.fields ? { fields: data.fields.map((f) => ({ ...f })) } : {}),
    ...(data.values ? { values: data.values.map((v) => ({ ...v })) } : {}),
  };
}

function cloneStormData(data: StormData): StormData {
  return {
    ...data,
    fields: data.fields.map((f) => ({ ...f })),
    responseFields: data.responseFields?.map((f) => ({ ...f })),
    queryItems: data.queryItems?.map((item) => ({
      ...item,
      types: [...item.types],
      tagFieldIds: [...item.tagFieldIds],
    })),
    constraints: data.constraints?.map((c) => ({ ...c })),
    permissions: data.permissions ? [...data.permissions] : undefined,
  };
}

const deepClone = <T>(value: T): T =>
  value === null || typeof value !== "object"
    ? value
    : (JSON.parse(JSON.stringify(value)) as T);

const cloneSyncedValue = (
  field: keyof CanvasObject,
  value: unknown,
): unknown => {
  if (field === "modelData") return cloneModelData(value as ModelData);
  if (field === "stormData") return cloneStormData(value as StormData);
  if (value !== null && typeof value === "object") return deepClone(value);
  return value;
};

/**
 * Propagate synced fields from the changed object to every other member of
 * its reference set.
 *
 * "Pull from source" model: the most recently edited member is the source of
 * truth; its synced fields are copied onto all peers. Returns a new objects
 * array, or null when nothing changed (so callers can avoid no-op state
 * updates that would pollute undo history).
 *
 * Pure function — safe to call from any slice's set() reducer.
 */
export function syncReferenceSet(
  objects: CanvasObject[],
  changedId: string,
): CanvasObject[] | null {
  const source = objects.find((o) => o.id === changedId);
  if (!source?.referenceId) return null;

  let changed = false;
  const next = objects.map((obj) => {
    if (obj.id === source.id || obj.referenceId !== source.referenceId) {
      return obj;
    }

    let touched = false;
    const merged: Record<string, unknown> = {};
    for (const field of syncableFields) {
      const value = source[field];
      // Only propagate fields the source actually has. Absent means the
      // source type doesn't use it (e.g. stormData on a text box).
      if (value === undefined) continue;
      const current = obj[field];
      if (current === value) continue;
      if (
        current !== undefined &&
        value !== null &&
        typeof value === "object" &&
        JSON.stringify(current) === JSON.stringify(value)
      ) {
        continue;
      }
      merged[field] = cloneSyncedValue(field, value);
      touched = true;
    }

    if (!touched) return obj;
    changed = true;
    return { ...obj, ...merged };
  });

  return changed ? next : null;
}

/** Generate a new shared reference-set id (`ref-` prefix eases debugging) */
export function generateReferenceId(): string {
  return `ref-${nanoid()}`;
}

/**
 * Build a reference copy of an object: new id, same content, joins the
 * source's reference set (assigning one if the source isn't linked yet —
 * the caller is responsible for also persisting that referenceId on the
 * source object).
 */
export function buildReferenceCopy(source: CanvasObject): CanvasObject {
  const copy: CanvasObject = {
    ...source,
    id: nanoid(),
    x: source.x + REFERENCE_COPY_OFFSET,
    y: source.y + REFERENCE_COPY_OFFSET,
    referenceId: source.referenceId ?? generateReferenceId(),
    // Per-instance state starts fresh
    locked: false,
  };
  // Never share nested mutable data with the source
  if (copy.stormData) copy.stormData = cloneStormData(copy.stormData);
  if (copy.modelData) copy.modelData = cloneModelData(copy.modelData);
  return copy;
}

/**
 * Drop a `referenceId` that no longer links anything — after a member is
 * deleted, a lone survivor should stop showing the linked badge. Pure; returns
 * the same array when nothing changed.
 */
export function pruneDanglingReferences(
  objects: CanvasObject[],
): CanvasObject[] {
  const counts = new Map<string, number>();
  for (const obj of objects) {
    if (obj.referenceId) {
      counts.set(obj.referenceId, (counts.get(obj.referenceId) ?? 0) + 1);
    }
  }

  let changed = false;
  const next = objects.map((obj) => {
    if (!obj.referenceId || (counts.get(obj.referenceId) ?? 0) > 1) return obj;
    changed = true;
    const unlinked = { ...obj };
    delete unlinked.referenceId;
    return unlinked;
  });

  return changed ? next : objects;
}
