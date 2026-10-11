import { Type } from "lucide-react";
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
  getStandardCardInlineEditTarget,
  CARD_HEADER_HEIGHT,
  CARD_DEFAULT_WIDTH,
} from "../common/cardLayout";
import { beginDescZones, hitDescZone } from "../common/descZones";
import { validateTypeValue } from "../common/typeValidation";
import { collectDefinedTypeNames } from "@/utils/typeCatalog";

/**
 * An Alias: a named domain type that wraps a single existing type
 * (e.g. `CustomerId = uuid`, `Money = number`). It holds no fields of its
 * own — just the wrapped type, which can be any primitive or defined type.
 */
export interface AliasCardData {
  name: string;
  aliasedType: string;
  isArray?: boolean;
  color?: string;
  description?: string;
}

export const AliasCardSchema = z.object({
  name: z.string().default("AliasName"),
  aliasedType: z.string().default("string"),
  isArray: z.boolean().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const aliasCardTool: ToolDefinition<AliasCardData> = {
  type: "aliasCard",
  name: "Alias",
  description: "A named domain type that wraps an existing type, reusable as a field type",
  icon: Type,
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

  computeSize: () => computeStandardCardSize(0),

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
    const headerColor = element.data.color || aliasCardTool.color;

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
        text: `${element.data.aliasedType || "unknown"}${element.data.isArray ? "[]" : ""}`,
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
        .describe("The wrapped type (e.g. string, uuid, number, or another defined type name)"),
      isArray: z.boolean().optional().describe("True when the alias wraps a list of the type"),
      color: z.string().optional().describe("Optional header color hex code"),
      description: z
        .string()
        .optional()
        .describe("Optional plain-language description of the alias"),
    }),
    onCreate: (params, center: Point): CanvasElement<AliasCardData> => {
      const data: AliasCardData = {
        name: params.name || "Alias",
        aliasedType: params.type || "string",
        ...(params.isArray ? { isArray: true } : {}),
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
