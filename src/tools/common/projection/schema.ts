/** Zod schema shared by the projection cards (State / View). */
import { z } from "zod";

const projectionFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  isArray: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  description: z.string().optional(),
});

const projectionQueryItemSchema = z.object({
  types: z.array(z.string()).default([]),
  tags: z
    .array(
      z.object({
        tag: z.string(),
        field: z.string(),
      }),
    )
    .default([]),
  description: z.string().optional(),
});

/** Builds the card schema with the given default name (e.g. `StateName`). */
export function buildProjectionSchema(defaultName: string) {
  return z.object({
    name: z.string().default(defaultName),
    params: z.array(projectionFieldSchema).default([]),
    queryItems: z.array(projectionQueryItemSchema).default([]),
    states: z.array(projectionFieldSchema).default([]),
    color: z.string().optional(),
    description: z.string().optional(),
  });
}
