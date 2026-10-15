import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import { collectBoardTagCatalog, fieldTypeKey } from "@/utils/eventTags";
import { collectEventTypeNames } from "@/utils/typeCatalog";
import { nameKey, toCamelIdentifier } from "@/utils/naming";
import { validateFieldTypes } from "../common/typeValidation";
import {
  getProjectionItems,
  getProjectionParams,
  getProjectionStates,
} from "../common/projection/metrics";
import type {
  ProjectionCardData,
  ProjectionField,
  ProjectionQueryItem,
  ProjectionQueryTag,
} from "../common/projection/types";

// View and State share the same data shape; the aliases below keep the public
// View-flavoured names while a single implementation lives in common/projection.
export type ViewField = ProjectionField;
export type ViewQueryTag = ProjectionQueryTag;
export type ViewQueryItem = ProjectionQueryItem;
export type ViewCardData = ProjectionCardData;

export const getViewParams = getProjectionParams;
export const getViewItems = getProjectionItems;
export const getViewStates = getProjectionStates;

export interface ViewValidationContext {
  /** All elements currently on the board (used to resolve the tag catalog). */
  elements: CanvasElement[];
}

/**
 * Enforces the View card invariants:
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
export function validateViewCardData(
  data: ViewCardData,
  ctx: ViewValidationContext,
): { data: ViewCardData; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const elements = ctx.elements ?? [];
  const catalog = collectBoardTagCatalog(elements);
  const eventTypes = collectEventTypeNames(elements);

  // Field types must be primitive or defined on the board.
  issues.push(...validateFieldTypes(getViewParams(data), "params", elements));
  issues.push(...validateFieldTypes(getViewStates(data), "states", elements));

  const params = getViewParams(data);
  const paramByName = new Map(params.map((p) => [p.name, p]));
  const queryItems = getViewItems(data);

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
    const validTags: ViewQueryTag[] = [];

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

  return { data: { ...data, queryItems: nextItems }, issues };
}
