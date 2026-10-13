import { Code } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { AliasCardOptions } from "./AliasCardOptions";
import {
  computeStandardCardSize,
  drawStandardCardFrame,
  renderStandardCardTitle,
  renderHeaderDescBadge,
  appendFieldValidationBadge,
  getStandardCardInlineEditTarget,
  measureCardTitleWidth,
  CARD_HEADER_HEIGHT,
  CARD_DEFAULT_WIDTH,
  ROW_LEFT_PADDING,
  ROW_RIGHT_PADDING,
  CARD_NAME_FONT_SIZE,
  VALIDATION_BADGE_W,
  VALIDATION_BADGE_H,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { beginDescZones, hitDescZone } from "../common/descZones";
import { validateTypeValue } from "../common/typeValidation";
import { collectDefinedTypeNames } from "@/utils/typeCatalog";
import { toDisplayType } from "@/utils/naming";
import { measureMonospaceText } from "@/utils/textWrap";
import {
  FieldValidationSchema,
  hasValidation,
  type FieldValidation,
} from "@/utils/fieldValidation";

/**
 * An Alias: a named domain type that wraps a single existing type
 * (e.g. `CustomerId = uuid`, `Money = number`). It holds no fields of its
 * own — just the wrapped type, which can be any primitive or defined type.
 * Validation rules attach to the wrapped type itself.
 */
export interface AliasCardData {
  name: string;
  aliasedType: string;
  isArray?: boolean;
  validation?: FieldValidation;
  color?: string;
  description?: string;
}

export const AliasCardSchema = z.object({
  name: z.string().default("AliasName"),
  aliasedType: z.string().default("string"),
  isArray: z.boolean().optional(),
  validation: FieldValidationSchema.optional(),
  color: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Content-driven size: a header + a single body row showing the wrapped type,
 * with a width that fits the title and the wrapped-type line (plus its
 * validation shield when present) without clipping.
 */
export function computeAliasCardSize(
  data: AliasCardData,
  customWidth = CARD_DEFAULT_WIDTH,
): { width: number; height: number } {
  const { height } = computeStandardCardSize(0, customWidth);

  const typeText = toDisplayType(data.aliasedType || "unknown", data.isArray);
  let bodyWidth = ROW_LEFT_PADDING + measureMonospaceText(typeText, CARD_NAME_FONT_SIZE);
  if (hasValidation(data.validation)) bodyWidth += 6 + VALIDATION_BADGE_W;
  bodyWidth += ROW_RIGHT_PADDING;

  const width = Math.max(customWidth, Math.ceil(measureCardTitleWidth(data.name)), Math.ceil(bodyWidth));
  return { width, height };
}

export const aliasCardTool: ToolDefinition<AliasCardData> = {
  type: "aliasCard",
  name: "Alias",
  description: "A named domain type that wraps an existing type, reusable as a field type",
  icon: Code,
  color: "#db2777",
  category: "modeling",

  schema: AliasCardSchema,
  createDefaultData: () => ({
    name: "NewAlias",
    aliasedType: "string",
    color: "#db2777",
  }),

  // Header + a single body row showing the wrapped type.
  defaultSize: { width: CARD_DEFAULT_WIDTH, height: CARD_HEADER_HEIGHT + 28 },

  computeSize: (data, width) => computeAliasCardSize(data, width),

  autoFitWidth: true,

  optionsBar: AliasCardOptions,

  validateData: (data, context) => ({
    data,
    issues: validateTypeValue(
      data.aliasedType,
      "aliasedType",
      collectDefinedTypeNames(context.elements ?? []),
    ),
  }),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || aliasCardTool.color, isDark);

    // 1. Draw card frame (header banner + body + border); no selectable rows.
    const g = new Graphics();
    drawStandardCardFrame(g, {
      width: element.width,
      height: element.height,
      headerColor,
      isDark,
      isSelected,
      selectedFieldIndex: -1,
      fieldCount: 1,
    });
    container.addChild(g);

    // 2. Render Header Title (the alias name)
    renderStandardCardTitle(
      container,
      element.data.name || "Alias",
      headerColor,
      context.textResolution,
    );

    // 3. Render the wrapped type as a single body line.
    if (typeof document !== "undefined") {
      const wrapped = new Text({
        text: toDisplayType(element.data.aliasedType || "unknown", element.data.isArray),
        style: {
          fontSize: 12,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xe4e4e7 : 0x27272a,
        },
        resolution: context.textResolution,
      });
      wrapped.x = 12;
      wrapped.y = CARD_HEADER_HEIGHT + 7;
      container.addChild(wrapped);

      // Validation marker: shield badge when the alias declares rules on the
      // wrapped type.
      const aliasBadgeX = wrapped.x + wrapped.width + 6;
      if (aliasBadgeX + VALIDATION_BADGE_W < element.width - 12) {
        appendFieldValidationBadge(container, {
          x: aliasBadgeX,
          y: CARD_HEADER_HEIGHT + (28 - VALIDATION_BADGE_H) / 2,
          isDark,
          validation: element.data.validation,
        });
      }
    }

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

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  // No field rows to sub-select; the wrapped type is edited from the options bar.
  onSubSelect: () => null,

  getInlineEditTarget: (element, localPoint) =>
    getStandardCardInlineEditTarget(element, localPoint, "Alias"),

  ai: {
    toolName: "create_alias_card",
    description:
      "Create an Alias definition card (a named domain type wrapping an existing type) in the Event Model",
    parameters: z.object({
      name: z.string().describe("PascalCase alias name (e.g. CustomerId, Money, Email)"),
      type: z
        .string()
        .describe("Wrapped type (primitive or defined type name)"),
      isArray: z.boolean().optional().describe("Wraps a list of the type"),
      validation: FieldValidationSchema.optional().describe(
        "Validation constraints on the wrapped type",
      ),
      color: z.string().optional().describe("Optional hex color"),
      description: z
        .string()
        .optional()
        .describe("Description of the alias"),
    }),
    onCreate: (params, center: Point): CanvasElement<AliasCardData> => {
      const data: AliasCardData = {
        name: params.name || "Alias",
        aliasedType: params.type || "string",
        ...(params.isArray ? { isArray: true } : {}),
        ...(params.validation ? { validation: params.validation } : {}),
        color: params.color || aliasCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = aliasCardTool.computeSize!(data);
      return {
        id: `alias-${nanoid(6)}`,
        type: "aliasCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
