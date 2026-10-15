import type {
  CanvasElement,
  Viewport,
  ProjectFileV2,
  ThemeMode,
  SelectedField,
  InlineEditState,
  DescHoverTarget,
} from "@/types";
import type { FieldValidation } from "@/utils/fieldValidation";

export interface HistoryEntry {
  elements: CanvasElement[];
}

export interface CanvasStoreState {
  // Project info
  projectName: string;
  googleDriveFileId: string | null;
  googleDriveFileName: string | null;

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
  isExportModalOpen: boolean;
  driveModalTab: "open" | "save";

  // History stacks
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Actions
  setProjectName: (name: string) => void;
  setGoogleDriveFileId: (id: string | null, name?: string) => void;
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
  setExportModalOpen: (open: boolean) => void;

  // Element CRUD with Undo
  addElement: (element: CanvasElement) => void;
  addElements: (elements: CanvasElement[]) => void;
  createReferenceCopy: (id: string) => CanvasElement | null;
  createMethodCopy: (sourceId: string, methodId: string) => CanvasElement | null;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  updateElements: (patches: Array<{ id: string } & Partial<CanvasElement>>) => void;
  /** Auto-arranges a Domain: Groups stacked left, Slices in a row beside them. */
  arrangeDomain: (domainId: string) => void;
  /** Auto-arranges a Group's child cards into a compact grid. */
  arrangeGroup: (groupId: string) => void;
  deleteElements: (ids: string[]) => void;
  deleteSelectedField: () => void;
  updateSelectedFieldType: (type: string) => void;
  toggleSelectedFieldTag: () => void;
  updateSelectedFieldTag: (tag: string | null) => void;
  toggleSelectedFieldArray: () => void;
  toggleSelectedFieldRequired: () => void;
  updateSelectedFieldValidation: (validation: FieldValidation | null) => void;
  navigateSelectedField: (direction: "up" | "down") => void;
  clearBoard: () => void;
  loadProject: (project: ProjectFileV2) => void;

  // History operations
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}
