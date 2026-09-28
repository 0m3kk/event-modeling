import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasObject, StormData, StormField, StormKind, StormQueryItem, StormConstraint } from "@/types";
import {
  computeStormCardHeight,
  computeOptimalStormCardWidth,
} from "@/utils/cardDimensions";
import { toDisplayName } from "@/utils/naming";
import { arrangeStormLanes, type StormLaneCard, type StormLanePosition } from "@/utils/stormLayout";
import {
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
  fieldType: z.string().optional().describe("Type or Model node name (default 'string'). Notify cards ignore type."),
  required: z.boolean().optional(),
  description: z.string().optional(),
  tag: z.string().optional().describe("Tag name (e.g. 'Order')."),
});

const queryItemSpec = z.object({
  types: z.array(z.string()).optional().describe("Existing Event card names; empty matches all."),
  tagFields: z.array(z.string()).optional().describe("Names of tagged fields on this card."),
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
      .join("\n")}\n${describeStormOptions(input)} Create the missing Event cards (with their field tags) first.`,
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
  if (input.permissions && input.kind === "actor") {
    data.permissions = input.permissions.map((p) => p.trim()).filter(Boolean);
    if (!input.fields || input.fields.length === 0) {
      data.fields = data.permissions.map((p) => createStormField(p, ""));
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
    "Create event-storming cards (command / event / notify / query / actor / state / constraint). Arranges cards into lanes unless arrange=false. Query-item 'types' must name existing Event cards, and State/Constraint field tags must exist on an Event field.",
  schema: z.object({
    cards: z
      .array(
        z.object({
          kind: z.enum(STORM_KINDS),
          name: z.string().min(1),
          description: z.string().optional(),
          isArray: z.boolean().optional(),
          fields: z.array(fieldSpec).optional(),
          responseFields: z.array(fieldSpec).optional(),
          queryItems: z.array(queryItemSpec).optional(),
          constraints: z.array(z.string()).optional(),
          action: z.string().optional(),
          permissions: z.array(z.string()).optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .min(1)
      .max(100),
    arrange: z.boolean().optional().describe("Auto-arrange into lanes (default true)."),
  }),
  execute: (args, ctx) => {
    const state = ctx.getState();
    const center = getViewportCenter(state);

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
      const obj: CanvasObject = {
        id: `storm-${nanoid()}`,
        type: "storm",
        x: 0,
        y: 0,
        width,
        height,
        stormData: data,
      };
      return { spec, obj };
    });

    assertValidStormWrite({
      existing: state.objects,
      cards: built.map(({ spec, obj }): StormValidationCard => ({
        kind: spec.kind,
        name: obj.stormData?.name ?? toDisplayName(spec.name),
        fields: obj.stormData?.fields ?? [],
        queryItems: spec.queryItems,
      })),
    });

    if (args.arrange !== false) {
      const layoutCards: StormLaneCard[] = built.map(({ obj }) => ({
        id: obj.id,
        kind: obj.stormData?.kind ?? "event",
        width: obj.width ?? 200,
        height: obj.height ?? 120,
      }));
      const probe = arrangeStormLanes(layoutCards, { origin: { x: 0, y: 0 } });
      const size = layoutSize(probe, layoutCards);
      const origin = findFreeSpot(state.objects, size, {
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
      });
      const byId = new Map(
        arrangeStormLanes(layoutCards, { origin }).map((pos) => [pos.id, pos]),
      );
      for (const { obj } of built) {
        const pos = byId.get(obj.id);
        if (pos) {
          obj.x = pos.x;
          obj.y = pos.y;
        }
      }
    } else {
      const placed: CanvasObject[] = [];
      for (const { spec, obj } of built) {
        if (spec.x !== undefined && spec.y !== undefined) {
          obj.x = spec.x;
          obj.y = spec.y;
        } else {
          const spot = findFreeSpot(
            [...state.objects, ...placed],
            { width: obj.width ?? 200, height: obj.height ?? 120 },
            center,
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
    };
  },
});

export const updateStormCardTool = defineTool({
  name: "update_storm_card",
  description:
    "Update an existing event-storming card. Recalculates card height automatically.",
  schema: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    isArray: z.boolean().optional(),
    fields: z.array(fieldSpec).optional(),
    responseFields: z.array(fieldSpec).optional(),
    queryItems: z.array(queryItemSpec).optional(),
    constraints: z.array(z.string()).optional(),
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

    assertValidStormWrite({
      existing: state.objects,
      cards: [
        {
          kind: existing.kind,
          name:
            args.name !== undefined ? toDisplayName(args.name) : existing.name,
          fields,
          writtenFields: args.fields !== undefined ? fields : [],
          queryItems: args.queryItems,
        },
      ],
    });

    const data = buildStormData({
      kind: existing.kind,
      name: args.name !== undefined ? toDisplayName(args.name) : existing.name,
      description: args.description ?? existing.description,
      isArray: args.isArray ?? existing.isArray,
      fields,
      responseFields,
      queryItems: args.queryItems,
      constraints: args.constraints,
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
    return { updated: true, id: args.id };
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
