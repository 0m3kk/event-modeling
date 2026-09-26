import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasObject, ModelData, ModelField, ModelEnumValue } from "@/types";
import { computeModelNodeHeight } from "@/utils/cardDimensions";
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
        }),
      )
      .min(1)
      .max(500),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const center = getViewportCenter(state);
    const created: Array<{ id: string; name: string; kind: string }> = [];

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
      const width = 220;

      let pos = { x: spec.x ?? 0, y: spec.y ?? 0 };
      if (!hasPosition) {
        pos = findFreeSpot(state.objects, { width, height }, center);
      }

      const obj: CanvasObject = {
        id: `model-${nanoid()}`,
        type: "model",
        x: pos.x,
        y: pos.y,
        width,
        height,
        modelData: data,
      };

      state.addObject(obj);
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
