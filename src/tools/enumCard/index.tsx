import { List } from "lucide-react";
import { z } from "zod";
import { Graphics } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { EnumCardOptions } from "./EnumCardOptions";
import {
  computeStandardCardSize,
  drawStandardCardFrame,
  renderStandardCardTitle,
  renderStandardCardFields,
  renderHeaderDescBadge,
  getStandardCardSubSelect,
  navigateStandardCardSubSelect,
  getStandardCardInlineEditTarget,
  CARD_DEFAULT_WIDTH,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { beginDescZones, hitDescZone } from "../common/descZones";

/**
 * An Enum member: a named value with an optional description. Unlike an Object
 * field it carries no data type, so members are stored under the shared
 * `fields` key (typeless rows) to reuse the standard card helpers.
 */
export interface EnumField {
  name: string;
  description?: string;
}

export interface EnumCardData {
  name: string;
  fields: EnumField[];
  color?: string;
  description?: string;
}

export const EnumCardSchema = z.object({
  name: z.string().default("EnumName"),
  fields: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const enumCardTool: ToolDefinition<EnumCardData> = {
  type: "enumCard",
  name: "Enum",
  description: "An Enum definition: a named set of values, reusable as a field type",
  icon: List,
  color: "#65a30d",
  category: "modeling",

  schema: EnumCardSchema,
  createDefaultData: () => ({
    name: "NewEnum",
    fields: [],
    color: "#65a30d",
  }),

  defaultSize: { width: CARD_DEFAULT_WIDTH, height: 60 },

  computeSize: (data) => computeStandardCardSize(data.fields?.length || 0),

  optionsBar: EnumCardOptions,

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || enumCardTool.color, isDark);

    const selectedFieldIndex =
      context.selectedField?.elementId === element.id
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
      element.data.name || "Enum",
      headerColor,
      context.textResolution,
    );

    // 3. Render value rows (name only, no type column)
    renderStandardCardFields(container, {
      elementId: element.id,
      fields: element.data.fields,
      selectedFieldIndex,
      width: element.width,
      isDark,
      textResolution: context.textResolution,
      emptyHintText: "(no values)",
    });

    // 4. Header ⓘ description badge (shows when present or selected)
    renderHeaderDescBadge(container, {
      elementId: element.id,
      width: element.width,
      isDark,
      isSelected,
      hasDescription: Boolean(element.data.description),
      hasReference: Boolean(element.referenceId),
      text: element.data.description,
      textResolution: context.textResolution,
    });
  },

  onSubSelect: (element, localPoint) =>
    getStandardCardSubSelect(localPoint, element.data.fields?.length || 0),

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onDeleteSubSelect: (element, fieldIndex) => {
    if (!element.data.fields || fieldIndex < 0 || fieldIndex >= element.data.fields.length) {
      return null;
    }
    const nextFields = element.data.fields.filter((_, i) => i !== fieldIndex);
    const nextData = { ...element.data, fields: nextFields };
    const nextSize = enumCardTool.computeSize ? enumCardTool.computeSize(nextData) : null;
    return {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    };
  },

  getSelectedFieldItem: (element, field) => {
    const value = element.data.fields?.[field.fieldIndex];
    if (!value) return null;
    // `type` is empty on purpose: Enum members have no data type, which hides
    // the type/array/required controls in the OptionsBar.
    return { name: value.name, type: "" };
  },

  getSubSelectSections: (element) => [
    {
      id: "fields",
      name: "values",
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
    getStandardCardInlineEditTarget(element, localPoint, "Enum"),

  ai: {
    toolName: "create_enum_card",
    description:
      "Create an Enum definition card (a named set of values) in the Event Model",
    parameters: z.object({
      name: z.string().describe("PascalCase enum name (e.g. OrderStatus, Currency)"),
      values: z
        .array(
          z.object({
            name: z.string().describe("Enum value name (e.g. Draft, Active, Closed)"),
            description: z.string().optional().describe("Optional description of the value"),
          }),
        )
        .optional()
        .describe("Values that make up the enum"),
      color: z.string().optional().describe("Optional header color hex code"),
      description: z
        .string()
        .optional()
        .describe("Optional plain-language description of the enum"),
    }),
    onCreate: (params, center: Point): CanvasElement<EnumCardData> => {
      const fields = params.values || [];
      const data: EnumCardData = {
        name: params.name || "Enum",
        fields,
        color: params.color || enumCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = enumCardTool.computeSize!(data);
      return {
        id: `enum-${nanoid(6)}`,
        type: "enumCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
