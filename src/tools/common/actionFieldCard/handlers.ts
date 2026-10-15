/**
 * Interaction handlers for the action field cards (Command / Query):
 * sub-selection, row deletion, field type/array/required/validation edits,
 * section metadata and inline text editors.
 */
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { isSameAction, isSameIdentifier, toDisplayAction, toDisplayName } from "@/utils/naming";
import type { FieldValidation } from "@/utils/fieldValidation";
import {
  ACTION_PRIMARY_BAND_TOP,
  ACTION_ROW_HEIGHT,
  ACTION_SECTION_HEADER_HEIGHT,
  ACTION_TOKEN_ROW_TOP,
  ACTION_HEADER_HEIGHT,
} from "./metrics";
import type { ActionCardData, ActionField } from "./types";

export interface ActionHandlerConfig {
  /** Reads the primary section fields (handles the Command legacy alias). */
  getPrimary: (data: ActionCardData) => ActionField[];
  /** Data key the primary list is written to (`inputs` / `params`). */
  primaryKey: "inputs" | "params";
  /** Primary section id/label (`inputs` / `params`). */
  primarySectionId: string;
  /** Header/inline-edit fallback title (e.g. "Command"). */
  title: string;
  /** Recomputes the card size for the given data. */
  computeSize: (data: ActionCardData, width?: number) => { width: number; height: number };
}

/** Returns a copy of the data with the primary section replaced. */
function withPrimary(data: ActionCardData, key: "inputs" | "params", list: ActionField[]): ActionCardData {
  return key === "inputs" ? { ...data, inputs: list } : { ...data, params: list };
}

function rowIndexAt(localY: number, startY: number, count: number): number | null {
  if (localY < startY) return null;
  const index = Math.floor((localY - startY) / ACTION_ROW_HEIGHT);
  if (index < 0 || index >= count) return null;
  return index;
}

export function actionSubSelect(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  localPoint: Point,
): SelectedField | null {
  const primary = config.getPrimary(element.data);
  const responses = element.data.responses ?? [];
  const primaryCount = Math.max(1, primary.length);
  const primaryStartY = ACTION_PRIMARY_BAND_TOP + ACTION_SECTION_HEADER_HEIGHT;
  const primaryEndY = primaryStartY + primaryCount * ACTION_ROW_HEIGHT;

  if (localPoint.y >= primaryStartY && localPoint.y < primaryEndY) {
    if (primary.length === 0) return null;
    const index = rowIndexAt(localPoint.y, primaryStartY, primary.length);
    return index === null
      ? null
      : { elementId: element.id, sectionIndex: 0, sectionId: config.primarySectionId, fieldIndex: index };
  }

  const respStartY = primaryEndY + ACTION_SECTION_HEADER_HEIGHT;
  const respEndY = respStartY + Math.max(1, responses.length) * ACTION_ROW_HEIGHT;
  if (localPoint.y >= respStartY && localPoint.y < respEndY) {
    if (responses.length === 0) return null;
    const index = rowIndexAt(localPoint.y, respStartY, responses.length);
    return index === null
      ? null
      : { elementId: element.id, sectionIndex: 1, sectionId: "responses", fieldIndex: index };
  }

  return null;
}

export function actionDeleteRow(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  fieldIndex: number,
  sectionIndex = 0,
): Partial<CanvasElement<ActionCardData>> | null {
  const primary = config.getPrimary(element.data);
  const responses = element.data.responses ?? [];

  let nextPrimary = [...primary];
  let nextResponses = [...responses];

  if (sectionIndex === 1) {
    if (fieldIndex < 0 || fieldIndex >= responses.length) return null;
    nextResponses = responses.filter((_, i) => i !== fieldIndex);
  } else {
    if (fieldIndex < 0 || fieldIndex >= primary.length) return null;
    nextPrimary = primary.filter((_, i) => i !== fieldIndex);
  }

  const nextData = withPrimary({ ...element.data, responses: nextResponses }, config.primaryKey, nextPrimary);
  const nextSize = config.computeSize(nextData, element.width);
  return { width: nextSize.width, height: nextSize.height, data: nextData };
}

function updatePrimaryField(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  field: SelectedField,
  patch: (current: ActionField) => ActionField,
): Partial<CanvasElement<ActionCardData>> | null {
  if (field.sectionIndex === 1) return null;
  const primary = config.getPrimary(element.data);
  if (field.fieldIndex < 0 || field.fieldIndex >= primary.length) return null;
  const next = [...primary];
  next[field.fieldIndex] = patch(primary[field.fieldIndex]);
  return { data: withPrimary(element.data, config.primaryKey, next) };
}

/** Replaces the `type` of a primary or response field. */
export function actionUpdateType(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  field: SelectedField,
  type: string,
): Partial<CanvasElement<ActionCardData>> | null {
  const trimmed = type.trim();
  if (!trimmed) return null;

  if (field.sectionIndex === 1) {
    const responses = element.data.responses ?? [];
    if (field.fieldIndex < 0 || field.fieldIndex >= responses.length) return null;
    const next = [...responses];
    next[field.fieldIndex] = { ...responses[field.fieldIndex], type: trimmed };
    return { data: { ...element.data, responses: next } };
  }
  return updatePrimaryField(config, element, field, (current) => ({ ...current, type: trimmed }));
}

/** Toggles the array/required flag of a primary or response field. */
export function actionToggleFlag(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  field: SelectedField,
  flag: "isArray" | "isRequired",
): Partial<CanvasElement<ActionCardData>> | null {
  const apply = (current: ActionField): ActionField =>
    flag === "isArray"
      ? { ...current, isArray: !current.isArray }
      : { ...current, isRequired: !current.isRequired };

  if (field.sectionIndex === 1) {
    const responses = element.data.responses ?? [];
    if (field.fieldIndex < 0 || field.fieldIndex >= responses.length) return null;
    const next = [...responses];
    next[field.fieldIndex] = apply(responses[field.fieldIndex]);
    return { data: { ...element.data, responses: next } };
  }
  return updatePrimaryField(config, element, field, apply);
}

/** Sets/clears validation on a primary field. Responses are outputs and reject it. */
export function actionUpdateValidation(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  field: SelectedField,
  validation: FieldValidation | null,
): Partial<CanvasElement<ActionCardData>> | null {
  if (field.sectionIndex === 1) return null;
  return updatePrimaryField(config, element, field, (current) => {
    const next = { ...current };
    if (validation) next.validation = validation;
    else delete next.validation;
    return next;
  });
}

export function actionSelectedFieldItem(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  field: SelectedField,
): ActionField | null {
  if (field.sectionIndex === 1) {
    return (element.data.responses ?? [])[field.fieldIndex] ?? null;
  }
  return config.getPrimary(element.data)[field.fieldIndex] ?? null;
}

export function actionSections(config: ActionHandlerConfig, element: CanvasElement<ActionCardData>) {
  return [
    { id: config.primarySectionId, name: config.primarySectionId, count: config.getPrimary(element.data).length },
    { id: "responses", name: "responses", count: (element.data.responses ?? []).length },
  ];
}

export function actionInlineEdit(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  localPoint: Point,
): InlineEditState | null {
  // 1. Header -> edit the card name.
  if (localPoint.y <= ACTION_HEADER_HEIGHT) {
    return {
      elementId: element.id,
      worldBounds: { x: element.x + 8, y: element.y + 4, width: element.width - 16, height: 24 },
      initialValue: toDisplayName(element.data?.name) || config.title,
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

  // 2. Action row -> edit the action token.
  if (localPoint.y >= ACTION_TOKEN_ROW_TOP && localPoint.y < ACTION_TOKEN_ROW_TOP + ACTION_ROW_HEIGHT) {
    return {
      elementId: element.id,
      worldBounds: {
        x: element.x + 10,
        y: element.y + ACTION_TOKEN_ROW_TOP + 2,
        width: Math.max(80, element.width - 20),
        height: 24,
      },
      initialValue: toDisplayAction(element.data.action),
      multiline: false,
      onCommit: (newValue) => {
        const trimmed = newValue.trim();
        if (isSameAction(trimmed, element.data.action)) return;
        useCanvasStore.getState().updateElement(element.id, {
          data: { ...element.data, action: trimmed || undefined },
        });
      },
    };
  }

  const primary = config.getPrimary(element.data);
  const responses = element.data.responses ?? [];
  const primaryCount = Math.max(1, primary.length);
  const primaryStartY = ACTION_PRIMARY_BAND_TOP + ACTION_SECTION_HEADER_HEIGHT;
  const primaryEndY = primaryStartY + primaryCount * ACTION_ROW_HEIGHT;

  // 3. Primary row
  if (localPoint.y >= primaryStartY && localPoint.y < primaryEndY) {
    const index = rowIndexAt(localPoint.y, primaryStartY, primary.length);
    if (index === null) return null;
    return fieldNameEditor(config, element, primary[index], index, 0, config.primarySectionId, primaryStartY, primary, responses);
  }

  // 4. Response row
  const respStartY = primaryEndY + ACTION_SECTION_HEADER_HEIGHT;
  const respEndY = respStartY + Math.max(1, responses.length) * ACTION_ROW_HEIGHT;
  if (localPoint.y >= respStartY && localPoint.y < respEndY) {
    const index = rowIndexAt(localPoint.y, respStartY, responses.length);
    if (index === null) return null;
    return fieldNameEditor(config, element, responses[index], index, 1, "responses", respStartY, primary, responses);
  }

  return null;
}

function fieldNameEditor(
  config: ActionHandlerConfig,
  element: CanvasElement<ActionCardData>,
  field: ActionField,
  index: number,
  sectionIndex: number,
  sectionId: string,
  sectionStartY: number,
  primary: ActionField[],
  responses: ActionField[],
): InlineEditState {
  return {
    elementId: element.id,
    worldBounds: {
      x: element.x + 10,
      y: element.y + sectionStartY + index * ACTION_ROW_HEIGHT + 2,
      width: Math.max(80, element.width - 80),
      height: 24,
    },
    initialValue: toDisplayName(field.name),
    multiline: false,
    onCommit: (newName) => {
      const trimmed = newName.trim();
      if (!trimmed || isSameIdentifier(trimmed, field.name)) return;
      useCanvasStore.getState().setSelectedField({
        elementId: element.id,
        sectionIndex,
        sectionId,
        fieldIndex: index,
      });
      const data =
        sectionIndex === 1
          ? (() => {
              const next = [...responses];
              next[index] = { ...field, name: trimmed };
              return { ...element.data, responses: next };
            })()
          : (() => {
              const next = [...primary];
              next[index] = { ...field, name: trimmed };
              return withPrimary(element.data, config.primaryKey, next);
            })();
      useCanvasStore.getState().updateElement(element.id, { data });
    },
  };
}
