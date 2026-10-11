import { Terminal } from "lucide-react";
import { z } from "zod";
import { Graphics } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { CommandCardOptions } from "./CommandCardOptions";
import {
  computeStandardCardSize,
  drawStandardCardFrame,
  renderStandardCardTitle,
  renderStandardCardFields,
  getStandardCardSubSelect,
  navigateStandardCardSubSelect,
  getStandardCardInlineEditTarget,
  CARD_DEFAULT_WIDTH,
} from "../common/cardLayout";

export interface CommandField {
  name: string;
  type: string;
}

export interface CommandCardData {
  name: string;
  fields: CommandField[];
  color?: string;
}

export const CommandCardSchema = z.object({
  name: z.string().default("CommandName"),
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
      }),
    )
    .default([]),
  color: z.string().optional(),
});

export const commandCardTool: ToolDefinition<CommandCardData> = {
  type: "commandCard",
  name: "Command",
  description: "A Command representing an intent or action in the system",
  icon: Terminal,
  color: "#2563eb",
  category: "modeling",

  schema: CommandCardSchema,
  createDefaultData: () => ({
    name: "NewCommand",
    fields: [],
    color: "#2563eb",
  }),

  defaultSize: { width: CARD_DEFAULT_WIDTH, height: 60 },

  computeSize: (data) => computeStandardCardSize(data.fields?.length || 0),

  optionsBar: CommandCardOptions,

  render: (container, element, context) => {
    container.removeChildren();

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = element.data.color || commandCardTool.color;

    const isSectionActive =
      !context.selectedField?.sectionIndex ||
      context.selectedField.sectionIndex === 0;

    const selectedFieldIndex =
      context.selectedField?.elementId === element.id && isSectionActive
        ? context.selectedField.fieldIndex
        : -1;

    const fieldsCount = element.data.fields?.length || 0;

    // 1. Draw card frame (header banner, body, sunken field selection highlight, border)
    const g = new Graphics();
    drawStandardCardFrame(g, {
      width: element.width,
      height: element.height,
      headerColor,
      isDark,
      isSelected,
      selectedFieldIndex,
      fieldCount: fieldsCount,
    });
    container.addChild(g);

    // 2. Render Header Title (Geist Mono, contrast-aware color)
    renderStandardCardTitle(
      container,
      element.data.name || "Command",
      headerColor,
      context.textResolution,
    );

    // 3. Render Field rows (Geist Mono, edge-to-edge layout)
    renderStandardCardFields(container, {
      fields: element.data.fields,
      selectedFieldIndex,
      width: element.width,
      isDark,
      textResolution: context.textResolution,
    });
  },

  onSubSelect: (element, localPoint) =>
    getStandardCardSubSelect(localPoint, element.data.fields?.length || 0),

  onDeleteSubSelect: (element, fieldIndex) => {
    if (!element.data.fields || fieldIndex < 0 || fieldIndex >= element.data.fields.length) {
      return null;
    }
    const nextFields = element.data.fields.filter((_, i) => i !== fieldIndex);
    const nextData = { ...element.data, fields: nextFields };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;
    return {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    };
  },

  getSubSelectSections: (element) => [
    {
      id: "fields",
      name: "fields",
      count: element.data.fields?.length || 0,
    },
  ],

  onNavigateSubSelect: (element, current, direction) =>
    navigateStandardCardSubSelect(
      element.id,
      current,
      direction,
      element.data.fields?.length || 0,
    ),

  getInlineEditTarget: (element, localPoint) =>
    getStandardCardInlineEditTarget(element, localPoint, "Command"),

  ai: {
    toolName: "create_command_card",
    description: "Create a domain Command card in the Event Model",
    parameters: z.object({
      name: z.string().describe("PascalCase command name (e.g. PlaceOrder, RegisterUser)"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name in camelCase"),
            type: z.string().describe("Field data type (e.g. string, number, boolean)"),
          }),
        )
        .optional()
        .describe("Parameters / payload carried by the command"),
      color: z.string().optional().describe("Optional header color hex code"),
    }),
    onCreate: (params, center: Point): CanvasElement<CommandCardData> => {
      const fields = params.fields || [];
      const data: CommandCardData = {
        name: params.name || "Command",
        fields,
        color: params.color || commandCardTool.color,
      };
      const size = commandCardTool.computeSize!(data);
      return {
        id: `command-${nanoid(6)}`,
        type: "commandCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
