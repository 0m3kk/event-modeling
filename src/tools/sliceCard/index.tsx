import { Rows3 } from "lucide-react";
import { z } from "zod";
import { Graphics, Text } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition, ValidationIssue } from "../types";
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "../registry";
import { SliceOptions } from "./SliceOptions";
import {
  CARD_CORNER_RADIUS,
  renderStandardCardTitle,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { isSameIdentifier, toDisplayName } from "@/utils/naming";
import {
  SLICE_HEADER_HEIGHT,
  SLICE_LANE_LABEL_HEIGHT,
  SLICE_LANE_MIN_CONTENT_HEIGHT,
  SLICE_TYPE,
  computeSliceCardSize,
  computeSliceLayout,
  createSliceLane,
  getSliceChildren,
  hitSliceLane,
  isSliceEligibleChild,
  laneEffectiveType,
  normalizeSliceData,
  type SliceData,
  type SliceElement,
  type SliceLane,
} from "./layout";

export type { SliceData, SliceLane } from "./layout";

export const SliceCardSchema = z.object({
  name: z.string().default("Slice"),
  color: z.string().optional(),
  description: z.string().optional(),
  lanes: z
    .array(
      z.object({
        id: z.string(),
        childType: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export const sliceCardTool: ToolDefinition<SliceData> = {
  type: SLICE_TYPE,
  name: "Slice",
  description:
    "A Slice groups cards into stacked lanes; each lane holds a single card type (Command, Constraint, Query, …)",
  icon: Rows3,
  color: "#4338ca",
  category: "modeling",
  // The slice auto-sizes to its lanes/cards, so edge-resize is disabled.
  resizable: false,

  schema: SliceCardSchema,
  createDefaultData: () => ({
    name: "Slice",
    color: "#4338ca",
    lanes: [createSliceLane()],
  }),

  defaultSize: { width: computeSliceCardSize({ name: "Slice", lanes: [] }).width, height: 0 },

  computeSize: (data) => computeSliceCardSize(data),

  optionsBar: SliceOptions,

  normalizeData: (data) => normalizeSliceData(data),

  validateData: (data) => {
    const issues: ValidationIssue[] = [];
    const lanes = Array.isArray(data.lanes) ? data.lanes : [];

    if (lanes.length === 0) {
      issues.push({
        path: "lanes",
        code: "lanes_empty",
        message: "A Slice must declare at least one lane.",
      });
    }

    const ids = new Set<string>();
    const types = new Set<string>();

    lanes.forEach((lane, index) => {
      if (!lane?.id) {
        issues.push({
          path: `lanes[${index}].id`,
          code: "missing_lane_id",
          message: `Lane ${index} is missing an id.`,
        });
      } else if (ids.has(lane.id)) {
        issues.push({
          path: `lanes[${index}].id`,
          code: "duplicate_lane_id",
          message: `Lane id "${lane.id}" is duplicated.`,
        });
      }
      if (lane?.id) ids.add(lane.id);

      if (lane?.childType) {
        if (!isSliceEligibleChild(lane.childType)) {
          issues.push({
            path: `lanes[${index}].childType`,
            code: "lane_type_not_allowed",
            message: `Lane ${index} cannot hold "${lane.childType}" (Enum, Object, Alias and Slice cards are not allowed in lanes).`,
          });
        } else if (!toolRegistry.get(lane.childType)) {
          issues.push({
            path: `lanes[${index}].childType`,
            code: "lane_type_unknown",
            message: `Lane ${index} references unknown card type "${lane.childType}".`,
          });
        }

        if (types.has(lane.childType)) {
          issues.push({
            path: `lanes[${index}].childType`,
            code: "duplicate_lane_type",
            message: `Lane type "${lane.childType}" is used by more than one lane.`,
          });
        }
        types.add(lane.childType);
      }
    });

    return { data, issues };
  },

  render: (container, element, context) => {
    container.removeChildren();

    const isDark = context.theme === "dark";
    const isSelected = context.isSelected;
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;
    const headerColor = resolveHeaderColor(element.data.color || sliceCardTool.color, isDark);

    const all = useCanvasStore.getState().elements;
    const children = getSliceChildren(all, element.id);
    const layout = computeSliceLayout(element as SliceElement, children);

    const selectedField =
      context.selectedField?.elementId === element.id ? context.selectedField : null;
    const selectedLane =
      selectedField?.sectionId === "lane" ? selectedField.sectionIndex ?? -1 : -1;

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const laneEvenBg = isDark ? 0x1c1c20 : 0xf8fafc;
    const laneOddBg = isDark ? 0x18181b : 0xffffff;
    const labelBg = isDark ? 0x27272a : 0xf4f4f5;
    const sunkenColor = isDark ? 0x27272a : 0xeef2f7;
    const separatorColor = isDark ? 0x3f3f46 : 0xe4e4e7;
    const borderColor = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;

    const g = new Graphics();

    // Header banner (rounded top, flat bottom)
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, SLICE_HEADER_HEIGHT);
    g.lineTo(0, SLICE_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // Body (flat top, rounded bottom)
    g.moveTo(0, SLICE_HEADER_HEIGHT);
    g.lineTo(w, SLICE_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // Lane bands, labels and separators
    layout.lanes.forEach((lane) => {
      g.rect(0, lane.top, w, lane.height);
      g.fill({ color: lane.laneIndex % 2 === 0 ? laneEvenBg : laneOddBg });

      if (lane.laneIndex === selectedLane) {
        g.rect(0, lane.top, w, lane.height);
        g.fill({ color: sunkenColor });
      }

      // Label band
      g.rect(0, lane.top, w, SLICE_LANE_LABEL_HEIGHT);
      g.fill({ color: labelBg });

      const isLast = lane.laneIndex === layout.lanes.length - 1;
      if (!isLast) {
        g.rect(0, lane.top + lane.height - 1, w, 1);
        g.fill({ color: separatorColor });
      }
    });

    g.roundRect(0, 0, w, h, r);
    g.stroke({ color: borderColor, width: isSelected ? 2 : 1 });
    container.addChild(g);

    renderStandardCardTitle(container, element.data.name || "Slice", headerColor, context.textResolution);

    if (typeof document === "undefined") return;

    if (layout.lanes.length === 0) {
      const hint = new Text({
        text: "(no lanes — add one from the options bar)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      hint.x = 12;
      hint.y = SLICE_HEADER_HEIGHT + 14;
      container.addChild(hint);
      return;
    }

    layout.lanes.forEach((lane) => {
      const toolDef = lane.childType ? toolRegistry.get(lane.childType) : null;
      const typeName = lane.childType ? toolDef?.name ?? lane.childType : null;

      const label = new Text({
        text: typeName ? typeName.toUpperCase() : "(EMPTY LANE)",
        style: {
          fontSize: 9,
          fontWeight: "bold",
          letterSpacing: 0.6,
          fontFamily: '"Geist Mono", monospace',
          fill: typeName
            ? isDark
              ? 0x71717a
              : 0xa1a1aa
            : isDark
              ? 0x52525b
              : 0xc4c4c8,
        },
        resolution: context.textResolution,
      });
      label.x = 12;
      label.y = lane.top + 5;
      container.addChild(label);

      const count = new Text({
        text: `${lane.children.length}`,
        style: {
          fontSize: 9,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x52525b : 0xb4b4b8,
        },
        resolution: context.textResolution,
      });
      count.x = w - count.width - 12;
      count.y = lane.top + 5;
      container.addChild(count);

      if (lane.children.length === 0) {
        const hint = new Text({
          text: "Drop cards here",
          style: {
            fontSize: 11,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0x52525b : 0xc4c4c8,
          },
          resolution: context.textResolution,
        });
        hint.x = 12;
        hint.y = lane.contentTop + Math.max(0, (SLICE_LANE_MIN_CONTENT_HEIGHT - 14) / 2);
        container.addChild(hint);
      }
    });
  },

  onSubSelect: (element, localPoint): SelectedField | null => {
    const all = useCanvasStore.getState().elements;
    const children = getSliceChildren(all, element.id);
    const hit = hitSliceLane(element as SliceElement, children, localPoint);
    if (!hit) return null;
    return {
      elementId: element.id,
      sectionId: "lane",
      sectionIndex: hit.laneIndex,
      fieldIndex: -1,
    };
  },

  onDeleteSubSelect: (element, fieldIndex, sectionIndex = 0) => {
    if (fieldIndex >= 0) return null;
    const lanes = element.data.lanes ?? [];
    if (sectionIndex < 0 || sectionIndex >= lanes.length) return null;
    const nextData: SliceData = {
      ...element.data,
      lanes: lanes.filter((_, i) => i !== sectionIndex),
    };
    return { data: nextData };
  },

  getSubSelectSections: (element) => {
    const all = useCanvasStore.getState().elements;
    const children = getSliceChildren(all, element.id);
    return (element.data.lanes ?? []).map((lane) => {
      const kids = children.filter((c) => c.laneId === lane.id);
      const type = laneEffectiveType(lane, kids);
      return {
        id: "lane",
        name: type ? toolRegistry.get(type)?.name ?? type : "empty",
        count: kids.length,
      };
    });
  },

  onNavigateSubSelect: (element, current, direction) => {
    if (current.sectionId !== "lane") return null;
    const lanes = element.data.lanes ?? [];
    if (lanes.length === 0) return null;
    const index = current.sectionIndex ?? 0;
    const next = direction === "down" ? Math.min(lanes.length - 1, index + 1) : Math.max(0, index - 1);
    return {
      elementId: element.id,
      sectionId: "lane",
      sectionIndex: next,
      fieldIndex: -1,
    };
  },

  getInlineEditTarget: (element, localPoint: Point): InlineEditState | null => {
    if (localPoint.y <= SLICE_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: toDisplayName(element.data?.name) || "Slice",
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
    return null;
  },

  ai: {
    toolName: "create_slice",
    description:
      "Create a Slice: a vertical grouping whose lanes are stacked top-to-bottom. Each lane holds cards of a single type; declare the lane types up front. " +
      "A flow is ONE slice: a write slice is commandCard then eventCard (write slice stops at events); a read slice is queryCard then viewCard or stateCard. " +
      "After creating the slice, create each lane's card(s) and place them in the lane by passing `slice` (and `lane` when the type is ambiguous).",
    parameters: z.object({
      name: z.string().describe("PascalCase slice name (e.g. PlaceOrderSlice)"),
      description: z
        .string()
        .optional()
        .describe("Optional plain-language description of what the slice covers"),
      color: z.string().optional().describe("Optional header color hex code"),
      lanes: z
        .array(
          z.object({
            type: z
              .string()
              .describe(
                "Card type this lane holds: commandCard, queryCard, eventCard, stateCard, viewCard, constraintCard, serviceCard or stickyNote",
              ),
          }),
        )
        .describe("Lanes ordered top-to-bottom; each lane holds one card type"),
    }),
    onCreate: (params, center: Point): CanvasElement<SliceData> => {
      const lanes: SliceLane[] = (params.lanes ?? []).map(
        (lane: { type?: string }) => createSliceLane(lane.type),
      );
      const data: SliceData = {
        name: params.name || "Slice",
        lanes,
        color: params.color || sliceCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = computeSliceCardSize(data);
      return {
        id: `slice-${nanoid(6)}`,
        type: SLICE_TYPE,
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
