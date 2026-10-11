import { StickyNote as StickyIcon } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";

export interface StickyNoteData {
  text: string;
  color?: string;
}

export const StickyNoteSchema = z.object({
  text: z.string().default("Sticky Note"),
  color: z.string().optional(),
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

  render: (container, element, context) => {
    container.removeChildren();

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const bgHex = isDark ? 0x78350f : 0xfef08a; // Dark amber vs pastel yellow
    const textHex = isDark ? 0xfef3c7 : 0x713f12;

    const g = new Graphics();
    g.roundRect(0, 0, element.width, element.height, 8);
    g.fill({ color: bgHex, alpha: 0.95 });

    if (isSelected) {
      g.stroke({ color: 0x3b82f6, width: 2 });
    } else {
      g.stroke({ color: isDark ? 0x92400e : 0xfde047, width: 1 });
    }
    container.addChild(g);

    const text = new Text({
      text: element.data.text || "Note",
      style: {
        fontSize: 13,
        fontFamily: "Geist Mono, monospace",
        fill: textHex,
        wordWrap: true,
        wordWrapWidth: Math.max(element.width - 24, 40),
      },
    });
    text.x = 12;
    text.y = 12;
    container.addChild(text);
  },

  ai: {
    toolName: "create_sticky_note",
    description: "Create a sticky note annotation on the canvas",
    parameters: z.object({
      text: z.string().describe("Content of the note"),
      color: z.string().optional().describe("Optional hex color code"),
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
        },
      };
    },
  },
};
