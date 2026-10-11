import { Terminal } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { CommandCardOptions } from "./CommandCardOptions";
import {
  renderStandardCardTitle,
  CARD_CORNER_RADIUS,
} from "../common/cardLayout";
import { navigateSubSelect } from "@/utils/subSelection";

export const COMMAND_HEADER_HEIGHT = 32;
export const COMMAND_SECTION_HEADER_HEIGHT = 22;
export const COMMAND_ROW_HEIGHT = 28;
export const COMMAND_DEFAULT_WIDTH = 220;

export interface CommandField {
  name: string;
  type: string;
}

export interface CommandCardData {
  name: string;
  inputs?: CommandField[];
  responses?: CommandField[];
  color?: string;
  // Backward compatibility
  fields?: CommandField[];
}

export function getCommandInputs(data: CommandCardData): CommandField[] {
  if (Array.isArray(data.inputs)) return data.inputs;
  if (Array.isArray(data.fields)) return data.fields;
  return [];
}

export function getCommandResponses(data: CommandCardData): CommandField[] {
  if (Array.isArray(data.responses)) return data.responses;
  return [];
}

export function computeCommandCardSize(
  data: CommandCardData,
  customWidth = COMMAND_DEFAULT_WIDTH,
): { width: number; height: number } {
  const inputs = getCommandInputs(data);
  const responses = getCommandResponses(data);
  const inputsCount = Math.max(1, inputs.length);
  const responsesCount = Math.max(1, responses.length);
  const height =
    COMMAND_HEADER_HEIGHT +
    COMMAND_SECTION_HEADER_HEIGHT +
    inputsCount * COMMAND_ROW_HEIGHT +
    COMMAND_SECTION_HEADER_HEIGHT +
    responsesCount * COMMAND_ROW_HEIGHT;
  return { width: customWidth, height };
}

export const CommandCardSchema = z.object({
  name: z.string().default("CommandName"),
  inputs: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
      }),
    )
    .default([]),
  responses: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
      }),
    )
    .default([]),
  color: z.string().optional(),
});

export const commandCardTool: ToolDefinition<CommandCardData> = {
  type: "commandCard",
  name: "Command",
  description: "A Command representing an intent or action with inputs and response fields",
  icon: Terminal,
  color: "#2563eb",
  category: "modeling",

  schema: CommandCardSchema,
  createDefaultData: () => ({
    name: "NewCommand",
    inputs: [],
    responses: [],
    color: "#2563eb",
  }),

  // Minimum height with empty inputs and responses: 32 + 22 + 28 + 22 + 28 = 132
  defaultSize: { width: COMMAND_DEFAULT_WIDTH, height: 132 },

  computeSize: (data) => computeCommandCardSize(data),

  optionsBar: CommandCardOptions,

  render: (container, element, context) => {
    container.removeChildren();

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = element.data.color || commandCardTool.color;
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;

    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const inputsCount = Math.max(1, inputs.length);
    const responsesCount = Math.max(1, responses.length);

    const inputStartY = COMMAND_HEADER_HEIGHT + COMMAND_SECTION_HEADER_HEIGHT;
    const respHeaderY = inputStartY + inputsCount * COMMAND_ROW_HEIGHT;
    const respStartY = respHeaderY + COMMAND_SECTION_HEADER_HEIGHT;

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const sectionHeaderBg = isDark ? 0x27272a : 0xf4f4f5;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

    const isThisElement = context.selectedField?.elementId === element.id;
    const activeSection = context.selectedField?.sectionIndex ?? 0;
    const activeFieldIndex = isThisElement ? context.selectedField?.fieldIndex ?? -1 : -1;

    const g = new Graphics();

    // 1. Fill top header banner (rounded top corners, flat bottom)
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, COMMAND_HEADER_HEIGHT);
    g.lineTo(0, COMMAND_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Fill card body background (flat top, rounded bottom corners)
    g.moveTo(0, COMMAND_HEADER_HEIGHT);
    g.lineTo(w, COMMAND_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Fill Input Section header banner
    g.rect(0, COMMAND_HEADER_HEIGHT, w, COMMAND_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 4. Fill Response Section header banner
    g.rect(0, respHeaderY, w, COMMAND_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 5. Sunken highlight for active selected field
    if (isThisElement && activeFieldIndex >= 0) {
      if (activeSection === 0 && activeFieldIndex < inputs.length) {
        const highlightY = inputStartY + activeFieldIndex * COMMAND_ROW_HEIGHT;
        g.rect(0, highlightY, w, COMMAND_ROW_HEIGHT);
        g.fill({ color: sunkenColor });
      } else if (activeSection === 1 && activeFieldIndex < responses.length) {
        const highlightY = respStartY + activeFieldIndex * COMMAND_ROW_HEIGHT;
        const isLastRow = activeFieldIndex === responsesCount - 1;
        if (isLastRow) {
          // Flat top, rounded bottom corners
          g.moveTo(0, highlightY);
          g.lineTo(w, highlightY);
          g.lineTo(w, h - r);
          g.arcTo(w, h, w - r, h, r);
          g.lineTo(r, h);
          g.arcTo(0, h, 0, h - r, r);
          g.closePath();
          g.fill({ color: sunkenColor });
        } else {
          g.rect(0, highlightY, w, COMMAND_ROW_HEIGHT);
          g.fill({ color: sunkenColor });
        }
      }
    }

    // 6. Draw outer crisp border stroke
    g.roundRect(0, 0, w, h, r);
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });

    container.addChild(g);

    // 7. Render Header Title
    renderStandardCardTitle(
      container,
      element.data.name || "Command",
      headerColor,
      context.textResolution,
    );

    if (typeof document !== "undefined") {
      // 8. Render Input Section Header Label
      const inputSectionLabel = new Text({
        text: "INPUT",
        style: {
          fontSize: 10,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xa1a1aa : 0x71717a,
        },
        resolution: context.textResolution,
      });
      inputSectionLabel.x = 12;
      inputSectionLabel.y = COMMAND_HEADER_HEIGHT + 4;
      container.addChild(inputSectionLabel);

      // 9. Render Input Fields
      if (inputs.length > 0) {
        inputs.forEach((field, idx) => {
          const rowY = inputStartY + idx * COMMAND_ROW_HEIGHT;
          const isFieldSelected = isThisElement && activeSection === 0 && activeFieldIndex === idx;

          const fieldName = new Text({
            text: field.name,
            style: {
              fontSize: 12,
              fontWeight: isFieldSelected ? "bold" : "normal",
              fontFamily: '"Geist Mono", monospace',
              fill: isFieldSelected
                ? isDark
                  ? 0xf4f4f5
                  : 0x09090b
                : isDark
                  ? 0xe4e4e7
                  : 0x27272a,
            },
            resolution: context.textResolution,
          });
          fieldName.x = 12;
          fieldName.y = rowY + 7;
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
          typeLabel.x = w - typeLabel.width - 12;
          typeLabel.y = rowY + 8;
          container.addChild(typeLabel);
        });
      } else {
        const emptyInputs = new Text({
          text: "(no inputs)",
          style: {
            fontSize: 11,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0x71717a : 0xa1a1aa,
          },
          resolution: context.textResolution,
        });
        emptyInputs.x = 12;
        emptyInputs.y = inputStartY + 7;
        container.addChild(emptyInputs);
      }

      // 10. Render Response Section Header Label
      const respSectionLabel = new Text({
        text: "RESPONSE",
        style: {
          fontSize: 10,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xa1a1aa : 0x71717a,
        },
        resolution: context.textResolution,
      });
      respSectionLabel.x = 12;
      respSectionLabel.y = respHeaderY + 4;
      container.addChild(respSectionLabel);

      // 11. Render Response Fields
      if (responses.length > 0) {
        responses.forEach((field, idx) => {
          const rowY = respStartY + idx * COMMAND_ROW_HEIGHT;
          const isFieldSelected = isThisElement && activeSection === 1 && activeFieldIndex === idx;

          const fieldName = new Text({
            text: field.name,
            style: {
              fontSize: 12,
              fontWeight: isFieldSelected ? "bold" : "normal",
              fontFamily: '"Geist Mono", monospace',
              fill: isFieldSelected
                ? isDark
                  ? 0xf4f4f5
                  : 0x09090b
                : isDark
                  ? 0xe4e4e7
                  : 0x27272a,
            },
            resolution: context.textResolution,
          });
          fieldName.x = 12;
          fieldName.y = rowY + 7;
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
          typeLabel.x = w - typeLabel.width - 12;
          typeLabel.y = rowY + 8;
          container.addChild(typeLabel);
        });
      } else {
        const emptyResponses = new Text({
          text: "(no responses)",
          style: {
            fontSize: 11,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0x71717a : 0xa1a1aa,
          },
          resolution: context.textResolution,
        });
        emptyResponses.x = 12;
        emptyResponses.y = respStartY + 7;
        container.addChild(emptyResponses);
      }
    }
  },

  onSubSelect: (element, localPoint): SelectedField | null => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const inputsCount = Math.max(1, inputs.length);
    const inputStartY = COMMAND_HEADER_HEIGHT + COMMAND_SECTION_HEADER_HEIGHT;
    const inputEndY = inputStartY + inputsCount * COMMAND_ROW_HEIGHT;

    // Check Input section rows
    if (localPoint.y >= inputStartY && localPoint.y < inputEndY) {
      if (inputs.length === 0) return null;
      const index = Math.floor((localPoint.y - inputStartY) / COMMAND_ROW_HEIGHT);
      if (index >= 0 && index < inputs.length) {
        return {
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "inputs",
          fieldIndex: index,
        };
      }
      return null;
    }

    // Check Response section rows
    const respHeaderY = inputEndY;
    const respStartY = respHeaderY + COMMAND_SECTION_HEADER_HEIGHT;
    const responsesCount = Math.max(1, responses.length);
    const respEndY = respStartY + responsesCount * COMMAND_ROW_HEIGHT;

    if (localPoint.y >= respStartY && localPoint.y < respEndY) {
      if (responses.length === 0) return null;
      const index = Math.floor((localPoint.y - respStartY) / COMMAND_ROW_HEIGHT);
      if (index >= 0 && index < responses.length) {
        return {
          elementId: element.id,
          sectionIndex: 1,
          sectionId: "responses",
          fieldIndex: index,
        };
      }
      return null;
    }

    return null;
  },

  onDeleteSubSelect: (element, fieldIndex, sectionIndex = 0) => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);

    let nextInputs = [...inputs];
    let nextResponses = [...responses];

    if (sectionIndex === 1) {
      if (fieldIndex < 0 || fieldIndex >= responses.length) return null;
      nextResponses = responses.filter((_, i) => i !== fieldIndex);
    } else {
      if (fieldIndex < 0 || fieldIndex >= inputs.length) return null;
      nextInputs = inputs.filter((_, i) => i !== fieldIndex);
    }

    const nextData: CommandCardData = {
      ...element.data,
      inputs: nextInputs,
      responses: nextResponses,
    };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;
    return {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    };
  },

  onUpdateSubSelectType: (element, field, type) => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const trimmed = type.trim();
    if (!trimmed) return null;

    if (field.sectionIndex === 1) {
      if (field.fieldIndex < 0 || field.fieldIndex >= responses.length) return null;
      const nextResponses = [...responses];
      nextResponses[field.fieldIndex] = { ...responses[field.fieldIndex], type: trimmed };
      return {
        data: { ...element.data, inputs, responses: nextResponses },
      };
    } else {
      if (field.fieldIndex < 0 || field.fieldIndex >= inputs.length) return null;
      const nextInputs = [...inputs];
      nextInputs[field.fieldIndex] = { ...inputs[field.fieldIndex], type: trimmed };
      return {
        data: { ...element.data, inputs: nextInputs, responses },
      };
    }
  },

  getSelectedFieldItem: (element, field) => {
    if (field.sectionIndex === 1) {
      const responses = getCommandResponses(element.data);
      return responses[field.fieldIndex] ?? null;
    }
    const inputs = getCommandInputs(element.data);
    return inputs[field.fieldIndex] ?? null;
  },

  getSubSelectSections: (element) => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    return [
      {
        id: "inputs",
        name: "inputs",
        count: inputs.length,
      },
      {
        id: "responses",
        name: "responses",
        count: responses.length,
      },
    ];
  },

  getInlineEditTarget: (element, localPoint) => {
    // 1. Double click on Header -> Edit Command Name
    if (localPoint.y <= COMMAND_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: element.data?.name || "Command",
        multiline: false,
        onCommit: (newValue) => {
          const trimmed = newValue.trim();
          if (trimmed && trimmed !== element.data?.name) {
            useCanvasStore.getState().updateElement(element.id, {
              data: { ...element.data, name: trimmed },
            });
          }
        },
      };
    }

    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const inputsCount = Math.max(1, inputs.length);
    const inputStartY = COMMAND_HEADER_HEIGHT + COMMAND_SECTION_HEADER_HEIGHT;
    const inputEndY = inputStartY + inputsCount * COMMAND_ROW_HEIGHT;

    // 2. Double click on Input row
    if (localPoint.y >= inputStartY && localPoint.y < inputEndY) {
      const index = Math.floor((localPoint.y - inputStartY) / COMMAND_ROW_HEIGHT);
      if (index >= 0 && index < inputs.length) {
        const inputField = inputs[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "inputs",
          fieldIndex: index,
        });

        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 10,
            y: element.y + inputStartY + index * COMMAND_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 80),
            height: 24,
          },
          initialValue: inputField.name,
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && trimmed !== inputField.name) {
              const nextInputs = [...inputs];
              nextInputs[index] = { ...inputField, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, inputs: nextInputs, responses },
              });
            }
          },
        };
      }
      return null;
    }

    // 3. Double click on Response row
    const respHeaderY = inputEndY;
    const respStartY = respHeaderY + COMMAND_SECTION_HEADER_HEIGHT;
    const responsesCount = Math.max(1, responses.length);
    const respEndY = respStartY + responsesCount * COMMAND_ROW_HEIGHT;

    if (localPoint.y >= respStartY && localPoint.y < respEndY) {
      const index = Math.floor((localPoint.y - respStartY) / COMMAND_ROW_HEIGHT);
      if (index >= 0 && index < responses.length) {
        const respField = responses[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 1,
          sectionId: "responses",
          fieldIndex: index,
        });

        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 10,
            y: element.y + respStartY + index * COMMAND_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 80),
            height: 24,
          },
          initialValue: respField.name,
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && trimmed !== respField.name) {
              const nextResponses = [...responses];
              nextResponses[index] = { ...respField, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, inputs, responses: nextResponses },
              });
            }
          },
        };
      }
      return null;
    }

    return null;
  },

  ai: {
    toolName: "create_command_card",
    description: "Create a domain Command card in the Event Model with inputs and response fields",
    parameters: z.object({
      name: z.string().describe("PascalCase command name (e.g. PlaceOrder, RegisterUser)"),
      inputs: z
        .array(
          z.object({
            name: z.string().describe("Input field name in camelCase"),
            type: z.string().describe("Field data type (e.g. string, number, boolean)"),
          }),
        )
        .optional()
        .describe("Input parameters / payload carried by the command"),
      responses: z
        .array(
          z.object({
            name: z.string().describe("Response field name in camelCase"),
            type: z.string().describe("Field data type (e.g. string, number, boolean)"),
          }),
        )
        .optional()
        .describe("Return / response fields produced by the command"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name in camelCase"),
            type: z.string().describe("Field data type (e.g. string, number, boolean)"),
          }),
        )
        .optional()
        .describe("Legacy flat fields list (treated as inputs)"),
      color: z.string().optional().describe("Optional header color hex code"),
    }),
    onCreate: (params, center: Point): CanvasElement<CommandCardData> => {
      const inputs = params.inputs || params.fields || [];
      const responses = params.responses || [];
      const data: CommandCardData = {
        name: params.name || "Command",
        inputs,
        responses,
        color: params.color || commandCardTool.color,
      };
      const size = commandCardTool.computeSize!(data);
      return {
        id: `command-${nanoid(6)}`,
        type: "commandCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
