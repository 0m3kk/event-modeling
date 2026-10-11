import type { ComponentType } from "react";
import type { Container } from "pixi.js";
import { z } from "zod";
import type { CanvasElement, Point, ResolvedTheme, SelectedField, InlineEditState } from "@/types";

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

  // Optional: handles sub-element selection on pointer down (e.g. select field)
  onSubSelect?: (element: CanvasElement<TData>, localPoint: Point) => number | null;

  // Optional: provides inline edit target on double click (e.g. edit name, field name)
  getInlineEditTarget?: (element: CanvasElement<TData>, localPoint: Point) => InlineEditState | null;

  ai?: ToolAIOperation<TData>;
}

