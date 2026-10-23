import { z } from "zod";

/**
 * Constraints a field (or an Alias wrapping a type) can declare. The set is
 * intentionally JSON-Schema-like: length bounds and a pattern for strings,
 * range bounds for numbers, item-count bounds for arrays, plus a free-text
 * rule for anything the structured fields cannot express.
 *
 * Every key is optional; a validation is "present" only when at least one key
 * carries a usable value (see {@link hasValidation}). Stored on the field data
 * as `validation`.
 */
export interface FieldValidation {
  /** Minimum string length (inclusive). */
  minLength?: number;
  /** Maximum string length (inclusive). */
  maxLength?: number;
  /** Regular expression the string value must match. */
  pattern?: string;
  /** Named string format (e.g. `email`, `url`, `uuid`). */
  format?: string;
  /** Minimum numeric value (inclusive). */
  min?: number;
  /** Maximum numeric value (inclusive). */
  max?: number;
  /** Minimum array item count (inclusive). */
  minItems?: number;
  /** Maximum array item count (inclusive). */
  maxItems?: number;
  /** Free-text custom rule (predicate / expression) for hard-to-model checks. */
  rule?: string;
}

/**
 * Zod mirror of {@link FieldValidation}. All keys optional so a validation
 * object is only ever partially populated; used by the card schemas and the
 * AI tool parameter schemas.
 */
export const FieldValidationSchema = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  format: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  rule: z.string().optional(),
});

/** A named string format a field can declare. */
export interface FieldFormatPreset {
  value: string;
  label: string;
}

/** Preset string formats offered by the validation editor. */
export const FIELD_FORMAT_PRESETS: FieldFormatPreset[] = [
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "uuid", label: "UUID" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "DateTime" },
  { value: "time", label: "Time" },
  { value: "ipv4", label: "IPv4" },
  { value: "ipv6", label: "IPv6" },
];

/** Which constraint group applies to a field, based on its declared type. */
export type FieldValidationKind = "string" | "number" | "array" | "json";

/** Type names (lowercased) treated as numeric for validation grouping. */
const NUMERIC_TYPES = new Set(["integer", "float"]);

/**
 * Picks the validation group to surface for a field. Array fields always use
 * item-count bounds; otherwise the declared type decides between numeric range,
 * JSON (free-form, so only the custom rule applies) and string length/pattern.
 * Unknown/defined types (e.g. an Alias name) fall back to the string group.
 */
export function validationKindFor(
  type: string | undefined,
  isArray?: boolean,
): FieldValidationKind {
  if (isArray) return "array";
  const key = (type || "").trim().toLowerCase();
  if (NUMERIC_TYPES.has(key)) return "number";
  if (key === "json") return "json";
  return "string";
}

/**
 * True when a validation carries at least one meaningful constraint. Numeric
 * zero counts (it is a real bound); empty strings and non-finite numbers do
 * not.
 */
export function hasValidation(validation: FieldValidation | undefined | null): boolean {
  if (!validation) return false;
  const hasNumber = (n: number | undefined) => typeof n === "number" && Number.isFinite(n);
  const hasText = (t: string | undefined) => typeof t === "string" && t.trim().length > 0;
  return (
    hasNumber(validation.minLength) ||
    hasNumber(validation.maxLength) ||
    hasText(validation.pattern) ||
    hasText(validation.format) ||
    hasNumber(validation.min) ||
    hasNumber(validation.max) ||
    hasNumber(validation.minItems) ||
    hasNumber(validation.maxItems) ||
    hasText(validation.rule)
  );
}

/**
 * Drops empty/undefined keys so stored data stays clean, returning `undefined`
 * when nothing usable remains. Callers store `undefined` to mean "no
 * validation".
 */
export function cleanValidation(
  validation: FieldValidation | undefined | null,
): FieldValidation | undefined {
  if (!validation) return undefined;
  const next: FieldValidation = {};
  const takeNumber = (key: keyof FieldValidation) => {
    const value = validation[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      (next as Record<string, unknown>)[key] = value;
    }
  };
  const takeText = (key: keyof FieldValidation) => {
    const value = validation[key];
    if (typeof value === "string" && value.trim()) {
      (next as Record<string, unknown>)[key] = key === "pattern" ? value : value.trim();
    }
  };
  takeNumber("minLength");
  takeNumber("maxLength");
  takeText("pattern");
  takeText("format");
  takeNumber("min");
  takeNumber("max");
  takeNumber("minItems");
  takeNumber("maxItems");
  takeText("rule");
  return hasValidation(next) ? next : undefined;
}

/**
 * Human label for a stored format value (falls back to the raw value when it is
 * not one of the presets, e.g. AI-authored custom formats).
 */
export function formatLabel(value: string): string {
  return FIELD_FORMAT_PRESETS.find((preset) => preset.value === value)?.label ?? value;
}

/**
 * Short human-readable labels for a validation's active constraints, used by
 * the editor's summary line (e.g. `["length ≥ 3", "length ≤ 32"]`).
 */
export function validationSummary(validation: FieldValidation | undefined): string[] {
  if (!validation) return [];
  const parts: string[] = [];
  if (typeof validation.minLength === "number") parts.push(`length ≥ ${validation.minLength}`);
  if (typeof validation.maxLength === "number") parts.push(`length ≤ ${validation.maxLength}`);
  if (validation.format?.trim()) parts.push(`format ${formatLabel(validation.format.trim())}`);
  if (validation.pattern?.trim()) parts.push(`pattern ${validation.pattern}`);
  if (typeof validation.min === "number") parts.push(`≥ ${validation.min}`);
  if (typeof validation.max === "number") parts.push(`≤ ${validation.max}`);
  if (typeof validation.minItems === "number") parts.push(`items ≥ ${validation.minItems}`);
  if (typeof validation.maxItems === "number") parts.push(`items ≤ ${validation.maxItems}`);
  if (validation.rule?.trim()) parts.push(validation.rule.trim());
  return parts;
}

/** Editable form of a validation: every value is a string (inputs are text). */
export type ValidationDraft = {
  minLength: string;
  maxLength: string;
  pattern: string;
  format: string;
  min: string;
  max: string;
  minItems: string;
  maxItems: string;
  rule: string;
};

/** The empty draft, used when a field has no validation yet. */
export function emptyValidationDraft(): ValidationDraft {
  return {
    minLength: "",
    maxLength: "",
    pattern: "",
    format: "",
    min: "",
    max: "",
    minItems: "",
    maxItems: "",
    rule: "",
  };
}

/** Seeds the editor's draft from stored validation data. */
export function validationToDraft(validation: FieldValidation | undefined): ValidationDraft {
  const draft = emptyValidationDraft();
  if (!validation) return draft;
  const asText = (n: number | undefined) =>
    typeof n === "number" && Number.isFinite(n) ? String(n) : "";
  draft.minLength = asText(validation.minLength);
  draft.maxLength = asText(validation.maxLength);
  draft.pattern = validation.pattern ?? "";
  draft.format = validation.format ?? "";
  draft.min = asText(validation.min);
  draft.max = asText(validation.max);
  draft.minItems = asText(validation.minItems);
  draft.maxItems = asText(validation.maxItems);
  draft.rule = validation.rule ?? "";
  return draft;
}

/**
 * Parses the editor's draft back into a validation. Empty inputs are dropped;
 * non-numeric text in numeric boxes is ignored. Returns `null` for an empty
 * draft so callers can clear a field's validation.
 */
export function draftToValidation(draft: ValidationDraft): FieldValidation | null {
  const parsed: FieldValidation = {};
  const number = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
  };
  parsed.minLength = number(draft.minLength);
  parsed.maxLength = number(draft.maxLength);
  parsed.pattern = draft.pattern.trim() || undefined;
  parsed.format = draft.format.trim() || undefined;
  parsed.min = number(draft.min);
  parsed.max = number(draft.max);
  parsed.minItems = number(draft.minItems);
  parsed.maxItems = number(draft.maxItems);
  parsed.rule = draft.rule.trim() || undefined;
  return cleanValidation(parsed) ?? null;
}
