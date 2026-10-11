import { create } from "zustand";
import type { CanvasElement, Viewport, ProjectFileV2, ThemeMode, SelectedField, InlineEditState, DescHoverTarget } from "@/types";
import {
  ensureUniqueElement,
  resolveUniqueDataOnUpdate,
} from "@/utils/naming";
import {
  createReferenceCopy as makeReferenceCopy,
  syncReferenceUpdates,
  syncBatchReferenceUpdates,
  pruneDanglingReferences,
} from "@/utils/reference";
import { toolRegistry } from "@/tools/registry";
import {
  navigateSubSelect,
  getAdjacentSubSelectAfterDeletion,
} from "@/utils/subSelection";

interface HistoryEntry {
  elements: CanvasElement[];
}

export interface CanvasStoreState {
  // Project info
  projectName: string;
  googleDriveFileId: string | null;

  // Canvas data
  elements: CanvasElement[];
  selectedIds: string[];
  selectedField: SelectedField | null;
  inlineEdit: InlineEditState | null;
  descHover: DescHoverTarget | null;
  isDragging: boolean;
  tool: string; // "select" or tool type
  viewport: Viewport;

  // UI state
  theme: ThemeMode;
  isSearchOpen: boolean;
  isGoogleDriveModalOpen: boolean;
  isAIPanelOpen: boolean;
  driveModalTab: "open" | "save";

  // History stacks
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Actions
  setProjectName: (name: string) => void;
  setGoogleDriveFileId: (id: string | null) => void;
  setTool: (tool: string) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  setSelectedIds: (ids: string[]) => void;
  setSelectedField: (field: SelectedField | null) => void;
  setInlineEdit: (edit: InlineEditState | null) => void;
  setDescHover: (target: DescHoverTarget | null) => void;
  setIsDragging: (isDragging: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  setSearchOpen: (open: boolean) => void;
  setGoogleDriveModalOpen: (open: boolean, tab?: "open" | "save") => void;
  setAIPanelOpen: (open: boolean) => void;

  // Element CRUD with Undo
  addElement: (element: CanvasElement) => void;
  addElements: (elements: CanvasElement[]) => void;
  createReferenceCopy: (id: string) => CanvasElement | null;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  updateElements: (patches: Array<{ id: string } & Partial<CanvasElement>>) => void;
  deleteElements: (ids: string[]) => void;
  deleteSelectedField: () => void;
  updateSelectedFieldType: (type: string) => void;
  toggleSelectedFieldTag: () => void;
  updateSelectedFieldTag: (tag: string | null) => void;
  toggleSelectedFieldArray: () => void;
  toggleSelectedFieldRequired: () => void;
  navigateSelectedField: (direction: "up" | "down") => void;
  clearBoard: () => void;
  loadProject: (project: ProjectFileV2) => void;

  // History operations
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_HISTORY = 50;

function snapshotState(elements: CanvasElement[]): HistoryEntry {
  return {
    elements: JSON.parse(JSON.stringify(elements)),
  };
}

export const useCanvasStore = create<CanvasStoreState>((set, get) => ({
  projectName: "Untitled Board",
  googleDriveFileId: null,

  elements: [],
  selectedIds: [],
  selectedField: null,
  inlineEdit: null,
  descHover: null,
  isDragging: false,
  tool: "select",
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
    screenWidth: 0,
    screenHeight: 0,
  },

  theme: "system",
  isSearchOpen: false,
  isGoogleDriveModalOpen: false,
  isAIPanelOpen: false,
  driveModalTab: "save",

  undoStack: [],
  redoStack: [],

  setProjectName: (name) => set({ projectName: name }),
  setGoogleDriveFileId: (id) => set({ googleDriveFileId: id }),
  setTool: (tool) => set({ tool }),
  setViewport: (patch) =>
    set((state) => ({ viewport: { ...state.viewport, ...patch } })),

  setSelectedIds: (ids) =>
    set((state) => ({
      selectedIds: ids,
      selectedField:
        state.selectedField && ids.includes(state.selectedField.elementId)
          ? state.selectedField
          : null,
    })),
  setSelectedField: (field) => set({ selectedField: field }),
  setInlineEdit: (edit) => set({ inlineEdit: edit }),
  setDescHover: (target) => set({ descHover: target }),
  setIsDragging: (isDragging) => set({ isDragging }),
  selectAll: () =>
    set((state) => ({ selectedIds: state.elements.map((e) => e.id) })),
  clearSelection: () => set({ selectedIds: [], selectedField: null, inlineEdit: null, descHover: null, isDragging: false }),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setGoogleDriveModalOpen: (open, tab = "save") =>
    set({ isGoogleDriveModalOpen: open, driveModalTab: tab }),
  setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),

  addElement: (element) => {
    const current = get().elements;
    const uniqueElement = ensureUniqueElement(element, current);
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...state.elements, uniqueElement],
      selectedIds: [uniqueElement.id],
      selectedField: null,
      inlineEdit: null,
    }));
  },

  addElements: (elements) => {
    const current = get().elements;
    const processed: CanvasElement[] = [];
    let running = [...current];
    for (const el of elements) {
      const uniqueEl = ensureUniqueElement(el, running);
      processed.push(uniqueEl);
      running.push(uniqueEl);
    }
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...state.elements, ...processed],
      selectedIds: processed.map((e) => e.id),
      selectedField: null,
      inlineEdit: null,
    }));
  },

  createReferenceCopy: (id) => {
    const current = get().elements;
    const source = current.find((el) => el.id === id);
    if (!source) return null;

    const { sourcePatch, copy } = makeReferenceCopy(source);
    const updatedCurrent = current.map((el) =>
      el.id === sourcePatch.id
        ? {
            ...el,
            referenceId: sourcePatch.referenceId,
            isOriginal: sourcePatch.isOriginal,
          }
        : el,
    );

    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...updatedCurrent, copy],
      selectedIds: [copy.id],
      selectedField: null,
      inlineEdit: null,
    }));
    return copy;
  },

  updateElement: (id, patch) => {
    const current = get().elements;
    const target = current.find((el) => el.id === id);
    if (!target) return;

    const finalPatch = patch.data
      ? { ...patch, data: resolveUniqueDataOnUpdate(target, patch.data, current) }
      : patch;

    const updatedElements = syncReferenceUpdates(current, id, finalPatch);
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: updatedElements,
    }));
  },

  updateElements: (patches) => {
    const current = get().elements;
    const finalPatches = patches.map((patch) => {
      const target = current.find((el) => el.id === patch.id);
      if (!target || !patch.data) return patch;
      return {
        ...patch,
        data: resolveUniqueDataOnUpdate(target, patch.data, current),
      };
    });

    const updatedElements = syncBatchReferenceUpdates(current, finalPatches);
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: updatedElements,
    }));
  },

  deleteElements: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const current = get().elements;
    const remaining = current.filter((el) => !idSet.has(el.id));
    const cleaned = pruneDanglingReferences(remaining);

    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: cleaned,
      selectedIds: state.selectedIds.filter((id) => !idSet.has(id)),
      selectedField:
        state.selectedField && idSet.has(state.selectedField.elementId)
          ? null
          : state.selectedField,
      inlineEdit:
        state.inlineEdit && idSet.has(state.inlineEdit.elementId)
          ? null
          : state.inlineEdit,
    }));
  },

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

  clearBoard: () => {
    const current = get().elements;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [],
      selectedIds: [],
    }));
  },

  loadProject: (project) => {
    set({
      projectName: project.name,
      elements: project.elements,
      selectedIds: [],
      viewport: {
        x: project.viewport.x,
        y: project.viewport.y,
        zoom: project.viewport.zoom,
        screenWidth: get().viewport.screenWidth,
        screenHeight: get().viewport.screenHeight,
      },
      undoStack: [],
      redoStack: [],
    });
  },

  undo: () => {
    const { undoStack, elements } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, snapshotState(elements)],
      elements: prev.elements,
      selectedIds: [],
    }));
  },

  redo: () => {
    const { redoStack, elements } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set((state) => ({
      undoStack: [...state.undoStack, snapshotState(elements)],
      redoStack: state.redoStack.slice(0, -1),
      elements: next.elements,
      selectedIds: [],
    }));
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));

export const undo = () => useCanvasStore.getState().undo();
export const redo = () => useCanvasStore.getState().redo();
