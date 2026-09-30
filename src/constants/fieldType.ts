import type { CanvasObject, StormField } from "@/types";

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

function normalizeStormFields(fields: StormField[] | undefined): StormField[] | undefined {
  if (!fields) return fields;
  return fields.map((field) => ({
    ...field,
    fieldType: normalizeFieldType(field.fieldType),
  }));
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
      },
    };
  }

  if (obj.type === "model" && obj.modelData) {
    const data = obj.modelData;
    return {
      ...obj,
      modelData: {
        ...data,
        fields: data.fields?.map((field) => ({
          ...field,
          fieldType: normalizeFieldType(field.fieldType),
        })),
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
