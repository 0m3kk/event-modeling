import type { CanvasObject, GroupInfo, Tool, Viewport, AISettings, AIConversation } from "@/types";
import type { CardHitZone } from "@/engine/renderers/types";

export interface AlignmentGuide {
  axis: "x" | "y";
  position: number;
}

export interface InlineEditTarget {
  objectId: string;
  zone: CardHitZone;
  initialValue: string;
}

export interface TypeSelectTarget {
  objectId: string;
  fieldId?: string;
  section?: "params" | "response";
  isModel?: boolean;
  kind?: string;
  anchor: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

import type { FieldClipboard } from "@/types";
import type { AlignDirection, DistributeDirection } from "@/utils/align";

export interface StormFieldSelection {
  objectId: string;
  fieldId?: string;
}

/**
 * Target of the description (ⓘ) hover tooltip / edit popover.
 * `fieldId` omitted means the card's own description. `iconBounds` is the ⓘ
 * hit box in card-local coordinates, used to anchor the tooltip/editor.
 */
export interface DescTarget {
  objectId: string;
  fieldId?: string;
  iconBounds: { x: number; y: number; width: number; height: number };
}

/**
 * Target of the authorization-action hover tooltip on a Command / Query card
 * header icon. `iconBounds` is the icon's hit box in card-local coordinates,
 * used to anchor the tooltip.
 */
export interface ActionTarget {
  objectId: string;
  action: string;
  iconBounds: { x: number; y: number; width: number; height: number };
}

export interface CanvasStoreState {
  projectName: string;
  objects: CanvasObject[];
  groups: GroupInfo[];
  selectedIds: string[];
  tool: Tool;
  viewport: Viewport;
  isLocked: boolean;
  alignmentGuides: AlignmentGuide[];
  inlineEdit: InlineEditTarget | null;
  typeSelect: TypeSelectTarget | null;
  stormSelectedField: StormFieldSelection | null;
  fieldClipboard: FieldClipboard | null;
  stormActionHover: string | null;
  isSearchOpen: boolean;
  descHover: DescTarget | null;
  actionHover: ActionTarget | null;

  // AI Assistant State
  aiSettings: AISettings;
  aiConversation: AIConversation;
  aiRunning: boolean;
  aiError: string | null;
  aiUsageCount: number;
}

export interface CanvasStoreActions {
  // Tool & selection
  setTool: (tool: Tool) => void;
  setSelectedIds: (ids: string[]) => void;
  selectObject: (id: string, multi?: boolean) => void;
  deselectObject: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Object manipulations
  addObject: (object: CanvasObject) => void;
  addObjects: (objects: CanvasObject[]) => void;
  updateObject: (id: string, patch: Partial<CanvasObject>) => void;
  updateObjects: (
    updates: { id: string; patch: Partial<CanvasObject> }[],
  ) => void;
  createReferenceCopy: (ids: string[]) => void;
  deleteObjects: (ids: string[]) => void;
  moveObjects: (
    ids: string[],
    dx: number,
    dy: number,
    snapToGrid?: boolean,
  ) => void;

  // Row manipulations & field clipboard
  setStormSelectedField: (sel: StormFieldSelection | null) => void;
  setStormActionHover: (action: string | null) => void;
  moveRow: (objectId: string, rowId: string, direction: "up" | "down") => void;
  deleteSelectedStormField: () => void;
  deleteSelectedRow: (objectId: string, rowId: string) => void;
  copySelectedFields: () => void;
  pasteFields: (objectId: string) => void;
  addStormField: (
    objectId: string,
    section?: "params" | "response",
  ) => string | undefined;
  addStormQueryItem: (objectId: string) => string | undefined;
  addStormConstraint: (objectId: string) => string | undefined;
  addModelField: (objectId: string) => string | undefined;
  addModelEnumValue: (objectId: string) => string | undefined;

  // Alignment, Distribution & Layout
  alignObjects: (direction: AlignDirection) => void;
  distributeObjects: (direction: DistributeDirection) => void;
  arrangeLanes: () => void;

  // Viewport
  setViewport: (viewport: Partial<Viewport>) => void;

  // Groups
  setGroups: (groups: GroupInfo[]) => void;
  addGroup: (group: GroupInfo) => void;
  updateGroup: (id: string, patch: Partial<GroupInfo>) => void;
  deleteGroup: (id: string) => void;
  groupObjects: (objectIds?: string[], name?: string) => string | undefined;
  ungroupObjects: (targetIds?: string[]) => void;
  moveGroupObjects: (
    groupId: string,
    dx: number,
    dy: number,
    snapToGrid?: boolean,
  ) => void;
  selectGroup: (groupId: string) => void;

  // Lock & Canvas settings
  setLocked: (locked: boolean) => void;

  // Alignment guides
  setAlignmentGuides: (guides: AlignmentGuide[]) => void;
  clearAlignmentGuides: () => void;

  // Inline editing & Type selection
  setInlineEdit: (target: InlineEditTarget | null) => void;
  setTypeSelect: (target: TypeSelectTarget | null) => void;

  // Description (ⓘ) hover tooltip
  setDescHover: (target: DescTarget | null) => void;

  // Authorization-action hover tooltip (Command / Query header icon)
  setActionHover: (target: ActionTarget | null) => void;

  // Search
  setSearchOpen: (open: boolean) => void;

  // Project metadata
  setProjectName: (name: string) => void;

  // Whole board reset / load
  resetBoard: (
    objects?: CanvasObject[],
    groups?: GroupInfo[],
    projectName?: string,
  ) => void;

  // AI Assistant Actions
  setAISettings: (settings: Partial<AISettings>) => void;
  sendAIMessage: (text: string) => Promise<void>;
  stopAI: () => void;
  newAIConversation: () => void;
  clearAIError: () => void;
}

export type CanvasStore = CanvasStoreState & CanvasStoreActions;
