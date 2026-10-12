import { Box } from "lucide-react";
import { z } from "zod";
import { Graphics } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { ObjectCardOptions } from "./ObjectCardOptions";
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
import { validateFieldTypes } from "../common/typeValidation";

export interface ObjectField {
  name: string;
  type: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
}

export interface ObjectCardData {
  name: string;
  fields: ObjectField[];
  color?: string;
  description?: string;
}

export const ObjectCardSchema = z.object({
  name: z.string().default("ObjectName"),
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        isArray: z.boolean().optional(),
        isRequired: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const objectCardTool: ToolDefinition<ObjectCardData> = {
  type: "objectCard",
  name: "Object",
  description:
    "A shared Object (value/struct) definition with fields, reusable as a field type",
  icon: Box,
  color: "#c026d3",
  category: "modeling",

  schema: ObjectCardSchema,
  createDefaultData: () => ({
    name: "NewObject",
    fields: [],
    color: "#c026d3",
  }),

  defaultSize: { width: CARD_DEFAULT_WIDTH, height: 60 },

  computeSize: (data) => computeStandardCardSize(data.fields?.length || 0),

  optionsBar: ObjectCardOptions,

  validateData: (data, context) => ({
    data,
    issues: validateFieldTypes(data.fields, "fields", context.elements ?? []),
  }),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || objectCardTool.color, isDark);

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
      element.data.name || "Object",
      headerColor,
      context.textResolution,
    );

    // 3. Render Field rows (Geist Mono, edge-to-edge layout)
    renderStandardCardFields(container, {
      elementId: element.id,
      fields: element.data.fields,
      selectedFieldIndex,
      width: element.width,
      isDark,
      textResolution: context.textResolution,
      emptyHintText: "(no fields)",
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
    const nextSize = objectCardTool.computeSize ? objectCardTool.computeSize(nextData) : null;
    return {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    };
  },

  onUpdateSubSelectType: (element, field, type) => {
    const fields = element.data.fields;
    if (!fields || field.fieldIndex < 0 || field.fieldIndex >= fields.length) {
      return null;
    }
    const trimmed = type.trim();
    if (!trimmed) return null;
    const nextFields = [...fields];
    nextFields[field.fieldIndex] = { ...fields[field.fieldIndex], type: trimmed };
    return {
      data: { ...element.data, fields: nextFields },
    };
  },

  onToggleSubSelectArray: (element, field) => {
    const fields = element.data.fields;
    if (!fields || field.fieldIndex < 0 || field.fieldIndex >= fields.length) {
      return null;
    }
    const nextFields = [...fields];
    const cur = nextFields[field.fieldIndex];
    nextFields[field.fieldIndex] = { ...cur, isArray: !cur.isArray };
    return {
      data: { ...element.data, fields: nextFields },
    };
  },

  onToggleSubSelectRequired: (element, field) => {
    const fields = element.data.fields;
    if (!fields || field.fieldIndex < 0 || field.fieldIndex >= fields.length) {
      return null;
    }
    const nextFields = [...fields];
    const cur = nextFields[field.fieldIndex];
    nextFields[field.fieldIndex] = { ...cur, isRequired: !cur.isRequired };
    return {
      data: { ...element.data, fields: nextFields },
    };
  },

  getSelectedFieldItem: (element, field) => {
    return element.data.fields?.[field.fieldIndex] ?? null;
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
    getStandardCardInlineEditTarget(element, localPoint, "Object"),

  ai: {
    toolName: "create_object_card",
    description:
      "Create a shared Object definition card (a reusable value/struct type).",
    parameters: z.object({
      name: z.string().describe("PascalCase object name (e.g. Address, Customer)"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name in camelCase"),
            type: z
              .string()
              .describe("Field type (primitive or defined type name)"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z
              .string()
              .optional()
              .describe("What this field means"),
          }),
        )
        .optional()
        .describe("Object fields"),
      color: z.string().optional().describe("Optional hex color"),
      description: z
        .string()
        .optional()
        .describe("Description of the object"),
    }),
    onCreate: (params, center: Point): CanvasElement<ObjectCardData> => {
      const fields = params.fields || [];
      const data: ObjectCardData = {
        name: params.name || "Object",
        fields,
        color: params.color || objectCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = objectCardTool.computeSize!(data);
      return {
        id: `object-${nanoid(6)}`,
        type: "objectCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
