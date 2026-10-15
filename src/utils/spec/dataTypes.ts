/**
 * Inline expansion of data containers (Object / Enum / Alias) for the spec
 * export.
 *
 * Data definitions are never listed in a section of their own: each is expanded
 * inline at the first field that references its type; later references stay as
 * the plain type name. The mapField/mapFields pair returned here carries the
 * "already expanded" bookkeeping across the whole document.
 */
import type { CanvasElement } from "@/types";
import { nameKey } from "../naming";
import { normalizeTypeName } from "../typeCatalog";
import { cleanValidation, hasValidation, type FieldValidation } from "../fieldValidation";
import { listNamed } from "./helpers";

/** A field row as stored on most cards (superset of the per-card shapes). */
export interface RawField {
  name?: string;
  type?: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
  tag?: string;
  validation?: FieldValidation;
}

interface DataType {
  kind: "object" | "enum" | "alias";
  element: CanvasElement;
}

interface FieldMapperOptions {
  objects: CanvasElement[];
  enums: CanvasElement[];
  aliases: CanvasElement[];
  nameOf: (el: CanvasElement) => string;
}

export interface FieldMapper {
  mapField: (field: RawField | undefined | null) => Record<string, unknown>;
  mapFields: (fields: unknown) => Record<string, unknown>[] | undefined;
}

export function createFieldMapper({ objects, enums, aliases, nameOf }: FieldMapperOptions): FieldMapper {
  const dataTypes = new Map<string, DataType>();
  for (const el of objects) dataTypes.set(nameKey(nameOf(el)), { kind: "object", element: el });
  for (const el of enums) dataTypes.set(nameKey(nameOf(el)), { kind: "enum", element: el });
  for (const el of aliases) dataTypes.set(nameKey(nameOf(el)), { kind: "alias", element: el });
  /** Names of data types already expanded inline, so each is expanded once. */
  const expandedData = new Set<string>();

  /** Expands a data definition (its fields may reference further data types). */
  function expandData(data: DataType): Record<string, unknown> {
    const el = data.element;
    const typeName = nameOf(el);
    if (data.kind === "object") {
      const out: Record<string, unknown> = { object: typeName };
      if (el.data?.description) out.description = el.data.description;
      const fields = Array.isArray(el.data?.fields) ? el.data.fields : [];
      const mapped = fields.map((f: RawField) => mapField(f));
      if (mapped.length > 0) out.fields = mapped;
      return out;
    }
    if (data.kind === "enum") {
      const out: Record<string, unknown> = { enum: typeName };
      if (el.data?.description) out.description = el.data.description;
      const values = listNamed(el.data?.fields);
      if (values.length > 0) out.values = values;
      return out;
    }
    const out: Record<string, unknown> = {
      alias: typeName,
      of: el.data?.aliasedType ?? "",
    };
    if (el.data?.isArray) out.array = true;
    if (el.data?.description) out.description = el.data.description;
    const validation = cleanValidation(el.data?.validation);
    if (validation) out.validation = validation;
    return out;
  }

  function mapField(field: RawField | undefined | null): Record<string, unknown> {
    const out: Record<string, unknown> = {
      name: field?.name ?? "",
      type: field?.type ?? "",
    };
    if (field?.isArray) out.array = true;
    if (field?.isRequired) out.required = true;
    if (field?.tag) out.tag = field.tag;
    if (field?.description) out.description = field.description;
    if (field?.validation && hasValidation(field.validation)) {
      out.validation = cleanValidation(field.validation) ?? field.validation;
    }

    const typeKey = field?.type ? nameKey(normalizeTypeName(field.type)) : "";
    const data = typeKey ? dataTypes.get(typeKey) : undefined;
    if (data && !expandedData.has(typeKey)) {
      expandedData.add(typeKey);
      out.type = expandData(data);
    }
    return out;
  }

  function mapFields(fields: unknown): Record<string, unknown>[] | undefined {
    if (!Array.isArray(fields) || fields.length === 0) return undefined;
    return fields.map((f) => mapField(f as RawField));
  }

  return { mapField, mapFields };
}
