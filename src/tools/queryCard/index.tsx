import { Search } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { QueryCardOptions } from "./QueryCardOptions";
import {
  renderStandardCardTitle,
  renderHeaderDescBadge,
  drawInfoBadge,
  CARD_CORNER_RADIUS,
  DESC_HIT_HALF,
  DESC_ROW_BADGE_GAP,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { isSameIdentifier, toDisplayName, toDisplayType } from "@/utils/naming";
import { beginDescZones, addDescZone, hitDescZone } from "../common/descZones";
import { validateFieldTypes } from "../common/typeValidation";

export const QUERY_HEADER_HEIGHT = 32;
export const QUERY_SECTION_HEADER_HEIGHT = 22;
export const QUERY_ROW_HEIGHT = 28;
export const QUERY_DEFAULT_WIDTH = 220;

export interface QueryField {
  name: string;
  type: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
}

export interface QueryCardData {
  name: string;
  params?: QueryField[];
  responses?: QueryField[];
  color?: string;
  description?: string;
}

export function getQueryParams(data: QueryCardData): QueryField[] {
  if (Array.isArray(data.params)) return data.params;
  return [];
}

export function getQueryResponses(data: QueryCardData): QueryField[] {
  if (Array.isArray(data.responses)) return data.responses;
  return [];
}

export function computeQueryCardSize(
  data: QueryCardData,
  customWidth = QUERY_DEFAULT_WIDTH,
): { width: number; height: number } {
  const params = getQueryParams(data);
  const responses = getQueryResponses(data);
  const paramsCount = Math.max(1, params.length);
  const responsesCount = Math.max(1, responses.length);
  const height =
    QUERY_HEADER_HEIGHT +
    QUERY_SECTION_HEADER_HEIGHT +
    paramsCount * QUERY_ROW_HEIGHT +
    QUERY_SECTION_HEADER_HEIGHT +
    responsesCount * QUERY_ROW_HEIGHT;
  return { width: customWidth, height };
}

/**
 * Draws a Query row's ⓘ badge just left of its type label and records the
 * hover hit box (only when the row carries a description).
 */
function renderQueryRowDescBadge(
  container: Container,
  elementId: string,
  field: QueryField,
  sectionIndex: number,
  fieldIndex: number,
  typeLabelX: number,
  rowY: number,
  textResolution: number,
): void {
  const badgeCx = typeLabelX - DESC_ROW_BADGE_GAP;
  const badgeCy = rowY + QUERY_ROW_HEIGHT / 2;
  const badgeG = new Graphics();
  drawInfoBadge(badgeG, container, badgeCx, badgeCy, {
    radius: 6,
    stroke: 0x94a3b8,
    fill: 0x64748b,
    fontSize: 7,
    alpha: field.description ? 1 : 0.5,
    textResolution,
  });
  container.addChild(badgeG);

  if (field.description) {
    addDescZone(elementId, {
      elementId,
      fieldIndex,
      sectionIndex,
      text: field.description,
      iconBounds: {
        x: badgeCx - DESC_HIT_HALF,
        y: badgeCy - DESC_HIT_HALF,
        width: DESC_HIT_HALF * 2,
        height: DESC_HIT_HALF * 2,
      },
    });
  }
}

export const QueryCardSchema = z.object({
  name: z.string().default("QueryName"),
  params: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        isArray: z.boolean().optional(),
        isRequired: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  responses: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        isArray: z.boolean().optional(),
        isRequired: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const queryCardTool: ToolDefinition<QueryCardData> = {
  type: "queryCard",
  name: "Query",
  description: "A Query representing a read/intent with parameter and response fields",
  icon: Search,
  color: "#16a34a",
  category: "modeling",

  schema: QueryCardSchema,
  createDefaultData: () => ({
    name: "NewQuery",
    params: [],
    responses: [],
    color: "#16a34a",
  }),

  // Minimum height with empty params and responses: 32 + 22 + 28 + 22 + 28 = 132
  defaultSize: { width: QUERY_DEFAULT_WIDTH, height: 132 },

  computeSize: (data) => computeQueryCardSize(data),

  optionsBar: QueryCardOptions,

  validateData: (data, context) => ({
    data,
    issues: [
      ...validateFieldTypes(getQueryParams(data), "params", context.elements ?? []),
      ...validateFieldTypes(getQueryResponses(data), "responses", context.elements ?? []),
    ],
  }),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || queryCardTool.color, isDark);
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;

    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    const paramsCount = Math.max(1, params.length);
    const responsesCount = Math.max(1, responses.length);

    const paramStartY = QUERY_HEADER_HEIGHT + QUERY_SECTION_HEADER_HEIGHT;
    const respHeaderY = paramStartY + paramsCount * QUERY_ROW_HEIGHT;
    const respStartY = respHeaderY + QUERY_SECTION_HEADER_HEIGHT;

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
    g.lineTo(w, QUERY_HEADER_HEIGHT);
    g.lineTo(0, QUERY_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Fill card body background (flat top, rounded bottom corners)
    g.moveTo(0, QUERY_HEADER_HEIGHT);
    g.lineTo(w, QUERY_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Fill Param Section header banner
    g.rect(0, QUERY_HEADER_HEIGHT, w, QUERY_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 4. Fill Response Section header banner
    g.rect(0, respHeaderY, w, QUERY_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 5. Sunken highlight for active selected field
    if (isThisElement && activeFieldIndex >= 0) {
      if (activeSection === 0 && activeFieldIndex < params.length) {
        const highlightY = paramStartY + activeFieldIndex * QUERY_ROW_HEIGHT;
        g.rect(0, highlightY, w, QUERY_ROW_HEIGHT);
        g.fill({ color: sunkenColor });
      } else if (activeSection === 1 && activeFieldIndex < responses.length) {
        const highlightY = respStartY + activeFieldIndex * QUERY_ROW_HEIGHT;
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
          g.rect(0, highlightY, w, QUERY_ROW_HEIGHT);
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
      element.data.name || "Query",
      headerColor,
      context.textResolution,
    );

    // 7b. Header ⓘ description badge (shows when present or selected)
    renderHeaderDescBadge(container, {
      elementId: element.id,
      width: w,
      isDark,
      isSelected,
      hasDescription: Boolean(element.data.description),
      hasReference: Boolean(element.referenceId),
      text: element.data.description,
      textResolution: context.textResolution,
    });

    if (typeof document !== "undefined") {
      // 8. Render Param Section Header Label
      const paramSectionLabel = new Text({
        text: "PARAM",
        style: {
          fontSize: 10,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xa1a1aa : 0x71717a,
        },
        resolution: context.textResolution,
      });
      paramSectionLabel.x = 12;
      paramSectionLabel.y = QUERY_HEADER_HEIGHT + 4;
      container.addChild(paramSectionLabel);

      // 9. Render Param Fields
      if (params.length > 0) {
        params.forEach((field, idx) => {
          const rowY = paramStartY + idx * QUERY_ROW_HEIGHT;
          const isFieldSelected = isThisElement && activeSection === 0 && activeFieldIndex === idx;

          const fieldName = new Text({
            text: toDisplayName(field.name),
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

          // Required marker: a "*" right after the field name.
          if (field.isRequired) {
            const requiredStar = new Text({
              text: "*",
              style: {
                fontSize: 13,
                fontWeight: "bold",
                fontFamily: '"Geist Mono", monospace',
                fill: isDark ? 0xf87171 : 0xdc2626,
              },
              resolution: context.textResolution,
            });
            requiredStar.x = fieldName.x + fieldName.width + 2;
            requiredStar.y = rowY + 6;
            container.addChild(requiredStar);
          }

          const typeLabel = new Text({
            text: toDisplayType(field.type, field.isArray),
            style: {
              fontSize: 11,
              fontFamily: '"Geist Mono", monospace',
              fill: isDark ? 0xa1a1aa : 0x71717a,
            },
            resolution: context.textResolution,
          });
          const showDescBadge = Boolean(field.description) || isFieldSelected;
          typeLabel.x = w - typeLabel.width - 12;
          typeLabel.y = rowY + 8;
          container.addChild(typeLabel);

          if (showDescBadge) {
            renderQueryRowDescBadge(
              container,
              element.id,
              field,
              0,
              idx,
              typeLabel.x,
              rowY,
              context.textResolution,
            );
          }
        });
      } else {
        const emptyParams = new Text({
          text: "(no params)",
          style: {
            fontSize: 11,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0x71717a : 0xa1a1aa,
          },
          resolution: context.textResolution,
        });
        emptyParams.x = 12;
        emptyParams.y = paramStartY + 7;
        container.addChild(emptyParams);
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
          const rowY = respStartY + idx * QUERY_ROW_HEIGHT;
          const isFieldSelected = isThisElement && activeSection === 1 && activeFieldIndex === idx;

          const fieldName = new Text({
            text: toDisplayName(field.name),
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

          // Required marker: a "*" right after the field name.
          if (field.isRequired) {
            const requiredStar = new Text({
              text: "*",
              style: {
                fontSize: 13,
                fontWeight: "bold",
                fontFamily: '"Geist Mono", monospace',
                fill: isDark ? 0xf87171 : 0xdc2626,
              },
              resolution: context.textResolution,
            });
            requiredStar.x = fieldName.x + fieldName.width + 2;
            requiredStar.y = rowY + 6;
            container.addChild(requiredStar);
          }

          const typeLabel = new Text({
            text: toDisplayType(field.type, field.isArray),
            style: {
              fontSize: 11,
              fontFamily: '"Geist Mono", monospace',
              fill: isDark ? 0xa1a1aa : 0x71717a,
            },
            resolution: context.textResolution,
          });
          const showDescBadge = Boolean(field.description) || isFieldSelected;
          typeLabel.x = w - typeLabel.width - 12;
          typeLabel.y = rowY + 8;
          container.addChild(typeLabel);

          if (showDescBadge) {
            renderQueryRowDescBadge(
              container,
              element.id,
              field,
              1,
              idx,
              typeLabel.x,
              rowY,
              context.textResolution,
            );
          }
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

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    const paramsCount = Math.max(1, params.length);
    const paramStartY = QUERY_HEADER_HEIGHT + QUERY_SECTION_HEADER_HEIGHT;
    const paramEndY = paramStartY + paramsCount * QUERY_ROW_HEIGHT;

    // Check Param section rows
    if (localPoint.y >= paramStartY && localPoint.y < paramEndY) {
      if (params.length === 0) return null;
      const index = Math.floor((localPoint.y - paramStartY) / QUERY_ROW_HEIGHT);
      if (index >= 0 && index < params.length) {
        return {
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "params",
          fieldIndex: index,
        };
      }
      return null;
    }

    // Check Response section rows
    const respHeaderY = paramEndY;
    const respStartY = respHeaderY + QUERY_SECTION_HEADER_HEIGHT;
    const responsesCount = Math.max(1, responses.length);
    const respEndY = respStartY + responsesCount * QUERY_ROW_HEIGHT;

    if (localPoint.y >= respStartY && localPoint.y < respEndY) {
      if (responses.length === 0) return null;
      const index = Math.floor((localPoint.y - respStartY) / QUERY_ROW_HEIGHT);
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
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);

    let nextParams = [...params];
    let nextResponses = [...responses];

    if (sectionIndex === 1) {
      if (fieldIndex < 0 || fieldIndex >= responses.length) return null;
      nextResponses = responses.filter((_, i) => i !== fieldIndex);
    } else {
      if (fieldIndex < 0 || fieldIndex >= params.length) return null;
      nextParams = params.filter((_, i) => i !== fieldIndex);
    }

    const nextData: QueryCardData = {
      ...element.data,
      params: nextParams,
      responses: nextResponses,
    };
    const nextSize = queryCardTool.computeSize ? queryCardTool.computeSize(nextData) : null;
    return {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    };
  },

  onUpdateSubSelectType: (element, field, type) => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    const trimmed = type.trim();
    if (!trimmed) return null;

    if (field.sectionIndex === 1) {
      if (field.fieldIndex < 0 || field.fieldIndex >= responses.length) return null;
      const nextResponses = [...responses];
      nextResponses[field.fieldIndex] = { ...responses[field.fieldIndex], type: trimmed };
      return {
        data: { ...element.data, params, responses: nextResponses },
      };
    } else {
      if (field.fieldIndex < 0 || field.fieldIndex >= params.length) return null;
      const nextParams = [...params];
      nextParams[field.fieldIndex] = { ...params[field.fieldIndex], type: trimmed };
      return {
        data: { ...element.data, params: nextParams, responses },
      };
    }
  },

  onToggleSubSelectArray: (element, field) => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);

    if (field.sectionIndex === 1) {
      if (field.fieldIndex < 0 || field.fieldIndex >= responses.length) return null;
      const nextResponses = [...responses];
      const cur = nextResponses[field.fieldIndex];
      nextResponses[field.fieldIndex] = { ...cur, isArray: !cur.isArray };
      return {
        data: { ...element.data, params, responses: nextResponses },
      };
    } else {
      if (field.fieldIndex < 0 || field.fieldIndex >= params.length) return null;
      const nextParams = [...params];
      const cur = nextParams[field.fieldIndex];
      nextParams[field.fieldIndex] = { ...cur, isArray: !cur.isArray };
      return {
        data: { ...element.data, params: nextParams, responses },
      };
    }
  },

  onToggleSubSelectRequired: (element, field) => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);

    if (field.sectionIndex === 1) {
      if (field.fieldIndex < 0 || field.fieldIndex >= responses.length) return null;
      const nextResponses = [...responses];
      const cur = nextResponses[field.fieldIndex];
      nextResponses[field.fieldIndex] = { ...cur, isRequired: !cur.isRequired };
      return {
        data: { ...element.data, params, responses: nextResponses },
      };
    } else {
      if (field.fieldIndex < 0 || field.fieldIndex >= params.length) return null;
      const nextParams = [...params];
      const cur = nextParams[field.fieldIndex];
      nextParams[field.fieldIndex] = { ...cur, isRequired: !cur.isRequired };
      return {
        data: { ...element.data, params: nextParams, responses },
      };
    }
  },

  getSelectedFieldItem: (element, field) => {
    if (field.sectionIndex === 1) {
      const responses = getQueryResponses(element.data);
      return responses[field.fieldIndex] ?? null;
    }
    const params = getQueryParams(element.data);
    return params[field.fieldIndex] ?? null;
  },

  getSubSelectSections: (element) => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    return [
      {
        id: "params",
        name: "params",
        count: params.length,
      },
      {
        id: "responses",
        name: "responses",
        count: responses.length,
      },
    ];
  },

  getInlineEditTarget: (element, localPoint) => {
    // 1. Double click on Header -> Edit Query Name
    if (localPoint.y <= QUERY_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: toDisplayName(element.data?.name) || "Query",
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
    }

    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    const paramsCount = Math.max(1, params.length);
    const paramStartY = QUERY_HEADER_HEIGHT + QUERY_SECTION_HEADER_HEIGHT;
    const paramEndY = paramStartY + paramsCount * QUERY_ROW_HEIGHT;

    // 2. Double click on Param row
    if (localPoint.y >= paramStartY && localPoint.y < paramEndY) {
      const index = Math.floor((localPoint.y - paramStartY) / QUERY_ROW_HEIGHT);
      if (index >= 0 && index < params.length) {
        const paramField = params[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "params",
          fieldIndex: index,
        });

        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 10,
            y: element.y + paramStartY + index * QUERY_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 80),
            height: 24,
          },
          initialValue: toDisplayName(paramField.name),
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && !isSameIdentifier(trimmed, paramField.name)) {
              const nextParams = [...params];
              nextParams[index] = { ...paramField, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, params: nextParams, responses },
              });
            }
          },
        };
      }
      return null;
    }

    // 3. Double click on Response row
    const respHeaderY = paramEndY;
    const respStartY = respHeaderY + QUERY_SECTION_HEADER_HEIGHT;
    const responsesCount = Math.max(1, responses.length);
    const respEndY = respStartY + responsesCount * QUERY_ROW_HEIGHT;

    if (localPoint.y >= respStartY && localPoint.y < respEndY) {
      const index = Math.floor((localPoint.y - respStartY) / QUERY_ROW_HEIGHT);
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
            y: element.y + respStartY + index * QUERY_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 80),
            height: 24,
          },
          initialValue: toDisplayName(respField.name),
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && !isSameIdentifier(trimmed, respField.name)) {
              const nextResponses = [...responses];
              nextResponses[index] = { ...respField, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, params, responses: nextResponses },
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
    toolName: "create_query_card",
    description: "Create a domain Query card in the Event Model with param and response fields",
    parameters: z.object({
      name: z.string().describe("PascalCase query name (e.g. GetOrder, ListUsers)"),
      params: z
        .array(
          z.object({
            name: z.string().describe("Param field name in camelCase"),
            type: z.string().describe("Field type"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z
              .string()
              .optional()
              .describe("What this field means"),
          }),
        )
        .optional()
        .describe("Parameters / input payload carried by the query"),
      responses: z
        .array(
          z.object({
            name: z.string().describe("Response field name in camelCase"),
            type: z.string().describe("Field type"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z
              .string()
              .optional()
              .describe("What this field means"),
          }),
        )
        .optional()
        .describe("Return / response fields produced by the query"),
      color: z.string().optional().describe("Optional hex color"),
      description: z
        .string()
        .optional()
        .describe("Description of the query"),
    }),
    onCreate: (params, center: Point): CanvasElement<QueryCardData> => {
      const queryParams = params.params || [];
      const responses = params.responses || [];
      const data: QueryCardData = {
        name: params.name || "Query",
        params: queryParams,
        responses,
        color: params.color || queryCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = queryCardTool.computeSize!(data);
      return {
        id: `query-${nanoid(6)}`,
        type: "queryCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
