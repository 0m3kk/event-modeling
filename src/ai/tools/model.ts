import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasObject, ModelData, ModelField, ModelEnumValue } from "@/types";
import {
  computeModelNodeHeight,
  computeOptimalModelNodeWidth,
} from "@/utils/cardDimensions";
import { toDisplayName } from "@/utils/naming";
import { defineTool } from "./schema";
import { findFreeSpot, getViewportCenter } from "./helpers";

export const createModelNodesTool = defineTool({
  name: "create_model_nodes",
  description:
    "Create data-model nodes (object / array / wrap / enum). Object nodes carry a field list; array/wrap carry an item/inner type; enum carries values.",
  schema: z.object({
    nodes: z
      .array(
        z.object({
          kind: z.enum(["object", "array", "wrap", "enum"]),
          name: z.string().min(1),
          description: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          fields: z
            .array(
              z.object({
                name: z.string(),
                fieldType: z.string().optional(),
                required: z.boolean().optional(),
                description: z.string().optional(),
              }),
            )
            .optional(),
          itemType: z.string().optional(),
          innerType: z.string().optional(),
          values: z
            .array(
              z.object({
                value: z.string(),
                description: z.string().optional(),
              }),
            )
            .optional(),
          groupId: z
            .string()
            .optional()
            .describe("Group ID or Section name to add this model node to."),
        }),
      )
      .min(1)
      .max(500),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const center = getViewportCenter(state);
    const created: Array<{ id: string; name: string; kind: string }> = [];

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

    for (const spec of args.nodes) {
      const hasPosition = spec.x !== undefined && spec.y !== undefined;
      const displayName = toDisplayName(spec.name);

      const data: ModelData = {
        kind: spec.kind,
        name: displayName,
        ...(spec.description ? { description: spec.description } : {}),
      };

      if (spec.kind === "object") {
        data.fields = (spec.fields ?? []).map((f): ModelField => ({
          id: nanoid(),
          name: toDisplayName(f.name),
          fieldType: f.fieldType ?? "string",
          required: f.required ?? false,
          description: f.description,
        }));
      } else if (spec.kind === "array") {
        data.itemType = spec.itemType ?? "string";
      } else if (spec.kind === "wrap") {
        data.innerType = spec.innerType ?? "string";
      } else {
        data.values = (spec.values ?? []).map((v): ModelEnumValue => ({
          id: nanoid(),
          name: v.value,
          value: v.value,
          description: v.description,
        }));
      }

      const height = computeModelNodeHeight(data);
      const width = computeOptimalModelNodeWidth(data);
      const resolvedGroupId = resolveGroupId(spec.groupId);

      let pos = { x: spec.x ?? 0, y: spec.y ?? 0 };
      if (!hasPosition) {
        let searchCenter = center;
        if (resolvedGroupId) {
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
        pos = findFreeSpot(
          [...state.objects, ...placed],
          { width, height },
          searchCenter,
        );
      }

      const obj: CanvasObject = {
        id: `model-${nanoid()}`,
        type: "model",
        x: pos.x,
        y: pos.y,
        width,
        height,
        modelData: data,
        ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
      };

      state.addObject(obj);
      placed.push(obj);
      created.push({
        id: obj.id,
        name: displayName,
        kind: spec.kind,
      });
    }

    return { created, count: created.length };
  },
});

export const modelTools = [createModelNodesTool];
