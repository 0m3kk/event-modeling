import { z } from "zod";
import { nanoid } from "nanoid";
import type {
  CanvasObject,
  StormData,
  StormField,
  FieldValidation,
  StormKind,
  StormQueryItem,
  StormConstraint,
} from "@/types";
import {
  computeStormCardHeight,
  computeOptimalStormCardWidth,
} from "@/utils/cardDimensions";
import { toDisplayName } from "@/utils/naming";
import { stormHasResponseFields } from "@/constants/storm";
import { DEFAULT_FIELD_TYPE, normalizeFieldType } from "@/constants/fieldType";
import { getActorPermissions } from "@/utils/stormAuth";
import { normalizeValidation } from "@/utils/fieldValidation";
import { fieldValidationSpec } from "./fieldValidationSpec";
import {
  buildFieldTypeEnvironment,
  fieldTypeError,
  resolveFieldType,
  type FieldTypeEnvironment,
} from "./fieldTypes";
import {
  arrangeStormLanes,
  arrangeVerticalSlice,
  type StormLaneCard,
  type StormLanePosition,
} from "@/utils/stormLayout";
import {
  collectStormWarnings,
  describeStormOptions,
  validateStormWrite,
  type StormValidationCard,
  type StormValidationInput,
} from "@/utils/stormValidation";
import { defineTool } from "./schema";
import {
  findFreeSpot,
  getGroupObstacleRects,
  getObjectsBounds,
  getViewportCenter,
} from "./helpers";
import { groupAndAncestorIds } from "@/utils/groupBounds";

const STORM_KINDS = [
  "command",
  "event",
  "external",
  "query",
  "actor",
  "state",
  "constraint",
] as const;

const validationSpec = fieldValidationSpec;

const fieldSpec = z.object({
  name: z.string(),
  fieldType: z
    .string()
    .optional()
    .describe(
      "Primitive type (String, Number, Boolean, UUID, DateTime, Date, Email, URL, URI, JSON, Any, Void) or Model node name; append '[]' for array. Defaults to String.",
    ),
  required: z.boolean().optional(),
  description: z.string().optional().describe("Domain explanation of field."),
  tag: z
    .string()
    .optional()
    .describe(
      "DCB tag name on Event field (e.g. 'Order'). Tag ONLY key/unique identifier fields.",
    ),
  mapping: z
    .string()
    .optional()
    .describe(
      "Source expression in Title Case (e.g. 'Command.Email', 'now()').",
    ),
  validation: validationSpec
    .optional()
    .describe("Input validation for Command payload or Query params only."),
});

const queryItemSpec = z.object({
  types: z
    .array(z.string())
    .optional()
    .describe("Matching Event card names; empty matches all."),
  tagFields: z
    .array(z.string())
    .optional()
    .describe("Names of tagged inputFields on this card used to filter events."),
  set: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Projection mapping: outputFields in Title Case -> EventName.FieldName in Title Case (e.g. { 'Status': \"'ACTIVE'\", 'Email': 'User Registered.Email' }).",
    ),
});

export const constraintRuleSpec = z.union([
  z.string(),
  z.object({
    text: z.string().optional().describe("Human-readable rule text."),
    description: z.string().optional(),
    code: z.string().optional().describe("Domain error code (e.g. USER_NOT_FOUND)."),
    assert: z.string().optional().describe('CEL/JS invariant (e.g. "Fields"."User ID" != null).'),
    message: z.string().optional().describe("Error message."),
    severity: z.enum(["error", "warning"]).optional(),
    status: z.number().int().optional().describe("HTTP status code (e.g. 400, 404)."),
  }),
]);

type FieldSpec = z.output<typeof fieldSpec>;
type QueryItemSpec = z.output<typeof queryItemSpec>;
export type ConstraintRuleSpec = z.output<typeof constraintRuleSpec>;

function createStormField(
  name: string,
  fieldType = DEFAULT_FIELD_TYPE,
  required = false,
  description?: string,
  tag?: string,
  validation?: FieldValidation,
  mapping?: string,
): StormField {
  return {
    id: nanoid(),
    name,
    fieldType,
    required,
    description,
    tag,
    mapping: mapping?.trim() ? mapping.trim() : undefined,
    ...(validation ? { validation } : {}),
  };
}

function createStormQueryItem(
  types: string[] = [],
  tagFieldIds: string[] = [],
  set?: Record<string, string>,
): StormQueryItem {
  return {
    id: nanoid(),
    types,
    tagFieldIds,
    set: set && Object.keys(set).length > 0 ? set : undefined,
  };
}

function createStormConstraint(
  input: string | ConstraintRuleSpec = "",
): StormConstraint {
  if (typeof input === "string") {
    return {
      id: nanoid(),
      text: input,
    };
  }
  const label =
    input.text?.trim() ||
    input.description?.trim() ||
    input.code?.trim() ||
    input.assert?.trim() ||
    "";
  return {
    id: nanoid(),
    text: label,
    code: input.code?.trim() || undefined,
    assert: input.assert?.trim() || undefined,
    message: input.message?.trim() || undefined,
    severity: input.severity,
    status: typeof input.status === "number" ? input.status : undefined,
  };
}

function assertValidStormWrite(input: StormValidationInput): void {
  const issues = validateStormWrite(input);
  if (issues.length === 0) return;
  throw new Error(
    `Rejected: invalid event-storming references. Fix these and retry:\n${issues
      .map((issue) => `- ${issue}`)
      .join("\n")}\n${describeStormOptions(input)} Create the missing Event cards (with their field tags) or Command/Query cards (with their actions) first.`,
  );
}

function buildFields(
  specs: FieldSpec[] | undefined,
  kind: StormKind,
  options: {
    allowValidation?: boolean;
    env?: FieldTypeEnvironment;
    errors?: string[];
    label?: string;
  } = {},
): StormField[] {
  const typeless = kind === "actor";
  return (specs ?? []).map((spec) => {
    let fieldType: string;
    if (typeless) {
      fieldType = "";
    } else if (options.env) {
      const resolved = resolveFieldType(spec.fieldType, options.env);
      fieldType = resolved.type || DEFAULT_FIELD_TYPE;
      if (resolved.error) {
        options.errors?.push(
          `${options.label ? `${options.label} ` : ""}field "${toDisplayName(
            spec.name,
          )}" ${resolved.error}`,
        );
      }
    } else {
      fieldType = normalizeFieldType(spec.fieldType) || DEFAULT_FIELD_TYPE;
    }
    return createStormField(
      toDisplayName(spec.name),
      fieldType,
      typeless ? false : (spec.required ?? false),
      spec.description,
      spec.tag ? toDisplayName(spec.tag) : undefined,
      options.allowValidation ? normalizeValidation(spec.validation) : undefined,
      spec.mapping,
    );
  });
}

/**
 * Whether a kind's PRIMARY field list (Command payload / Query params) may
 * carry input validation. Command/Query responseFields and all other kinds
 * cannot.
 */
function kindValidatesFields(kind: StormKind): boolean {
  return kind === "command" || kind === "query";
}

function buildStormData(input: {
  kind: StormKind;
  name: string;
  description?: string;
  isArray?: boolean;
  fields: StormField[];
  inputFields?: StormField[];
  outputFields?: StormField[];
  responseFields?: StormField[];
  queryItems?: QueryItemSpec[];
  constraints?: (string | ConstraintRuleSpec)[];
  action?: string;
  permissions?: string[];
}): StormData {
  const isProjection = input.kind === "state" || input.kind === "constraint";
  const data: StormData = {
    kind: input.kind,
    name: toDisplayName(input.name),
    fields: isProjection ? [] : input.fields,
  };
  if (isProjection) {
    data.inputFields = input.inputFields ?? [];
    data.outputFields = input.outputFields ?? [];
  }
  if (input.description) data.description = input.description;
  if (input.isArray !== undefined) data.isArray = input.isArray;
  if (input.action && (input.kind === "command" || input.kind === "query")) {
    data.action = input.action.trim();
  }
  if (input.kind === "actor") {
    data.fields = [];
    if (input.permissions) {
      data.permissions = input.permissions.map((p) => p.trim()).filter(Boolean);
    }
  }
  if (input.responseFields && stormHasResponseFields(input.kind)) {
    data.responseFields = input.responseFields;
  }

  if (input.queryItems) {
    // Tags are supplied by INPUT params on projection cards; on every other
    // kind the primary field list is the tag source.
    const tagSource = isProjection
      ? (data.inputFields ?? [])
      : (data.fields ?? []);
    const fieldIdByName = new Map(
      tagSource.map((f) => [toDisplayName(f.name), f.id]),
    );
    data.queryItems = input.queryItems.map((item) => {
      const tagFieldIds = (item.tagFields ?? [])
        .map((name) => fieldIdByName.get(toDisplayName(name)))
        .filter((id): id is string => Boolean(id));
      return createStormQueryItem(
        (item.types ?? []).map(toDisplayName),
        tagFieldIds,
        item.set,
      );
    });
  }

  if (input.constraints) {
    data.constraints = input.constraints.map((text) =>
      createStormConstraint(text),
    );
  }

  return data;
}

function layoutSize(
  positions: StormLanePosition[],
  cards: StormLaneCard[],
): { width: number; height: number } {
  const byId = new Map(cards.map((card) => [card.id, card]));
  let width = 0;
  let height = 0;
  for (const pos of positions) {
    const card = byId.get(pos.id);
    if (!card) continue;
    width = Math.max(width, pos.x + card.width);
    height = Math.max(height, pos.y + card.height);
  }
  return { width, height };
}

export const createStormCardsTool = defineTool({
  name: "create_storm_cards",
  description:
    "Create event-storming cards (command, constraint, event, state, query, actor, external) in vertical slices. Command/Query specify action. Constraints act as Decision Models checking historical events. Events carry DCB tags on key fields.",
  schema: z.object({
    cards: z
      .array(
        z.object({
          kind: z.enum(STORM_KINDS),
          name: z.string().min(1).describe("Card title in Title Case (English)."),
          description: z
            .string()
            .optional()
            .describe("Concise, clear explanation of domain purpose."),
          isArray: z.boolean().optional(),
          fields: z.array(fieldSpec).optional(),
          inputFields: z
            .array(fieldSpec)
            .optional()
            .describe(
              "State & Constraint cards only: INPUT params (carry tags for queryItems).",
            ),
          outputFields: z
            .array(fieldSpec)
            .optional()
            .describe(
              "State & Constraint cards only: OUTPUT projected fields (no tags).",
            ),
          responseFields: z
            .array(fieldSpec)
            .optional()
            .describe("Query & Command cards: response payload."),
          queryItems: z
            .array(queryItemSpec)
            .optional()
            .describe("DCB queries matching event types & tagged input params."),
          constraints: z
            .array(constraintRuleSpec)
            .optional()
            .describe(
              "Constraint cards: domain invariants (strings or { code, assert, message, status }).",
            ),
          action: z
            .string()
            .optional()
            .describe("Authorization action (resource:verb:scope) for Command/Query."),
          permissions: z
            .array(z.string())
            .optional()
            .describe("Actor wildcard permissions (e.g. ['order:*'])."),
          x: z.number().optional(),
          y: z.number().optional(),
          groupId: z
            .string()
            .optional()
            .describe("Group ID or Section name to add this card to."),
        }),
      )
      .min(1)
      .max(100),
    arrange: z
      .boolean()
      .optional()
      .describe("Auto-arrange cards (default true)."),
    layout: z
      .enum(["verticalSlice", "lanes", "none"])
      .optional()
      .describe(
        "Layout arrangement: 'verticalSlice' (default for slices: Command/Query top -> Constraint/State middle -> Event/External bottom; a read-side Constraint stacks between Query and State) or 'lanes' (horizontal lanes).",
      ),
    nearCardId: z
      .string()
      .optional()
      .describe(
        "ID or name of an existing related domain card/slice to place the new cards immediately next to (domain proximity).",
      ),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const center = getViewportCenter(state);

    const resolveGroupId = (groupIdOrName?: string): string | undefined => {
      if (!groupIdOrName) return undefined;
      const direct = state.groups.find((g) => g.id === groupIdOrName);
      if (direct) return direct.id;
      const byName = state.groups.find(
        (g) => g.name.toLowerCase() === groupIdOrName.trim().toLowerCase(),
      );
      return byName?.id;
    };

    const typeEnv = buildFieldTypeEnvironment(state.objects);
    const typeErrors: string[] = [];

    const built = args.cards.map((spec) => {
      const label = `"${toDisplayName(spec.name)}" (${spec.kind})`;
      const fieldOptions = { env: typeEnv, errors: typeErrors, label };
      const data = buildStormData({
        kind: spec.kind,
        name: spec.name,
        description: spec.description,
        isArray: spec.isArray,
        action: spec.action,
        permissions: spec.permissions,
        fields: buildFields(spec.fields, spec.kind, {
          ...fieldOptions,
          allowValidation: kindValidatesFields(spec.kind),
        }),
        inputFields:
          spec.inputFields !== undefined
            ? buildFields(spec.inputFields, spec.kind, fieldOptions)
            : undefined,
        outputFields:
          spec.outputFields !== undefined
            ? buildFields(spec.outputFields, spec.kind, fieldOptions)
            : undefined,
        responseFields:
          spec.responseFields !== undefined
            ? buildFields(spec.responseFields, spec.kind, fieldOptions)
            : undefined,
        queryItems: spec.queryItems,
        constraints: spec.constraints,
      });

      const width = computeOptimalStormCardWidth(data);
      const height = computeStormCardHeight(data, width);
      const resolvedGroupId = resolveGroupId(spec.groupId);
      const obj: CanvasObject = {
        id: `storm-${nanoid()}`,
        type: "storm",
        x: 0,
        y: 0,
        width,
        height,
        stormData: data,
        ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
      };
      return { spec, obj };
    });

    if (typeErrors.length > 0) {
      throw new Error(fieldTypeError(typeErrors));
    }

    const validationInput: StormValidationInput = {
      existing: state.objects,
      cards: built.map(({ spec, obj }): StormValidationCard => ({
        kind: spec.kind,
        name: spec.name,
        fields: obj.stormData?.fields ?? [],
        inputFields: obj.stormData?.inputFields,
        outputFields: obj.stormData?.outputFields,
        responseFields: obj.stormData?.responseFields,
        rawFields: spec.fields,
        rawInputFields: spec.inputFields,
        rawOutputFields: spec.outputFields,
        rawResponseFields: spec.responseFields,
        queryItems: spec.queryItems,
        constraints: spec.constraints,
        action: obj.stormData?.action,
        permissions:
          obj.stormData?.kind === "actor"
            ? getActorPermissions(obj.stormData)
            : undefined,
      })),
    };
    assertValidStormWrite(validationInput);
    const warnings = collectStormWarnings(validationInput);

    const layoutMode =
      args.layout ??
      (args.arrange === false
        ? "none"
        : args.cards.some((c) => c.kind === "actor")
          ? "lanes"
          : "verticalSlice");

    if (layoutMode !== "none") {
      const layoutCards: StormLaneCard[] = built.map(({ obj }) => ({
        id: obj.id,
        kind: obj.stormData?.kind ?? "event",
        width: obj.width ?? 200,
        height: obj.height ?? 120,
      }));

      const arranger =
        layoutMode === "verticalSlice"
          ? arrangeVerticalSlice
          : arrangeStormLanes;
      const probe = arranger(layoutCards, { origin: { x: 0, y: 0 } });
      const size = layoutSize(probe, layoutCards);

      // Check for nearCardId (spatial domain proximity)
      let domainOriginCenter: { x: number; y: number } | undefined;
      if (args.nearCardId) {
        const needle = args.nearCardId.trim().toLowerCase();
        const nearObj = state.objects.find(
          (o) =>
            o.id === args.nearCardId ||
            (o.stormData?.name && o.stormData.name.toLowerCase() === needle) ||
            (o.modelData?.name && o.modelData.name.toLowerCase() === needle),
        );
        if (nearObj) {
          domainOriginCenter = {
            x: nearObj.x + (nearObj.width ?? 200) + 80,
            y: nearObj.y,
          };
        }
      }

      // If all cards belong to the same group, place them relative to that group
      const commonGroupId = built.every(
        (b) => b.obj.groupId && b.obj.groupId === built[0]?.obj.groupId,
      )
        ? built[0]?.obj.groupId
        : undefined;
      const targetGroup = commonGroupId
        ? state.groups.find((g) => g.id === commonGroupId)
        : undefined;

      let groupOriginCenter = domainOriginCenter ?? {
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
      };
      if (targetGroup) {
        const members = state.objects.filter(
          (o) => o.groupId === targetGroup.id && o.type !== "connector",
        );
        if (members.length > 0) {
          let maxX = -Infinity;
          let minY = Infinity;
          for (const m of members) {
            maxX = Math.max(maxX, m.x + m.width);
            minY = Math.min(minY, m.y);
          }
          groupOriginCenter = { x: maxX + 40, y: minY };
        } else if (targetGroup.customBounds) {
          groupOriginCenter = {
            x: targetGroup.customBounds.x + 24,
            y: targetGroup.customBounds.y + 24,
          };
        }
      }

      const origin = findFreeSpot(state.objects, size, groupOriginCenter, {
        // Steer the whole slice around existing Section frames so it does not
        // land inside a neighbouring group; the target group (when set) is
        // exempt so its members are not treated as obstacles to themselves.
        obstacles: getGroupObstacleRects(
          state.groups,
          commonGroupId
            ? groupAndAncestorIds(commonGroupId, state.groups)
            : undefined,
        ),
      });
      const byId = new Map(
        arranger(layoutCards, { origin }).map((pos) => [pos.id, pos]),
      );
      for (const { spec, obj } of built) {
        if (spec.x !== undefined && spec.y !== undefined) {
          obj.x = spec.x;
          obj.y = spec.y;
        } else {
          const pos = byId.get(obj.id);
          if (pos) {
            obj.x = pos.x;
            obj.y = pos.y;
          }
        }
      }
    } else {
      const placed: CanvasObject[] = [];
      for (const { spec, obj } of built) {
        if (spec.x !== undefined && spec.y !== undefined) {
          obj.x = spec.x;
          obj.y = spec.y;
        } else {
          let searchCenter = center;
          if (obj.groupId) {
            const targetGroup = state.groups.find((g) => g.id === obj.groupId);
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
          const spot = findFreeSpot(
            [...state.objects, ...placed],
            { width: obj.width ?? 200, height: obj.height ?? 120 },
            searchCenter,
            {
              obstacles: getGroupObstacleRects(
                state.groups,
                obj.groupId
                  ? groupAndAncestorIds(obj.groupId, state.groups)
                  : undefined,
              ),
            },
          );
          obj.x = spot.x;
          obj.y = spot.y;
        }
        placed.push(obj);
      }
    }

    const created: Array<{ id: string; name: string; kind: StormKind }> = [];
    for (const { spec, obj } of built) {
      state.addObject(obj);
      created.push({
        id: obj.id,
        name: obj.stormData?.name ?? toDisplayName(spec.name),
        kind: spec.kind,
      });
    }

    return {
      created: created.map(({ id, name, kind }) => ({ id, name, kind })),
      count: created.length,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
});

export const updateStormCardTool = defineTool({
  name: "update_storm_card",
  description:
    "Update an existing event-storming card. Use this especially for Constraint Evolution (updating queryItems when new related events are added), updating authorization actions/permissions, or refining descriptions. When replacing `fields` on a Command or Query, include each field's `validation` (minLength/maxLength/pattern/format/min/max/allowedValues) so input validation is preserved.",
  schema: z.object({
    id: z.string().describe("Card ID to update."),
    name: z.string().optional().describe("New card title in Title Case (English)."),
    description: z
      .string()
      .optional()
      .describe("Concise, clear explanation of domain purpose."),
    isArray: z.boolean().optional(),
    fields: z.array(fieldSpec).optional(),
    inputFields: z
      .array(fieldSpec)
      .optional()
      .describe("State & Constraint: replace INPUT params (tags allowed here)."),
    outputFields: z
      .array(fieldSpec)
      .optional()
      .describe("State & Constraint: replace OUTPUT fields (no tags)."),
    responseFields: z
      .array(fieldSpec)
      .optional()
      .describe("Query & Command: replace RESPONSE payload."),
    queryItems: z
      .array(queryItemSpec)
      .optional()
      .describe("Updated queryItems for State/Constraint."),
    constraints: z
      .array(constraintRuleSpec)
      .optional()
      .describe("Updated constraints (strings or { code, assert, message, status })."),
    action: z
      .string()
      .optional()
      .describe("Authorization action (resource:verb:scope)."),
    permissions: z
      .array(z.string())
      .optional()
      .describe("Actor permissions with wildcards."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const object = state.objects.find((o) => o.id === args.id);
    if (!object) return { updated: false, error: "No object with that id." };
    if (object.type !== "storm" || !object.stormData) {
      return { updated: false, error: "Object is not an event-storming card." };
    }

    const existing = object.stormData;
    const isProjection =
      existing.kind === "state" || existing.kind === "constraint";
    const typeEnv = buildFieldTypeEnvironment(state.objects);
    const typeErrors: string[] = [];
    const fieldOptions = {
      env: typeEnv,
      errors: typeErrors,
      label: `"${existing.name}" (${existing.kind})`,
    };
    const fields =
      args.fields !== undefined
        ? buildFields(args.fields, existing.kind, {
            ...fieldOptions,
            allowValidation: kindValidatesFields(existing.kind),
          })
        : existing.fields;
    const inputFields =
      args.inputFields !== undefined
        ? buildFields(args.inputFields, existing.kind, fieldOptions)
        : existing.inputFields;
    const outputFields =
      args.outputFields !== undefined
        ? buildFields(args.outputFields, existing.kind, fieldOptions)
        : existing.outputFields;
    const responseFields =
      args.responseFields !== undefined
        ? buildFields(args.responseFields, existing.kind, fieldOptions)
        : undefined;

    const writtenPermissions =
      args.permissions !== undefined
        ? args.permissions
        : args.fields !== undefined && existing.kind === "actor"
          ? fields.map((f) => f.name)
          : undefined;

    const validationInput: StormValidationInput = {
      existing: state.objects.filter((o) => o.id !== args.id),
      cards: [
        {
          kind: existing.kind,
          name: args.name !== undefined ? args.name : existing.name,
          fields: isProjection ? [] : fields,
          inputFields: isProjection ? inputFields : undefined,
          outputFields: isProjection ? outputFields : undefined,
          responseFields: responseFields ?? existing.responseFields,
          writtenFields: args.fields !== undefined ? fields : [],
          rawFields: args.fields,
          rawInputFields: args.inputFields,
          rawOutputFields: args.outputFields,
          rawResponseFields: args.responseFields,
          queryItems: args.queryItems ?? existing.queryItems,
          constraints: args.constraints ?? existing.constraints,
          action: args.action ?? existing.action,
          permissions:
            existing.kind === "actor"
              ? getActorPermissions({
                  ...existing,
                  permissions: args.permissions ?? existing.permissions,
                  fields,
                })
              : undefined,
          writtenPermissions:
            existing.kind === "actor"
              ? (writtenPermissions ?? [])
              : undefined,
        },
      ],
    };
    if (typeErrors.length > 0) {
      throw new Error(fieldTypeError(typeErrors));
    }
    assertValidStormWrite(validationInput);
    const warnings = collectStormWarnings(validationInput);

    const data = buildStormData({
      kind: existing.kind,
      name: args.name !== undefined ? toDisplayName(args.name) : existing.name,
      description: args.description ?? existing.description,
      isArray: args.isArray ?? existing.isArray,
      fields,
      inputFields,
      outputFields,
      responseFields,
      queryItems: args.queryItems,
      constraints: args.constraints,
      action: args.action ?? existing.action,
      permissions: args.permissions ?? existing.permissions,
    });
    if (args.responseFields === undefined) {
      data.responseFields = existing.responseFields;
    }
    if (args.inputFields === undefined) data.inputFields = existing.inputFields;
    if (args.outputFields === undefined)
      data.outputFields = existing.outputFields;
    if (args.queryItems === undefined) data.queryItems = existing.queryItems;
    if (args.constraints === undefined) data.constraints = existing.constraints;

    // A width the user resized by hand is preserved (height still reflows to
    // the new content); otherwise the card refits to its content width.
    const newWidth = object.widthLocked
      ? object.width || 200
      : Math.max(object.width || 200, computeOptimalStormCardWidth(data));
    const newHeight = computeStormCardHeight(data, newWidth);
    state.updateObject(args.id, {
      stormData: data,
      width: newWidth,
      height: newHeight,
    });
    return {
      updated: true,
      id: args.id,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
});

export const arrangeStormLanesTool = defineTool({
  name: "arrange_storm_lanes",
  description:
    "Re-arrange event-storming cards into Actor→Command→Event→External→Query→State→Constraint lanes.",
  schema: z.object({
    cardIds: z.array(z.string()).optional(),
    origin: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe("Top-left anchor."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    let cards = state.objects.filter(
      (o): o is CanvasObject & { stormData: StormData } =>
        o.type === "storm" && Boolean(o.stormData),
    );
    if (args.cardIds?.length) {
      const wanted = new Set(args.cardIds);
      cards = cards.filter((o) => wanted.has(o.id));
    }
    if (cards.length === 0) {
      return { arranged: 0, positions: [] };
    }

    const bounds = getObjectsBounds(cards);
    const origin =
      args.origin ??
      (bounds ? { x: bounds.minX, y: bounds.minY } : { x: 0, y: 0 });

    const positions = arrangeStormLanes(
      cards.map((o) => ({
        id: o.id,
        kind: o.stormData.kind,
        width: o.width ?? 200,
        height: o.height ?? 120,
      })),
      { origin },
    );

    for (const pos of positions) {
      state.updateObject(pos.id, { x: pos.x, y: pos.y });
    }

    return { arranged: positions.length, positions };
  },
});

export const arrangeStormSliceTool = defineTool({
  name: "arrange_storm_slice",
  description:
    "Re-center an existing vertical slice in place. Call this after adding, removing, or reordering cards in a slice (or whenever a lane grows, e.g. an extra Constraint appears in the middle layer): it re-lays the slice out top-to-bottom and centers every layer (Command/Query, Constraint(s), Event(s)/State) on the widest layer, so the upper and lower lanes are no longer left shifted when the middle layer widens. Existing separator lines are re-fitted into the new gaps automatically.",
  schema: z.object({
    cardIds: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe(
        "Ids of every card in the slice (Command/Query, Constraint(s), Event(s)/State).",
      ),
    layout: z
      .enum(["verticalSlice", "lanes"])
      .optional()
      .describe(
        "'verticalSlice' (default, top-to-bottom slice) or 'lanes' (horizontal Actor→…→Constraint lanes).",
      ),
    origin: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe("Top-left anchor. Defaults to the slice's current top-left."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const wanted = new Set(args.cardIds);
    const cards = state.objects.filter(
      (o): o is CanvasObject & { stormData: StormData } =>
        o.type === "storm" && Boolean(o.stormData) && wanted.has(o.id),
    );
    if (cards.length === 0) {
      return { arranged: 0, positions: [] };
    }

    const bounds = getObjectsBounds(cards);
    const origin =
      args.origin ??
      (bounds ? { x: bounds.minX, y: bounds.minY } : { x: 0, y: 0 });

    const arranger =
      (args.layout ?? "verticalSlice") === "lanes"
        ? arrangeStormLanes
        : arrangeVerticalSlice;
    const positions = arranger(
      cards.map((o) => ({
        id: o.id,
        kind: o.stormData.kind,
        width: o.width ?? 200,
        height: o.height ?? 120,
      })),
      { origin },
    );

    for (const pos of positions) {
      state.updateObject(pos.id, { x: pos.x, y: pos.y });
    }

    return { arranged: positions.length, positions };
  },
});

export const stormTools = [
  createStormCardsTool,
  updateStormCardTool,
  arrangeStormLanesTool,
  arrangeStormSliceTool,
];
