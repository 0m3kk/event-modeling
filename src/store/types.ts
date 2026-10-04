import type { CanvasObject, GroupInfo, Tool, Viewport, AISettings, AIConversation, BddStep, BddStepRef, StormConstraint } from "@/types";
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
import type { ObjectClipboard } from "@/utils/objectClipboard";
import type { AlignDirection, DistributeDirection } from "@/utils/align";

export interface StormFieldSelection {
  objectId: string;
  fieldId?: string;
}

/**
 * Target of the BDD scenario step popover. `stepId` omitted means "create a
 * new step" on the card; present means "edit that step".
 */
export interface BddStepPopupTarget {
  objectId: string;
  stepId?: string;
}

/**
 * Target of the DCB Query Item popover. `queryItemId` omitted means "add a
 * new query item" on the card; present means "edit that query item".
 */
export interface QueryItemPopupTarget {
  objectId: string;
  queryItemId?: string;
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

/**
 * Target of the validation ✓ hover tooltip on a Command field / Query param
 * row. `text` is the pre-rendered rule summary shown in the tooltip.
 */
export interface ValidationTarget {
  objectId: string;
  /** Omitted for node-level targets (array / wrap). */
  fieldId?: string;
  text: string;
  iconBounds: { x: number; y: number; width: number; height: number };
}

/**
 * Target of the mapping popover (Event field or Command/Query response field).
 */
export interface MappingTarget {
  objectId: string;
  fieldId: string;
  section?: "params" | "response";
}

/**
 * Target of the mapping [⇄] or warning [!] hover tooltip.
 */
export interface MappingHover {
  objectId: string;
  fieldId?: string;
  text: string;
  isWarning?: boolean;
  iconBounds: { x: number; y: number; width: number; height: number };
}

export interface ModelPopupEntry {
  id: string;
  modelId: string;
  sourceObjectId?: string;
  sourceFieldId?: string;
  sourceFieldName?: string;
  sourceFieldType?: string;
  worldAnchor?: {
    x: number;
    y: number;
    height: number;
  };
  rowOffsetFromParent?: number;
  anchorRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  level: number;
}

export interface CanvasStoreState {
  projectName: string;
  googleDriveFileId: string | null;
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
  /** Open validation panel target (Command field / Query param). */
  validationTarget: StormFieldSelection | null;
  /** Open BDD scenario step popover target (create when stepId is omitted). */
  bddStepPopup: BddStepPopupTarget | null;
  /** Open DCB query item popover target (create when queryItemId is omitted). */
  queryItemPopup: QueryItemPopupTarget | null;
  /** Hovered validation ✓ badge, used to anchor its tooltip. */
  validationHover: ValidationTarget | null;
  /** Open field mapping popover target (Event field / Response field). */
  mappingTarget: MappingTarget | null;
  /** Hovered mapping [⇄] or warning [!] badge. */
  mappingHover: MappingHover | null;
  fieldClipboard: FieldClipboard | null;
  /** Snapshot of the selected objects/groups, filled by Cmd/Ctrl+C. */
  objectClipboard: ObjectClipboard | null;
  stormActionHover: string | null;
  /** Objects the AI is pointing at; drawn as a pulsing ring, never a selection. */
  aiHighlightIds: string[];
  isSearchOpen: boolean;
  descHover: DescTarget | null;
  actionHover: ActionTarget | null;
  modelPopupChain: ModelPopupEntry[];
  isDragging: boolean;

  // AI Assistant State
  aiSettings: AISettings;
  aiConversation: AIConversation;
  aiRunning: boolean;
  aiError: string | null;
  aiUsageCount: number;
  /** Agent loop steps used in the current turn. */
  aiStepUsed: number;
  /** Maximum agent loop steps allowed per turn. */
  aiStepLimit: number;
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
  /** Ring the objects the AI wants to point out, without selecting them. */
  setAIHighlight: (ids: string[]) => void;
  moveRow: (objectId: string, rowId: string, direction: "up" | "down") => void;
  deleteSelectedStormField: () => void;
  deleteSelectedRow: (objectId: string, rowId: string) => void;
  copySelectedFields: () => void;
  pasteFields: (objectId: string) => void;
  /** Copy the selected objects/groups (cards, models, lines, connectors, …). */
  copySelectedObjects: () => void;
  /** Paste the object clipboard as fresh, independent copies. */
  pasteObjects: () => void;
  addStormField: (
    objectId: string,
    section?: "params" | "response",
  ) => string | undefined;
  addStormQueryItem: (objectId: string) => string | undefined;
  addStormConstraint: (objectId: string) => string | undefined;
  updateStormConstraint: (
    objectId: string,
    constraintId: string,
    patch: Partial<Omit<StormConstraint, "id">>,
  ) => void;
  updateStormFieldMapping: (
    objectId: string,
    fieldId: string,
    mapping?: string,
    section?: "params" | "response",
  ) => void;
  updateStormQueryItemSet: (
    objectId: string,
    queryItemId: string,
    set?: Record<string, string>,
  ) => void;
  setMappingTarget: (target: MappingTarget | null) => void;
  setMappingHover: (hover: MappingHover | null) => void;
  /** Create a BDD scenario step (defaults to the phase's ref) and select it. */
  addBddStep: (objectId: string, ref?: BddStepRef) => string | undefined;
  /** Replace the editable parts of a BDD scenario step. */
  updateBddStep: (
    objectId: string,
    stepId: string,
    patch: Partial<Pick<BddStep, "ref" | "name" | "payload">>,
  ) => void;
  /** Open / close the BDD scenario step popover. */
  setBddStepPopup: (target: BddStepPopupTarget | null) => void;
  /** Open / close the DCB query item popover. */
  setQueryItemPopup: (target: QueryItemPopupTarget | null) => void;
  addModelField: (objectId: string) => string | undefined;
  addModelEnumValue: (objectId: string) => string | undefined;
  addServiceModelMethod: (objectId: string) => string | undefined;
  updateServiceModelMethod: (
    objectId: string,
    methodId: string,
    patch: Partial<import("@/types").ServiceMethod>,
  ) => void;

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
  addToGroup: (groupId: string, objectIds: string[]) => void;
  removeFromGroup: (objectIds: string[]) => void;
  moveGroupObjects: (
    groupId: string,
    dx: number,
    dy: number,
    snapToGrid?: boolean,
  ) => void;
  selectGroup: (groupId: string, multi?: boolean) => void;

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

  // Validation panel + ✓ hover tooltip (Command fields / Query params)
  setValidationTarget: (target: StormFieldSelection | null) => void;
  setValidationHover: (target: ValidationTarget | null) => void;

  // Authorization-action hover tooltip (Command / Query header icon)
  setActionHover: (target: ActionTarget | null) => void;

  // Search
  setSearchOpen: (open: boolean) => void;

  // Cascading Model Popups
  openModelPopup: (entry: Omit<ModelPopupEntry, "id">) => void;
  closeModelPopup: (level?: number) => void;
  clearModelPopups: () => void;

  // Dragging state
  setIsDragging: (isDragging: boolean) => void;

  // Project metadata
  setProjectName: (name: string) => void;
  setGoogleDriveFileId: (fileId: string | null) => void;

  // Whole board reset / load
  resetBoard: (
    objects?: CanvasObject[],
    groups?: GroupInfo[],
    projectName?: string,
    googleDriveFileId?: string | null,
  ) => void;

  // AI Assistant Actions
  setAISettings: (settings: Partial<AISettings>) => void;
  sendAIMessage: (text: string) => Promise<void>;
  stopAI: () => void;
  newAIConversation: () => void;
  clearAIError: () => void;
}

export type CanvasStore = CanvasStoreState & CanvasStoreActions;
