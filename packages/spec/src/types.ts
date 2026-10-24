/**
 * The **specification document contract**.
 *
 * These types describe the semantic, human-readable domain model that the board
 * exports (`*.spec.yaml`) and that the code generator consumes. The shape is
 * deliberately independent of the canvas: it holds meaning (events, commands,
 * domains, slices, data types...) and never geometry or internal ids.
 *
 * Data containers (Object / Enum / Alias) are defined *once* in the top-level
 * {@link Specification.types} registry, and every field references them by name
 * (a plain string). For backward compatibility a field's {@link Field.type} may
 * still be an inline definition object; {@link hoistTypes} lifts those into the
 * `types` registry so field types are always strings.
 */

/** A named item that may optionally carry a description (enum members, state refs). */
export type NamedRef = string | { name: string; description?: string };

/**
 * Constraints a field (or an Alias wrapping a type) can declare. JSON-Schema-like:
 * length bounds and a pattern for strings, range bounds for numbers, item-count
 * bounds for arrays, plus a free-text rule.
 */
export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  rule?: string;
}

/** An Object definition, serialized as `{ object, fields }`. */
export interface ObjectTypeDef {
  object: string;
  description?: string;
  fields?: Field[];
}

/** An Enum definition, serialized as `{ enum, values }`. */
export interface EnumTypeDef {
  enum: string;
  description?: string;
  values?: NamedRef[];
}

/** An Alias definition, serialized as `{ alias, of }`. */
export interface AliasTypeDef {
  alias: string;
  of: string;
  array?: boolean;
  description?: string;
  validation?: FieldValidation;
}

/** Any data definition (Object / Enum / Alias). */
export type DataTypeDef = ObjectTypeDef | EnumTypeDef | AliasTypeDef;

/**
 * The `type` of a field: a plain type name, or — for documents written before
 * the `types` registry — an inline definition object.
 */
export type FieldType = string | DataTypeDef;

export interface Field {
  name: string;
  type: FieldType;
  /** True when the field holds a list. */
  array?: boolean;
  /** True when the field is mandatory. */
  required?: boolean;
  /** DCB tag attached to this field, if any. */
  tag?: string;
  description?: string;
  validation?: FieldValidation;
}

export interface Domain {
  name: string;
  groups?: string[];
  slices?: string[];
  cards?: string[];
}

export interface Group {
  name: string;
  domain?: string;
  cards?: string[];
}

export interface SliceLane {
  /** Display type of the lane (`Event`, `Command`, `any`, ...). */
  type: string;
  cards: string[];
}

export interface Slice {
  name: string;
  domain?: string;
  description?: string;
  lanes?: SliceLane[];
}

export interface EventDef {
  name: string;
  description?: string;
  fields?: Field[];
}

export interface CommandDef {
  name: string;
  action?: string;
  description?: string;
  inputs?: Field[];
  responses?: Field[];
}

export interface QueryDef {
  name: string;
  action?: string;
  description?: string;
  params?: Field[];
  responses?: Field[];
}

export interface QueryItem {
  types: string[];
  tags?: Array<{ tag: string; field: string }>;
  description?: string;
}

/** Shared shape for View and State cards. */
export interface StateLikeDef {
  name: string;
  description?: string;
  params?: Field[];
  query?: QueryItem[];
  states?: Field[];
}

export interface ConstraintDef {
  name: string;
  description?: string;
  states?: NamedRef[];
  rules?: string[];
}

/** @deprecated Services are now exported as one method per definition. */
export interface ServiceMethod {
  name: string;
  description?: string;
  params?: Field[];
  returns?: Field[];
}

/**
 * A service method execution. Each entry in `spec.services` is one method:
 * its `name` is the method name and its fields are `params` / `returns`.
 */
export interface ServiceDef {
  name: string;
  /**
   * Service interface name: methods that share a `serviceName` are emitted as
   * the methods of one generated service interface. Omitted when unspecified.
   */
  serviceName?: string;
  description?: string;
  params?: Field[];
  returns?: Field[];
  /** @deprecated Legacy multi-method shape; still parsed when present. */
  methods?: ServiceMethod[];
}

export interface ActorDef {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface TagDef {
  tag: string;
  types: string[];
  fromEvents: string[];
}

export interface NoteDef {
  text: string;
  description?: string;
}

/** The root specification document. */
export interface Specification {
  name: string;
  domains?: Domain[];
  groups?: Group[];
  slices?: Slice[];
  /** Data containers (Object / Enum / Alias), each defined once and referenced by name. */
  types?: DataTypeDef[];
  events?: EventDef[];
  commands?: CommandDef[];
  queries?: QueryDef[];
  views?: StateLikeDef[];
  states?: StateLikeDef[];
  constraints?: ConstraintDef[];
  services?: ServiceDef[];
  actors?: ActorDef[];
  tags?: TagDef[];
  notes?: NoteDef[];
}

/** True when a field type is an inline definition rather than a plain name. */
export function isInlineType(type: FieldType): type is DataTypeDef {
  return typeof type === "object" && type !== null;
}

/** The declared name of an inline definition (works for object/enum/alias). */
export function dataTypeDefName(def: DataTypeDef): string {
  if ("object" in def) return def.object;
  if ("enum" in def) return def.enum;
  return def.alias;
}
