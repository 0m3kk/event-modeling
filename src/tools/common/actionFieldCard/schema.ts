/** Zod schema shared by the action field cards (Command / Query). */
import { z } from "zod";
import { FieldValidationSchema } from "@/utils/fieldValidation";
import type { ActionCardData } from "./types";

const primaryFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  isArray: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  description: z.string().optional(),
  validation: FieldValidationSchema.optional(),
});

const responseFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  isArray: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  description: z.string().optional(),
});

/**
 * Builds the card schema. `primaryKey` names the primary section (`inputs` for
 * Command, `params` for Query); only the primary section accepts validation.
 */
export function buildActionSchema(
  primaryKey: "inputs" | "params",
  defaultName: string,
): z.ZodType<ActionCardData, any, any> {
  const shared = {
    name: z.string().default(defaultName),
    action: z.string().optional(),
    responses: z.array(responseFieldSchema).default([]),
    color: z.string().optional(),
    description: z.string().optional(),
  };

  const schema =
    primaryKey === "inputs"
      ? z.object({ ...shared, inputs: z.array(primaryFieldSchema).default([]) })
      : z.object({ ...shared, params: z.array(primaryFieldSchema).default([]) });

  return schema as unknown as z.ZodType<ActionCardData, any, any>;
}
