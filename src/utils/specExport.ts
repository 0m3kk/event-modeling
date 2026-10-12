import type { CanvasElement } from "@/types";
import { getElementName, nameKey } from "./naming";
import { collectBoardTags } from "./eventTags";
import { normalizeTypeName } from "./typeCatalog";
import { cleanValidation, hasValidation, type FieldValidation } from "./fieldValidation";

/**
 * Exports the board as a human-readable, tool-agnostic domain specification in
 * YAML.
 *
 * The spec is *semantic*: it is organised by meaning (domains, slices, events,
 * commands, queries, views, states, constraints, services, actors, DCB tags)
 * rather than by canvas geometry, so it reads like a design document and can be
 * diffed, reviewed or fed to code generators. Board positions, sizes, colours
 * and internal ids are deliberately omitted. There is no bookkeeping summary
 * either — the document is just the model.
 *
 * Data containers (Object / Enum / Alias cards) are never listed as standalone
 * entries — not in a section of their own, nor in the Domain/Group membership
 * lists. Each definition is expanded inline at the first field that references
 * its type; later references stay as the plain type name. The model therefore
 * centres on the objects that use the data, and the data travels with them.
 * Data types that no field ever references are omitted.
 *
 * Reference copies and service method-execution copies share the name of the
 * card they mirror, so definitions de-duplicate by name while Slice lanes still
 * reference the copies that appear inside them.
 */

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

/** Card types that hold reusable data definitions (expanded inline, not listed). */
const DATA_CARD_TYPES = new Set(["objectCard", "enumCard", "aliasCard"]);

/** A field row as stored on most cards (superset of the per-card shapes). */
interface RawField {
  name?: string;
  type?: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
  tag?: string;
  validation?: FieldValidation;
}

/** One DCB query item as stored on State/View cards. */
interface RawQueryItem {
  types?: string[];
  tags?: Array<{ tag?: string; field?: string }>;
  description?: string;
}

export interface SpecificationInput {
  /** Board / project name. */
  name: string;
  /** Every element currently on the canvas. */
  elements: CanvasElement[];
}

function elementName(el: CanvasElement): string {
  return getElementName(el) ?? el.id;
}

/** Keeps the first element seen for each name, so mirror copies collapse. */
function uniqueByName(elements: CanvasElement[]): CanvasElement[] {
  const seen = new Set<string>();
  const out: CanvasElement[] = [];
  for (const el of elements) {
    const name = getElementName(el);
    const key = name ? nameKey(name) : `#${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(el);
  }
  return out;
}

/** Maps DCB query items (`types` OR'd, `tags` AND'd) to their spec form. */
function mapQueryItems(items: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items.map((raw) => {
    const item = (raw ?? {}) as RawQueryItem;
    const out: Record<string, unknown> = {
      types: Array.isArray(item.types)
        ? item.types.filter((t): t is string => typeof t === "string" && t.length > 0)
        : [],
    };
    const tags = Array.isArray(item.tags)
      ? item.tags
          .filter((t) => t && (t.tag || t.field))
          .map((t) => ({ tag: t.tag ?? "", field: t.field ?? "" }))
      : [];
    if (tags.length > 0) out.tags = tags;
    if (item.description) out.description = item.description;
    return out;
  });
}

/**
 * Renders a list of named items as plain strings, or as `{ name, description }`
 * objects when at least one item carries a description.
 */
function listNamed(
  items: unknown,
): Array<string | { name: string; description?: string }> {
  if (!Array.isArray(items)) return [];
  const valid = items.filter(
    (i): i is { name: string; description?: string } =>
      Boolean(i) && typeof (i as { name?: unknown }).name === "string",
  );
  const anyDescription = valid.some((i) => i.description);
  return valid.map((i) =>
    anyDescription
      ? { name: i.name, ...(i.description ? { description: i.description } : {}) }
      : i.name,
  );
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
  // Method-execution copies mirror a Service method; they are not definitions.
  const services = uniqueByName(
    byType("serviceCard").filter((el) => !(el.data as { methodRef?: unknown })?.methodRef),
  );
  const objects = uniqueByName(byType("objectCard"));
  const enums = uniqueByName(byType("enumCard"));
  const aliases = uniqueByName(byType("aliasCard"));
  const actors = uniqueByName(byType("actorCard"));
  const notes = byType("stickyNote");

  const idToName = new Map(elements.map((el) => [el.id, elementName(el)]));
  const nameOf = (el: CanvasElement) => idToName.get(el.id) ?? elementName(el);

  const domainIdToName = new Map(domains.map((d) => [d.id, nameOf(d)]));

  // ---- Data containers: Object / Enum / Alias ------------------------------
  //
  // Data definitions are not listed in a section of their own. Each one is
  // expanded inline at the first field that references its type; later
  // references stay as the plain type name. The spec therefore reads around the
  // modelling objects while the data they consume travels with them.
  const dataTypes = new Map<
    string,
    { kind: "object" | "enum" | "alias"; element: CanvasElement }
  >();
  for (const el of objects) {
    dataTypes.set(nameKey(elementName(el)), { kind: "object", element: el });
  }
  for (const el of enums) {
    dataTypes.set(nameKey(elementName(el)), { kind: "enum", element: el });
  }
  for (const el of aliases) {
    dataTypes.set(nameKey(elementName(el)), { kind: "alias", element: el });
  }
  /** Names of data types already expanded inline, so each is expanded once. */
  const expandedData = new Set<string>();

  /** Expands a data definition (its fields may reference further data types). */
  function expandData(data: {
    kind: "object" | "enum" | "alias";
    element: CanvasElement;
  }): Record<string, unknown> {
    const el = data.element;
    const typeName = nameOf(el);
    if (data.kind === "object") {
      const out: Record<string, unknown> = { object: typeName };
      if (el.data?.description) out.description = el.data.description;
      const fields = Array.isArray(el.data?.fields) ? el.data.fields : [];
      const mapped = fields.map((f: RawField) => mapField(f));
      if (mapped.length > 0) out.fields = mapped;
      return out;
    }
    if (data.kind === "enum") {
      const out: Record<string, unknown> = { enum: typeName };
      if (el.data?.description) out.description = el.data.description;
      const values = listNamed(el.data?.fields);
      if (values.length > 0) out.values = values;
      return out;
    }
    const out: Record<string, unknown> = {
      alias: typeName,
      of: el.data?.aliasedType ?? "",
    };
    if (el.data?.isArray) out.array = true;
    if (el.data?.description) out.description = el.data.description;
    const validation = cleanValidation(el.data?.validation);
    if (validation) out.validation = validation;
    return out;
  }

  /**
   * Maps a stored field row to its spec form, dropping empty optional keys.
   * When the field's type names a data card that has not been expanded yet, the
   * type is replaced by that card's inline definition.
   */
  function mapField(field: RawField | undefined | null): Record<string, unknown> {
    const out: Record<string, unknown> = {
      name: field?.name ?? "",
      type: field?.type ?? "",
    };
    if (field?.isArray) out.array = true;
    if (field?.isRequired) out.required = true;
    if (field?.tag) out.tag = field.tag;
    if (field?.description) out.description = field.description;
    if (field?.validation && hasValidation(field.validation)) {
      out.validation = cleanValidation(field.validation) ?? field.validation;
    }

    const typeKey = field?.type ? nameKey(normalizeTypeName(field.type)) : "";
    const data = typeKey ? dataTypes.get(typeKey) : undefined;
    if (data && !expandedData.has(typeKey)) {
      expandedData.add(typeKey);
      out.type = expandData(data);
    }
    return out;
  }

  function mapFields(fields: unknown): Record<string, unknown>[] | undefined {
    if (!Array.isArray(fields) || fields.length === 0) return undefined;
    return fields.map((f) => mapField(f as RawField));
  }

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
          el.type !== "sliceCard" &&
          !DATA_CARD_TYPES.has(el.type),
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
      .filter((el) => el.groupId === group.id && !DATA_CARD_TYPES.has(el.type))
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
        const cards = elements
          .filter((el) => el.sliceId === slice.id && el.laneId === lane.id)
          .map(nameOf);
        return {
          type: lane.childType ? TOOL_LABELS[lane.childType] ?? lane.childType : "any",
          cards,
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
    if (typeof data.description === "string" && data.description) {
      out.description = data.description;
    }
    const methods = Array.isArray(data.methods) ? data.methods : [];
    if (methods.length > 0) {
      out.methods = methods.map((raw) => {
        const method = (raw ?? {}) as {
          name?: string;
          description?: string;
          params?: unknown;
          returns?: unknown;
        };
        const methodOut: Record<string, unknown> = { name: method.name ?? "" };
        if (method.description) methodOut.description = method.description;
        const params = mapFields(method.params);
        if (params) methodOut.params = params;
        const returns = mapFields(method.returns);
        if (returns) methodOut.returns = returns;
        return methodOut;
      });
    }
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

// ---------------------------------------------------------------------------
// Minimal YAML emitter
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when a string must be quoted to stay a string in YAML: it looks like
 * another scalar type, starts with an indicator character, or carries
 * significant whitespace.
 */
function needsQuotes(value: string): boolean {
  if (value === "") return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/[:#]\s/.test(value) || /:\s*$/.test(value)) return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/[\n\r\t]/.test(value)) return true;
  return false;
}

function scalarToYaml(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const text = String(value);
  // JSON string syntax is a valid YAML double-quoted scalar (escapes included).
  return needsQuotes(text) ? JSON.stringify(text) : text;
}

function isEmptyContainer(value: unknown): boolean {
  return (
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

/**
 * Serializes a plain JS value to a YAML document. Supports objects, arrays,
 * strings, numbers, booleans and null; keys with `undefined` values are omitted.
 * Complex array items are emitted block-style (`- key: value`) so the output
 * reads like a hand-written spec.
 */
export function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (isEmptyContainer(item) || !isPlainObject(item)) {
          return `${pad}- ${scalarToYaml(item)}`;
        }
        // Render the object one level in, then fold its first line onto the dash.
        const block = toYaml(item, indent + 1);
        const childPad = "  ".repeat(indent + 1);
        return `${pad}- ${block.slice(childPad.length)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined);
    if (keys.length === 0) return "{}";
    return keys
      .map((key) => {
        const child = value[key];
        const keyText = needsQuotes(key) ? JSON.stringify(key) : key;
        if (!isPlainObject(child) && !Array.isArray(child)) {
          return `${pad}${keyText}: ${scalarToYaml(child)}`;
        }
        if (isEmptyContainer(child)) {
          return `${pad}${keyText}: ${Array.isArray(child) ? "[]" : "{}"}`;
        }
        return `${pad}${keyText}:\n${toYaml(child, indent + 1)}`;
      })
      .join("\n");
  }

  return `${pad}${scalarToYaml(value)}`;
}

/** Serializes the board to a YAML specification string. */
export function serializeSpecification(input: SpecificationInput): string {
  const spec = buildSpecification(input);
  return `${toYaml(spec)}\n`;
}

/** Filesystem-safe slug derived from a board name. */
export function specFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "board"}.spec.yaml`;
}

/**
 * Saves a pre-serialized specification to a `.spec.yaml` file, using the File
 * System Access API when available and falling back to a download link.
 * Exposed separately so a preview modal can save exactly what it shows.
 */
export async function downloadSpecification(
  yaml: string,
  name: string,
): Promise<void> {
  const fileName = specFileName(name);

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Event Modeling Specification (YAML)",
            accept: { "text/yaml": [".yaml", ".yml"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(yaml);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === "AbortError") return; // User cancelled
      // Fall through to the blob download.
    }
  }

  const blob = new Blob([yaml], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Saves the board's specification to a `.spec.yaml` file. Convenience wrapper
 * that serializes the board and then downloads it.
 */
export async function exportSpecificationToFile(
  input: SpecificationInput,
): Promise<void> {
  await downloadSpecification(serializeSpecification(input), input.name);
}
