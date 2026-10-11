import { Zap } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { getContrastTextColor } from "@/utils/color";
import { EventCardOptions } from "./EventCardOptions";
import { useCanvasStore } from "@/store";

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

  defaultSize: { width: 220, height: 88 },

  computeSize: (data) => {
    const fieldsCount = data.fields?.length || 0;
    const contentCount = Math.max(1, fieldsCount);
    // Header (32px) + fields (count * 28px) with zero padding above/below
    const height = 32 + contentCount * 28;
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
    const r = 8;
    const w = element.width;
    const h = element.height;
    const headerH = 32;

    // 1. Fill top header banner (rounded top corners, flat bottom) - single uniform fill!
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, headerH);
    g.lineTo(0, headerH);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Fill card body background (flat top, rounded bottom corners)
    g.moveTo(0, headerH);
    g.lineTo(w, headerH);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Highlight selected field: FULL-WIDTH edge-to-edge, NO side padding
    const selectedFieldIndex =
      context.selectedField?.elementId === element.id
        ? context.selectedField.fieldIndex
        : -1;

    const fieldsCount = element.data.fields?.length || 0;
    if (selectedFieldIndex >= 0 && selectedFieldIndex < fieldsCount) {
      const isLast = selectedFieldIndex === fieldsCount - 1;
      const highlightY = headerH + selectedFieldIndex * 28;
      const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

      if (isLast) {
        // Flat top, rounded bottom corners (radius 8)
        g.moveTo(0, highlightY);
        g.lineTo(w, highlightY);
        g.lineTo(w, h - r);
        g.arcTo(w, h, w - r, h, r);
        g.lineTo(r, h);
        g.arcTo(0, h, 0, h - r, r);
        g.closePath();
        g.fill({ color: sunkenColor });
      } else {
        // Full width rectangle spanning from x=0 to element.width
        g.rect(0, highlightY, w, 28);
        g.fill({ color: sunkenColor });
      }
    }

    // 4. Draw single uniform border stroke around entire card (after all fills)
    g.roundRect(0, 0, w, h, r);
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

    // Fields list: starts immediately at header bottom (y = 32), 28px height per row
    let currentY = 32;

    if (element.data.fields && element.data.fields.length > 0) {
      element.data.fields.forEach((field, idx) => {
        const isFieldSelected = idx === selectedFieldIndex;

        const fieldName = new Text({
          text: field.name,
          style: {
            fontSize: 12,
            fontWeight: isFieldSelected ? "bold" : "normal",
            fontFamily: '"Geist Mono", monospace',
            fill: isFieldSelected
              ? isDark ? 0xf4f4f5 : 0x09090b
              : isDark ? 0xe4e4e7 : 0x27272a,
          },
          resolution: context.textResolution,
        });
        fieldName.x = 12;
        fieldName.y = currentY + 7;
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
        typeLabel.y = currentY + 8;
        container.addChild(typeLabel);

        currentY += 28;
      });
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
      emptyHint.y = currentY + 7;
      container.addChild(emptyHint);
    }
  },

  onSubSelect: (element, localPoint) => {
    // Header area (y <= 32) is not a field
    if (localPoint.y <= 32) return null;
    const startY = 32;
    const rowHeight = 28;
    const index = Math.floor((localPoint.y - startY) / rowHeight);
    if (index >= 0 && index < (element.data.fields?.length || 0)) {
      return index;
    }
    return null;
  },

  onDeleteSubSelect: (element, fieldIndex) => {
    if (!element.data.fields || fieldIndex < 0 || fieldIndex >= element.data.fields.length) {
      return null;
    }
    const nextFields = element.data.fields.filter((_, i) => i !== fieldIndex);
    const nextData = { ...element.data, fields: nextFields };
    const nextSize = eventCardTool.computeSize ? eventCardTool.computeSize(nextData) : null;
    return {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    };
  },

  getInlineEditTarget: (element, localPoint) => {
    // 1. Double click on Header -> Edit Event Name
    if (localPoint.y <= 32) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: element.data.name || "Event",
        multiline: false,
        onCommit: (newValue) => {
          const trimmed = newValue.trim();
          if (trimmed && trimmed !== element.data.name) {
            useCanvasStore.getState().updateElement(element.id, {
              data: { ...element.data, name: trimmed },
            });
          }
        },
      };
    }

    // 2. Double click on Field Name (only the name, hold off on type for now)
    const startY = 32;
    const rowHeight = 28;
    const index = Math.floor((localPoint.y - startY) / rowHeight);
    if (index >= 0 && index < (element.data.fields?.length || 0)) {
      const field = element.data.fields[index];
      useCanvasStore.getState().setSelectedField({
        elementId: element.id,
        fieldIndex: index,
      });

      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 10,
          y: element.y + startY + index * rowHeight + 2,
          width: Math.max(80, element.width - 80),
          height: 24,
        },
        initialValue: field.name,
        multiline: false,
        onCommit: (newName) => {
          const trimmed = newName.trim();
          if (trimmed && trimmed !== field.name) {
            const nextFields = [...element.data.fields];
            nextFields[index] = { ...field, name: trimmed };
            useCanvasStore.getState().updateElement(element.id, {
              data: { ...element.data, fields: nextFields },
            });
          }
        },
      };
    }

    return null;
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
