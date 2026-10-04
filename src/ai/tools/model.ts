import { z } from "zod";
import { nanoid } from "nanoid";
import type {
  CanvasObject,
  FieldValidation,
  ModelData,
  ModelField,
  ModelEnumValue,
  ServiceMethod,
  ServiceMethodParam,
} from "@/types";
import {
  computeModelNodeHeight,
  computeOptimalModelNodeWidth,
} from "@/utils/cardDimensions";
import { toDisplayName } from "@/utils/naming";
import { DEFAULT_FIELD_TYPE } from "@/constants/fieldType";
import { normalizeValidation } from "@/utils/fieldValidation";
import { fieldValidationSpec } from "./fieldValidationSpec";
import {
  buildFieldTypeEnvironment,
  fieldTypeError,
  resolveFieldType,
} from "./fieldTypes";
import { defineTool } from "./schema";
import { findFreeSpot, getGroupObstacleRects, getViewportCenter } from "./helpers";
import { groupAndAncestorIds } from "@/utils/groupBounds";

/**
 * Reduce a normalized validation object to the rules a model kind understands:
 * object/wrap keep every rule, array keeps item-count limits only.
 */
function modelValidation(
  input: FieldValidation | undefined,
  scope: "object" | "array" | "wrap",
): FieldValidation | undefined {
  const normalized = normalizeValidation(input);
  if (!normalized) return undefined;
  if (scope !== "array") return normalized;

  const arrayOnly: FieldValidation = {};
  if (normalized.minItems !== undefined) arrayOnly.minItems = normalized.minItems;
  if (normalized.maxItems !== undefined) arrayOnly.maxItems = normalized.maxItems;
  return Object.keys(arrayOnly).length > 0 ? arrayOnly : undefined;
}

export const createModelNodesTool = defineTool({
  name: "create_model_nodes",
  description:
    "Create data-model nodes (object / array / wrap / enum / service). Object nodes carry a field list; array/wrap carry an item/inner type; enum carries values; service carries methods (with parameters and return types). Object fields and array/wrap nodes may set `validation` (an object field uses the full rule set; an array node only uses minItems/maxItems; a wrap node validates the whole wrapped value). Enum and service never validate.",
  schema: z.object({
    nodes: z
      .array(
        z.object({
          kind: z.enum(["object", "array", "wrap", "enum", "service"]),
          name: z.string().min(1),
          description: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          fields: z
            .array(
              z.object({
                name: z.string(),
                fieldType: z
                  .string()
                  .optional()
                  .describe(
                    "Primitive type (String, Number, Boolean, UUID, DateTime, Date, Email, URL, URI, JSON, Any, Void) or the name of a Model node (existing or created in this batch); append '[]' for an array. Defaults to String. Invalid types are rejected.",
                  ),
                required: z.boolean().optional(),
                description: z.string().optional(),
                validation: fieldValidationSpec
                  .optional()
                  .describe("Object nodes only: per-field input validation."),
              }),
            )
            .optional(),
          methods: z
            .array(
              z.object({
                name: z.string(),
                returnType: z
                  .string()
                  .optional()
                  .describe(
                    "Primitive type or Model node name; append '[]' for an array. Defaults to String. Invalid types are rejected.",
                  ),
                description: z.string().optional(),
                params: z
                  .array(
                    z.object({
                      name: z.string(),
                      paramType: z
                        .string()
                        .optional()
                        .describe(
                          "Primitive type or Model node name; append '[]' for an array. Defaults to String.",
                        ),
                    }),
                  )
                  .optional(),
              }),
            )
            .optional()
            .describe(
              "Service nodes only: functions/methods provided by this service.",
            ),
          itemType: z
            .string()
            .optional()
            .describe(
              "Array nodes: element type. A primitive (String, Number, Boolean, UUID, DateTime, Date, Email, URL, URI, JSON, Any, Void) or a Model node name (existing or in this batch). Defaults to String.",
            ),
          innerType: z
            .string()
            .optional()
            .describe(
              "Wrap nodes: wrapped type. A primitive (String, Number, Boolean, UUID, DateTime, Date, Email, URL, URI, JSON, Any, Void) or a Model node name (existing or in this batch). Defaults to String.",
            ),
          validation: fieldValidationSpec
            .optional()
            .describe(
              "Array nodes: minItems/maxItems item-count limits only. Wrap nodes: rules for the whole wrapped value. Ignored on object/enum (object validation is per field).",
            ),
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

    // A field type must be a primitive or a Model node — existing on the board
    // or created in this same batch. Reject everything else with a fixable
    // message before any node is added.
    const typeEnv = buildFieldTypeEnvironment(
      state.objects,
      args.nodes.map((node) => toDisplayName(node.name)),
    );
    const typeErrors: string[] = [];
    for (const spec of args.nodes) {
      const label = `"${toDisplayName(spec.name)}" (${spec.kind})`;
      if (spec.kind === "object") {
        for (const field of spec.fields ?? []) {
          const { error } = resolveFieldType(field.fieldType, typeEnv);
          if (error) {
            typeErrors.push(
              `${label} field "${toDisplayName(field.name)}" ${error}`,
            );
          }
        }
      } else if (spec.kind === "array") {
        const { error } = resolveFieldType(spec.itemType, typeEnv);
        if (error) typeErrors.push(`${label} itemType ${error}`);
      } else if (spec.kind === "wrap") {
        const { error } = resolveFieldType(spec.innerType, typeEnv);
        if (error) typeErrors.push(`${label} innerType ${error}`);
      } else if (spec.kind === "service") {
        for (const m of spec.methods ?? []) {
          const { error: retErr } = resolveFieldType(m.returnType, typeEnv);
          if (retErr) {
            typeErrors.push(`${label} method "${m.name}" returnType ${retErr}`);
          }
          for (const p of m.params ?? []) {
            const { error: paramErr } = resolveFieldType(p.paramType, typeEnv);
            if (paramErr) {
              typeErrors.push(
                `${label} method "${m.name}" param "${p.name}" ${paramErr}`,
              );
            }
          }
        }
      }
    }
    if (typeErrors.length > 0) {
      throw new Error(fieldTypeError(typeErrors));
    }

    for (const spec of args.nodes) {
      const hasPosition = spec.x !== undefined && spec.y !== undefined;
      const displayName = toDisplayName(spec.name);

      const data: ModelData = {
        kind: spec.kind,
        name: displayName,
        ...(spec.description ? { description: spec.description } : {}),
      };

      if (spec.kind === "object") {
        data.fields = (spec.fields ?? []).map((f): ModelField => {
          const validation = modelValidation(f.validation, "object");
          return {
            id: nanoid(),
            name: toDisplayName(f.name),
            fieldType:
              resolveFieldType(f.fieldType, typeEnv).type || DEFAULT_FIELD_TYPE,
            required: f.required ?? false,
            description: f.description,
            ...(validation ? { validation } : {}),
          };
        });
      } else if (spec.kind === "array") {
        data.itemType =
          resolveFieldType(spec.itemType, typeEnv).type || DEFAULT_FIELD_TYPE;
        const validation = modelValidation(spec.validation, "array");
        if (validation) data.validation = validation;
      } else if (spec.kind === "wrap") {
        data.innerType =
          resolveFieldType(spec.innerType, typeEnv).type || DEFAULT_FIELD_TYPE;
        const validation = modelValidation(spec.validation, "wrap");
        if (validation) data.validation = validation;
      } else if (spec.kind === "service") {
        data.methods = (spec.methods ?? []).map((m): ServiceMethod => ({
          id: nanoid(),
          name: m.name,
          returnType:
            resolveFieldType(m.returnType, typeEnv).type || DEFAULT_FIELD_TYPE,
          description: m.description,
          params: (m.params ?? []).map((p): ServiceMethodParam => ({
            id: nanoid(),
            name: p.name,
            paramType:
              resolveFieldType(p.paramType, typeEnv).type || DEFAULT_FIELD_TYPE,
          })),
        }));
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
          {
            obstacles: getGroupObstacleRects(
              state.groups,
              resolvedGroupId
                ? groupAndAncestorIds(resolvedGroupId, state.groups)
                : undefined,
            ),
          },
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
