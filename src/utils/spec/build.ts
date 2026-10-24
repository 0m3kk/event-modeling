/**
 * Builds the board's specification object (plain JS data). See
 * {@link buildSpecification}. Call the serializer in `./index` to turn it into
 * YAML.
 */
import type { CanvasElement } from "@/types";
import { collectBoardTags } from "../eventTags";
import { createFieldMapper } from "./dataTypes";
import {
  elementName,
  listNamed,
  mapQueryItems,
  uniqueByName,
  uniqueByReference,
} from "./helpers";

/** Display labels for the card types a Slice lane can be reserved for. */
const TOOL_LABELS: Record<string, string> = {
  eventCard: "Event",
  commandCard: "Command",
  queryCard: "Query",
  viewCard: "View",
  stateCard: "State",
  constraintCard: "Constraint",
  serviceCard: "Service",
  objectCard: "Object",
  enumCard: "Enum",
  aliasCard: "Alias",
  actorCard: "Actor",
  sliceCard: "Slice",
  groupCard: "Group",
  domainCard: "Domain",
  stickyNote: "Sticky Note",
};

/** Card types that hold reusable data definitions (collected once under `types`). */
const DATA_CARD_TYPES = new Set(["objectCard", "enumCard", "aliasCard"]);

export interface SpecificationInput {
  /** Board / project name. */
  name: string;
  /** Every element currently on the canvas. */
  elements: CanvasElement[];
}

/**
 * Builds the specification object (plain JS data). Call
 * {@link serializeSpecification} to turn it into YAML.
 */
export function buildSpecification({
  name,
  elements,
}: SpecificationInput): Record<string, unknown> {
  const byType = (type: string) => elements.filter((el) => el.type === type);

  const domains = byType("domainCard");
  const groups = byType("groupCard");
  const slices = byType("sliceCard");

  const events = uniqueByName(byType("eventCard"));
  const commands = uniqueByName(byType("commandCard"));
  const queries = uniqueByName(byType("queryCard"));
  const views = uniqueByName(byType("viewCard"));
  const states = uniqueByName(byType("stateCard"));
  const constraints = uniqueByName(byType("constraintCard"));
  // A Service card is one method execution. Reference copies collapse, but
  // distinct services are allowed to share a method name.
  const services = uniqueByReference(byType("serviceCard"));
  // Object / Enum / Alias cards, in board order; the mapper de-duplicates them.
  const dataCards = elements.filter((el) => DATA_CARD_TYPES.has(el.type));
  const actors = uniqueByName(byType("actorCard"));
  const notes = byType("stickyNote");

  const idToName = new Map(elements.map((el) => [el.id, elementName(el)]));
  const nameOf = (el: CanvasElement) => idToName.get(el.id) ?? elementName(el);

  const domainIdToName = new Map(domains.map((d) => [d.id, nameOf(d)]));

  // Data containers (Object/Enum/Alias) are defined once in the document's
  // `types` registry; fields reference them by their plain name.
  const { mapFields, dataTypes } = createFieldMapper({ dataCards, nameOf });

  // ---- Structure: Domains, Groups, Slices ----------------------------------
  const domainsSpec = domains.map((domain) => {
    const out: Record<string, unknown> = { name: nameOf(domain) };
    const childGroups = groups.filter((g) => g.domainId === domain.id).map(nameOf);
    const childSlices = slices.filter((s) => s.domainId === domain.id).map(nameOf);
    const directCards = elements
      .filter(
        (el) =>
          el.domainId === domain.id &&
          el.type !== "groupCard" &&
          el.type !== "sliceCard",
      )
      .map(nameOf);
    if (childGroups.length > 0) out.groups = childGroups;
    if (childSlices.length > 0) out.slices = childSlices;
    if (directCards.length > 0) out.cards = directCards;
    return out;
  });

  const groupsSpec = groups.map((group) => {
    const out: Record<string, unknown> = { name: nameOf(group) };
    const domain = group.domainId ? domainIdToName.get(group.domainId) : undefined;
    if (domain) out.domain = domain;
    const cards = elements
      .filter((el) => el.groupId === group.id)
      .map(nameOf);
    if (cards.length > 0) out.cards = cards;
    return out;
  });

  const slicesSpec = slices.map((slice) => {
    const out: Record<string, unknown> = { name: nameOf(slice) };
    const domain = slice.domainId ? domainIdToName.get(slice.domainId) : undefined;
    if (domain) out.domain = domain;
    const data = (slice.data ?? {}) as { description?: string; lanes?: unknown };
    if (data.description) out.description = data.description;

    const lanes = Array.isArray(data.lanes) ? data.lanes : [];
    const laneSpec = lanes
      .filter((lane): lane is { id: string; childType?: string | null } =>
        Boolean(lane) && typeof (lane as { id?: unknown }).id === "string",
      )
      .map((lane) => {
        const laneCards = elements.filter(
          (el) => el.sliceId === slice.id && el.laneId === lane.id,
        );
        // A reserved lane uses its `childType`; an untyped (manual) lane adopts
        // the type of the card it holds. A reference copy carries the same type
        // as its source, so the lane reports the source's type rather than "any".
        const laneType = lane.childType ?? laneCards[0]?.type ?? null;
        return {
          type: laneType ? TOOL_LABELS[laneType] ?? laneType : "any",
          cards: laneCards.map(nameOf),
        };
      });
    if (laneSpec.length > 0) out.lanes = laneSpec;
    return out;
  });

  // ---- Behavior ------------------------------------------------------------
  const eventsSpec = events.map((el) => {
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (el.data?.description) out.description = el.data.description;
    const fields = mapFields(el.data?.fields);
    if (fields) out.fields = fields;
    return out;
  });

  const commandsSpec = commands.map((el) => {
    const data = (el.data ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (typeof data.action === "string" && data.action) out.action = data.action;
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const inputs = mapFields(Array.isArray(data.inputs) ? data.inputs : data.fields);
    if (inputs) out.inputs = inputs;
    const responses = mapFields(data.responses);
    if (responses) out.responses = responses;
    return out;
  });

  const queriesSpec = queries.map((el) => {
    const data = (el.data ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (typeof data.action === "string" && data.action) out.action = data.action;
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const params = mapFields(data.params);
    if (params) out.params = params;
    const responses = mapFields(data.responses);
    if (responses) out.responses = responses;
    return out;
  });

  const mapStateLike = (el: CanvasElement): Record<string, unknown> => {
    const data = (el.data ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const params = mapFields(data.params);
    if (params) out.params = params;
    const query = mapQueryItems(data.queryItems);
    if (query) out.query = query;
    const projected = mapFields(data.states);
    if (projected) out.states = projected;
    return out;
  };

  const viewsSpec = views.map(mapStateLike);
  const statesSpec = states.map(mapStateLike);

  const constraintsSpec = constraints.map((el) => {
    const data = (el.data ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const refStates = listNamed(data.states);
    if (refStates.length > 0) out.states = refStates;
    const rules = Array.isArray(data.rules)
      ? data.rules.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];
    if (rules.length > 0) out.rules = rules;
    return out;
  });

  const servicesSpec = services.map((el) => {
    const data = (el.data ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (typeof data.serviceName === "string" && data.serviceName.trim()) {
      // Interface name: methods sharing a serviceName belong to one interface.
      out.serviceName = data.serviceName;
    }
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const params = mapFields(data.params);
    if (params) out.params = params;
    const returns = mapFields(data.returns);
    if (returns) out.returns = returns;
    return out;
  });

  const actorsSpec = actors.map((el) => {
    const data = (el.data ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { name: nameOf(el) };
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const permissions = Array.isArray(data.permissions)
      ? data.permissions
          .map((p) => (p as { action?: unknown })?.action)
          .filter((a): a is string => typeof a === "string" && a.length > 0)
      : [];
    if (permissions.length > 0) out.permissions = permissions;
    return out;
  });

  const tagsSpec = collectBoardTags(elements).map((tag) => ({
    tag: tag.tag,
    types: tag.types,
    fromEvents: tag.fromEvents,
  }));

  const notesSpec = notes.map((el) => {
    const out: Record<string, unknown> = { text: el.data?.text ?? "" };
    if (el.data?.description) out.description = el.data.description;
    return out;
  });

  // ---- Assemble ------------------------------------------------------------
  const spec: Record<string, unknown> = { name };

  if (domainsSpec.length > 0) spec.domains = domainsSpec;
  if (groupsSpec.length > 0) spec.groups = groupsSpec;
  if (slicesSpec.length > 0) spec.slices = slicesSpec;
  const typesSpec = dataTypes();
  if (typesSpec.length > 0) spec.types = typesSpec;
  if (eventsSpec.length > 0) spec.events = eventsSpec;
  if (commandsSpec.length > 0) spec.commands = commandsSpec;
  if (queriesSpec.length > 0) spec.queries = queriesSpec;
  if (viewsSpec.length > 0) spec.views = viewsSpec;
  if (statesSpec.length > 0) spec.states = statesSpec;
  if (constraintsSpec.length > 0) spec.constraints = constraintsSpec;
  if (servicesSpec.length > 0) spec.services = servicesSpec;
  if (actorsSpec.length > 0) spec.actors = actorsSpec;
  if (tagsSpec.length > 0) spec.tags = tagsSpec;
  if (notesSpec.length > 0) spec.notes = notesSpec;

  return spec;
}
