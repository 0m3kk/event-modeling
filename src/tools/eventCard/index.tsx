import { Zap } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { getContrastTextColor } from "@/utils/color";
import { EventCardOptions } from "./EventCardOptions";

export interface EventField {
  name: string;
  type: string;
}

export interface EventCardData {
  name: string;
  fields: EventField[];
  color?: string;
}

export const EventCardSchema = z.object({
  name: z.string().default("EventName"),
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

export const eventCardTool: ToolDefinition<EventCardData> = {
  type: "eventCard",
  name: "Event",
  description: "A Domain Event representing something that happened in the system",
  icon: Zap,
  color: "#f97316",
  category: "modeling",

  schema: EventCardSchema,
  createDefaultData: () => ({
    name: "NewEvent",
    fields: [
      { name: "id", type: "string" },
      { name: "timestamp", type: "datetime" },
    ],
    color: "#f97316",
  }),

  defaultSize: { width: 220, height: 96 },

  computeSize: (data) => {
    const fieldsCount = data.fields?.length || 0;
    const contentCount = Math.max(1, fieldsCount);
    // Header (32px) + top padding (10px) + fields (count * 22px) + bottom padding (10px)
    const height = 52 + contentCount * 22;
    return { width: 220, height };
  },

  optionsBar: EventCardOptions,

  render: (container, element, context) => {
    container.removeChildren();

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const cardBg = isDark ? 0x18181b : 0xffffff;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const headerColor = element.data.color || eventCardTool.color;

    const g = new Graphics();

    // 1. Fill entire card background
    g.roundRect(0, 0, element.width, element.height, 8);
    g.fill({ color: cardBg });

    // 2. Fill top header banner (rounded top corners, straight bottom)
    g.roundRect(0, 0, element.width, 32, 8);
    g.fill({ color: headerColor });
    g.rect(0, 20, element.width, 12);
    g.fill({ color: headerColor });

    // 3. Draw single uniform border stroke around entire card (after fills so border is consistent)
    g.roundRect(0, 0, element.width, element.height, 8);
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });

    container.addChild(g);

    // Header Title (contrast-aware text, vertically centered in 32px header)
    const title = new Text({
      text: element.data.name || "Event",
      style: {
        fontSize: 13,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: getContrastTextColor(headerColor),
      },
      resolution: context.textResolution,
    });
    title.x = 12;
    title.y = 8;
    container.addChild(title);

    // Fields list (symmetric 10px padding from header bottom and card bottom)
    let currentY = 42;
    if (element.data.fields && element.data.fields.length > 0) {
      for (const field of element.data.fields) {
        const fieldName = new Text({
          text: field.name,
          style: {
            fontSize: 12,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0xe4e4e7 : 0x27272a,
          },
          resolution: context.textResolution,
        });
        fieldName.x = 12;
        fieldName.y = currentY;
        container.addChild(fieldName);

        const typeLabel = new Text({
          text: field.type,
          style: {
            fontSize: 11,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0xa1a1aa : 0x71717a,
          },
          resolution: context.textResolution,
        });
        typeLabel.x = element.width - typeLabel.width - 12;
        typeLabel.y = currentY + 1;
        container.addChild(typeLabel);

        currentY += 22;
      }
    } else {
      const emptyHint = new Text({
        text: "(no fields)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      emptyHint.x = 12;
      emptyHint.y = currentY;
      container.addChild(emptyHint);
    }
  },

  ai: {
    toolName: "create_event_card",
    description: "Create a domain Event card in the Event Model",
    parameters: z.object({
      name: z.string().describe("PascalCase event name (e.g. OrderPlaced, ItemAdded)"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name in camelCase"),
            type: z.string().describe("Field data type (e.g. string, number, boolean)"),
          }),
        )
        .optional()
        .describe("Payload fields carried by the event"),
      color: z.string().optional().describe("Optional header color hex code"),
    }),
    onCreate: (params, center: Point): CanvasElement<EventCardData> => {
      const fields = params.fields || [
        { name: "id", type: "string" },
        { name: "timestamp", type: "datetime" },
      ];
      const data: EventCardData = {
        name: params.name || "Event",
        fields,
        color: params.color || eventCardTool.color,
      };
      const size = eventCardTool.computeSize!(data);
      return {
        id: `event-${nanoid(6)}`,
        type: "eventCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
