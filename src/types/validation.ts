/**
 * Shared input-validation rules for storm fields and model nodes.
 *
 * Every rule is optional; an absent/empty object means "no extra validation".
 * The rules map one-to-one onto JSON Schema keywords so the exported schema
 * (utils/jsonSchemaExport.ts) carries the same constraints:
 * - minLength / maxLength → string length bounds
 * - pattern               → string regex
 * - format                → well-known string format (email, uuid, …)
 * - min / max             → numeric bounds (minimum / maximum)
 * - minItems / maxItems   → array item count bounds (arrays only)
 * - allowedValues         → `enum`
 *
 * `required` is tracked separately (it lives on the owning field).
 */
export interface FieldValidation {
  /** Minimum string length (inclusive). */
  minLength?: number;
  /** Maximum string length (inclusive). */
  maxLength?: number;
  /** ECMAScript regular expression the string value must match. */
  pattern?: string;
  /**
   * Well-known string format (JSON Schema `format`), e.g. `email`, `uuid`,
   * `uri`, `date-time`. See STORM_VALIDATION_FORMATS for the offered list.
   */
  format?: string;
  /** Minimum numeric value (inclusive). */
  min?: number;
  /** Maximum numeric value (inclusive). */
  max?: number;
  /** Minimum array length (inclusive). Arrays only. */
  minItems?: number;
  /** Maximum array length (inclusive). Arrays only. */
  maxItems?: number;
  /** Permitted values (JSON Schema `enum`). */
  allowedValues?: string[];
}
