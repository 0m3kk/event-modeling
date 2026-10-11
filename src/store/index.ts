import { create } from "zustand";
import type { CanvasElement, Viewport, ProjectFileV2, ThemeMode } from "@/types";

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
  selectAll: () => void;
  clearSelection: () => void;

  setSearchOpen: (open: boolean) => void;
  setGoogleDriveModalOpen: (open: boolean, tab?: "open" | "save") => void;
  setAIPanelOpen: (open: boolean) => void;

  // Element CRUD with Undo
  addElement: (element: CanvasElement) => void;
  addElements: (elements: CanvasElement[]) => void;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  updateElements: (patches: Array<{ id: string } & Partial<CanvasElement>>) => void;
  deleteElements: (ids: string[]) => void;
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

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  selectAll: () =>
    set((state) => ({ selectedIds: state.elements.map((e) => e.id) })),
  clearSelection: () => set({ selectedIds: [] }),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setGoogleDriveModalOpen: (open, tab = "save") =>
    set({ isGoogleDriveModalOpen: open, driveModalTab: tab }),
  setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),

  addElement: (element) => {
    const current = get().elements;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...state.elements, element],
      selectedIds: [element.id],
    }));
  },

  addElements: (elements) => {
    const current = get().elements;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...state.elements, ...elements],
      selectedIds: elements.map((e) => e.id),
    }));
  },

  updateElement: (id, patch) => {
    const current = get().elements;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...patch } : el,
      ),
    }));
  },

  updateElements: (patches) => {
    const current = get().elements;
    const patchMap = new Map(patches.map((p) => [p.id, p]));
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: state.elements.map((el) => {
        const patch = patchMap.get(el.id);
        return patch ? { ...el, ...patch } : el;
      }),
    }));
  },

  deleteElements: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const current = get().elements;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: state.elements.filter((el) => !idSet.has(el.id)),
      selectedIds: state.selectedIds.filter((id) => !idSet.has(id)),
    }));
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
