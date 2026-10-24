/**
 * Zod mirror of the {@link Specification} document contract.
 *
 * Used to validate a parsed `*.spec.yaml` before it reaches a generator, so
 * malformed input fails early with a precise, path-annotated message instead of
 * blowing up deep inside template rendering.
 */
import { z } from "zod";
import type {
  ActorDef,
  CommandDef,
  ConstraintDef,
  Domain,
  EventDef,
  Field,
  Group,
  NoteDef,
  QueryDef,
  ServiceDef,
  Slice,
  Specification,
  StateLikeDef,
  TagDef,
} from "./types";

export const fieldValidationSchema = z.object({
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

export const namedRefSchema = z.union([
  z.string(),
  z.object({ name: z.string(), description: z.string().optional() }),
]);

export const objectTypeDefSchema = z.object({
  object: z.string(),
  description: z.string().optional(),
  fields: z.array(z.lazy(() => fieldSchema)).optional(),
});

export const enumTypeDefSchema = z.object({
  enum: z.string(),
  description: z.string().optional(),
  values: z.array(namedRefSchema).optional(),
});

export const aliasTypeDefSchema = z.object({
  alias: z.string(),
  of: z.string(),
  array: z.boolean().optional(),
  description: z.string().optional(),
  validation: fieldValidationSchema.optional(),
});

export const dataTypeDefSchema = z.union([
  objectTypeDefSchema,
  enumTypeDefSchema,
  aliasTypeDefSchema,
]);

export const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.union([z.string(), objectTypeDefSchema, enumTypeDefSchema, aliasTypeDefSchema]),
    array: z.boolean().optional(),
    required: z.boolean().optional(),
    tag: z.string().optional(),
    description: z.string().optional(),
    validation: fieldValidationSchema.optional(),
  }),
);

const domainSchema: z.ZodType<Domain> = z.object({
  name: z.string(),
  groups: z.array(z.string()).optional(),
  slices: z.array(z.string()).optional(),
  cards: z.array(z.string()).optional(),
});

const groupSchema: z.ZodType<Group> = z.object({
  name: z.string(),
  domain: z.string().optional(),
  cards: z.array(z.string()).optional(),
});

const sliceSchema: z.ZodType<Slice> = z.object({
  name: z.string(),
  domain: z.string().optional(),
  description: z.string().optional(),
  lanes: z
    .array(z.object({ type: z.string(), cards: z.array(z.string()) }))
    .optional(),
});

const eventSchema: z.ZodType<EventDef> = z.object({
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(fieldSchema).optional(),
});

const commandSchema: z.ZodType<CommandDef> = z.object({
  name: z.string(),
  action: z.string().optional(),
  description: z.string().optional(),
  inputs: z.array(fieldSchema).optional(),
  responses: z.array(fieldSchema).optional(),
});

const querySchema: z.ZodType<QueryDef> = z.object({
  name: z.string(),
  action: z.string().optional(),
  description: z.string().optional(),
  params: z.array(fieldSchema).optional(),
  responses: z.array(fieldSchema).optional(),
});

const queryItemSchema = z.object({
  types: z.array(z.string()),
  tags: z.array(z.object({ tag: z.string(), field: z.string() })).optional(),
  description: z.string().optional(),
});

const stateLikeSchema: z.ZodType<StateLikeDef> = z.object({
  name: z.string(),
  description: z.string().optional(),
  params: z.array(fieldSchema).optional(),
  query: z.array(queryItemSchema).optional(),
  states: z.array(fieldSchema).optional(),
});

const constraintSchema: z.ZodType<ConstraintDef> = z.object({
  name: z.string(),
  description: z.string().optional(),
  states: z.array(namedRefSchema).optional(),
  rules: z.array(z.string()).optional(),
});

const serviceSchema: z.ZodType<ServiceDef> = z.object({
  name: z.string(),
  serviceName: z.string().optional(),
  description: z.string().optional(),
  params: z.array(fieldSchema).optional(),
  returns: z.array(fieldSchema).optional(),
  methods: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        params: z.array(fieldSchema).optional(),
        returns: z.array(fieldSchema).optional(),
      }),
    )
    .optional(),
});

const actorSchema: z.ZodType<ActorDef> = z.object({
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const tagSchema: z.ZodType<TagDef> = z.object({
  tag: z.string(),
  types: z.array(z.string()),
  fromEvents: z.array(z.string()),
});

const noteSchema: z.ZodType<NoteDef> = z.object({
  text: z.string(),
  description: z.string().optional(),
});

export const specificationSchema: z.ZodType<Specification> = z.object({
  name: z.string(),
  domains: z.array(domainSchema).optional(),
  groups: z.array(groupSchema).optional(),
  slices: z.array(sliceSchema).optional(),
  types: z.array(dataTypeDefSchema).optional(),
  events: z.array(eventSchema).optional(),
  commands: z.array(commandSchema).optional(),
  queries: z.array(querySchema).optional(),
  views: z.array(stateLikeSchema).optional(),
  states: z.array(stateLikeSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  services: z.array(serviceSchema).optional(),
  actors: z.array(actorSchema).optional(),
  tags: z.array(tagSchema).optional(),
  notes: z.array(noteSchema).optional(),
});
