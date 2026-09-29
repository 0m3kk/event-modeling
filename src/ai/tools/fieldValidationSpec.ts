import { z } from "zod";
import { STORM_VALIDATION_FORMATS } from "@/constants/storm";

/**
 * Shared Zod schema for a field / node `validation` object, used by the storm
 * and model write tools. The output type is structurally compatible with
 * `FieldValidation` and is passed through `normalizeValidation` before storage.
 */
export const fieldValidationSpec = z.object({
  minLength: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Minimum string length (inclusive)."),
  maxLength: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Maximum string length (inclusive)."),
  pattern: z
    .string()
    .optional()
    .describe("ECMAScript regular expression the value must match."),
  format: z
    .enum(STORM_VALIDATION_FORMATS)
    .optional()
    .describe("Well-known string format (JSON Schema format)."),
  min: z.number().optional().describe("Minimum numeric value (inclusive)."),
  max: z.number().optional().describe("Maximum numeric value (inclusive)."),
  minItems: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Minimum array length (inclusive)."),
  maxItems: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Maximum array length (inclusive)."),
  allowedValues: z
    .array(z.string())
    .optional()
    .describe("Permitted values (JSON Schema enum)."),
});

export type FieldValidationSpec = z.output<typeof fieldValidationSpec>;
