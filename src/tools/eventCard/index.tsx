import { Zap } from "lucide-react";
import { z } from "zod";
import { Graphics } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point } from "@/types";
import { EventCardOptions } from "./EventCardOptions";
import {
  computeStandardCardSize,
  drawStandardCardFrame,
  renderStandardCardTitle,
  renderStandardCardFields,
  getStandardCardSubSelect,
  navigateStandardCardSubSelect,
  getStandardCardInlineEditTarget,
  CARD_DEFAULT_WIDTH,
} from "../common/cardLayout";

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

  defaultSize: { width: CARD_DEFAULT_WIDTH, height: 88 },

  computeSize: (data) => computeStandardCardSize(data.fields?.length || 0),

  optionsBar: EventCardOptions,

  render: (container, element, context) => {
    container.removeChildren();

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = element.data.color || eventCardTool.color;

    const isSectionActive =
      !context.selectedField?.sectionIndex ||
      context.selectedField.sectionIndex === 0;

    const selectedFieldIndex =
      context.selectedField?.elementId === element.id && isSectionActive
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
      element.data.name || "Event",
      headerColor,
      context.textResolution,
    );

    // 3. Render Field rows (Geist Mono, edge-to-edge layout)
    renderStandardCardFields(container, {
      fields: element.data.fields,
      selectedFieldIndex,
      width: element.width,
      isDark,
      textResolution: context.textResolution,
    });
  },

  onSubSelect: (element, localPoint) =>
    getStandardCardSubSelect(localPoint, element.data.fields?.length || 0),

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
    getStandardCardInlineEditTarget(element, localPoint, "Event"),

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
