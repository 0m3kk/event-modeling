/** Sub-selection slice: editing the selected field row inside a card. */
import type { StateCreator } from "zustand";
import type { CanvasElement } from "@/types";
import { toolRegistry } from "@/tools/registry";
import { cleanValidation } from "@/utils/fieldValidation";
import { getAdjacentSubSelectAfterDeletion, navigateSubSelect } from "@/utils/subSelection";
import type { CanvasStoreState } from "../types";

export type FieldSlice = Pick<
  CanvasStoreState,
  | "deleteSelectedField"
  | "updateSelectedFieldType"
  | "toggleSelectedFieldTag"
  | "updateSelectedFieldTag"
  | "toggleSelectedFieldArray"
  | "toggleSelectedFieldRequired"
  | "updateSelectedFieldValidation"
  | "navigateSelectedField"
>;

export const createFieldSlice: StateCreator<CanvasStoreState, [], [], FieldSlice> = (set, get) => ({
  deleteSelectedField: () => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    let patch: Partial<CanvasElement> | null = null;

    if (tool?.onDeleteSubSelect) {
      patch = tool.onDeleteSubSelect(element, selectedField.fieldIndex, selectedField.sectionIndex);
    } else if (Array.isArray(element.data?.fields)) {
      const nextFields = element.data.fields.filter(
        (_: unknown, i: number) => i !== selectedField.fieldIndex,
      );
      const nextData = { ...element.data, fields: nextFields };
      const nextSize = tool?.computeSize ? tool.computeSize(nextData) : null;
      patch = {
        height: nextSize ? nextSize.height : element.height,
        data: nextData,
      };
    }

    if (patch) {
      get().updateElement(element.id, patch);
      const updatedElement = get().elements.find((el) => el.id === element.id);
      const nextSelected = updatedElement
        ? getAdjacentSubSelectAfterDeletion(updatedElement, selectedField, tool)
        : null;
      set({ selectedField: nextSelected });
    }
  },

  updateSelectedFieldType: (type) => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    if (tool?.onUpdateSubSelectType) {
      const patch = tool.onUpdateSubSelectType(element, selectedField, type);
      if (patch) {
        get().updateElement(element.id, patch);
      }
      return;
    }

    if (!Array.isArray(element.data?.fields)) return;

    const fields = element.data.fields;
    const index = selectedField.fieldIndex;
    if (index < 0 || index >= fields.length) return;

    const trimmedType = type.trim();
    if (!trimmedType || fields[index].type === trimmedType) return;

    const nextFields = [...fields];
    nextFields[index] = { ...fields[index], type: trimmedType };

    get().updateElement(element.id, {
      data: { ...element.data, fields: nextFields },
    });
  },

  toggleSelectedFieldTag: () => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    if (tool?.onToggleSubSelectTag) {
      const patch = tool.onToggleSubSelectTag(element, selectedField);
      if (patch) {
        get().updateElement(element.id, patch);
      }
      return;
    }

    if (!Array.isArray(element.data?.fields)) return;

    const fields = element.data.fields;
    const index = selectedField.fieldIndex;
    if (index < 0 || index >= fields.length) return;

    const nextFields = [...fields];
    const cur = nextFields[index];
    if (cur.tag || cur.isTag) {
      nextFields[index] = { ...cur, tag: undefined, isTag: false };
    } else {
      nextFields[index] = { ...cur, tag: cur.name || "tag", isTag: true };
    }

    get().updateElement(element.id, {
      data: { ...element.data, fields: nextFields },
    });
  },

  updateSelectedFieldTag: (tag: string | null) => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    if (tool?.onUpdateSubSelectTag) {
      const patch = tool.onUpdateSubSelectTag(element, selectedField, tag);
      if (patch) {
        get().updateElement(element.id, patch);
      }
      return;
    }

    if (!Array.isArray(element.data?.fields)) return;

    const fields = element.data.fields;
    const index = selectedField.fieldIndex;
    if (index < 0 || index >= fields.length) return;

    const nextFields = [...fields];
    const cur = nextFields[index];
    const trimmed = tag?.trim();
    if (trimmed) {
      const cleanTag = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
      nextFields[index] = { ...cur, tag: cleanTag, isTag: true };
    } else {
      nextFields[index] = { ...cur, tag: undefined, isTag: false };
    }

    get().updateElement(element.id, {
      data: { ...element.data, fields: nextFields },
    });
  },

  toggleSelectedFieldArray: () => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    if (tool?.onToggleSubSelectArray) {
      const patch = tool.onToggleSubSelectArray(element, selectedField);
      if (patch) {
        get().updateElement(element.id, patch);
      }
      return;
    }

    if (!Array.isArray(element.data?.fields)) return;

    const fields = element.data.fields;
    const index = selectedField.fieldIndex;
    if (index < 0 || index >= fields.length) return;

    const nextFields = [...fields];
    const cur = nextFields[index];
    nextFields[index] = { ...cur, isArray: !cur.isArray };

    get().updateElement(element.id, {
      data: { ...element.data, fields: nextFields },
    });
  },

  toggleSelectedFieldRequired: () => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    if (tool?.onToggleSubSelectRequired) {
      const patch = tool.onToggleSubSelectRequired(element, selectedField);
      if (patch) {
        get().updateElement(element.id, patch);
      }
      return;
    }

    if (!Array.isArray(element.data?.fields)) return;

    const fields = element.data.fields;
    const index = selectedField.fieldIndex;
    if (index < 0 || index >= fields.length) return;

    const nextFields = [...fields];
    const cur = nextFields[index];
    nextFields[index] = { ...cur, isRequired: !cur.isRequired };

    get().updateElement(element.id, {
      data: { ...element.data, fields: nextFields },
    });
  },

  updateSelectedFieldValidation: (validation) => {
    const { selectedField, elements } = get();
    if (!selectedField) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const cleaned = cleanValidation(validation) ?? null;

    const tool = toolRegistry.get(element.type);
    if (tool?.onUpdateSubSelectValidation) {
      const patch = tool.onUpdateSubSelectValidation(element, selectedField, cleaned);
      if (patch) {
        get().updateElement(element.id, patch);
      }
      return;
    }

    if (!Array.isArray(element.data?.fields)) return;

    const fields = element.data.fields;
    const index = selectedField.fieldIndex;
    if (index < 0 || index >= fields.length) return;

    const nextFields = [...fields];
    const nextField = { ...nextFields[index] };
    if (cleaned) {
      nextField.validation = cleaned;
    } else {
      delete nextField.validation;
    }
    nextFields[index] = nextField;

    get().updateElement(element.id, {
      data: { ...element.data, fields: nextFields },
    });
  },

  navigateSelectedField: (direction) => {
    const { selectedField, selectedIds, elements } = get();
    if (!selectedField) return;
    if (!selectedIds.includes(selectedField.elementId)) return;

    const element = elements.find((el) => el.id === selectedField.elementId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    const next = navigateSubSelect(element, selectedField, direction, tool);
    if (next) {
      set({ selectedField: next });
    }
  },
});
