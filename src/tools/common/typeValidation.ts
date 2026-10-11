import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import {
  collectDefinedTypeNames,
  isKnownFieldType,
  normalizeTypeName,
} from "@/utils/typeCatalog";

/** Minimal shape of a typed field row shared by every card. */
export interface TypedFieldLike {
  name?: string;
  type?: string;
}

/**
 * Validates a single type token. A type must be present and must resolve to a
 * primitive or a type defined on the board (Object/Enum/Alias). Anything else
 * is reported so the AI bridge can reject the tool call.
 */
export function validateTypeValue(
  type: string | undefined,
  path: string,
  defined: Set<string>,
): ValidationIssue[] {
  const normalized = normalizeTypeName(type);
  if (!normalized) {
    return [{ path, code: "type_missing", message: "A data type is required." }];
  }
  if (!isKnownFieldType(normalized, defined)) {
    return [
      {
        path,
        code: "type_unknown",
        message:
          `Type "${normalized}" is not a primitive and is not a defined ` +
          `Object/Enum/Alias on the board.`,
      },
    ];
  }
  return [];
}

/**
 * Validates the `type` of every field in `fields`, reporting one issue per bad
 * row. `pathPrefix` is the dotted path to the array (e.g. `params`,
 * `methods[0].returns`) so issues point at the exact field.
 */
export function validateFieldTypes(
  fields: TypedFieldLike[] | undefined,
  pathPrefix: string,
  elements: CanvasElement[],
): ValidationIssue[] {
  const defined = collectDefinedTypeNames(elements);
  const issues: ValidationIssue[] = [];
  const list = Array.isArray(fields) ? fields : [];
  list.forEach((field, index) => {
    issues.push(...validateTypeValue(field?.type, `${pathPrefix}[${index}].type`, defined));
  });
  return issues;
}
