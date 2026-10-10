import type { CanvasObject, ModelData, StormData } from "@/types";

/**
 * Row reordering for field-bearing cards (pure calculations).
 *
 * Reorderable lists:
 * - model "object": modelData.fields
 * - model "enum": modelData.values
 * - storm (command/event/state/constraint/query): stormData.fields
 * - storm query/command: stormData.responseFields
 * - storm state/constraint: stormData.queryItems
 * - storm constraint: stormData.constraints
 *
 * Reordering never changes a card's height (row count is constant), so the
 * callers only swap the list — no geometry recompute needed.
 */

/** Direction a row moves within its list */
export type RowMoveDirection = "up" | "down";

/** Which list inside a ModelData a row id belongs to */
export type ModelRowList = "fields" | "values" | "methods";

/** Which list inside a StormData a row id belongs to */
export type StormRowList =
  | "fields"
  | "inputFields"
  | "outputFields"
  | "responseFields"
  | "queryItems"
  | "constraints"
  | "steps";

/**
 * Splices `fromIndex` to `toIndex` in a new array (input untouched).
 * Returns the input array unchanged for no-op or out-of-range moves.
 */
export function reorderItems<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex === toIndex) return items;
  if (fromIndex < 0 || toIndex < 0) return items;
  if (fromIndex >= items.length || toIndex >= items.length) return items;
  const next = [...items];
  const moved = next[fromIndex] as T;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Target index for a one-step move, or -1 when it would leave the list */
function stepIndex(
  fromIndex: number,
  length: number,
  direction: RowMoveDirection,
): number {
  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
  return toIndex >= 0 && toIndex < length ? toIndex : -1;
}

/**
 * Resolves which model list holds `rowId` (fields before values — ids never
 * overlap, so order is only a fallback). Null when the row is not in any
 * list (wrap/array type rows, stale selections).
 */
export function resolveModelRowList(
  data: ModelData,
  rowId: string,
): ModelRowList | null {
  if (
    data.kind === "object" &&
    (data.fields ?? []).some((f) => f.id === rowId)
  ) {
    return "fields";
  }
  if (data.kind === "enum" && (data.values ?? []).some((v) => v.id === rowId)) {
    return "values";
  }
  if (
    data.kind === "service" &&
    (data.methods ?? []).some((m) => m.id === rowId)
  ) {
    return "methods";
  }
  return null;
}

/**
 * Resolves which storm list holds `rowId`. Field lookup comes first (the
 * common case), then the State/Constraint Query Items, then the Constraint
 * free-text lines. Null when the id matches nothing (stale selection).
 */
export function resolveStormRowList(
  data: StormData,
  rowId: string,
): StormRowList | null {
  if (data.fields.some((f) => f.id === rowId)) return "fields";
  if ((data.inputFields ?? []).some((f) => f.id === rowId)) return "inputFields";
  if ((data.outputFields ?? []).some((f) => f.id === rowId))
    return "outputFields";
  if ((data.responseFields ?? []).some((f) => f.id === rowId))
    return "responseFields";
  if ((data.queryItems ?? []).some((i) => i.id === rowId)) return "queryItems";
  if ((data.constraints ?? []).some((c) => c.id === rowId))
    return "constraints";
  if ((data.steps ?? []).some((s) => s.id === rowId)) return "steps";
  return null;
}

/**
 * Moves a row inside a model card one position up/down. Returns the updated
 * CanvasObject (new modelData reference) or null when the move is impossible
 * (not a model, locked, unknown row, or already at the edge). The card height
 * is unchanged, so only the data moves.
 */
export function moveModelRowInObject(
  obj: CanvasObject,
  rowId: string,
  direction: RowMoveDirection,
): CanvasObject | null {
  if (obj.type !== "model" || !obj.modelData || obj.locked) return null;
  const data = obj.modelData;
  const list = resolveModelRowList(data, rowId);
  if (!list) return null;

  if (list === "fields") {
    const items = data.fields ?? [];
    const fromIndex = items.findIndex((f) => f.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      modelData: { ...data, fields: reorderItems(items, fromIndex, toIndex) },
    };
  }
  if (list === "values") {
    const items = data.values ?? [];
    const fromIndex = items.findIndex((v) => v.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      modelData: { ...data, values: reorderItems(items, fromIndex, toIndex) },
    };
  }
  // methods
  const items = data.methods ?? [];
  const fromIndex = items.findIndex((m) => m.id === rowId);
  const toIndex = stepIndex(fromIndex, items.length, direction);
  if (toIndex === -1) return null;
  return {
    ...obj,
    modelData: { ...data, methods: reorderItems(items, fromIndex, toIndex) },
  };
}

/**
 * Moves a row inside a storm card one position up/down (field, query item or
 * constraint line). Returns the updated CanvasObject or null when the move is
 * impossible (not a storm, locked, unknown row, or already at the edge).
 */
export function moveStormRowInObject(
  obj: CanvasObject,
  rowId: string,
  direction: RowMoveDirection,
): CanvasObject | null {
  if (obj.type !== "storm" || !obj.stormData || obj.locked) return null;
  const data = obj.stormData;
  const list = resolveStormRowList(data, rowId);
  if (!list) return null;

  if (list === "fields") {
    const fromIndex = data.fields.findIndex((f) => f.id === rowId);
    const toIndex = stepIndex(fromIndex, data.fields.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      stormData: {
        ...data,
        fields: reorderItems(data.fields, fromIndex, toIndex),
      },
    };
  }
  if (list === "inputFields") {
    const items = data.inputFields ?? [];
    const fromIndex = items.findIndex((f) => f.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      stormData: {
        ...data,
        inputFields: reorderItems(items, fromIndex, toIndex),
      },
    };
  }
  if (list === "outputFields") {
    const items = data.outputFields ?? [];
    const fromIndex = items.findIndex((f) => f.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      stormData: {
        ...data,
        outputFields: reorderItems(items, fromIndex, toIndex),
      },
    };
  }
  if (list === "responseFields") {
    const items = data.responseFields ?? [];
    const fromIndex = items.findIndex((f) => f.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      stormData: {
        ...data,
        responseFields: reorderItems(items, fromIndex, toIndex),
      },
    };
  }
  if (list === "queryItems") {
    const items = data.queryItems ?? [];
    const fromIndex = items.findIndex((i) => i.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      stormData: {
        ...data,
        queryItems: reorderItems(items, fromIndex, toIndex),
      },
    };
  }
  if (list === "steps") {
    const items = data.steps ?? [];
    const fromIndex = items.findIndex((s) => s.id === rowId);
    const toIndex = stepIndex(fromIndex, items.length, direction);
    if (toIndex === -1) return null;
    return {
      ...obj,
      stormData: {
        ...data,
        steps: reorderItems(items, fromIndex, toIndex),
      },
    };
  }
  // constraint lines
  const items = data.constraints ?? [];
  const fromIndex = items.findIndex((c) => c.id === rowId);
  const toIndex = stepIndex(fromIndex, items.length, direction);
  if (toIndex === -1) return null;
  return {
    ...obj,
    stormData: {
      ...data,
      constraints: reorderItems(items, fromIndex, toIndex),
    },
  };
}
