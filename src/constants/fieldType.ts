import type {
  BddStep,
  CanvasObject,
  ModelEnumValue,
  ModelField,
  StormConstraint,
  StormField,
  StormQueryItem,
} from "@/types";

/**
 * Canonical primitive field types and their normalization.
 *
 * Primitive types are stored in a single canonical PascalCase / acronym
 * spelling ("String", "UUID", "DateTime", …) so the type pill, the JSON Schema
 * export and the AI tools all read the same way. Any casing or common alias
 * (e.g. "uuid", "date-time") resolves to the canonical name through
 * `normalizeFieldType`. Names that are not a known primitive — Model node
 * references and freeform custom types — are left untouched: models keep their
 * own names.
 */

export const PRIMITIVE_TYPES = [
  "String",
  "Number",
  "Boolean",
  "UUID",
  "DateTime",
  "Date",
  "Email",
  "URL",
  "URI",
  "JSON",
  "Any",
  "Void",
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/** Default type a freshly added field starts with. */
export const DEFAULT_FIELD_TYPE = "String";

/** Default element type for a bare array / wrap node. */
export const DEFAULT_ANY_TYPE = "Any";

/**
 * Lowercased alias -> canonical. Only aliases whose spelling differs from the
 * canonical name need an entry: `"uuid"` already lowercases to the key for
 * `"UUID"`, but `"date-time"` does not match `"datetime"`.
 */
const PRIMITIVE_ALIASES: Record<string, PrimitiveType> = {
  "date-time": "DateTime",
  date_time: "DateTime",
};

const PRIMITIVE_BY_KEY = new Map<string, PrimitiveType>(
  PRIMITIVE_TYPES.map((type) => [type.toLowerCase(), type]),
);

/** Split a type string into its base name and trailing `[]` array marker. */
export function splitArraySuffix(type: string): {
  base: string;
  isArray: boolean;
} {
  const trimmed = type.trim();
  if (trimmed.endsWith("[]")) {
    return { base: trimmed.slice(0, -2).trim(), isArray: true };
  }
  return { base: trimmed, isArray: false };
}

/** Canonical primitive for a base type (no `[]`), or `null` when unknown. */
export function canonicalPrimitiveType(raw?: string): PrimitiveType | null {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return null;
  return PRIMITIVE_BY_KEY.get(key) ?? PRIMITIVE_ALIASES[key] ?? null;
}

/** Whether a type (with optional `[]`) is a known primitive. */
export function isPrimitiveType(raw?: string): boolean {
  const { base } = splitArraySuffix(raw ?? "");
  return canonicalPrimitiveType(base) !== null;
}

/**
 * Normalize a field type: trim, canonicalize a known primitive (case- and
 * alias-insensitively) and keep any `[]` array suffix. Unknown names — model
 * references and custom types — are only trimmed so their own casing survives.
 */
export function normalizeFieldType(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return trimmed;
  const { base, isArray } = splitArraySuffix(trimmed);
  const resolved = canonicalPrimitiveType(base) ?? base;
  return isArray ? `${resolved}[]` : resolved;
}

/**
 * Coerce a possibly non-array list into an array. `undefined`/`null` stay
 * `undefined` so optional bands are preserved; any other non-array value (e.g.
 * an object written by a bad import or AI patch) becomes `[]` so downstream
 * iteration and `.map` calls never throw.
 */
function asArrayOrUndefined<T>(value: unknown): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeStormFields(fields: unknown): StormField[] | undefined {
  const list = asArrayOrUndefined<StormField>(fields);
  if (list === undefined) return undefined;
  return list.map((field) => ({
    ...field,
    fieldType: normalizeFieldType(field.fieldType),
  }));
}

function normalizeModelFields(fields: unknown): ModelField[] | undefined {
  const list = asArrayOrUndefined<ModelField>(fields);
  if (list === undefined) return undefined;
  return list.map((field) => ({
    ...field,
    fieldType: normalizeFieldType(field.fieldType),
  }));
}

/**
 * Repair the array-shaped lists on a Model/Storm payload, leaving field types
 * untouched. Boards can arrive from outside (files, autosave, AI patches) with
 * a `fields`/`values`/`queryItems` value that is not an array; every consumer
 * assumes arrays, so coerce them here before they reach a `.map`. Returns the
 * original object when nothing needs repair, so it cannot churn unrelated state.
 */
export function coerceObjectArrays(obj: CanvasObject): CanvasObject {
  if (obj.type === "storm" && obj.stormData) {
    const data = obj.stormData;
    const fields = asArrayOrUndefined<StormField>(data.fields) ?? [];
    const inputFields = asArrayOrUndefined<StormField>(data.inputFields);
    const outputFields = asArrayOrUndefined<StormField>(data.outputFields);
    const responseFields = asArrayOrUndefined<StormField>(data.responseFields);
    const queryItems = asArrayOrUndefined<StormQueryItem>(data.queryItems);
    const constraints = asArrayOrUndefined<StormConstraint>(data.constraints);
    const steps = asArrayOrUndefined<BddStep>(data.steps);
    const permissions = asArrayOrUndefined<string>(data.permissions);
    if (
      fields === data.fields &&
      inputFields === data.inputFields &&
      outputFields === data.outputFields &&
      responseFields === data.responseFields &&
      queryItems === data.queryItems &&
      constraints === data.constraints &&
      steps === data.steps &&
      permissions === data.permissions
    ) {
      return obj;
    }
    return {
      ...obj,
      stormData: {
        ...data,
        fields,
        inputFields,
        outputFields,
        responseFields,
        queryItems,
        constraints,
        steps,
        permissions,
      },
    };
  }

  if (obj.type === "model" && obj.modelData) {
    const data = obj.modelData;
    const fields = asArrayOrUndefined<ModelField>(data.fields);
    const values = asArrayOrUndefined<ModelEnumValue>(data.values);
    if (fields === data.fields && values === data.values) return obj;
    return { ...obj, modelData: { ...data, fields, values } };
  }

  return obj;
}

/**
 * Return `obj` with every field type canonicalized. Used when a board is loaded
 * (file / autosave / restore) so legacy lowercase types ("uuid", "datetime")
 * surface as their canonical spelling everywhere. Non-primitive types
 * (model names) are trimmed only.
 */
export function normalizeObjectFieldTypes(obj: CanvasObject): CanvasObject {
  if (obj.type === "storm" && obj.stormData) {
    const data = obj.stormData;
    return {
      ...obj,
      stormData: {
        ...data,
        fields: normalizeStormFields(data.fields) ?? data.fields,
        inputFields: normalizeStormFields(data.inputFields),
        outputFields: normalizeStormFields(data.outputFields),
        responseFields: normalizeStormFields(data.responseFields),
        queryItems: asArrayOrUndefined<StormQueryItem>(data.queryItems),
        constraints: asArrayOrUndefined<StormConstraint>(data.constraints),
        steps: asArrayOrUndefined<BddStep>(data.steps),
        permissions: asArrayOrUndefined<string>(data.permissions),
      },
    };
  }

  if (obj.type === "model" && obj.modelData) {
    const data = obj.modelData;
    return {
      ...obj,
      modelData: {
        ...data,
        fields: normalizeModelFields(data.fields),
        values: asArrayOrUndefined<ModelEnumValue>(data.values),
        itemType:
          data.itemType !== undefined
            ? normalizeFieldType(data.itemType)
            : data.itemType,
        innerType:
          data.innerType !== undefined
            ? normalizeFieldType(data.innerType)
            : data.innerType,
      },
    };
  }

  return obj;
}
