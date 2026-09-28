import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasObject } from "@/types";
import { defineTool } from "./schema";
import { toDisplayName } from "@/utils/naming";
import {
  findFreeSpot,
  getObjectsBounds,
  getViewportCenter,
  objectLabel,
} from "./helpers";

const CARDINAL_ANCHORS = ["top", "right", "bottom", "left"] as const;
const anchor = z.enum(CARDINAL_ANCHORS);

const objectSpecs = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stickyNote"),
    text: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    fill: z.string().optional().describe("Background color."),
    groupId: z.string().optional().describe("Group ID or Section name to add this sticky note to."),
  }),
  z.object({
    type: z.literal("textBox"),
    text: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    groupId: z.string().optional().describe("Group ID or Section name to add this text box to."),
  }),
  z.object({
    type: z.literal("connector"),
    sourceId: z.string().optional(),
    targetId: z.string().optional(),
    sourceRef: z.number().int().optional().describe("Index into this batch."),
    targetRef: z.number().int().optional(),
    sourceAnchor: anchor.optional(),
    targetAnchor: anchor.optional(),
  }),
]);

type ObjectSpec = z.output<typeof objectSpecs>;

export const createObjectsTool = defineTool({
  name: "create_objects",
  description:
    "Create one or more basic canvas objects: sticky notes, text boxes, and orthogonal connectors.",
  schema: z.object({
    objects: z.array(objectSpecs).min(1).max(100),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const center = getViewportCenter(state);
    const created: Array<{ index: number; id: string; type: string }> = [];
    const idsByIndex: string[] = [];

    const resolveGroupId = (groupIdOrName?: string): string | undefined => {
      if (!groupIdOrName) return undefined;
      const direct = state.groups.find((g) => g.id === groupIdOrName);
      if (direct) return direct.id;
      const byName = state.groups.find(
        (g) => g.name.toLowerCase() === groupIdOrName.trim().toLowerCase(),
      );
      return byName?.id;
    };

    const placed: CanvasObject[] = [];

    // Pass 1: non-connectors
    args.objects.forEach((spec, index) => {
      if (spec.type === "connector") return;

      const width = spec.width ?? (spec.type === "stickyNote" ? 180 : 200);
      const height = spec.height ?? (spec.type === "stickyNote" ? 140 : 40);
      const hasPos = spec.x !== undefined && spec.y !== undefined;
      const resolvedGroupId = resolveGroupId(spec.groupId);

      let searchCenter = center;
      if (!hasPos && resolvedGroupId) {
        const targetGroup = state.groups.find((g) => g.id === resolvedGroupId);
        if (targetGroup) {
          const members = [...state.objects, ...placed].filter(
            (o) => o.groupId === targetGroup.id && o.type !== "connector",
          );
          if (members.length > 0) {
            let maxX = -Infinity;
            let minY = Infinity;
            for (const m of members) {
              maxX = Math.max(maxX, m.x + m.width);
              minY = Math.min(minY, m.y);
            }
            searchCenter = { x: maxX + 40, y: minY };
          } else if (targetGroup.customBounds) {
            searchCenter = {
              x: targetGroup.customBounds.x + 24,
              y: targetGroup.customBounds.y + 24,
            };
          }
        }
      }

      const pos = hasPos
        ? { x: spec.x!, y: spec.y! }
        : findFreeSpot([...state.objects, ...placed], { width, height }, searchCenter);

      const obj: CanvasObject = {
        id: `${spec.type}-${nanoid()}`,
        type: spec.type,
        x: pos.x,
        y: pos.y,
        width,
        height,
        text: spec.text,
        ...(spec.type === "stickyNote" && spec.fill ? { fill: spec.fill } : {}),
        ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
      };

      state.addObject(obj);
      placed.push(obj);
      idsByIndex[index] = obj.id;
      created.push({ index, id: obj.id, type: obj.type });
    });

    // Pass 2: connectors
    args.objects.forEach((spec: ObjectSpec, index) => {
      if (spec.type !== "connector") return;
      const sourceId =
        spec.sourceId ??
        (spec.sourceRef !== undefined ? idsByIndex[spec.sourceRef] : undefined);
      const targetId =
        spec.targetId ??
        (spec.targetRef !== undefined ? idsByIndex[spec.targetRef] : undefined);
      if (!sourceId || !targetId) return;

      const connector: CanvasObject = {
        id: `conn-${nanoid()}`,
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: {
            objectId: sourceId,
            anchor: spec.sourceAnchor ?? "right",
          },
          end: {
            objectId: targetId,
            anchor: spec.targetAnchor ?? "left",
          },
          arrowEnd: true,
        },
      };

      state.addObject(connector);
      created.push({ index, id: connector.id, type: "connector" });
    });

    return { created, count: created.length };
  },
});

const objectPatch = z.object({
  text: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  locked: z.boolean().optional(),
  stormData: z.unknown().optional(),
  modelData: z.unknown().optional(),
  connectorData: z.unknown().optional(),
});

export const updateObjectsTool = defineTool({
  name: "update_objects",
  description: "Update existing objects by id with a partial patch.",
  schema: z.object({
    updates: z
      .array(z.object({ id: z.string(), patch: objectPatch }))
      .min(1)
      .max(100),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const updated: string[] = [];
    const notFound: string[] = [];

    for (const { id, patch } of args.updates) {
      const exists = state.objects.some((o) => o.id === id);
      if (!exists) {
        notFound.push(id);
        continue;
      }
      state.updateObject(id, patch as Partial<CanvasObject>);
      updated.push(id);
    }

    return { updated, updatedCount: updated.length, notFound };
  },
});

export const deleteObjectsTool = defineTool({
  name: "delete_objects",
  description: "Delete objects by id. Connectors attached to them are cleaned up automatically.",
  schema: z.object({
    ids: z.array(z.string()).min(1).max(200),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const existing = args.ids.filter((id) =>
      state.objects.some((o) => o.id === id),
    );
    const notFound = args.ids.filter((id) => !existing.includes(id));
    if (existing.length > 0) {
      state.deleteObjects(existing);
    }
    return { deleted: existing, deletedCount: existing.length, notFound };
  },
});

export const connectObjectsTool = defineTool({
  name: "connect_objects",
  description: "Draw orthogonal 90° elbow connectors between existing cards/nodes.",
  schema: z.object({
    connections: z
      .array(
        z.object({
          sourceId: z.string(),
          targetId: z.string(),
          sourceAnchor: anchor.optional(),
          targetAnchor: anchor.optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const created: string[] = [];
    const failures: number[] = [];

    args.connections.forEach((conn, index) => {
      const sourceExists = state.objects.some((o) => o.id === conn.sourceId);
      const targetExists = state.objects.some((o) => o.id === conn.targetId);
      if (!sourceExists || !targetExists) {
        failures.push(index);
        return;
      }

      const connector: CanvasObject = {
        id: `conn-${nanoid()}`,
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: {
            objectId: conn.sourceId,
            anchor: conn.sourceAnchor ?? "right",
          },
          end: {
            objectId: conn.targetId,
            anchor: conn.targetAnchor ?? "left",
          },
          arrowEnd: true,
        },
      };

      state.addObject(connector);
      created.push(connector.id);
    });

    return {
      created,
      createdCount: created.length,
      ...(failures.length > 0
        ? {
            warning: `Connections at indices ${failures.join(", ")} skipped — unknown source or target id.`,
          }
        : {}),
    };
  },
});

export const createReferenceCopiesTool = defineTool({
  name: "create_reference_copies",
  description:
    "Create linked reference copies of existing cards/nodes by id. Synced duplicates stay in sync across the set.",
  schema: z.object({
    ids: z.array(z.string()).min(1).max(200),
  }),
  execute: (args, ctx) => {
    const before = new Set(ctx.getState().objects.map((o) => o.id));
    const existing = args.ids.filter((id) => before.has(id));
    const notFound = args.ids.filter((id) => !before.has(id));

    if (existing.length === 0) {
      return { created: [], count: 0, notFound };
    }

    ctx.getState().createReferenceCopy(existing);

    const created = ctx
      .getState()
      .objects.filter((o) => !before.has(o.id))
      .map((o) => ({ id: o.id, type: o.type, label: objectLabel(o) }));

    return { created, count: created.length, notFound };
  },
});

export const groupObjectsTool = defineTool({
  name: "group_objects",
  description:
    "Group objects into a Section frame so they move together, or add objects to an existing group by specifying groupId or matching name.",
  schema: z.object({
    ids: z.array(z.string()).min(1),
    name: z.string().optional().describe("Section name."),
    groupId: z
      .string()
      .optional()
      .describe("Existing target group ID or name to add objects to."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const existing = args.ids.filter((id) =>
      state.objects.some((o) => o.id === id),
    );
    const notFound = args.ids.filter((id) => !existing.includes(id));

    if (existing.length === 0) {
      return {
        grouped: false,
        error: "No matching objects found to group.",
        notFound,
      };
    }

    // Check if target group is specified via groupId or existing name
    const resolveTargetGroup = () => {
      if (args.groupId) {
        const direct = state.groups.find((g) => g.id === args.groupId);
        if (direct) return direct;
        const byName = state.groups.find(
          (g) => g.name.toLowerCase() === args.groupId!.trim().toLowerCase(),
        );
        if (byName) return byName;
      }
      if (args.name) {
        const byName = state.groups.find(
          (g) => g.name.toLowerCase() === args.name!.trim().toLowerCase(),
        );
        if (byName) return byName;
      }
      return undefined;
    };

    const targetGroup = resolveTargetGroup();
    if (targetGroup) {
      state.addToGroup(targetGroup.id, existing);
      return {
        grouped: true,
        groupId: targetGroup.id,
        name: targetGroup.name,
        memberIds: existing,
        count: existing.length,
        notFound,
      };
    }

    if (existing.length < 2) {
      return {
        grouped: false,
        error: "Need at least two existing objects to create a new group.",
        notFound,
      };
    }

    const before = new Set(state.groups.map((g) => g.id));
    state.groupObjects(
      existing,
      args.name ? toDisplayName(args.name) : undefined,
    );

    const group = ctx.getState().groups.find((g) => !before.has(g.id));
    if (!group) {
      return {
        grouped: false,
        error: "Those objects already share one group.",
        notFound,
      };
    }

    return {
      grouped: true,
      groupId: group.id,
      name: group.name,
      memberIds: existing,
      count: existing.length,
      notFound,
    };
  },
});

export const ungroupObjectsTool = defineTool({
  name: "ungroup_objects",
  description: "Dissolve one or more Section frames by group id.",
  schema: z.object({
    groupIds: z.array(z.string()).min(1),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const existing = args.groupIds.filter((id) =>
      state.groups.some((g) => g.id === id),
    );
    const notFound = args.groupIds.filter((id) => !existing.includes(id));

    for (const id of existing) state.deleteGroup(id);

    return { ungrouped: existing, ungroupedCount: existing.length, notFound };
  },
});

export const selectObjectsTool = defineTool({
  name: "select_objects",
  description: "Select objects on the canvas by id.",
  schema: z.object({ ids: z.array(z.string()).max(500) }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const valid = args.ids.filter((id) =>
      state.objects.some((o) => o.id === id),
    );
    state.setSelectedIds(valid);
    return { selected: valid, count: valid.length };
  },
});

export const focusViewportTool = defineTool({
  name: "focus_viewport",
  description: "Pan and zoom the canvas to center the specified objects (or all objects).",
  schema: z.object({
    ids: z.array(z.string()).optional(),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const targets = args.ids?.length
      ? state.objects.filter((o) => args.ids!.includes(o.id))
      : state.objects;
    const bounds = getObjectsBounds(targets);
    if (!bounds) {
      return { focused: false, reason: "No objects to focus." };
    }

    const screenWidth = state.viewport.screenWidth > 0 ? state.viewport.screenWidth : 1200;
    const screenHeight = state.viewport.screenHeight > 0 ? state.viewport.screenHeight : 800;
    const padding = 120;
    const width = Math.max(1, bounds.maxX - bounds.minX) + padding;
    const height = Math.max(1, bounds.maxY - bounds.minY) + padding;
    const zoom = Math.min(
      2,
      Math.max(0.2, Math.min(screenWidth / width, screenHeight / height)),
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    state.setViewport({
      x: centerX - screenWidth / (2 * zoom),
      y: centerY - screenHeight / (2 * zoom),
      zoom,
    });
    return { focused: true, viewport: { zoom, centerX, centerY } };
  },
});

export const writeTools = [
  createObjectsTool,
  updateObjectsTool,
  deleteObjectsTool,
  connectObjectsTool,
  createReferenceCopiesTool,
  groupObjectsTool,
  ungroupObjectsTool,
  selectObjectsTool,
  focusViewportTool,
];
