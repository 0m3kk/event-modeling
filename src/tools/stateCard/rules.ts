import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import { collectBoardTagCatalog, fieldTypeKey } from "@/utils/eventTags";
import { collectDefinedTypeNames, collectEventTypeNames } from "@/utils/typeCatalog";
import { nameKey, toCamelIdentifier } from "@/utils/naming";
import { validateFieldTypes } from "../common/typeValidation";

/** A typed field row used by both the `params` and `states` sections. */
export interface StateField {
  name: string;
  type: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
}

/**
 * A DCB tag reference inside a query item.
 *
 * `tag` is the tag name already attached to an event field on the board and
 * `field` is the name of a param field on this State card. They are rendered as
 * `tagName:{fieldName}` (e.g. `course:{courseId}`). The param field type MUST
 * match the type of the event field carrying the tag.
 */
export interface QueryTag {
  tag: string;
  field: string;
}

/**
 * One DCB query item: a set of event `types` (matched with OR) and a set of
 * `tags` (all required). Query items are combined with OR.
 */
export interface QueryItem {
  types: string[];
  tags: QueryTag[];
  description?: string;
}

export interface StateCardData {
  name: string;
  params?: StateField[];
  queryItems?: QueryItem[];
  states?: StateField[];
  color?: string;
  description?: string;
}

export function getStateParams(data: StateCardData): StateField[] {
  return Array.isArray(data.params) ? data.params : [];
}

export function getQueryItems(data: StateCardData): QueryItem[] {
  return Array.isArray(data.queryItems) ? data.queryItems : [];
}

export function getStateFields(data: StateCardData): StateField[] {
  return Array.isArray(data.states) ? data.states : [];
}

/**
 * System-provided values that need no external source: they are supplied by the
 * runtime rather than by a Command/Query input. Names are compared through
 * {@link nameKey}, so `timeNow` and `time now` both resolve to `time now`.
 */
const SYSTEM_VALUE_NAME_KEYS: ReadonlySet<string> = new Set(
  [
    "now",
    "timeNow",
    "currentTime",
    "currentDate",
    "currentTimestamp",
    "today",
    "timestamp",
    "systemTime",
  ].map(nameKey),
);

/** Collects the `name` of every field row in a value that may hold them. */
function addFieldNames(target: Set<string>, fields: unknown): void {
  if (!Array.isArray(fields)) return;
  for (const field of fields) {
    const key = nameKey((field as { name?: string } | null | undefined)?.name);
    if (key) target.add(key);
  }
}

/**
 * Every field name declared elsewhere on the board — a Command input/response, a
 * Query/View param/response, a Service method param/return, or an Event field.
 * A State param whose name matches one of these is considered to have a source:
 * the value flows in from the flow that carries it (a Command input, a Query
 * param, or the events the projection reads).
 */
function collectDeclaredFieldNames(elements: CanvasElement[]): Set<string> {
  const names = new Set<string>();
  for (const el of elements ?? []) {
    const data: any = el.data ?? {};
    switch (el.type) {
      case "commandCard":
        addFieldNames(names, data.inputs);
        addFieldNames(names, data.responses);
        addFieldNames(names, data.fields);
        break;
      case "queryCard":
      case "viewCard":
        addFieldNames(names, data.params);
        addFieldNames(names, data.responses);
        break;
      case "eventCard":
        addFieldNames(names, data.fields);
        break;
      case "serviceCard":
        if (Array.isArray(data.methods)) {
          for (const method of data.methods) {
            addFieldNames(names, method?.params);
            addFieldNames(names, method?.returns);
          }
        }
        break;
      default:
        break;
    }
  }
  return names;
}

/**
 * Names (normalized) of every type defined on the board — Object, Enum and
 * Alias cards. A param typed with one of these carries a known domain value
 * (an enum member, a structured object), so its origin is not in doubt.
 */
function collectDefinedTypeKeys(elements: CanvasElement[]): Set<string> {
  const keys = new Set<string>();
  for (const name of collectDefinedTypeNames(elements)) {
    const key = nameKey(name);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Why a param's value exists. A param with no source at all is the anomaly this
 * card rejects: a field cannot simply appear in a State that a Constraint reads
 * without any Command/Query/Event supplying it.
 */
export type StateParamSource = "query tag" | "defined type" | "system" | "declared field";

/**
 * Classifies a param's origin, or returns null when nothing on the card or
 * board can supply it.
 */
export function findStateParamSource(
  param: StateField,
  data: StateCardData,
  declaredFieldNames: Set<string>,
  definedTypeKeys: Set<string>,
): StateParamSource | null {
  const key = nameKey(param.name);
  if (!key) return null;

  // 1. Bound to a DCB tag: the param selects the events it filters.
  const boundToTag = getQueryItems(data).some((item) =>
    (Array.isArray(item.tags) ? item.tags : []).some((tag) => nameKey(tag?.field) === key),
  );
  if (boundToTag) return "query tag";

  // 2. Typed with a defined Object/Enum/Alias: a known domain value.
  if (definedTypeKeys.has(nameKey(param.type))) return "defined type";

  // 3. Supplied by the runtime (e.g. `now`).
  if (SYSTEM_VALUE_NAME_KEYS.has(key)) return "system";

  // 4. Declared on a Command/Query/Service/Event elsewhere on the board.
  if (declaredFieldNames.has(key)) return "declared field";

  return null;
}

export interface StateValidationContext {
  /** All elements currently on the board (used to resolve the tag catalog). */
  elements: CanvasElement[];
}

/**
 * Enforces the State card invariants:
 * - every field type (params/states) must be a primitive or a defined type;
 * - every query event type must match an Event card on the board;
 * - every query tag must reference a tag that exists on an event field;
 * - that tag must map to a param field on this card;
 * - the param field type must match the tagged event field type;
 * - every param must trace to a source (a query tag, an Enum type, a system
 *   value, or a field declared elsewhere on the board);
 * - a param must not be echoed as a state field of the same name (a State is a
 *   single object, so an input does not need to reappear as output).
 *
 * Returns a normalized copy of the data with invalid event types and tag
 * references dropped, plus the list of issues found. Callers decide whether to
 * repair (store) or reject (AI) based on this result.
 */
export function validateStateCardData(
  data: StateCardData,
  ctx: StateValidationContext,
): { data: StateCardData; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const elements = ctx.elements ?? [];
  const catalog = collectBoardTagCatalog(elements);
  const eventTypes = collectEventTypeNames(elements);

  // Field types must be primitive or defined on the board.
  issues.push(...validateFieldTypes(getStateParams(data), "params", elements));
  issues.push(...validateFieldTypes(getStateFields(data), "states", elements));

  const params = getStateParams(data);
  const paramByName = new Map(params.map((p) => [p.name, p]));
  const queryItems = getQueryItems(data);

  const nextItems = queryItems.map((item, itemIndex) => {
    // 1. Every event type in the item must exist on the board.
    const inputTypes = Array.isArray(item.types) ? item.types : [];
    const validTypes: string[] = [];

    inputTypes.forEach((raw, typeIndex) => {
      const name = typeof raw === "string" ? raw.trim() : "";
      const path = `queryItems[${itemIndex}].types[${typeIndex}]`;

      if (!name) {
        issues.push({
          path,
          code: "event_type_not_found",
          message: "Query event type name is empty.",
        });
        return;
      }

      if (!eventTypes.has(nameKey(name))) {
        issues.push({
          path,
          code: "event_type_not_found",
          message: `Event "${name}" does not exist on the board.`,
        });
        return;
      }

      validTypes.push(name);
    });

    // 2. Every tag must exist and map to a param field of the same type.
    const inputTags = Array.isArray(item.tags) ? item.tags : [];
    const validTags: QueryTag[] = [];

    inputTags.forEach((ref, tagIndex) => {
      const tag = toCamelIdentifier(ref?.tag || "");
      const fieldName = (ref?.field || "").trim();
      const path = `queryItems[${itemIndex}].tags[${tagIndex}]`;

      if (!tag) {
        issues.push({ path, code: "tag_not_found", message: "Query tag name is empty." });
        return;
      }

      if (!catalog.has(tag)) {
        issues.push({
          path,
          code: "tag_not_found",
          message: `Tag "${tag}" is not attached to any event field on the board.`,
        });
        return;
      }

      if (!fieldName) {
        issues.push({
          path,
          code: "field_not_found",
          message: `Tag "${tag}" must reference a param field.`,
        });
        return;
      }

      const paramField = paramByName.get(fieldName);
      if (!paramField) {
        issues.push({
          path,
          code: "field_not_found",
          message: `Param field "${fieldName}" referenced by tag "${tag}" does not exist.`,
        });
        return;
      }

      const allowedTypes = catalog.get(tag)!;
      const fieldKey = fieldTypeKey(paramField);
      if (!allowedTypes.has(fieldKey)) {
        issues.push({
          path,
          code: "type_mismatch",
          message: `Param field "${fieldName}" is ${fieldKey} but the event field tagged "${tag}" is ${Array.from(
            allowedTypes,
          ).join(" | ")}.`,
        });
        return;
      }

      validTags.push({ tag, field: fieldName });
    });

    return { ...item, types: validTypes, tags: validTags };
  });

  // 3. Provenance: every param must trace to a source, and a param must not be
  //    repeated as a state field. State is one object, so a value already
  //    carried in `params` does not need to reappear in `states`.
  const declaredFieldNames = collectDeclaredFieldNames(elements);
  const definedTypeKeys = collectDefinedTypeKeys(elements);

  params.forEach((param, index) => {
    if (!nameKey(param.name)) return; // nameless rows are a separate problem
    if (findStateParamSource(param, data, declaredFieldNames, definedTypeKeys)) return;
    issues.push({
      path: `params[${index}].name`,
      code: "param_source_unknown",
      message:
        `Param "${param.name}" has no traceable source. A State param must come from a ` +
        `Command input, a Query param, a DCB tag binding, an Enum value, or a system value ` +
        `such as now. Bind it to a query tag ({ tag, field }) or declare it on the ` +
        `Command/Query that calls this State.`,
    });
  });

  const paramKeys = new Set(params.map((p) => nameKey(p.name)).filter(Boolean));
  getStateFields(data).forEach((field, index) => {
    const key = nameKey(field.name);
    if (!key || !paramKeys.has(key)) return;
    issues.push({
      path: `states[${index}].name`,
      code: "state_echoes_param",
      message:
        `State field "${field.name}" repeats a param of the same name. A State is a single ` +
        `object, so once a value is in params it does not need to appear again in states.`,
    });
  });

  return { data: { ...data, queryItems: nextItems }, issues };
}
