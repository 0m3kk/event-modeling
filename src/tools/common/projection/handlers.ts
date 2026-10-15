/**
 * Interaction handlers for the projection cards (State / View): sub-selection,
 * row deletion, field type/array/required toggles, section metadata and the
 * inline text editors. Pure functions wired into a {@link ToolDefinition} by
 * `createProjectionCardTool`.
 */
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { isSameIdentifier, toDisplayName } from "@/utils/naming";
import {
  PROJECTION_HEADER_HEIGHT,
  PROJECTION_ROW_HEIGHT,
  computeProjectionCardSize,
  computeProjectionLayout,
  getProjectionItems,
  getProjectionParams,
  getProjectionStates,
  queryItemHeight,
} from "./metrics";
import type { ProjectionCardData, ProjectionField } from "./types";

/** Maps a vertical position inside a fixed-height section to a field index, or null. */
function rowIndexAt(localY: number, startY: number, count: number): number | null {
  if (localY < startY) return null;
  const index = Math.floor((localY - startY) / PROJECTION_ROW_HEIGHT);
  if (index < 0 || index >= count) return null;
  return index;
}

export function projectionSubSelect(
  element: CanvasElement<ProjectionCardData>,
  localPoint: Point,
): SelectedField | null {
  const {
    params,
    items,
    states,
    paramsCount,
    queryOffsets,
    queryItemsHeight,
    statesCount,
    paramStartY,
    queryStartY,
    stateStartY,
  } = computeProjectionLayout(element.data);

  const paramEndY = paramStartY + paramsCount * PROJECTION_ROW_HEIGHT;
  if (localPoint.y >= paramStartY && localPoint.y < paramEndY) {
    if (params.length === 0) return null;
    const index = rowIndexAt(localPoint.y, paramStartY, params.length);
    return index === null
      ? null
      : { elementId: element.id, sectionIndex: 0, sectionId: "params", fieldIndex: index };
  }

  const queryEndY = queryStartY + queryItemsHeight;
  if (localPoint.y >= queryStartY && localPoint.y < queryEndY) {
    if (items.length === 0) return null;
    const local = localPoint.y - queryStartY;
    for (let i = 0; i < items.length; i++) {
      const start = queryOffsets[i];
      const end = start + queryItemHeight(items[i]);
      if (local >= start && local < end) {
        return { elementId: element.id, sectionIndex: 1, sectionId: "query", fieldIndex: i };
      }
    }
    return null;
  }

  const stateEndY = stateStartY + statesCount * PROJECTION_ROW_HEIGHT;
  if (localPoint.y >= stateStartY && localPoint.y < stateEndY) {
    if (states.length === 0) return null;
    const index = rowIndexAt(localPoint.y, stateStartY, states.length);
    return index === null
      ? null
      : { elementId: element.id, sectionIndex: 2, sectionId: "states", fieldIndex: index };
  }

  return null;
}

export function projectionDeleteRow(
  element: CanvasElement<ProjectionCardData>,
  fieldIndex: number,
  sectionIndex = 0,
): Partial<CanvasElement<ProjectionCardData>> | null {
  const params = getProjectionParams(element.data);
  const items = getProjectionItems(element.data);
  const states = getProjectionStates(element.data);

  let nextParams = [...params];
  let nextItems = [...items];
  let nextStates = [...states];

  if (sectionIndex === 2) {
    if (fieldIndex < 0 || fieldIndex >= states.length) return null;
    nextStates = states.filter((_, i) => i !== fieldIndex);
  } else if (sectionIndex === 1) {
    if (fieldIndex < 0 || fieldIndex >= items.length) return null;
    nextItems = items.filter((_, i) => i !== fieldIndex);
  } else {
    if (fieldIndex < 0 || fieldIndex >= params.length) return null;
    nextParams = params.filter((_, i) => i !== fieldIndex);
  }

  const nextData: ProjectionCardData = {
    ...element.data,
    params: nextParams,
    queryItems: nextItems,
    states: nextStates,
  };
  const nextSize = computeProjectionCardSize(nextData, element.width);
  return { width: nextSize.width, height: nextSize.height, data: nextData };
}

/** Replaces the `type` of one params/states field. Section 1 (query) is not editable. */
export function projectionUpdateType(
  element: CanvasElement<ProjectionCardData>,
  field: SelectedField,
  type: string,
): Partial<CanvasElement<ProjectionCardData>> | null {
  const trimmed = type.trim();
  if (!trimmed) return null;

  const section = field.sectionIndex;
  const list =
    section === 0
      ? getProjectionParams(element.data)
      : section === 2
        ? getProjectionStates(element.data)
        : null;
  if (!list) return null;
  if (field.fieldIndex < 0 || field.fieldIndex >= list.length) return null;

  const next = [...list];
  next[field.fieldIndex] = { ...list[field.fieldIndex], type: trimmed };
  return { data: section === 0 ? { ...element.data, params: next } : { ...element.data, states: next } };
}

/** Toggles the array/required flag of one params/states field. Section 1 (query) is not editable. */
export function projectionToggleFlag(
  element: CanvasElement<ProjectionCardData>,
  field: SelectedField,
  flag: "isArray" | "isRequired",
): Partial<CanvasElement<ProjectionCardData>> | null {
  const section = field.sectionIndex;
  const list =
    section === 0
      ? getProjectionParams(element.data)
      : section === 2
        ? getProjectionStates(element.data)
        : null;
  if (!list) return null;
  if (field.fieldIndex < 0 || field.fieldIndex >= list.length) return null;

  const current = list[field.fieldIndex];
  const toggled =
    flag === "isArray"
      ? { ...current, isArray: !current.isArray }
      : { ...current, isRequired: !current.isRequired };
  const next = [...list];
  next[field.fieldIndex] = toggled;
  return { data: section === 0 ? { ...element.data, params: next } : { ...element.data, states: next } };
}

/** Labels a query item by its event types (it has no name/type of its own). */
export function projectionSelectedFieldItem(
  element: CanvasElement<ProjectionCardData>,
  field: SelectedField,
): { name: string; type: string } | ProjectionField | null {
  if (field.sectionIndex === 1) {
    const item = getProjectionItems(element.data)[field.fieldIndex];
    if (!item) return null;
    // Query items are not name/type fields; label them by their event types and
    // let the options bar use the dedicated types/tags popovers instead.
    const label = item.types.length > 0 ? item.types.join(" | ") : "Query item";
    return { name: label, type: "" };
  }
  const list = field.sectionIndex === 2 ? getProjectionStates(element.data) : getProjectionParams(element.data);
  return list[field.fieldIndex] ?? null;
}

export function projectionSections(element: CanvasElement<ProjectionCardData>) {
  return [
    { id: "params", name: "params", count: getProjectionParams(element.data).length },
    { id: "query", name: "query", count: getProjectionItems(element.data).length },
    { id: "states", name: "states", count: getProjectionStates(element.data).length },
  ];
}

export function projectionInlineEdit(
  element: CanvasElement<ProjectionCardData>,
  localPoint: Point,
  fallbackTitle: string,
): InlineEditState | null {
  // 1. Header -> edit the card name.
  if (localPoint.y <= PROJECTION_HEADER_HEIGHT) {
    return {
      elementId: element.id,
      worldBounds: { x: element.x + 8, y: element.y + 4, width: element.width - 16, height: 24 },
      initialValue: toDisplayName(element.data?.name) || fallbackTitle,
      multiline: false,
      onCommit: (newValue) => {
        const trimmed = newValue.trim();
        if (trimmed && !isSameIdentifier(trimmed, element.data?.name)) {
          useCanvasStore.getState().updateElement(element.id, {
            data: { ...element.data, name: trimmed },
          });
        }
      },
    };
  }

  const {
    params,
    items,
    states,
    paramsCount,
    queryOffsets,
    queryItemsHeight,
    paramStartY,
    queryStartY,
    stateStartY,
  } = computeProjectionLayout(element.data);

  const paramEndY = paramStartY + paramsCount * PROJECTION_ROW_HEIGHT;
  if (localPoint.y >= paramStartY && localPoint.y < paramEndY) {
    const index = rowIndexAt(localPoint.y, paramStartY, params.length);
    if (index === null) return null;
    return fieldNameEditor(element, params[index], index, 0, paramStartY);
  }

  const queryEndY = queryStartY + queryItemsHeight;
  if (localPoint.y >= queryStartY && localPoint.y < queryEndY) {
    const local = localPoint.y - queryStartY;
    for (let i = 0; i < items.length; i++) {
      const start = queryOffsets[i];
      const end = start + queryItemHeight(items[i]);
      if (local >= start && local < end) {
        // Query items have no editable text; just select them so the options
        // bar exposes the types/tags editors.
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 1,
          sectionId: "query",
          fieldIndex: i,
        });
        break;
      }
    }
    return null;
  }

  const stateEndY = stateStartY + Math.max(1, states.length) * PROJECTION_ROW_HEIGHT;
  if (localPoint.y >= stateStartY && localPoint.y < stateEndY) {
    const index = rowIndexAt(localPoint.y, stateStartY, states.length);
    if (index === null) return null;
    return fieldNameEditor(element, states[index], index, 2, stateStartY);
  }

  return null;
}

/** Builds the inline editor for one params/states field name and writes the new name on commit. */
function fieldNameEditor(
  element: CanvasElement<ProjectionCardData>,
  field: ProjectionField,
  index: number,
  sectionIndex: number,
  sectionStartY: number,
): InlineEditState {
  return {
    elementId: element.id,
    worldBounds: {
      x: element.x + 10,
      y: element.y + sectionStartY + index * PROJECTION_ROW_HEIGHT + 2,
      width: Math.max(80, element.width - 80),
      height: 24,
    },
    initialValue: toDisplayName(field.name),
    multiline: false,
    onCommit: (newName) => {
      const trimmed = newName.trim();
      if (!trimmed || isSameIdentifier(trimmed, field.name)) return;
      const isParams = sectionIndex === 0;
      const list = isParams ? getProjectionParams(element.data) : getProjectionStates(element.data);
      const next = [...list];
      next[index] = { ...field, name: trimmed };
      const data: ProjectionCardData = isParams
        ? { ...element.data, params: next }
        : { ...element.data, states: next };
      useCanvasStore.getState().updateElement(element.id, { data });
    },
  };
}
