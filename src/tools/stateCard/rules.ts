import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import { collectBoardTagCatalog, fieldTypeKey } from "@/utils/eventTags";
import { collectEventTypeNames } from "@/utils/typeCatalog";
import { nameKey } from "@/utils/naming";
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
 * - the param field type must match the tagged event field type.
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
      const tag = (ref?.tag || "").trim();
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

  return { data: { ...data, queryItems: nextItems }, issues };
}
