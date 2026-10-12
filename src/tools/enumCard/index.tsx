import { List } from "lucide-react";
import { z } from "zod";
import { Graphics } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { EnumCardOptions } from "./EnumCardOptions";
import {
  CARD_HEADER_HEIGHT,
  CARD_ROW_HEIGHT,
  drawStandardCardFrame,
  renderStandardCardTitle,
  renderStandardCardFields,
  formatFieldNameLabel,
  renderHeaderDescBadge,
  getStandardCardSubSelect,
  navigateStandardCardSubSelect,
  getStandardCardInlineEditTarget,
  CARD_DEFAULT_WIDTH,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { measureMonospaceText } from "@/utils/textWrap";
import { toDisplayName } from "@/utils/naming";
import { beginDescZones, hitDescZone } from "../common/descZones";

/** Left padding before a value label (mirrors renderStandardCardFields). */
const ENUM_ROW_LEFT_PADDING = 12;
/** Space kept right of the longest value so it clears the row ⓘ badge/edge. */
const ENUM_ROW_RIGHT_RESERVE = 34;
/** Font size of a value label in renderStandardCardFields. */
const ENUM_VALUE_FONT_SIZE = 12;
/** Font size of the header title in renderStandardCardTitle. */
const ENUM_TITLE_FONT_SIZE = 13;
/** Space kept right of the title for the header ⓘ badge. */
const ENUM_TITLE_RIGHT_RESERVE = 30;

/** On-canvas label of an enum value: verbatim (underscores kept) + ALL CAPS. */
export function enumValueLabel(name: string | undefined): string {
  return formatFieldNameLabel(name, { humanize: false, uppercase: true });
}

/**
 * Content-driven size: the card widens (never narrows below `customWidth`)
 * so the longest value label or the title is never clipped, and grows tall
 * enough for one row per value.
 */
export function computeEnumCardSize(
  data: EnumCardData,
  customWidth = CARD_DEFAULT_WIDTH,
): { width: number; height: number } {
  const fields = data.fields ?? [];
  const height = CARD_HEADER_HEIGHT + Math.max(1, fields.length) * CARD_ROW_HEIGHT;

  let required = ENUM_ROW_LEFT_PADDING + measureMonospaceText("", ENUM_VALUE_FONT_SIZE) + ENUM_ROW_RIGHT_RESERVE;
  for (const field of fields) {
    required = Math.max(
      required,
      ENUM_ROW_LEFT_PADDING +
        measureMonospaceText(enumValueLabel(field.name), ENUM_VALUE_FONT_SIZE) +
        ENUM_ROW_RIGHT_RESERVE,
    );
  }

  required = Math.max(
    required,
    ENUM_ROW_LEFT_PADDING +
      measureMonospaceText(toDisplayName(data.name), ENUM_TITLE_FONT_SIZE) +
      ENUM_TITLE_RIGHT_RESERVE,
  );

  return { width: Math.max(customWidth, Math.ceil(required)), height };
}

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

  computeSize: (data) => computeEnumCardSize(data),

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
      // Enum members are stored values, not identifiers, so display them
      // verbatim (underscores and casing preserved) and in ALL CAPS — e.g.
      // "in_progress" renders as "IN_PROGRESS" while the stored value is
      // untouched and the inline editor still shows the original.
      humanizeFieldNames: false,
      uppercaseFieldNames: true,
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
    getStandardCardInlineEditTarget(element, localPoint, "Enum", {
      // Editor shows the value in ALL CAPS (matching the card); committing
      // stores it verbatim, so separators such as `_` and the casing the user
      // types are preserved. The card widens/shrinks to fit.
      humanizeFieldNames: false,
      uppercaseFieldNames: true,
      resolveSize: (data) => computeEnumCardSize(data, element.width),
    }),

  ai: {
    toolName: "create_enum_card",
    description:
      "Create an Enum definition card (a named set of values) in the Event Model",
    parameters: z.object({
      name: z.string().describe("PascalCase enum name (e.g. OrderStatus, Currency)"),
      values: z
        .array(
          z.object({
            name: z.string().describe("Value name"),
            description: z.string().optional().describe("Description of the value"),
          }),
        )
        .optional()
        .describe("Enum values"),
      color: z.string().optional().describe("Optional hex color"),
      description: z
        .string()
        .optional()
        .describe("Description of the enum"),
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
