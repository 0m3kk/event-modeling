import type { StormFieldValidation } from "@/types";

/**
 * Helpers for Command / Query param input validation.
 *
 * Validation is stored on `StormField.validation` and edited through
 * ValidationPopover.tsx. This module keeps the pure pieces — counting,
 * describing and round-tripping the rules — so they can be unit tested and
 * reused by the renderer and the JSON Schema export.
 */

/** Editable draft: every rule as the raw string a text input holds. */
export interface FieldValidationDraft {
  minLength: string;
  maxLength: string;
  pattern: string;
  format: string;
  min: string;
  max: string;
  allowedValues: string;
}

export const EMPTY_VALIDATION_DRAFT: FieldValidationDraft = {
  minLength: "",
  maxLength: "",
  pattern: "",
  format: "",
  min: "",
  max: "",
  allowedValues: "",
};

/**
 * Field types whose value is a string, so a string `format` makes sense.
 * Numbers, booleans, arrays of those, and model references are excluded.
 */
const STRING_LIKE_TYPES = new Set([
  "",
  "string",
  "email",
  "uuid",
  "url",
  "uri",
  "date",
  "datetime",
  "time",
]);

export function isStringLikeFieldType(fieldType?: string): boolean {
  const base = (fieldType ?? "").replace(/\[\]$/, "").trim().toLowerCase();
  return STRING_LIKE_TYPES.has(base);
}

/**
 * Format a field type already implies, e.g. an `email` field type resolves to
 * `{ type: "string", format: "email" }` in the exported schema. Used purely as
 * a hint in the validation panel; explicit validation still wins on export.
 */
const FIELD_TYPE_FORMATS: Record<string, string> = {
  email: "email",
  uuid: "uuid",
  url: "uri",
  uri: "uri",
  date: "date",
  datetime: "date-time",
  time: "time",
};

export function formatFromFieldType(fieldType?: string): string | undefined {
  const base = (fieldType ?? "").replace(/\[\]$/, "").trim().toLowerCase();
  return FIELD_TYPE_FORMATS[base];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse a draft input into a finite number. Blank / invalid input yields
 * `undefined` so the rule is simply dropped rather than stored as NaN.
 */
function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parse a length bound as a non-negative integer. */
function parseLength(raw: string): number | undefined {
  const parsed = parseNumber(raw);
  if (parsed === undefined) return undefined;
  return Math.max(0, Math.trunc(parsed));
}

/** Split the allowed-values input on commas or newlines. */
export function parseAllowedValues(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Load stored validation into an editable draft. */
export function validationToDraft(
  validation?: StormFieldValidation,
): FieldValidationDraft {
  return {
    minLength: isFiniteNumber(validation?.minLength)
      ? String(validation.minLength)
      : "",
    maxLength: isFiniteNumber(validation?.maxLength)
      ? String(validation.maxLength)
      : "",
    pattern: validation?.pattern ?? "",
    format: validation?.format ?? "",
    min: isFiniteNumber(validation?.min) ? String(validation.min) : "",
    max: isFiniteNumber(validation?.max) ? String(validation.max) : "",
    allowedValues: (validation?.allowedValues ?? []).join(", "),
  };
}

/**
 * Turn an edited draft back into stored validation. Returns `undefined` when
 * no rule is set so empty validation never lingers on a field.
 */
export function draftToValidation(
  draft: FieldValidationDraft,
): StormFieldValidation | undefined {
  const validation: StormFieldValidation = {};

  const minLength = parseLength(draft.minLength);
  if (minLength !== undefined) validation.minLength = minLength;

  const maxLength = parseLength(draft.maxLength);
  if (maxLength !== undefined) validation.maxLength = maxLength;

  const pattern = draft.pattern.trim();
  if (pattern) validation.pattern = pattern;

  const format = draft.format.trim();
  if (format) validation.format = format;

  const min = parseNumber(draft.min);
  if (min !== undefined) validation.min = min;

  const max = parseNumber(draft.max);
  if (max !== undefined) validation.max = max;

  const allowedValues = parseAllowedValues(draft.allowedValues);
  if (allowedValues.length > 0) validation.allowedValues = allowedValues;

  return Object.keys(validation).length > 0 ? validation : undefined;
}

/** Number of individual rules a validation object declares. */
export function countValidationRules(
  validation?: StormFieldValidation,
): number {
  if (!validation) return 0;
  let count = 0;
  if (isFiniteNumber(validation.minLength)) count += 1;
  if (isFiniteNumber(validation.maxLength)) count += 1;
  if ((validation.pattern ?? "").trim()) count += 1;
  if ((validation.format ?? "").trim()) count += 1;
  if (isFiniteNumber(validation.min)) count += 1;
  if (isFiniteNumber(validation.max)) count += 1;
  if ((validation.allowedValues ?? []).length > 0) count += 1;
  return count;
}

/** Whether the field carries at least one validation rule. */
export function hasValidationRules(
  validation?: StormFieldValidation,
): boolean {
  return countValidationRules(validation) > 0;
}

/**
 * Clean an externally supplied validation payload (e.g. from the AI write
 * tools) so it matches what the popover would store: finite numbers, trimmed
 * pattern/format, and non-blank allowed values. Returns `undefined` when
 * nothing remains.
 */
export function normalizeValidation(
  input?: StormFieldValidation | null,
): StormFieldValidation | undefined {
  if (!input) return undefined;
  return draftToValidation(validationToDraft(input));
}

/** Human-readable one-liner used in button titles / tooltips. */
export function describeValidationRules(
  validation?: StormFieldValidation,
): string {
  if (!validation) return "";
  const parts: string[] = [];
  if (isFiniteNumber(validation.minLength)) {
    parts.push(`min length ${validation.minLength}`);
  }
  if (isFiniteNumber(validation.maxLength)) {
    parts.push(`max length ${validation.maxLength}`);
  }
  if ((validation.pattern ?? "").trim()) {
    parts.push(`pattern ${validation.pattern}`);
  }
  if ((validation.format ?? "").trim()) {
    parts.push(`format ${validation.format}`);
  }
  if (isFiniteNumber(validation.min)) parts.push(`min ${validation.min}`);
  if (isFiniteNumber(validation.max)) parts.push(`max ${validation.max}`);
  if ((validation.allowedValues ?? []).length > 0) {
    parts.push(`one of ${validation.allowedValues!.join(", ")}`);
  }
  return parts.join(", ");
}
