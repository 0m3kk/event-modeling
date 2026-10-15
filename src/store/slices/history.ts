/** History slice: undo/redo stacks and the actions that move between them. */
import type { StateCreator } from "zustand";
import type { CanvasStoreState } from "../types";
import { snapshotState } from "../helpers";

export type HistorySlice = Pick<
  CanvasStoreState,
  "undoStack" | "redoStack" | "undo" | "redo" | "canUndo" | "canRedo"
>;

export const createHistorySlice: StateCreator<CanvasStoreState, [], [], HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],

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
});
