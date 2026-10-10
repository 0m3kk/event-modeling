import { z } from "zod";
import type { CanvasObject } from "@/types";
import { defineTool } from "./schema";
import {
  getObjectsBounds,
  getViewportRect,
  rectsOverlap,
  toObjectRow,
} from "./helpers";
import { getCanvasRevision } from "./canvasRevision";

const OBJECT_TYPES = [
  "storm",
  "model",
  "connector",
  "line",
  "stickyNote",
  "textBox",
] as const;

const STORM_KINDS = [
  "command",
  "event",
  "query",
  "actor",
  "state",
  "constraint",
] as const;

function countByType(objects: { type: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obj of objects) {
    counts[obj.type] = (counts[obj.type] ?? 0) + 1;
  }
  return counts;
}

function countStormKinds(objects: CanvasObject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obj of objects) {
    if (obj.type === "storm" && obj.stormData?.kind) {
      counts[obj.stormData.kind] = (counts[obj.stormData.kind] ?? 0) + 1;
    }
  }
  return counts;
}

export const getCanvasOverviewTool = defineTool({
  name: "get_canvas_overview",
  description:
    "Get an overview of the canvas: object counts by type, storm card kinds count, existing event card names, bounds, viewport, groups, selection, and revision counter. If revision matches your last read, the canvas is unchanged.",
  schema: z.object({}),
  execute: (_args, ctx) => {
    const state = ctx.getState();
    const selection = state.objects
      .filter((o) => state.selectedIds.includes(o.id))
      .map((o) => toObjectRow(o));

    const existingEvents = state.objects
      .filter((o) => o.type === "storm" && o.stormData?.kind === "event")
      .map((o) => o.stormData!.name);

    return {
      revision: getCanvasRevision(),
      objectCount: state.objects.length,
      objectCountsByType: countByType(state.objects),
      stormKindsCount: countStormKinds(state.objects),
      existingEvents,
      bounds: getObjectsBounds(state.objects),
      groups: state.groups.map((group) => ({
        id: group.id,
        name: group.name,
        memberCount: state.objects.filter((o) => o.groupId === group.id).length,
      })),
      viewport: state.viewport,
      selection,
    };
  },
});

export const listObjectsTool = defineTool({
  name: "list_objects",
  description:
    "List canvas objects as compact rows (id, type, label, kind, action, group). Filter by type, stormKind, or label text. Geometry is omitted unless includeGeometry is set.",
  schema: z.object({
    type: z.enum(OBJECT_TYPES).optional().describe("Only return this type."),
    stormKind: z
      .enum(STORM_KINDS)
      .optional()
      .describe(
        "Filter storm cards by kind (command, event, constraint, state, query, actor).",
      ),
    textContains: z
      .string()
      .optional()
      .describe("Case-insensitive match against label/name."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe("Max rows to return (default 100)."),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Skip this many matches."),
    includeGeometry: z
      .boolean()
      .optional()
      .describe("Include x/y/width/height on each row."),
    viewportOnly: z
      .boolean()
      .optional()
      .describe("Only objects visible in the viewport."),
    summaryOnly: z
      .boolean()
      .optional()
      .describe("Return counts by type and groups instead of full rows."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const limit = args.limit ?? 100;
    const offset = args.offset ?? 0;
    const needle = args.textContains?.toLowerCase();
    const viewport = args.viewportOnly ? getViewportRect(state) : null;

    const filtered = state.objects.filter((obj) => {
      if (args.type && obj.type !== args.type) return false;
      if (
        args.stormKind &&
        (obj.type !== "storm" || obj.stormData?.kind !== args.stormKind)
      ) {
        return false;
      }
      if (needle) {
        const label = toObjectRow(obj).label.toLowerCase();
        if (!label.includes(needle)) return false;
      }
      if (viewport) {
        const rect = {
          x: obj.x,
          y: obj.y,
          width: obj.width ?? 0,
          height: obj.height ?? 0,
        };
        if (!rectsOverlap(rect, viewport)) return false;
      }
      return true;
    });

    if (args.summaryOnly) {
      return {
        revision: getCanvasRevision(),
        total: filtered.length,
        countsByType: countByType(filtered),
        groups: state.groups.map((group) => ({
          id: group.id,
          name: group.name,
          memberCount: state.objects.filter((o) => o.groupId === group.id)
            .length,
        })),
      };
    }

    return {
      revision: getCanvasRevision(),
      total: filtered.length,
      offset,
      returned: filtered
        .slice(offset, offset + limit)
        .map((obj) =>
          toObjectRow(obj, { includeGeometry: args.includeGeometry }),
        ),
      hasMore: offset + limit < filtered.length,
    };
  },
});

export const getObjectTool = defineTool({
  name: "get_object",
  description:
    "Get full JSON data of one object by id (including stormData, modelData, or connectorData).",
  schema: z.object({
    id: z.string().describe("Object id."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const object = state.objects.find((o) => o.id === args.id);
    if (!object) {
      return { found: false, id: args.id, error: "No object with that id." };
    }
    return { found: true, object };
  },
});

export const searchObjectsTool = defineTool({
  name: "search_objects",
  description:
    "Search canvas objects whose label or text contains query (case-insensitive).",
  schema: z.object({
    query: z.string().min(1).describe("Text to search for."),
    limit: z.number().int().min(1).max(1000).optional(),
    includeGeometry: z.boolean().optional(),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const needle = args.query.toLowerCase();
    const matches = state.objects.filter((obj) =>
      toObjectRow(obj).label.toLowerCase().includes(needle),
    );
    const limit = args.limit ?? 100;
    return {
      revision: getCanvasRevision(),
      total: matches.length,
      returned: matches
        .slice(0, limit)
        .map((obj) =>
          toObjectRow(obj, { includeGeometry: args.includeGeometry }),
        ),
    };
  },
});

export const readTools = [
  getCanvasOverviewTool,
  listObjectsTool,
  getObjectTool,
  searchObjectsTool,
];
