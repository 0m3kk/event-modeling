import { StickyNote as StickyIcon } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { getContrastTextColor } from "@/utils/color";
import {
  drawInfoBadge,
  getHeaderDescBadgeCenter,
  DESC_HEADER_BADGE_RADIUS,
  DESC_HIT_HALF,
} from "../common/cardLayout";
import { beginDescZones, addDescZone, hitDescZone } from "../common/descZones";
import { StickyNoteOptions } from "./StickyNoteOptions";
import { useCanvasStore } from "@/store";

export interface StickyNoteData {
  text: string;
  color?: string;
  description?: string;
}

export const StickyNoteSchema = z.object({
  text: z.string().default("Sticky Note"),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const stickyNoteTool: ToolDefinition<StickyNoteData> = {
  type: "stickyNote",
  name: "Sticky Note",
  description: "A quick note or annotation on the canvas",
  icon: StickyIcon,
  color: "#f59e0b",
  category: "annotation",

  schema: StickyNoteSchema,
  createDefaultData: () => ({
    text: "Note",
    color: "#fef08a",
  }),

  defaultSize: { width: 180, height: 140 },

  optionsBar: StickyNoteOptions,

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const noteColor = element.data.color || "#fef08a";
    const textColor = getContrastTextColor(noteColor);

    const g = new Graphics();
    g.roundRect(0, 0, element.width, element.height, 8);
    g.fill({ color: noteColor, alpha: isDark ? 0.9 : 0.95 });

    if (isSelected) {
      g.stroke({ color: 0x3b82f6, width: 2 });
    } else {
      g.stroke({ color: isDark ? 0x3f3f46 : 0x000000, alpha: 0.15, width: 1 });
    }
    container.addChild(g);

    const text = new Text({
      text: element.data.text || "Note",
      style: {
        fontSize: 13,
        fontFamily: '"Geist Mono", monospace',
        fill: textColor,
        wordWrap: true,
        wordWrapWidth: Math.max(element.width - 24, 40),
      },
      resolution: context.textResolution,
    });
    text.x = 12;
    text.y = 12;
    container.addChild(text);

    // ⓘ description badge (top-right). Sticky notes are light, so it uses a
    // slate glyph instead of the white banner badge.
    if (element.data.description || isSelected) {
      const center = getHeaderDescBadgeCenter(element.width, Boolean(element.referenceId));
      const badgeG = new Graphics();
      drawInfoBadge(badgeG, container, center.x, center.y, {
        radius: DESC_HEADER_BADGE_RADIUS,
        stroke: isDark ? 0x52525b : 0x94a3b8,
        fill: isDark ? 0xd4d4d8 : 0x475569,
        fontSize: 9,
        bold: true,
        alpha: element.data.description ? 1 : 0.5,
        textResolution: context.textResolution,
      });
      container.addChild(badgeG);

      if (element.data.description) {
        addDescZone(element.id, {
          elementId: element.id,
          text: element.data.description,
          iconBounds: {
            x: center.x - DESC_HIT_HALF,
            y: center.y - DESC_HIT_HALF,
            width: DESC_HIT_HALF * 2,
            height: DESC_HIT_HALF * 2,
          },
        });
      }
    }
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  getInlineEditTarget: (element) => {
    return {
      elementId: element.id,
      worldBounds: {
        x: element.x + 8,
        y: element.y + 8,
        width: element.width - 16,
        height: element.height - 16,
      },
      initialValue: element.data.text || "",
      multiline: true,
      onCommit: (newText) => {
        useCanvasStore.getState().updateElement(element.id, {
          data: { ...element.data, text: newText },
        });
      },
    };
  },

  ai: {
    toolName: "create_sticky_note",
    description: "Create a sticky note annotation on the canvas",
    parameters: z.object({
      text: z.string().describe("Content of the note"),
      color: z.string().optional().describe("Optional hex color code"),
      description: z
        .string()
        .optional()
        .describe("Optional longer description shown on the ⓘ badge"),
    }),
    onCreate: (params, center: Point): CanvasElement<StickyNoteData> => {
      return {
        id: `note-${nanoid(6)}`,
        type: "stickyNote",
        x: Math.round(center.x - 90),
        y: Math.round(center.y - 70),
        width: 180,
        height: 140,
        data: {
          text: params.text || "Note",
          color: params.color || "#fef08a",
          ...(params.description ? { description: params.description } : {}),
        },
      };
    },
  },
};
