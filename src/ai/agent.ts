import { toolRegistry, ToolValidationError } from "@/tools";
import type { ValidationIssue } from "@/tools";
import { useCanvasStore } from "@/store";
import { collectBoardTags } from "@/utils/eventTags";
import { getElementName, nameKey, normalizeIdentifierNames } from "@/utils/naming";
import {
  listDefinedTypeNames,
  PRIMITIVE_FIELD_TYPES,
} from "@/utils/typeCatalog";
import {
  isSliceEligibleChild,
  SLICE_TYPE,
  type SliceElement,
  type SliceLane,
} from "@/tools/sliceCard/layout";
import {
  DOMAIN_TYPE,
  isNestableInDomain,
  type DomainElement,
} from "@/tools/domainCard/layout";
import {
  GROUP_TYPE,
  isGroupEligibleChild,
} from "@/tools/groupCard/layout";
import { z } from "zod";
import { sendChatMessage, createSessionId, type AISettings, type ChatMessage } from "./client";
import type { CanvasElement, Point } from "@/types";
import { findFreeSpot } from "@/utils/placement";

/** Breathing room kept between free-standing AI-created cards. */
const AI_PLACEMENT_GAP = 40;

export interface AgentStepCallback {
  onToolCall?: (toolName: string, args: any) => void;
  onAssistantMessage?: (content: string) => void;
}

function getViewportCenter(): Point {
  const vp = useCanvasStore.getState().viewport;
  const zoom = vp.zoom || 1;
  return {
    x: -vp.x / zoom + (vp.screenWidth || 800) / (2 * zoom),
    y: -vp.y / zoom + (vp.screenHeight || 600) / (2 * zoom),
  };
}

function isZodOptional(schema: any): boolean {
  const typeName = schema?._def?.typeName;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}

/**
 * Recursively converts a Zod schema into a JSON Schema object understood by the
 * OpenAI tools API. Unlike a flat shape dump, this preserves nested arrays and
 * objects (e.g. `queryItems[].tags[] = { tag, field }`) so the model knows the
 * exact structure it must produce.
 */
export function zodToJsonSchema(schema: any): any {
  if (!schema) return { type: "object" };

  const def = schema._def;
  const typeName = def?.typeName;
  const description: string | undefined = schema.description;
  const withDesc = (obj: any) => (description ? { ...obj, description } : obj);

  switch (typeName) {
    case "ZodString":
      return withDesc({ type: "string" });
    case "ZodNumber":
      return withDesc({ type: "number" });
    case "ZodBoolean":
      return withDesc({ type: "boolean" });
    case "ZodBigInt":
      return withDesc({ type: "integer" });
    case "ZodEnum":
      return withDesc({ type: "string", enum: def.values });
    case "ZodNativeEnum":
      return withDesc({ type: "string", enum: Object.values(def.values) });
    case "ZodLiteral":
      return withDesc({ type: typeof def.value, enum: [def.value] });
    case "ZodArray":
      return withDesc({ type: "array", items: zodToJsonSchema(def.type) });
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries<any>(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isZodOptional(value)) required.push(key);
      }
      return withDesc({
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      });
    }
    case "ZodOptional":
    case "ZodDefault":
      return withDesc(zodToJsonSchema(def.innerType));
    case "ZodEffects":
      return withDesc(zodToJsonSchema(def.schema));
    case "ZodRecord":
    case "ZodAny":
    case "ZodUnknown":
      return withDesc({ type: "object" });
    default:
      return withDesc({ type: "object" });
  }
}

/** Maps a create tool name to its generated update counterpart. */
function toUpdateToolName(createToolName: string): string {
  return createToolName.startsWith("create_")
    ? `update_${createToolName.slice("create_".length)}`
    : `update_${createToolName}`;
}

/** Maps an update tool name back to the create tool name it was derived from. */
function toCreateToolName(updateToolName: string): string {
  return updateToolName.startsWith("update_")
    ? `create_${updateToolName.slice("update_".length)}`
    : updateToolName;
}

/**
 * Extra JSON-schema properties injected into every lane-eligible card tool so
 * the model can place the card it creates (or moves) into a Slice lane in the
 * same call. Resolved by {@link resolveSliceMembership}.
 */
const SLICE_PLACEMENT_PROPS: Record<string, any> = {
  slice: {
    type: "string",
    description:
      "Optional: name of an existing Slice to place this card inside one of its lanes. " +
      "Set this right after create_slice so AI-made slices are not left empty.",
  },
  lane: {
    type: "string",
    description:
      "Optional lane inside `slice`, when the card's type alone is ambiguous or the lane " +
      "should be chosen explicitly. Accepts the lane's card type (e.g. eventCard, queryCard, " +
      "stateCard, viewCard) or its 1-based position from the top. Defaults to the lane whose " +
      "reserved type matches this card.",
  },
};

/**
 * Extra JSON-schema property injected into every non-Domain card tool so the
 * model can place the card (or slice) inside a Domain frame in the same call.
 * Resolved by {@link resolveDomainMembership}.
 */
const DOMAIN_PLACEMENT_PROPS: Record<string, any> = {
  domain: {
    type: "string",
    description:
      "Optional: name of an existing Domain frame to place this card (or Slice) inside. " +
      "If no Domain exists yet, create one first with create_domain_card, then pass its name here. " +
      "A card that lives in a Slice lane cannot also be in a Domain — put the Slice itself, " +
      "not its lane cards, into the Domain.",
  },
};

/**
 * Extra JSON-schema property injected into every group-eligible card tool so
 * the model can place a definition/service card inside a Group frame in the
 * same call. Resolved by {@link resolveGroupMembership}.
 */
const GROUP_PLACEMENT_PROPS: Record<string, any> = {
  group: {
    type: "string",
    description:
      "Optional: name of an existing Group (a small frame that clusters Object/Enum/Alias definitions " +
      "or Services, normally inside a Domain) to place this card inside. Only Object, Enum, Alias and " +
      "Service cards can join a Group. Ignored when the card is placed in a Slice lane.",
  },
};

export function buildOpenAITools(): any[] {
  const aiTools = toolRegistry.getAITools();
  const tools: any[] = [];

  // 1. Generic canvas overview tool
  tools.push({
    type: "function",
    function: {
      name: "get_canvas_overview",
      description:
        "Read all current elements on the canvas, including their IDs, types, and summary data. " +
        "Also returns `eventTypes`, `tagCatalog` (every DCB tag currently attached to an event field, " +
        "with its type and source events), `slices` (each Slice with its lanes and the cards already " +
        "placed in them), `groups` (each Group frame with the definition/service cards it clusters) " +
        "and `domains` (each Domain frame with the cards/slices it contains) so you " +
        "can build valid State card query tags, target slice lanes, and place new items into the right Domain.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  });

  // 2. Generic clear canvas tool
  tools.push({
    type: "function",
    function: {
      name: "clear_canvas",
      description: "Delete all elements and clear the canvas.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  });

  // 3. Generic single-element delete tool
  tools.push({
    type: "function",
    function: {
      name: "delete_element",
      description:
        "Delete one element, located by its current name (`target`). Optionally narrow by `type` " +
        "(e.g. eventCard, stateCard). Use get_canvas_overview to find the exact name first.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Current name of the element to delete (must exist on the board)",
          },
          type: {
            type: "string",
            description: "Optional element type to disambiguate (e.g. eventCard, stateCard)",
          },
        },
        required: ["target"],
      },
    },
  });

  // 4. Dynamic decoupled tools from registry: each create tool also gets a
  //    matching update tool that reuses the same payload schema plus a
  //    `target` locator (the card's current name). Lane-eligible card tools
  //    also accept `slice` / `lane` so the model can drop the card straight
  //    into a Slice lane instead of leaving AI-made slices empty.
  for (const t of aiTools) {
    const definition = toolRegistry.getByAIToolName(t.toolName);
    const eligibleForLane = isSliceEligibleChild(definition?.type ?? "");
    // Every card can live in a Domain except a Domain itself (no nesting).
    const eligibleForDomain = definition?.type !== DOMAIN_TYPE;
    // Only definition/service cards can live in a Group.
    const eligibleForGroup = isGroupEligibleChild(definition?.type ?? "");
    const createParams = zodToJsonSchema(t.parameters);
    if (eligibleForLane) Object.assign(createParams.properties, SLICE_PLACEMENT_PROPS);
    if (eligibleForGroup) Object.assign(createParams.properties, GROUP_PLACEMENT_PROPS);
    if (eligibleForDomain) Object.assign(createParams.properties, DOMAIN_PLACEMENT_PROPS);

    tools.push({
      type: "function",
      function: {
        name: t.toolName,
        description: t.description,
        parameters: createParams,
      },
    });

    const updateParams = zodToJsonSchema(
      (t.parameters as z.ZodObject<any>).extend({
        target: z
          .string()
          .describe("Current name of the element to update (must exist on the board)"),
      }),
    );
    if (eligibleForLane) Object.assign(updateParams.properties, SLICE_PLACEMENT_PROPS);
    if (eligibleForGroup) Object.assign(updateParams.properties, GROUP_PLACEMENT_PROPS);
    if (eligibleForDomain) Object.assign(updateParams.properties, DOMAIN_PLACEMENT_PROPS);

    tools.push({
      type: "function",
      function: {
        name: toUpdateToolName(t.toolName),
        description:
          "Update an existing element located by its current name (`target`). " +
          "Send the COMPLETE corrected definition: the payload replaces the existing data " +
          "(array sections like fields/params are replaced wholesale). " +
          t.description,
        parameters: updateParams,
      },
    });
  }

  return tools;
}

/**
 * Shared error payload returned to the model when a creation is rejected, so
 * it can fix the data (create a missing event/tag/type first) and retry.
 */
function buildValidationError(issues: ValidationIssue[]): string {
  const latest = useCanvasStore.getState();
  const eventTypes = latest.elements
    .filter((el) => el.type === "eventCard")
    .map((el) => el.data?.name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  return JSON.stringify({
    status: "error",
    error: "validation_failed",
    message: "The card was NOT created or updated because its data breaks domain rules.",
    issues,
    tagCatalog: collectBoardTags(latest.elements),
    eventTypes,
    definedTypes: listDefinedTypeNames(latest.elements),
    primitiveTypes: Array.from(PRIMITIVE_FIELD_TYPES),
  });
}

/** Finds a board element by name (and optional type) using normalized names. */
function findElementByName(
  elements: CanvasElement[],
  name: string,
  type?: string,
): CanvasElement | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return elements.find(
    (el) => (!type || el.type === type) && nameKey(getElementName(el) ?? "") === key,
  );
}

interface SlicePlacement {
  /** True only when the call actually carried a `slice` argument. */
  requested: boolean;
  sliceId?: string;
  laneId?: string;
  error?: { message: string; issues: ValidationIssue[] };
}

const NOT_REQUESTED: SlicePlacement = { requested: false };

/**
 * Turns the optional `slice` / `lane` arguments of a create/update call into
 * concrete `sliceId` / `laneId` membership for a card.
 *
 * `slice` is the slice's name; `lane` (optional) is the lane's card type
 * (e.g. "eventCard" or its display name "Event") or its 1-based position from
 * the top. Without `lane`, the card's own type picks the lane, which is enough
 * for the typed lanes create_slice produces. An explicit empty `slice` detaches
 * the card from any slice/lane.
 */
function resolveSliceMembership(
  elements: CanvasElement[],
  cardType: string,
  args: any,
): SlicePlacement {
  if (!args || typeof args !== "object" || !("slice" in args)) return NOT_REQUESTED;

  const sliceName = typeof args.slice === "string" ? args.slice.trim() : "";
  if (!sliceName) return { requested: true, sliceId: undefined, laneId: undefined };

  const issue = (code: string, message: string, path = "slice"): SlicePlacement => ({
    requested: true,
    error: { message, issues: [{ path, code, message }] },
  });

  if (!isSliceEligibleChild(cardType)) {
    return issue(
      "slice_ineligible_card",
      `${cardType} cards cannot be placed in a slice lane (Enum, Object, Alias and Slice cards stay outside slices).`,
    );
  }

  const slice = findElementByName(elements, sliceName, SLICE_TYPE) as
    | SliceElement
    | undefined;
  if (!slice) {
    return issue(
      "slice_not_found",
      `No Slice named "${sliceName}" exists on the board. Create it first or use get_canvas_overview to list slices.`,
    );
  }

  const lanes: SliceLane[] = slice.data?.lanes ?? [];
  if (lanes.length === 0) {
    return issue("lane_not_found", `Slice "${sliceName}" has no lanes.`, "lane");
  }

  const laneLabel = (lane: SliceLane): string =>
    lane.childType ? toolRegistry.get(lane.childType)?.name ?? lane.childType : "(empty lane)";

  const laneRef = typeof args.lane === "string" ? args.lane.trim() : "";
  let lane: SliceLane | undefined;

  if (laneRef) {
    const asIndex = Number(laneRef);
    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= lanes.length) {
      lane = lanes[asIndex - 1];
    } else {
      const ref = nameKey(laneRef);
      lane = lanes.find((l) => {
        if (!l.childType) return false;
        const typeKey = nameKey(l.childType);
        const nameK = nameKey(toolRegistry.get(l.childType)?.name ?? "");
        return ref === typeKey || (nameK.length > 0 && ref === nameK);
      });
    }
  } else {
    lane = lanes.find((l) => l.childType === cardType);
  }

  if (!lane) {
    const available = lanes
      .map((l, i) => `${i + 1}:${l.childType ?? "empty"}`)
      .join(", ");
    return issue(
      "lane_not_found",
      `Slice "${sliceName}" has no lane for "${laneRef || cardType}". Available lanes: ${available}.`,
      "lane",
    );
  }

  if (lane.childType && lane.childType !== cardType) {
    return issue(
      "lane_type_mismatch",
      `Lane "${laneLabel(lane)}" only accepts ${lane.childType} cards, not ${cardType}.`,
      "lane",
    );
  }

  return { requested: true, sliceId: slice.id, laneId: lane.id };
}

/** Compact slice + lane summary for the model (identifies lanes by type/index). */
function summarizeSlices(elements: CanvasElement[]): any[] {
  return elements
    .filter((el) => el.type === SLICE_TYPE)
    .map((el) => {
      const lanes: SliceLane[] = (el.data as any)?.lanes ?? [];
      return {
        id: el.id,
        name: getElementName(el) ?? "Slice",
        lanes: lanes.map((lane, index) => ({
          index: index + 1,
          type: lane.childType ?? null,
          cards: elements.filter(
            (child) => child.sliceId === el.id && child.laneId === lane.id,
          ).map((child) => getElementName(child) ?? child.id),
        })),
      };
    });
}

/** Compact Domain summary for the model (name + the cards/slices it contains). */
function summarizeDomains(elements: CanvasElement[]): any[] {
  return elements
    .filter((el) => el.type === DOMAIN_TYPE)
    .map((el) => ({
      id: el.id,
      name: getElementName(el) ?? "Domain",
      cards: elements
        .filter((child) => child.domainId === el.id)
        .map((child) => getElementName(child) ?? child.id),
    }));
}

/** Compact Group summary for the model (name + the definition/service cards it clusters). */
function summarizeGroups(elements: CanvasElement[]): any[] {
  return elements
    .filter((el) => el.type === GROUP_TYPE)
    .map((el) => ({
      id: el.id,
      name: getElementName(el) ?? "Group",
      domain: el.domainId
        ? getElementName(elements.find((d) => d.id === el.domainId) ?? {}) ?? null
        : null,
      cards: elements
        .filter((child) => child.groupId === el.id)
        .map((child) => getElementName(child) ?? child.id),
    }));
}

interface DomainPlacement {
  /** True only when the call actually carried a `domain` argument. */
  requested: boolean;
  domainId?: string;
  error?: { message: string; issues: ValidationIssue[] };
}

const DOMAIN_NOT_REQUESTED: DomainPlacement = { requested: false };

/**
 * Turns the optional `domain` argument of a create/update call into concrete
 * `domainId` membership for a card. `domain` is the Domain's name; an explicit
 * empty `domain` detaches the card from any Domain.
 *
 * Domains nest no further, so a Domain card itself can never be placed inside
 * another one. A card that is being placed into a Slice lane is handled
 * separately (lane and domain membership are mutually exclusive).
 */
function resolveDomainMembership(
  elements: CanvasElement[],
  cardType: string,
  args: any,
): DomainPlacement {
  if (!args || typeof args !== "object" || !("domain" in args)) return DOMAIN_NOT_REQUESTED;

  const domainName = typeof args.domain === "string" ? args.domain.trim() : "";
  if (!domainName) return { requested: true, domainId: undefined };

  const issue = (code: string, message: string): DomainPlacement => ({
    requested: true,
    error: { message, issues: [{ path: "domain", code, message }] },
  });

  if (!isNestableInDomain(cardType)) {
    return issue(
      "domain_ineligible_card",
      "A Domain cannot be placed inside another Domain (domains do not nest).",
    );
  }

  const domain = elements.find(
    (el) => el.type === DOMAIN_TYPE && nameKey(getElementName(el) ?? "") === nameKey(domainName),
  ) as DomainElement | undefined;
  if (!domain) {
    return issue(
      "domain_not_found",
      `No Domain named "${domainName}" exists on the board. Create it first with create_domain_card or use get_canvas_overview to list domains.`,
    );
  }

  return { requested: true, domainId: domain.id };
}

interface GroupPlacement {
  /** True only when the call actually carried a `group` argument. */
  requested: boolean;
  groupId?: string;
  error?: { message: string; issues: ValidationIssue[] };
}

const GROUP_NOT_REQUESTED: GroupPlacement = { requested: false };

/**
 * Turns the optional `group` argument of a create/update call into concrete
 * `groupId` membership for a card. `group` is the Group's name; an explicit
 * empty `group` detaches the card from any Group.
 *
 * Only definition/service cards can join a Group, and a card in a Slice lane is
 * handled separately (lane and group membership are mutually exclusive).
 */
function resolveGroupMembership(
  elements: CanvasElement[],
  cardType: string,
  args: any,
): GroupPlacement {
  if (!args || typeof args !== "object" || !("group" in args)) return GROUP_NOT_REQUESTED;

  const groupName = typeof args.group === "string" ? args.group.trim() : "";
  if (!groupName) return { requested: true, groupId: undefined };

  const issue = (code: string, message: string): GroupPlacement => ({
    requested: true,
    error: { message, issues: [{ path: "group", code, message }] },
  });

  if (!isGroupEligibleChild(cardType)) {
    return issue(
      "group_ineligible_card",
      `${cardType} cards cannot join a Group (only Object, Enum, Alias and Service cards can).`,
    );
  }

  const group = elements.find(
    (el) => el.type === GROUP_TYPE && nameKey(getElementName(el) ?? "") === nameKey(groupName),
  );
  if (!group) {
    return issue(
      "group_not_found",
      `No Group named "${groupName}" exists on the board. Create it first with create_group_card or use get_canvas_overview to list groups.`,
    );
  }

  return { requested: true, groupId: group.id };
}

/** Deletes a single element located by name (and optional type). */
function executeDeleteElement(args: any): string {
  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  const type = typeof args?.type === "string" ? args.type.trim() : "";

  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the element name) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Element name is required." }],
    });
  }

  const element = findElementByName(state.elements, targetName, type || undefined);
  if (!element) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${type || "element"} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      name: targetName,
    });
  }

  state.deleteElements([element.id]);
  return JSON.stringify({ status: "success", deletedId: element.id, type: element.type });
}

/**
 * Updates an existing element in place, keeping its id, position and width.
 *
 * The payload reuses the matching create tool's schema (minus `target`, which
 * locates the card by its current name) and is rebuilt through that tool's
 * `onCreate`, so param->data mappings (e.g. enum `values` -> `fields`) are
 * handled uniformly. The rebuilt data is validated against the board with the
 * element itself excluded, so its own tags never conflict with themselves.
 */
function executeUpdateElement(updateName: string, args: any): string {
  const definition = toolRegistry.getByAIToolName(toCreateToolName(updateName));
  const ai = definition?.ai;
  if (!definition || !ai) {
    return JSON.stringify({ error: `Unknown tool: ${updateName}` });
  }

  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the current card name) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Target name is required." }],
    });
  }

  const existing = findElementByName(state.elements, targetName, definition.type);
  if (!existing) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${definition.type} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      type: definition.type,
      name: targetName,
    });
  }

  const { target: _target, ...payload } = args ?? {};
  const built = ai.onCreate(payload, { x: existing.x, y: existing.y });

  // Preserve identity/meta the payload did not mention so an update never
  // silently drops the card's name, colour, description or live links.
  const existingData = existing.data ?? {};
  let nextData: any = built.data;
  if (!("name" in payload) && existingData.name !== undefined) {
    nextData = { ...nextData, name: existingData.name };
  }
  if (!("color" in payload) && existingData.color !== undefined) {
    nextData = { ...nextData, color: existingData.color };
  }
  if (!("description" in payload) && existingData.description !== undefined) {
    nextData = { ...nextData, description: existingData.description };
  }
  if (!("text" in payload) && existingData.text !== undefined) {
    nextData = { ...nextData, text: existingData.text };
  }
  if (existingData.methodRef !== undefined) {
    nextData = { ...nextData, methodRef: existingData.methodRef };
  }

  // Enforce canonical camelCase identifiers before validating, so type/name
  // references the model wrote in any casing still resolve against the board.
  nextData = normalizeIdentifierNames(nextData, definition.type);

  // Validate against the board WITHOUT this element, otherwise its own tags
  // would look like a conflict with themselves.
  const others = state.elements.filter((el) => el.id !== existing.id);
  if (definition.validateData) {
    const { issues } = definition.validateData(nextData, { elements: others });
    if (issues.length > 0) {
      return buildValidationError(issues);
    }
  }
  if (definition.normalizeData) {
    nextData = definition.normalizeData(nextData, { elements: others });
  }

  const size = definition.computeSize
    ? definition.computeSize(nextData)
    : { width: existing.width, height: existing.height };

  // Optional slice/lane placement carried by the update.
  const placement = resolveSliceMembership(state.elements, definition.type, args);
  if (placement.error) {
    return JSON.stringify({
      status: "error",
      error: "slice_placement_failed",
      message: placement.error.message,
      issues: placement.error.issues,
    });
  }
  const inLane = placement.requested && Boolean(placement.sliceId);
  const membership: Partial<CanvasElement> = placement.requested
    ? { sliceId: placement.sliceId, laneId: placement.laneId, groupId: undefined, domainId: undefined }
    : {};
  const nextWidth = Math.max(existing.width, size.width);

  // Optional Group / Domain placement carried by the update. A card in a Slice
  // lane cannot belong to a Group or Domain, so a lane placement wins. A Group
  // is more specific than the Domain it may sit in, so it wins over a Domain.
  const movedToContainer: Partial<CanvasElement> = {};
  if (!inLane) {
    const groupPlacement = resolveGroupMembership(state.elements, definition.type, args);
    if (groupPlacement.error) {
      return JSON.stringify({
        status: "error",
        error: "group_placement_failed",
        message: groupPlacement.error.message,
        issues: groupPlacement.error.issues,
      });
    }
    if (groupPlacement.requested) {
      membership.groupId = groupPlacement.groupId;
      membership.domainId = undefined;
      // When landing in a real Group, sit beside its other children so the
      // frame grows around the card instead of stretching to its old position.
      if (groupPlacement.groupId) {
        const groupChildren = state.elements.filter(
          (el) => el.groupId === groupPlacement.groupId && el.id !== existing.id,
        );
        const spot = findFreeSpot(
          groupChildren,
          { x: existing.x, y: existing.y, width: nextWidth, height: size.height },
          AI_PLACEMENT_GAP,
        );
        movedToContainer.x = spot.x;
        movedToContainer.y = spot.y;
      }
    } else {
      const domainPlacement = resolveDomainMembership(state.elements, definition.type, args);
      if (domainPlacement.error) {
        return JSON.stringify({
          status: "error",
          error: "domain_placement_failed",
          message: domainPlacement.error.message,
          issues: domainPlacement.error.issues,
        });
      }
      if (domainPlacement.requested) {
        membership.domainId = domainPlacement.domainId;
        membership.groupId = undefined;
        // When landing in a real Domain, sit beside its other children so the
        // frame grows around the card instead of stretching to its old position.
        if (domainPlacement.domainId) {
          const domainChildren = state.elements.filter(
            (el) => el.domainId === domainPlacement.domainId && el.id !== existing.id,
          );
          const spot = findFreeSpot(
            domainChildren,
            { x: existing.x, y: existing.y, width: nextWidth, height: size.height },
            AI_PLACEMENT_GAP,
          );
          movedToContainer.x = spot.x;
          movedToContainer.y = spot.y;
        }
      }
    }
  }

  // Keep the card's position. Height is always content-driven; width only ever
  // grows, so wide query items (event types / tag badges) still fit after an AI
  // edit without undoing a deliberately narrower card.
  state.updateElement(existing.id, {
    data: nextData,
    height: size.height,
    width: nextWidth,
    ...movedToContainer,
    ...membership,
  });

  return JSON.stringify({ status: "success", updatedId: existing.id, type: existing.type });
}

export async function executeAITool(name: string, args: any): Promise<string> {
  const state = useCanvasStore.getState();

  if (name === "get_canvas_overview") {
    const summary = state.elements.map((el) => ({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      data: el.data,
    }));
    const eventTypes = state.elements
      .filter((el) => el.type === "eventCard")
      .map((el) => el.data?.name)
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
    const tagCatalog = collectBoardTags(state.elements);
    const definedTypes = listDefinedTypeNames(state.elements);
    return JSON.stringify({
      count: summary.length,
      elements: summary,
      eventTypes,
      tagCatalog,
      definedTypes,
      primitiveTypes: Array.from(PRIMITIVE_FIELD_TYPES),
      slices: summarizeSlices(state.elements),
      groups: summarizeGroups(state.elements),
      domains: summarizeDomains(state.elements),
    });
  }

  if (name === "clear_canvas") {
    state.clearBoard();
    return JSON.stringify({ status: "success", message: "Canvas cleared" });
  }

  if (name === "delete_element") {
    return executeDeleteElement(args);
  }

  if (name.startsWith("update_")) {
    return executeUpdateElement(name, args);
  }

  // Find tool in registry
  const aiTools = toolRegistry.getAITools();
  const matchedTool = aiTools.find((t) => t.toolName === name);
  const toolDefinition = toolRegistry.getByAIToolName(name);

  if (matchedTool) {
    const spawnPoint = getViewportCenter();

    try {
      const created = matchedTool.onCreate(args, spawnPoint);
      // Normalize identifiers before validating so any casing the model used
      // still resolves (e.g. a type written as "Customer Id" -> "customerId").
      const normalizedData = normalizeIdentifierNames(created.data, created.type);
      let element =
        normalizedData === created.data ? created : { ...created, data: normalizedData };

      // Reject before touching the canvas if the built data breaks domain
      // rules (unknown types, unknown event types/tags, tag type conflicts...).
      if (toolDefinition?.validateData) {
        const { issues } = toolDefinition.validateData(element.data, {
          elements: state.elements,
        });
        if (issues.length > 0) {
          return buildValidationError(issues);
        }
      }

      // Optional slice/lane placement carried by the create call.
      const placement = resolveSliceMembership(state.elements, element.type, args);
      if (placement.error) {
        return JSON.stringify({
          status: "error",
          error: "slice_placement_failed",
          message: placement.error.message,
          issues: placement.error.issues,
          slices: summarizeSlices(state.elements),
        });
      }

      if (placement.requested && placement.sliceId) {
        // Lane membership: the card sits inside its slice lane.
        element = { ...element, sliceId: placement.sliceId, laneId: placement.laneId };
      } else {
        // Optional Group / Domain placement carried by the create call. A card
        // in a Slice lane cannot belong to a Group or Domain, so lanes take
        // precedence; a Group is more specific than the Domain it sits in, so
        // it wins over a Domain.
        const groupPlacement = resolveGroupMembership(state.elements, element.type, args);
        if (groupPlacement.error) {
          return JSON.stringify({
            status: "error",
            error: "group_placement_failed",
            message: groupPlacement.error.message,
            issues: groupPlacement.error.issues,
            groups: summarizeGroups(state.elements),
          });
        }

        if (groupPlacement.requested && groupPlacement.groupId) {
          // Land beside the group's existing children so a batch spreads out
          // instead of stacking, and so the card sits inside the frame.
          const groupChildren = state.elements.filter(
            (el) => el.groupId === groupPlacement.groupId,
          );
          const spot = findFreeSpot(
            groupChildren,
            { x: element.x, y: element.y, width: element.width, height: element.height },
            AI_PLACEMENT_GAP,
          );
          element = {
            ...element,
            x: spot.x,
            y: spot.y,
            groupId: groupPlacement.groupId,
          };
        } else {
          const domainPlacement = resolveDomainMembership(state.elements, element.type, args);
          if (domainPlacement.error) {
            return JSON.stringify({
              status: "error",
              error: "domain_placement_failed",
              message: domainPlacement.error.message,
              issues: domainPlacement.error.issues,
              domains: summarizeDomains(state.elements),
            });
          }

          if (domainPlacement.requested && domainPlacement.domainId) {
            // Land beside the domain's existing children so a batch spreads out
            // instead of stacking, and so the card sits inside the frame.
            const domainChildren = state.elements.filter(
              (el) => el.domainId === domainPlacement.domainId,
            );
            const spot = findFreeSpot(
              domainChildren,
              { x: element.x, y: element.y, width: element.width, height: element.height },
              AI_PLACEMENT_GAP,
            );
            element = {
              ...element,
              x: spot.x,
              y: spot.y,
              domainId: domainPlacement.domainId,
            };
          } else {
            // Free-standing card: nudge it to the nearest free slot so a batch of
            // AI-created cards spreads out instead of stacking on the same spot.
            const spot = findFreeSpot(
              state.elements,
              { x: element.x, y: element.y, width: element.width, height: element.height },
              AI_PLACEMENT_GAP,
            );
            element = { ...element, x: spot.x, y: spot.y };
          }
        }
      }

      state.addElement(element);

      return JSON.stringify({
        status: "success",
        createdId: element.id,
        type: element.type,
      });
    } catch (error) {
      if (error instanceof ToolValidationError) {
        return buildValidationError(error.issues);
      }
      throw error;
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// Human-readable names for the languages the UI can be set to, so the model can
// be told (in words) which language to write all of its output in.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
};

export async function runAgentConversation(
  settings: AISettings,
  conversationHistory: ChatMessage[],
  callbacks?: AgentStepCallback,
  sessionId: string = createSessionId(),
  language: string = "vi",
): Promise<string> {
  const languageName = LANGUAGE_NAMES[language.slice(0, 2)] || "English";
  const languageInstruction = `OUTPUT LANGUAGE (IMPORTANT): the user is working in the ${languageName} language on this system. Write ALL of your output in ${languageName} — your chat replies, every card name, every field "description", every business rule on Constraint cards, Slice and Domain names, and any other human-readable text you put on the canvas — regardless of the language the user's message happens to be written in. Keep only technical identifiers (field names, type names, DCB tags) in their canonical form. Never answer in a language other than the one selected in the app.`;
  const systemPrompt = `You are the AI Event Modeling Architect.
You help software architects and developers design domain events, business models, and reactive systems on an infinite canvas.
You have tools to read the canvas, create sticky notes, create domain event cards, create command cards, create query cards, create state (projection/decision-model) cards, create view (persisted read-model) cards, create shared object definitions, create enum definitions, create type aliases, create service definitions (services expose methods with params and returns), create constraint cards (assert INPUT preconditions in plain language, e.g. "The account must be active", over one or more State cards — a rule gates whether the event is emitted, not how data is stored), create Domain frames (a dashed bounded-context boundary that groups related cards and slices), create Groups (a compact frame that clusters related Object/Enum/Alias definitions or Services, usually inside a Domain), create slices (a slice stacks lanes top-to-bottom, each lane holding cards of ONE type), and clear the board.
When the user asks to add or create something, always call the appropriate creation tool!
DOMAINS (IMPORTANT): keep new work inside a Domain (bounded context). Before creating anything, call get_canvas_overview and check its "domains" list.
- If one or more Domains already exist, place each new card or Slice into the most relevant existing one by passing "domain" = the domain's name (this also moves it there on update). Prefer an existing Domain over inventing a new one.
- If NO Domain exists yet, first call create_domain_card with a meaningful bounded-context name (e.g. Ordering, Billing), then place the new card(s)/Slice into it with "domain". When the work is a set of reusable definitions shared across several contexts, create a Domain named "Shared" instead and keep them there.
- A card that lives in a Slice lane cannot also belong to a Domain, so put the Slice itself into the Domain — not the individual cards inside its lanes.
- Mention to the user which Domain you placed the new work into.
GROUPS (CONVENTION): a Group is a compact frame that clusters reusable definitions. Inside a Domain the standard layout is TWO groups: one for the type definitions (Object, Enum and Alias cards) and one for the Services.
- Reuse the Domain's existing groups; create any missing one with create_group_card and give it a clear name (e.g. "Types" and "Services", or "MoneyTypes"/"PaymentServices" when more specific).
- EVERY time you create a new Object, Enum, Alias or Service card, place it into the matching group by passing "group" = the group's name. Do not leave these cards free-standing inside the Domain.
- Only Object/Enum/Alias/Service cards can join a Group, and a card in a Slice lane cannot. A Group lives inside the Domain (pass its own "domain"), so its cards do NOT need "domain" again.
FLOW SEMANTICS (IMPORTANT): a "flow" in Event Modeling is ONE slice, not the whole command→event→read-model chain. There are two kinds:
- Write slice: a Command that emits one or more Events. Its usual shape is three lanes top-to-bottom: commandCard, constraintCard, eventCard. Add a queryCard lane when the command must read data first, and a serviceCard lane only when the flow actually executes a service method (case-dependent).
- Read slice: a Query that reads Events into a read model. Its usual shape is queryCard then viewCard (or stateCard when the projection is specific to that one flow — a reusable State usually stays outside the slice). A constraintCard lane is optional — add it only when a rule must be checked (e.g. whether the query's target exists); not every read slice has one.
When the user asks to "draw/build a flow" (e.g. "vẽ flow") without naming the kind, produce exactly ONE write slice OR ONE read slice that matches their description — never both, and never the full command→event→view chain. Ask only when the kind is genuinely ambiguous. A write slice stops at the emitted events (no query/view); a read slice starts at the query (no command).
To change an existing card, prefer its matching update tool (e.g. update_event_card) over deleting and recreating it: pass "target" = the card's current name and send the COMPLETE corrected definition. This preserves the card's id, position and links. Use delete_element (by "target" name) to remove a card.
Data types: every field "type" MUST be either a primitive (${Array.from(PRIMITIVE_FIELD_TYPES).join(", ")}) or the exact name of an Object, Enum or Alias card that already exists on the board. Any other type is rejected — create the Object/Enum/Alias card first, then reference it by name.
For Event cards: a DCB tag names the domain entity (aggregate) the event belongs to and identifies ONE field type across the whole board. Tag with the entity noun, never an id field: for a field "accountId" use the tag "account", for "userId" use "user", for "orderId" use "order" — the same entity always gets the same tag. Reusing a tag with a different field type is rejected, so keep the type identical whenever you reuse a tag.
Field descriptions (IMPORTANT): for EVERY field you create — Event fields, Command inputs/responses, Query params/responses, Object fields, State params/states, View params/states, Service method params/returns, Enum values — always add a "description" explaining what that field means. Also give each card itself a "description" (and for an Object, a description of the object definition). These definitions are reused across the model, so each must be self-explanatory on its own.
For State cards: call get_canvas_overview first to discover existing event types, DCB tags and defined types. Every query item's "types" must be names of Event cards on the board. Every query tag is a { tag, field } pair where "tag" already exists on an event field and "field" is one of the card's params with the SAME type. If a creation tool returns status "error" with issues, fix them (e.g. create the missing event/tag/type first) and try again. A State is a REUSABLE projection/decision model that many flows can share, so it usually lives OUTSIDE any slice (free-standing) and is referenced by Constraint cards; only place a State inside a slice lane when the projection genuinely belongs to that single flow and is not shared.
STATE PARAM PROVENANCE (IMPORTANT): a param on a State (or View) is an INPUT, so its value must come from somewhere — never invent a field that has no source. Each param must trace to one of:
- (a) a Command input or Query param of the same name that drives the flow — this is the usual case: the Constraint compares the command's value against the projected state, so reuse the command/query field's EXACT name as the State param;
- (b) a DCB tag binding — write it as { tag, field } in a query item so the param selects the events it filters;
- (c) an Enum-typed field (a fixed domain value), or
- (d) a system value such as now / timeNow / today.
The linkage is indirect: the Command/Query SUPPLIES the value and the Constraint CONSUMES the State, so model the Command/Query input first and name the State param after it. A param with no such source is rejected with 'param_source_unknown'; fix it by renaming it to the real Command/Query/Event field, binding it to a tag, or typing it as an Enum.
A State is ONE object: a value already listed in 'params' must NOT be repeated in 'states'. Params are inputs (used to select/filter and to compare); states are the projected output. Repeating a param name in states is rejected with 'state_echoes_param' — leave it out.
For View cards: same shape and rules as State cards (params, query items, states), but a View represents a persisted read model stored in a database for sorting, searching and filtering. Use create_view_card when the user wants a queryable read model rather than an in-memory decision state.
For Constraint cards: call get_canvas_overview first to discover existing State cards. List the State cards the constraint uses in "states" (by name); those must exist on the board. "rules" is a list of free-text business rules written in plain, human language (e.g. "The account must be active", "An order can only be paid once") — do NOT write them in field-name notation like "accountStatus.status == 'active'"; keep them readable. The Constraint is the bridge between the flow's Command/Query and its State: the state params a rule compares must be supplied by that Command's inputs or Query's params, so make sure those fields exist on the command/query (add them if missing).
CONSTRAINT RULE SEMANTICS (IMPORTANT): a Constraint rule is a gate on the flow's INPUT — it decides whether the command/query is allowed to proceed and therefore whether the event gets emitted. Every rule must be checkable against the command/query inputs plus the referenced State at the moment the flow runs. A rule must NEVER describe how data is stored or what the event will contain (that is the event's payload, an OUTPUT concern). For example, "The password must be hashed before storage; raw passwords are never stored" is WRONG: it targets the data persisted by the event, not a precondition on input. Rewrite such intents as an input-side precondition, e.g. "The password must be non-empty" (reject bad input before emitting) — hashing is a handler/implementation detail that belongs in the event payload or a service, not a Constraint. Ask: "could this rule block the command before any event is written?" If not, it does not belong in the Constraint.
For Slices: create_slice takes a "name" and an ordered "lanes" list (top-to-bottom), each lane with a "type". A lane type must be one of commandCard, queryCard, eventCard, stateCard, viewCard, constraintCard, serviceCard or stickyNote — Enum/Object/Alias cards and nested Slices are NOT allowed in lanes. Give at least one lane and do not repeat the same lane type twice.
SLICE NAME (IMPORTANT): name a slice with a plain PascalCase business name that describes the flow, e.g. "PlaceOrder", "HandlePayment", "ViewOrderHistory". Do NOT end the name with the word "Slice" (never "PlaceOrderSlice") and do not include "slice" anywhere in it — "slice" is an internal Event Modeling concept that most users do not know, so the board should read as plain business language. Likewise never name a lane or card after the concept.
Filling lanes: after create_slice, create the card(s) each lane needs and place each one into its lane by passing "slice" = the slice's name (and "lane" only when the card's type alone is ambiguous: give the lane's card type or its 1-based position). An AI-made slice must not be left empty — a slice with no cards is not a finished flow.
Be concise, clear, and professional.
${languageInstruction}`;

  const wireMessages: any[] = [{ role: "system", content: systemPrompt }];

  for (const m of conversationHistory) {
    if (m.role === "tool") {
      wireMessages.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
      });
    } else if (m.role === "assistant" && m.toolCalls) {
      wireMessages.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls,
      });
    } else {
      wireMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  const tools = buildOpenAITools();
  let maxTurns = Math.max(1, Math.floor(settings.maxTurns) || 1);

  while (maxTurns > 0) {
    maxTurns--;
    const response = await sendChatMessage(settings, wireMessages, tools, sessionId);

    if (response.toolCalls.length > 0) {
      // Record assistant call
      wireMessages.push({
        role: "assistant",
        content: response.content || null,
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // Execute each tool
      for (const tc of response.toolCalls) {
        callbacks?.onToolCall?.(tc.name, tc.arguments);
        const resultString = await executeAITool(tc.name, tc.arguments);

        wireMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: resultString,
        });
      }
    } else {
      // Final message from assistant
      callbacks?.onAssistantMessage?.(response.content);
      return response.content;
    }
  }

  return "Task completed.";
}
