import { Boxes } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, type Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, InlineEditState, Point } from "@/types";
import { useCanvasStore } from "@/store";
import { getContrastTextColor, hexToNumber, resolveHeaderColor } from "@/utils/color";
import { isSameIdentifier, toDisplayName } from "@/utils/naming";
import { MONOSPACE_ADVANCE_RATIO } from "@/utils/textWrap";
import {
  GROUP_DEFAULT_HEIGHT,
  GROUP_DEFAULT_WIDTH,
  GROUP_LABEL_HEIGHT,
  GROUP_TYPE,
  getGroupChildren,
  type GroupData,
} from "./layout";

export type { GroupData } from "./layout";

export const GroupCardSchema = z.object({
  name: z.string().default("Group"),
  color: z.string().optional(),
  description: z.string().optional(),
});

/** Height of the small name chip drawn in the group's top band. */
const GROUP_CHIP_HEIGHT = 18;

/**
 * Truncates monospace text with an ellipsis so it fits within `maxWidth` pixels.
 * Geist Mono has a fixed glyph advance, so the width is predictable without a
 * canvas — the same assumption the app's wrapping helpers rely on.
 */
function truncateMonospace(text: string, maxWidth: number, fontSize: number): string {
  const charWidth = Math.max(1, fontSize * MONOSPACE_ADVANCE_RATIO);
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export const groupCardTool: ToolDefinition<GroupData> = {
  type: GROUP_TYPE,
  name: "Group",
  description:
    "A Group is a compact frame that clusters related Object, Enum, Alias or Service cards (usually inside a Domain)",
  icon: Boxes,
  color: "#0d9488",
  category: "modeling",
  // Auto-fits its children, so edge-resize is disabled.
  resizable: false,

  schema: GroupCardSchema,
  createDefaultData: () => ({ name: "Group", color: "#0d9488" }),

  defaultSize: { width: GROUP_DEFAULT_WIDTH, height: GROUP_DEFAULT_HEIGHT },

  render: (container: Container, element, context) => {
    container.removeChildren();

    const isDark = context.theme === "dark";
    const isSelected = context.isSelected;
    const w = element.width;
    const h = element.height;
    const color = element.data.color || groupCardTool.color;

    const g = new Graphics();
    // A soft wash + a solid (not dashed) border keeps a Group visually lighter
    // than a Domain while still reading as a distinct enclosure.
    g.roundRect(0, 0, w, h, 8);
    g.fill({ color: hexToNumber(color), alpha: isDark ? 0.09 : 0.05 });
    g.roundRect(0, 0, w, h, 8);
    g.stroke({ color: isSelected ? 0x3b82f6 : color, width: isSelected ? 2 : 1.5 });
    container.addChild(g);

    if (typeof document === "undefined") return;

    // Name chip: a small filled tag at the top-left that reads like a folder tab.
    const chipColor = resolveHeaderColor(color, isDark);
    const maxChipW = Math.max(40, w - 20);
    const chipText = new Text({
      text: truncateMonospace(toDisplayName(element.data.name) || "Group", maxChipW - 16, 11),
      style: {
        fontSize: 11,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: getContrastTextColor(chipColor),
      },
      resolution: context.textResolution,
    });
    const chipW = Math.min(maxChipW, chipText.width + 16);
    const chipG = new Graphics();
    chipG.roundRect(10, (GROUP_LABEL_HEIGHT - GROUP_CHIP_HEIGHT) / 2, chipW, GROUP_CHIP_HEIGHT, 4);
    chipG.fill({ color: hexToNumber(chipColor) });
    container.addChild(chipG);
    chipText.x = 18;
    chipText.y = (GROUP_LABEL_HEIGHT - chipText.height) / 2;
    container.addChild(chipText);

    const children = getGroupChildren(useCanvasStore.getState().elements, element.id);

    if (children.length === 0) {
      const hint = new Text({
        text: "Drop objects, enums, aliases or services here",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x52525b : 0xc4c4c8,
          wordWrap: true,
          wordWrapWidth: Math.max(40, w - 24),
        },
        resolution: context.textResolution,
      });
      hint.x = 12;
      hint.y = GROUP_LABEL_HEIGHT + 6;
      container.addChild(hint);
    } else {
      const count = new Text({
        text: `${children.length}`,
        style: {
          fontSize: 10,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x52525b : 0xb4b4b8,
        },
        resolution: context.textResolution,
      });
      count.x = w - count.width - 12;
      count.y = (GROUP_LABEL_HEIGHT - count.height) / 2;
      container.addChild(count);
    }
  },

  getInlineEditTarget: (element, localPoint): InlineEditState | null => {
    if (localPoint.y > GROUP_LABEL_HEIGHT) return null;
    return {
      elementId: element.id,
      worldBounds: {
        x: element.x + 8,
        y: element.y + 4,
        width: Math.max(80, element.width - 16),
        height: 22,
      },
      initialValue: toDisplayName(element.data?.name) || "Group",
      multiline: false,
      onCommit: (newValue) => {
        const trimmed = newValue.trim();
        if (trimmed && !isSameIdentifier(trimmed, element.data?.name)) {
          useCanvasStore.getState().updateElement(element.id, {
            data: { ...element.data, name: trimmed },
          });
        }
      },
    };
  },

  ai: {
    toolName: "create_group_card",
    description:
      "Create a Group — a compact frame clustering reusable definitions (Object/Enum/Alias and/or Services) inside a Domain. " +
      "After creating it, place eligible cards in it via `group`.",
    parameters: z.object({
      name: z
        .string()
        .describe(
          "PascalCase group name (e.g. MoneyTypes, PaymentServices)",
        ),
      color: z.string().optional().describe("Optional hex color"),
      description: z
        .string()
        .optional()
        .describe("Description of what the group clusters"),
    }),
    onCreate: (params, center: Point): CanvasElement<GroupData> => {
      const width = GROUP_DEFAULT_WIDTH;
      const height = GROUP_DEFAULT_HEIGHT;
      return {
        id: `group-${nanoid(6)}`,
        type: GROUP_TYPE,
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
        width,
        height,
        data: {
          name: params.name || "Group",
          color: params.color || groupCardTool.color,
          ...(params.description ? { description: params.description } : {}),
        },
      };
    },
  },
};
