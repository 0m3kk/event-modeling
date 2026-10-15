import { create } from "zustand";
import type { CanvasStoreState } from "./types";
import { createUiSlice } from "./slices/ui";
import { createHistorySlice } from "./slices/history";
import { createElementSlice } from "./slices/elements";
import { createFieldSlice } from "./slices/fields";

export type { CanvasStoreState, HistoryEntry } from "./types";

/**
 * The canvas store, composed from independent slices:
 * - `ui`       — board metadata, transient selection and panel state
 * - `elements` — board elements, CRUD, container layout and persistence
 * - `fields`   — editing the selected field row inside a card
 * - `history`  — undo / redo stacks
 */
export const useCanvasStore = create<CanvasStoreState>()((...a) => ({
  ...createUiSlice(...a),
  ...createHistorySlice(...a),
  ...createElementSlice(...a),
  ...createFieldSlice(...a),
}));

export const undo = () => useCanvasStore.getState().undo();
export const redo = () => useCanvasStore.getState().redo();
