import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import { collectBoardTagCatalog, fieldTypeKey } from "@/utils/eventTags";
import { toCamelIdentifier } from "@/utils/naming";
import { validateFieldTypes } from "../common/typeValidation";
import type { EventCardData } from "./index";

export interface EventValidationContext {
  /** All elements currently on the board (used to resolve existing tags). */
  elements: CanvasElement[];
}

/**
 * Enforces the Event card invariants:
 * - every field type must be a primitive or a type defined on the board;
 * - a DCB tag identifies a single field type, so a tag already used on the
 *   board (or earlier in this same card) may only be reused with the SAME
 *   field type. Reusing it with a different type is rejected.
 *
 * The data is returned unchanged: unlike tag *references* (which can be
 * dropped), a wrong field type has no safe automatic repair, so the AI path
 * rejects the whole call and reports the issues.
 */
export function validateEventCardData(
  data: EventCardData,
  ctx: EventValidationContext,
): { data: EventCardData; issues: ValidationIssue[] } {
  const elements = ctx.elements ?? [];
  const fields = Array.isArray(data.fields) ? data.fields : [];

  const issues: ValidationIssue[] = [
    ...validateFieldTypes(fields, "fields", elements),
  ];

  // Existing tags on the board: tag name -> set of type keys it is used with.
  const boardCatalog = collectBoardTagCatalog(elements);
  // Tags already claimed by this new card, so two fields in the same card
  // cannot declare the same tag with different types either.
  const cardTypes = new Map<string, Set<string>>();

  fields.forEach((field, index) => {
    const tag = toCamelIdentifier(typeof field?.tag === "string" ? field.tag : "");
    if (!tag) return;

    const typeKey = fieldTypeKey(field);
    const known = new Set<string>([
      ...(boardCatalog.get(tag) ?? []),
      ...(cardTypes.get(tag) ?? []),
    ]);

    if (known.size > 0 && !known.has(typeKey)) {
      issues.push({
        path: `fields[${index}].tag`,
        code: "tag_type_conflict",
        message:
          `Tag "${tag}" is already used with type ${Array.from(known).join(" | ")}, ` +
          `so it cannot be reused here with type "${typeKey}".`,
      });
    }

    const seen = cardTypes.get(tag) ?? new Set<string>();
    seen.add(typeKey);
    cardTypes.set(tag, seen);
  });

  return { data, issues };
}
