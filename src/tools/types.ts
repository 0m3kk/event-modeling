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
  computeSize?: (data: TData) => { width: number; height: number };

  render: (container: Container, element: CanvasElement<TData>, context: RenderContext) => void;
  destroy?: (container: Container) => void;

  optionsBar?: ComponentType<{
    element: CanvasElement<TData>;
    onUpdate: (partial: Partial<TData>) => void;
  }>;

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

  // Optional: resolves selected item data for UI (e.g. OptionsBar)
  getSelectedFieldItem?: (element: CanvasElement<TData>, field: SelectedField) => { name: string; type: string; isTag?: boolean; tag?: string; isArray?: boolean; isRequired?: boolean } | null;

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

