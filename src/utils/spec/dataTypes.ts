/**
 * Data containers (Object / Enum / Alias) for the spec export.
 *
 * Every data card is defined once in the spec's top-level `types` registry;
 * fields that use one reference it by its plain name. This mirrors the document
 * contract in `@em/spec`: definitions are collected (de-duplicated by name, in
 * board order), and field mapping is a plain copy of the row — a field never
 * carries a nested definition.
 */
import type { CanvasElement } from "@/types";
import { nameKey } from "../naming";
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

interface FieldMapperOptions {
  /** Object / Enum / Alias cards, in board order (mirror copies included). */
  dataCards: CanvasElement[];
  nameOf: (el: CanvasElement) => string;
}

export interface FieldMapper {
  mapField: (field: RawField | undefined | null) => Record<string, unknown>;
  mapFields: (fields: unknown) => Record<string, unknown>[] | undefined;
  /** Every data definition, de-duplicated by name, in board order. */
  dataTypes: () => Record<string, unknown>[];
}

export function createFieldMapper({ dataCards, nameOf }: FieldMapperOptions): FieldMapper {
  // Keep the first card seen for each name (mirror copies collapse), preserving
  // board order across Object / Enum / Alias cards.
  const byKey = new Map<string, CanvasElement>();
  const order: string[] = [];
  for (const el of dataCards) {
    const key = nameKey(nameOf(el));
    if (byKey.has(key)) continue;
    byKey.set(key, el);
    order.push(key);
  }

  /** Expands one data card into its definition form. */
  function expandData(el: CanvasElement): Record<string, unknown> {
    const typeName = nameOf(el);

    if (el.type === "objectCard") {
      const out: Record<string, unknown> = { object: typeName };
      if (el.data?.description) out.description = el.data.description;
      const fields = Array.isArray(el.data?.fields) ? el.data.fields : [];
      const mapped = fields.map((f: RawField) => mapField(f));
      if (mapped.length > 0) out.fields = mapped;
      return out;
    }

    if (el.type === "enumCard") {
      const out: Record<string, unknown> = { enum: typeName };
      if (el.data?.description) out.description = el.data.description;
      const values = listNamed(el.data?.fields);
      if (values.length > 0) out.values = values;
      return out;
    }

    // aliasCard
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
    return out;
  }

  function mapFields(fields: unknown): Record<string, unknown>[] | undefined {
    if (!Array.isArray(fields) || fields.length === 0) return undefined;
    return fields.map((f) => mapField(f as RawField));
  }

  const dataTypes = (): Record<string, unknown>[] =>
    order.map((key) => expandData(byKey.get(key)!));

  return { mapField, mapFields, dataTypes };
}
