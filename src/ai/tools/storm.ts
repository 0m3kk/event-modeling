import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasObject, StormData, StormField, StormKind, StormQueryItem, StormConstraint } from "@/types";
import {
  computeStormCardHeight,
  computeOptimalStormCardWidth,
} from "@/utils/cardDimensions";
import { toDisplayName } from "@/utils/naming";
import { getActorPermissions } from "@/utils/stormAuth";
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
import { findFreeSpot, getObjectsBounds, getViewportCenter } from "./helpers";

const STORM_KINDS = [
  "command",
  "event",
  "notify",
  "query",
  "actor",
  "state",
  "constraint",
] as const;

const fieldSpec = z.object({
  name: z.string(),
  fieldType: z
    .string()
    .optional()
    .describe(
      "Type or Model node name (default 'string'). Notify cards ignore type.",
    ),
  required: z.boolean().optional(),
  description: z
    .string()
    .optional()
    .describe("Short, clear domain explanation of the field purpose."),
  tag: z
    .string()
    .optional()
    .describe(
      "Tag name on Event field for DCB dynamic consistency boundary (e.g. 'Order'). Tag ONLY key/unique identifier fields (IDs, unique email, code); never tag non-key fields or all fields.",
    ),
});

const queryItemSpec = z.object({
  types: z
    .array(z.string())
    .optional()
    .describe(
      "Existing Event card names evaluated by this Constraint/State; empty matches all.",
    ),
  tagFields: z
    .array(z.string())
    .optional()
    .describe(
      "Names of tagged fields on this card used to filter matching events.",
    ),
});

type FieldSpec = z.output<typeof fieldSpec>;
type QueryItemSpec = z.output<typeof queryItemSpec>;

function createStormField(
  name: string,
  fieldType = "string",
  required = false,
  description?: string,
  tag?: string,
): StormField {
  return {
    id: nanoid(),
    name,
    fieldType,
    required,
    description,
    tag,
  };
}

function createStormQueryItem(
  types: string[] = [],
  tagFieldIds: string[] = [],
): StormQueryItem {
  return {
    id: nanoid(),
    types,
    tagFieldIds,
  };
}

function createStormConstraint(text = ""): StormConstraint {
  return {
    id: nanoid(),
    text,
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

function buildFields(specs: FieldSpec[] | undefined, kind: StormKind): StormField[] {
  return (specs ?? []).map((spec) => {
    const fieldType = kind === "notify" || kind === "actor" ? "" : (spec.fieldType ?? "string");
    return createStormField(
      toDisplayName(spec.name),
      fieldType,
      kind === "notify" || kind === "actor" ? false : (spec.required ?? false),
      spec.description,
      spec.tag ? toDisplayName(spec.tag) : undefined,
    );
  });
}

function buildStormData(input: {
  kind: StormKind;
  name: string;
  description?: string;
  isArray?: boolean;
  fields: StormField[];
  responseFields?: StormField[];
  queryItems?: QueryItemSpec[];
  constraints?: string[];
  action?: string;
  permissions?: string[];
}): StormData {
  const data: StormData = {
    kind: input.kind,
    name: toDisplayName(input.name),
    fields: input.fields,
  };
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
  if (input.responseFields && input.kind === "query") {
    data.responseFields = input.responseFields;
  }

  if (input.queryItems) {
    const fieldIdByName = new Map(
      input.fields.map((f) => [toDisplayName(f.name), f.id]),
    );
    data.queryItems = input.queryItems.map((item) => {
      const tagFieldIds = (item.tagFields ?? [])
        .map((name) => fieldIdByName.get(toDisplayName(name)))
        .filter((id): id is string => Boolean(id));
      return createStormQueryItem(
        (item.types ?? []).map(toDisplayName),
        tagFieldIds,
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
    "Create event-storming cards. For Write Slices: Command (intent + action) -> Constraint (reusable Decision Model checking business logic invariants against historical events, independent of command) -> Event (past fact with field tags only on key/unique fields; prefer event fields that also appear in the Command or Constraint payload, though timestamp/audit fields like Created At/Updated At are exempt). For Read Slices: Query (params + responseFields + action) -> State (projection with queryItems) <- Event. Actor specifies permissions (wildcard) and must NOT be connected to Command/Query. Query-item 'types' must name existing Event cards, and State/Constraint field tags must exist on an Event field. Actor permissions must match an existing Command or Query action on the canvas.",
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
          responseFields: z
            .array(fieldSpec)
            .optional()
            .describe("Query cards only (output fields)."),
          queryItems: z
            .array(queryItemSpec)
            .optional()
            .describe(
              "State & Constraint cards: DCB query matching event types and tagged fields.",
            ),
          constraints: z
            .array(z.string())
            .optional()
            .describe(
              "Constraint cards only: domain business logic invariants evaluated against historical events (not command input validation). Constraints are reusable and independent.",
            ),
          action: z
            .string()
            .optional()
            .describe(
              "Authorization action (resource:verb:scope) required for Command and Query cards (e.g. 'order:create:own', 'order:read:own').",
            ),
          permissions: z
            .array(z.string())
            .optional()
            .describe(
              "Actor cards only: wildcard permission patterns (e.g. ['order:*', '*:read:own']).",
            ),
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
        "Layout arrangement: 'verticalSlice' (default for slices: Command/Query top -> Constraint/State middle -> Event/Notify bottom) or 'lanes' (horizontal lanes).",
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

    const built = args.cards.map((spec) => {
      const data = buildStormData({
        kind: spec.kind,
        name: spec.name,
        description: spec.description,
        isArray: spec.isArray,
        action: spec.action,
        permissions: spec.permissions,
        fields: buildFields(spec.fields, spec.kind),
        responseFields:
          spec.responseFields !== undefined
            ? buildFields(spec.responseFields, spec.kind)
            : undefined,
        queryItems: spec.queryItems,
        constraints: spec.constraints,
      });

      const height = computeStormCardHeight(data);
      const width = computeOptimalStormCardWidth(data);
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

    const validationInput: StormValidationInput = {
      existing: state.objects,
      cards: built.map(({ spec, obj }): StormValidationCard => ({
        kind: spec.kind,
        name: obj.stormData?.name ?? toDisplayName(spec.name),
        fields: obj.stormData?.fields ?? [],
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

      const origin = findFreeSpot(state.objects, size, groupOriginCenter);
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
    "Update an existing event-storming card. Use this especially for Constraint Evolution (updating queryItems when new related events are added), updating authorization actions/permissions, or refining descriptions.",
  schema: z.object({
    id: z.string().describe("Card ID to update."),
    name: z.string().optional().describe("New card title in Title Case (English)."),
    description: z
      .string()
      .optional()
      .describe("Concise, clear explanation of domain purpose."),
    isArray: z.boolean().optional(),
    fields: z.array(fieldSpec).optional(),
    responseFields: z.array(fieldSpec).optional(),
    queryItems: z
      .array(queryItemSpec)
      .optional()
      .describe(
        "Updated queryItems for State/Constraint (e.g. adding new event types during Constraint Evolution).",
      ),
    constraints: z.array(z.string()).optional(),
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
    const fields =
      args.fields !== undefined
        ? buildFields(args.fields, existing.kind)
        : existing.fields;
    const responseFields =
      args.responseFields !== undefined
        ? buildFields(args.responseFields, existing.kind)
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
          name:
            args.name !== undefined ? toDisplayName(args.name) : existing.name,
          fields,
          writtenFields: args.fields !== undefined ? fields : [],
          queryItems: args.queryItems,
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
    assertValidStormWrite(validationInput);
    const warnings = collectStormWarnings(validationInput);

    const data = buildStormData({
      kind: existing.kind,
      name: args.name !== undefined ? toDisplayName(args.name) : existing.name,
      description: args.description ?? existing.description,
      isArray: args.isArray ?? existing.isArray,
      fields,
      responseFields,
      queryItems: args.queryItems,
      constraints: args.constraints,
      action: args.action ?? existing.action,
      permissions: args.permissions ?? existing.permissions,
    });
    if (args.responseFields === undefined) {
      data.responseFields = existing.responseFields;
    }
    if (args.queryItems === undefined) data.queryItems = existing.queryItems;
    if (args.constraints === undefined) data.constraints = existing.constraints;

    const newHeight = computeStormCardHeight(data);
    const newWidth = Math.max(
      object.width || 200,
      computeOptimalStormCardWidth(data),
    );
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
    "Re-arrange event-storming cards into Actor→Command→Event→Notify→Query→State→Constraint lanes.",
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

export const stormTools = [
  createStormCardsTool,
  updateStormCardTool,
  arrangeStormLanesTool,
];
