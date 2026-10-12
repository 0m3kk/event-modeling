import type { ComponentType } from "react";
import type { Container } from "pixi.js";
import { z } from "zod";
import type {
  CanvasElement,
  Point,
  ResolvedTheme,
  SelectedField,
  InlineEditState,
  DescHoverTarget,
} from "@/types";
import type { FieldValidation } from "@/utils/fieldValidation";

export interface RenderContext {
  theme: ResolvedTheme;
  isSelected: boolean;
  selectedField?: SelectedField | null;
  isHovered: boolean;
  zoom: number;
  textResolution: number;
}

export interface ToolAIOperation<TData> {
  toolName: string;
  description: string;
  parameters: z.ZodObject<any>;
  onCreate: (params: Record<string, any>, center: Point) => CanvasElement<TData>;
  onUpdate?: (element: CanvasElement<TData>, params: Record<string, any>) => CanvasElement<TData>;
}

export interface SubSelectSection {
  id?: string;
  name?: string;
  count: number;
}

/** Context available when validating/normalizing an element's data. */
export interface ToolDataContext {
  /** All current elements on the board. */
  elements: CanvasElement[];
}

/** A single rule violation reported by a tool's data validation. */
export interface ValidationIssue {
  /** Dotted path to the offending value (e.g. `queryItems[0].tags[1]`). */
  path: string;
  /** Machine-readable code (e.g. `tag_not_found`, `type_mismatch`). */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/**
 * Thrown when a tool refuses to create an element because the supplied data
 * violates its domain rules (e.g. an AI-created State card referencing an
 * unknown tag). The AI bridge catches this and reports the issues back to the
 * model as tool feedback.
 */
export class ToolValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.length > 0 ? issues.map((i) => i.message).join(" ") : "Validation failed");
    this.name = "ToolValidationError";
    this.issues = issues;
  }
}

export interface ToolDefinition<TData = any> {
  type: string;
  name: string;
  description?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  color: string;
  category?: "modeling" | "annotation" | "connector";

  schema: z.ZodType<TData, any, any>;
  createDefaultData: () => TData;
  defaultSize: { width: number; height: number };
  /**
   * Content-driven size. `width` (when provided) is the width the card already
   * has, so implementations can treat it as a floor and never shrink below it.
   */
  computeSize?: (data: TData, width?: number) => { width: number; height: number };
  /**
   * When true, the store keeps the card wide enough for its content: whenever
   * its data changes it grows the width to at least `computeSize(data, width)`
   * (never shrinking below the width the user already has) and reflows the
   * height through `computeHeightForWidth` when the card defines one.
   *
   * Used by the text-heavy cards (Event, Command, Query, State, View,
   * Constraint) whose names/types must never clip. Cards without it keep the
   * width they were given.
   */
  autoFitWidth?: boolean;
  /**
   * Optional: the height a card needs when its width is `width`. Used while
   * resizing so cards whose content wraps to the width (e.g. a Constraint's
   * rules) reflow instead of overflowing. When omitted, resizing only changes
   * the width.
   */
  computeHeightForWidth?: (data: TData, width: number) => number;
  /**
   * Whether the card exposes left/right resize handles. Defaults to true.
   * Auto-sized containers (e.g. a Slice) set this to false.
   */
  resizable?: boolean;

  render: (container: Container, element: CanvasElement<TData>, context: RenderContext) => void;
  destroy?: (container: Container) => void;

  optionsBar?: ComponentType<{
    element: CanvasElement<TData>;
    onUpdate: (partial: Partial<TData>) => void;
  }>;

  /**
   * Repairs data that enters the canvas from any source (AI, paste, import).
   * Called by the store on add/load. Must be pure and idempotent; it should
   * drop/normalize invalid references rather than throw.
   */
  normalizeData?: (data: TData, context: ToolDataContext) => TData;

  /**
   * Validates data against the tool's domain rules, returning a normalized
   * copy and any issues. Used by the AI path to reject invalid creations.
   */
  validateData?: (
    data: TData,
    context: ToolDataContext,
  ) => { data: TData; issues: ValidationIssue[] };

  // Optional: returns sections for sub-element navigation (e.g. Header, Fields, Relations)
  getSubSelectSections?: (element: CanvasElement<TData>) => SubSelectSection[];

  // Optional: handles sub-element selection on pointer down (e.g. select field)
  onSubSelect?: (element: CanvasElement<TData>, localPoint: Point) => number | SelectedField | null;

  // Optional: handles sub-element deletion (e.g. delete field)
  onDeleteSubSelect?: (element: CanvasElement<TData>, subIndex: number, sectionIndex?: number) => Partial<CanvasElement<TData>> | null;

  // Optional: handles sub-element type updates (e.g. change field type)
  onUpdateSubSelectType?: (element: CanvasElement<TData>, field: SelectedField, type: string) => Partial<CanvasElement<TData>> | null;

  // Optional: handles toggling tag status on sub-element (e.g. DCB tag on event field)
  onToggleSubSelectTag?: (element: CanvasElement<TData>, field: SelectedField) => Partial<CanvasElement<TData>> | null;

  // Optional: handles updating tag name on sub-element (e.g. DCB tag on event field)
  onUpdateSubSelectTag?: (element: CanvasElement<TData>, field: SelectedField, tag: string | null) => Partial<CanvasElement<TData>> | null;

  // Optional: handles toggling array status on sub-element (renders as "type[]")
  onToggleSubSelectArray?: (element: CanvasElement<TData>, field: SelectedField) => Partial<CanvasElement<TData>> | null;

  // Optional: handles toggling required status on sub-element (renders a "*" after the name)
  onToggleSubSelectRequired?: (element: CanvasElement<TData>, field: SelectedField) => Partial<CanvasElement<TData>> | null;

  // Optional: handles setting validation constraints on a sub-element. Passing
  // null clears any existing validation.
  onUpdateSubSelectValidation?: (
    element: CanvasElement<TData>,
    field: SelectedField,
    validation: FieldValidation | null,
  ) => Partial<CanvasElement<TData>> | null;

  // Optional: resolves selected item data for UI (e.g. OptionsBar)
  getSelectedFieldItem?: (element: CanvasElement<TData>, field: SelectedField) => { name: string; type: string; isTag?: boolean; tag?: string; isArray?: boolean; isRequired?: boolean; validation?: FieldValidation } | null;

  // Optional: handles custom navigation between sub-elements / sections
  onNavigateSubSelect?: (
    element: CanvasElement<TData>,
    current: SelectedField,
    direction: "up" | "down",
  ) => SelectedField | null;

  // Optional: provides inline edit target on double click (e.g. edit name, field name)
  getInlineEditTarget?: (element: CanvasElement<TData>, localPoint: Point) => InlineEditState | null;

  // Optional: resolves a description ⓘ hover target (header or field row) from
  // a local pointer position. Drives the ⓘ tooltip without selecting anything.
  getDescHoverTarget?: (
    element: CanvasElement<TData>,
    localPoint: Point,
  ) => DescHoverTarget | null;

  ai?: ToolAIOperation<TData>;
}

