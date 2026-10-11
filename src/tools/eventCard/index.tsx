import { Zap } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";

export interface EventField {
  name: string;
  type: string;
}

export interface EventCardData {
  name: string;
  fields: EventField[];
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
  }),

  defaultSize: { width: 220, height: 120 },

  computeSize: (data) => {
    const fieldsCount = data.fields?.length || 0;
    const height = Math.max(90, 52 + fieldsCount * 24 + 12);
    return { width: 220, height };
  },

  render: (container, element, context) => {
    container.removeChildren();

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const cardBg = isDark ? 0x18181b : 0xffffff;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;

    const g = new Graphics();
    // Background
    g.roundRect(0, 0, element.width, element.height, 8);
    g.fill({ color: cardBg });
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });

    // Top Orange Header Bar
    g.roundRect(0, 0, element.width, 36, 8);
    g.fill({ color: 0xf97316 });

    // Cut off bottom round corners of header
    g.rect(0, 24, element.width, 12);
    g.fill({ color: 0xf97316 });

    container.addChild(g);

    // Header Title
    const title = new Text({
      text: element.data.name || "Event",
      style: {
        fontSize: 13,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: 0xffffff,
      },
      resolution: context.textResolution,
    });
    title.x = 12;
    title.y = 9;
    container.addChild(title);

    // Fields list
    let currentY = 46;
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

        currentY += 24;
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
    }),
    onCreate: (params, center: Point): CanvasElement<EventCardData> => {
      const fields = params.fields || [
        { name: "id", type: "string" },
        { name: "timestamp", type: "datetime" },
      ];
      const data: EventCardData = {
        name: params.name || "Event",
        fields,
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
