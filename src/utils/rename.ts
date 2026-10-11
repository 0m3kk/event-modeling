import type { CanvasElement } from "@/types";
import { getElementName, nameKey } from "./naming";

/**
 * Cross-element references on the board are stored *by name*, not by id:
 * a field's `type` points at an Object/Enum/Alias, a query item's `types`
 * point at Event cards, a query item's `tags` point at DCB tags owned by Event
 * fields, and a Constraint's `states` point at State cards.
 *
 * Those names are therefore live references: renaming the source must rewrite
 * every reference to it, or the reference silently dangles. This module
 * collects the renames implied by a single element update and applies them
 * across the whole board.
 */

/** The kinds of name reference that can be rewritten. */
export type RenameKind = "type" | "event" | "state" | "tag" | "field";

export interface RenameMapping {
  kind: RenameKind;
  from: string;
  to: string;
  /**
   * Restricts a mapping to one element. A query tag's `field` points at a
   * param on the *same* card (an intra-card reference), so a param rename must
   * not leak into another card's query items.
   */
  scopeId?: string;
}

/** Card types that define a reusable type referenced by field `type`s. */
const TYPE_DEFINING_TYPES = new Set(["objectCard", "enumCard", "aliasCard"]);

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Detects DCB tag renames on an Event card. Tags are attached to fields, so we
 * pair each old field with its new counterpart (by field name, falling back to
 * position when the fields were rebuilt) and compare the tag names.
 */
function collectTagRenames(previous: CanvasElement, nextData: any): RenameMapping[] {
  const oldFields = Array.isArray(previous.data?.fields) ? previous.data.fields : [];
  const newFields = Array.isArray(nextData?.fields) ? nextData.fields : [];
  if (oldFields.length === 0 || newFields.length === 0) return [];

  const newIndexByName = new Map<string, number>();
  newFields.forEach((field: any, index: number) => {
    const key = nameKey(readString(field?.name));
    if (key && !newIndexByName.has(key)) newIndexByName.set(key, index);
  });

  const used = new Set<number>();
  const mappings: RenameMapping[] = [];

  oldFields.forEach((oldField: any, index: number) => {
    let newIndex = newIndexByName.get(nameKey(readString(oldField?.name)));
    if (newIndex === undefined && oldFields.length === newFields.length) newIndex = index;
    if (newIndex === undefined || used.has(newIndex)) return;
    used.add(newIndex);

    const from = readString(oldField?.tag);
    const to = readString(newFields[newIndex]?.tag);
    if (!from || !to || nameKey(from) === nameKey(to)) return;
    mappings.push({ kind: "tag", from, to });
  });

  return mappings;
}

/**
 * Detects param renames on a State/View card. A query item's tag `field`
 * references one of these params by name, so the reference must follow.
 * Only length-stable param lists are paired (position is the only stable key
 * when a param was renamed).
 */
function collectParamRenames(previous: CanvasElement, nextData: any): RenameMapping[] {
  const oldParams = Array.isArray(previous.data?.params) ? previous.data.params : [];
  const newParams = Array.isArray(nextData?.params) ? nextData.params : [];
  if (oldParams.length === 0 || oldParams.length !== newParams.length) return [];

  const mappings: RenameMapping[] = [];
  oldParams.forEach((oldParam: any, index: number) => {
    const from = readString(oldParam?.name);
    const to = readString(newParams[index]?.name);
    if (!from || !to || nameKey(from) === nameKey(to)) return;
    mappings.push({ kind: "field", from, to, scopeId: previous.id });
  });
  return mappings;
}

/**
 * Collects every rename implied by updating `previous` to carry `nextData`:
 * - a renamed Object/Enum/Alias => `type` references must follow;
 * - a renamed Event => query item `types` must follow;
 * - a renamed State => Constraint `states` must follow;
 * - a renamed Event field tag => query item `tags` must follow;
 * - a renamed State/View param => that card's query tag `field`s must follow.
 */
export function collectRenameMappings(
  previous: CanvasElement,
  nextData: any,
): RenameMapping[] {
  if (!previous || !nextData || typeof nextData !== "object") return [];
  const mappings: RenameMapping[] = [];

  const oldName = getElementName(previous);
  const newName = getElementName({ type: previous.type, data: nextData });
  if (oldName && newName && nameKey(oldName) !== nameKey(newName)) {
    if (TYPE_DEFINING_TYPES.has(previous.type)) {
      mappings.push({ kind: "type", from: oldName, to: newName });
    } else if (previous.type === "eventCard") {
      mappings.push({ kind: "event", from: oldName, to: newName });
    } else if (previous.type === "stateCard") {
      mappings.push({ kind: "state", from: oldName, to: newName });
    }
  }

  if (previous.type === "eventCard") {
    mappings.push(...collectTagRenames(previous, nextData));
  }
  if (previous.type === "stateCard" || previous.type === "viewCard") {
    mappings.push(...collectParamRenames(previous, nextData));
  }

  return mappings;
}

/** Rewrites a plain identifier string when it matches a `from` entry. */
function rewriteValue(value: unknown, mappings: RenameMapping[]): unknown {
  if (typeof value !== "string" || mappings.length === 0) return value;
  const key = nameKey(value);
  if (!key) return value;
  for (const mapping of mappings) {
    if (nameKey(mapping.from) === key) return mapping.to;
  }
  return value;
}

/**
 * Like {@link rewriteValue} but tolerant of a trailing `[]` array marker, which
 * some legacy boards carry inside the type string. The marker is preserved.
 */
function rewriteTypeValue(value: unknown, mappings: RenameMapping[]): unknown {
  if (typeof value !== "string" || mappings.length === 0) return value;
  const match = value.match(/(\[\])+$/);
  const suffix = match ? match[0] : "";
  const base = suffix ? value.slice(0, -suffix.length) : value;
  const rewritten = rewriteValue(base, mappings);
  return rewritten === base ? value : `${rewritten}${suffix}`;
}

/** Maps an array, returning the original reference when nothing changed. */
function rewriteArray<T>(array: T[], rewrite: (item: T) => T): T[] {
  let changed = false;
  const next = array.map((item) => {
    const mapped = rewrite(item);
    if (mapped !== item) changed = true;
    return mapped;
  });
  return changed ? next : array;
}

interface MappingBuckets {
  typeMappings: RenameMapping[];
  eventMappings: RenameMapping[];
  stateMappings: RenameMapping[];
  tagMappings: RenameMapping[];
  fieldMappings: RenameMapping[];
}

/** Rewrites the field `type`s of a `fields`/`inputs`/`params`-style array. */
function rewriteTypedRows(rows: any[], buckets: MappingBuckets): any[] {
  if (buckets.typeMappings.length === 0) return rows;
  return rewriteArray(rows, (row: any) => {
    if (!row || typeof row !== "object") return row;
    const type = rewriteTypeValue(row.type, buckets.typeMappings);
    return type === row.type ? row : { ...row, type };
  });
}

/**
 * Rewrites every name reference inside one element's data, returning the same
 * element when nothing matched so callers can cheaply detect no-ops.
 */
function rewriteElementReferences(
  element: CanvasElement,
  buckets: MappingBuckets,
): CanvasElement {
  const data = element.data;
  if (!data || typeof data !== "object") return element;

  let nextData: any = data;

  // Typed field rows. `states` is a no-op on a Constraint card (its rows carry
  // a `name`, not a `type`), and is rewritten there by the state rule below.
  for (const key of ["fields", "inputs", "responses", "params", "states"]) {
    const rows = nextData[key];
    if (!Array.isArray(rows)) continue;
    const nextRows = rewriteTypedRows(rows, buckets);
    if (nextRows !== rows) nextData = { ...nextData, [key]: nextRows };
  }

  // Service methods nest their typed rows under `methods[].params/returns`.
  const methods = nextData.methods;
  if (Array.isArray(methods) && buckets.typeMappings.length > 0) {
    const nextMethods = rewriteArray(methods, (method: any) => {
      if (!method || typeof method !== "object") return method;
      let nextMethod = method;
      for (const group of ["params", "returns"] as const) {
        const rows = nextMethod[group];
        if (!Array.isArray(rows)) continue;
        const nextRows = rewriteTypedRows(rows, buckets);
        if (nextRows !== rows) nextMethod = { ...nextMethod, [group]: nextRows };
      }
      return nextMethod;
    });
    if (nextMethods !== methods) nextData = { ...nextData, methods: nextMethods };
  }

  // Alias wraps a single named type.
  if (buckets.typeMappings.length > 0 && typeof nextData.aliasedType === "string") {
    const aliasedType = rewriteTypeValue(nextData.aliasedType, buckets.typeMappings);
    if (aliasedType !== nextData.aliasedType) {
      nextData = { ...nextData, aliasedType };
    }
  }

  // Query items: event types + DCB tag references.
  const queryItems = nextData.queryItems;
  if (Array.isArray(queryItems)) {
    const hasTypeWork = buckets.eventMappings.length > 0;
    const hasTagWork = buckets.tagMappings.length > 0 || buckets.fieldMappings.length > 0;
    if (hasTypeWork || hasTagWork) {
      const scopedFields = buckets.fieldMappings.filter(
        (mapping) => !mapping.scopeId || mapping.scopeId === element.id,
      );
      const nextItems = rewriteArray(queryItems, (item: any) => {
        if (!item || typeof item !== "object") return item;
        let nextItem = item;

        if (hasTypeWork && Array.isArray(item.types)) {
          const nextTypes = rewriteArray(item.types, (type: any) =>
            rewriteValue(type, buckets.eventMappings),
          );
          if (nextTypes !== item.types) nextItem = { ...nextItem, types: nextTypes };
        }

        if (hasTagWork && Array.isArray(item.tags)) {
          const nextTags = rewriteArray(item.tags, (tagRef: any) => {
            if (!tagRef || typeof tagRef !== "object") return tagRef;
            let nextTagRef = tagRef;
            const tag = rewriteValue(tagRef.tag, buckets.tagMappings);
            if (tag !== tagRef.tag) nextTagRef = { ...nextTagRef, tag };
            if (scopedFields.length > 0) {
              const field = rewriteValue(nextTagRef.field, scopedFields);
              if (field !== nextTagRef.field) nextTagRef = { ...nextTagRef, field };
            }
            return nextTagRef;
          });
          if (nextTags !== item.tags) nextItem = { ...nextItem, tags: nextTags };
        }

        return nextItem;
      });
      if (nextItems !== queryItems) nextData = { ...nextData, queryItems: nextItems };
    }
  }

  // A Constraint lists the State cards it reads, referenced by name.
  if (element.type === "constraintCard" && buckets.stateMappings.length > 0) {
    const states = nextData.states;
    if (Array.isArray(states)) {
      const nextStates = rewriteArray(states, (state: any) => {
        if (!state || typeof state !== "object") return state;
        const name = rewriteValue(state.name, buckets.stateMappings);
        return name === state.name ? state : { ...state, name };
      });
      if (nextStates !== states) nextData = { ...nextData, states: nextStates };
    }
  }

  return nextData === data ? element : { ...element, data: nextData };
}

/**
 * Applies rename mappings across every element, rewriting name references.
 * Returns the original array when nothing changed.
 */
export function applyRenameMappings(
  elements: CanvasElement[],
  mappings: RenameMapping[],
): CanvasElement[] {
  if (!Array.isArray(elements) || !mappings || mappings.length === 0) return elements;

  const buckets: MappingBuckets = {
    typeMappings: mappings.filter((m) => m.kind === "type"),
    eventMappings: mappings.filter((m) => m.kind === "event"),
    stateMappings: mappings.filter((m) => m.kind === "state"),
    tagMappings: mappings.filter((m) => m.kind === "tag"),
    fieldMappings: mappings.filter((m) => m.kind === "field"),
  };

  let changed = false;
  const next = elements.map((element) => {
    const rewritten = rewriteElementReferences(element, buckets);
    if (rewritten !== element) changed = true;
    return rewritten;
  });

  return changed ? next : elements;
}

/**
 * Convenience wrapper: given the element being updated and its next data,
 * derives the rename mappings and applies them across the board in one step.
 */
export function propagateRenames(
  elements: CanvasElement[],
  previous: CanvasElement,
  nextData: any,
): CanvasElement[] {
  const mappings = collectRenameMappings(previous, nextData);
  if (mappings.length === 0) return elements;
  return applyRenameMappings(elements, mappings);
}
