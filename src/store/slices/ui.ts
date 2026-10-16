/** UI / project slice: board metadata, transient selection and panel state. */
import type { StateCreator } from "zustand";
import { setStoredDriveFile } from "@/utils/googleDrive";
import type { CanvasStoreState } from "../types";

export type UiSlice = Pick<
  CanvasStoreState,
  | "projectName"
  | "projectId"
  | "projectCreatedAt"
  | "googleDriveFileId"
  | "googleDriveFileName"
  | "selectedIds"
  | "selectedField"
  | "inlineEdit"
  | "descHover"
  | "isDragging"
  | "tool"
  | "viewport"
  | "theme"
  | "isSearchOpen"
  | "isGoogleDriveModalOpen"
  | "isAIPanelOpen"
  | "isExportModalOpen"
  | "isChangesPanelOpen"
  | "driveModalTab"
  | "setProjectName"
  | "setProjectMeta"
  | "setGoogleDriveFileId"
  | "setTool"
  | "setViewport"
  | "setSelectedIds"
  | "setSelectedField"
  | "setInlineEdit"
  | "setDescHover"
  | "setIsDragging"
  | "selectAll"
  | "clearSelection"
  | "setSearchOpen"
  | "setGoogleDriveModalOpen"
  | "setAIPanelOpen"
  | "setExportModalOpen"
  | "setChangesPanelOpen"
>;

export const createUiSlice: StateCreator<CanvasStoreState, [], [], UiSlice> = (set, get) => ({
  projectName: "Untitled Board",
  projectId: `project-${Date.now().toString(36)}`,
  projectCreatedAt: new Date().toISOString(),
  googleDriveFileId: null,
  googleDriveFileName: null,

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
  isExportModalOpen: false,
  isChangesPanelOpen: false,
  driveModalTab: "save",

  setProjectName: (name) => set({ projectName: name }),
  setProjectMeta: (id, createdAt) => set({ projectId: id, projectCreatedAt: createdAt }),
  setGoogleDriveFileId: (id, name) => {
    set({ googleDriveFileId: id, googleDriveFileName: id ? name ?? get().projectName : null });
    // Remember the linked Drive file so a later save overwrites it even after
    // a reload; clearing the id also clears the persisted reference.
    setStoredDriveFile(id ? { id, name: name ?? get().projectName } : null);
  },
  setTool: (tool) => set({ tool }),
  setViewport: (patch) => set((state) => ({ viewport: { ...state.viewport, ...patch } })),

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
  selectAll: () => set((state) => ({ selectedIds: state.elements.map((e) => e.id) })),
  clearSelection: () =>
    set({
      selectedIds: [],
      selectedField: null,
      inlineEdit: null,
      descHover: null,
      isDragging: false,
    }),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setGoogleDriveModalOpen: (open, tab = "save") =>
    set({ isGoogleDriveModalOpen: open, driveModalTab: tab }),
  setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),
  setExportModalOpen: (open) => set({ isExportModalOpen: open }),
  setChangesPanelOpen: (open) => set({ isChangesPanelOpen: open }),
});
