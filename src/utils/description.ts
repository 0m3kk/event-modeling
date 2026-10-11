import type { CanvasElement, SelectedField } from "@/types";

/**
 * A field row that can carry a description. Shared shape across the Event and
 * Command card plugins (they all expose `name` and an optional `description`).
 */
export interface DescribableField {
  name?: string;
  description?: string;
}

export type FieldSectionKey = "fields" | "inputs" | "params" | "responses" | "returns";

export interface FieldSection {
  /** Key on `element.data` that holds this section's array. */
  key: FieldSectionKey;
  fields: DescribableField[];
  /** serviceCard only: which method this band belongs to. */
  methodIndex?: number;
  /** serviceCard only: which group within the method. */
  kind?: "params" | "returns";
}

/**
 * Resolves the ordered field bands of an element, matching the `sectionIndex`
 * used by `SelectedField` (Event = single "fields" band; Command = inputs then
 * responses; Query = params then responses). Elements without field rows
 * (e.g. Sticky Notes) yield an empty list and only support a card-level
 * description.
 */
export function getFieldSections(element: CanvasElement): FieldSection[] {
  const data = element.data ?? {};

  if (element.type === "queryCard") {
    // Query cards always store their input rows under `params`.
    const params = Array.isArray(data.params) ? (data.params as DescribableField[]) : [];
    const responses = Array.isArray(data.responses)
      ? (data.responses as DescribableField[])
      : [];
    return [
      { key: "params", fields: params },
      { key: "responses", fields: responses },
    ];
  }

  if (element.type === "commandCard") {
    // Legacy boards stored Command inputs under `fields`; keep writing back to
    // whichever key already holds them.
    const inputsKey: FieldSectionKey = Array.isArray(data.inputs)
      ? "inputs"
      : Array.isArray(data.fields)
        ? "fields"
        : "inputs";
    const inputs = Array.isArray(data[inputsKey]) ? (data[inputsKey] as DescribableField[]) : [];
    const responses = Array.isArray(data.responses)
      ? (data.responses as DescribableField[])
      : [];
    return [
      { key: inputsKey, fields: inputs },
      { key: "responses", fields: responses },
    ];
  }

  if (element.type === "serviceCard") {
    // Each method contributes a flat params band then a returns band, matching
    // the `sectionIndex` produced by the Service card's sub-selection.
    const methods = Array.isArray(data.methods) ? (data.methods as Array<{
      params?: DescribableField[];
      returns?: DescribableField[];
    }>) : [];
    const sections: FieldSection[] = [];
    methods.forEach((method, methodIndex) => {
      sections.push({
        key: "params",
        methodIndex,
        kind: "params",
        fields: Array.isArray(method.params) ? method.params : [],
      });
      sections.push({
        key: "returns",
        methodIndex,
        kind: "returns",
        fields: Array.isArray(method.returns) ? method.returns : [],
      });
    });
    return sections;
  }

  if (Array.isArray(data.fields)) {
    return [{ key: "fields", fields: data.fields as DescribableField[] }];
  }

  return [];
}

/**
 * Reads the description text for a card (`field` omitted) or one of its field
 * rows. Returns undefined when the target or its description does not exist,
 * so callers can skip rendering tooltips/editors.
 */
export function findDescriptionText(
  element: CanvasElement,
  field?: SelectedField | null,
): string | undefined {
  const data = element.data ?? {};
  if (!field) return typeof data.description === "string" ? data.description : undefined;

  // A Service method header (fieldIndex < 0) carries the description itself.
  if (element.type === "serviceCard" && field.sectionId === "method") {
    const method = Array.isArray(data.methods) ? data.methods[field.sectionIndex ?? 0] : undefined;
    return typeof method?.description === "string" ? method.description : undefined;
  }

  const section = getFieldSections(element)[field.sectionIndex ?? 0];
  const row = section?.fields?.[field.fieldIndex];
  return typeof row?.description === "string" ? row.description : undefined;
}

/**
 * Reads the display name of a field row, used to label the description panel
 * when it targets a row rather than the whole card.
 */
export function findRowName(
  element: CanvasElement,
  field?: SelectedField | null,
): string | undefined {
  if (!field) return undefined;

  if (element.type === "serviceCard" && field.sectionId === "method") {
    const methods = Array.isArray(element.data?.methods) ? element.data.methods : [];
    return methods[field.sectionIndex ?? 0]?.name;
  }

  const section = getFieldSections(element)[field.sectionIndex ?? 0];
  return section?.fields?.[field.fieldIndex]?.name;
}

/**
 * Builds the patch that writes (or removes, when `value` is undefined/empty) a
 * card/field description. Returns null when nothing would change, so callers
 * can skip a store update. `field` omitted targets the card-level description.
 */
export function applyDescription(
  element: CanvasElement,
  field: SelectedField | null,
  value: string | undefined,
): Partial<CanvasElement> | null {
  const data = element.data ?? {};
  const trimmed = value?.trim() ? value : undefined;

  if (!field) {
    if (trimmed) {
      if (data.description === trimmed) return null;
      return { data: { ...data, description: trimmed } };
    }
    if (typeof data.description !== "string") return null;
    const { description: _omit, ...rest } = data;
    return { data: rest };
  }

  // Service rows + method headers live under nested `data.methods`, so they are
  // written back with a dedicated path instead of the flat section key.
  if (element.type === "serviceCard") {
    return applyServiceDescription(element, field, trimmed);
  }

  const sections = getFieldSections(element);
  const section = sections[field.sectionIndex ?? 0];
  if (!section) return null;

  const index = field.fieldIndex;
  const row = section.fields[index];
  if (!row) return null;

  let nextRow: DescribableField;
  if (trimmed) {
    if (row.description === trimmed) return null;
    nextRow = { ...row, description: trimmed };
  } else {
    if (typeof row.description !== "string") return null;
    const { description: _omit, ...rest } = row;
    nextRow = rest;
  }

  const nextFields = [...section.fields];
  nextFields[index] = nextRow;

  return { data: { ...data, [section.key]: nextFields } };
}

/**
 * Writes (or removes) a description on a Service method header
 * (`sectionId === "method"`) or one of its params/returns rows.
 */
function applyServiceDescription(
  element: CanvasElement,
  field: SelectedField,
  trimmed: string | undefined,
): Partial<CanvasElement> | null {
  const data = element.data ?? {};
  const methods = Array.isArray(data.methods) ? [...data.methods] : [];

  // Method header → the method's own description.
  if (field.sectionId === "method") {
    const index = field.sectionIndex ?? 0;
    const method = methods[index];
    if (!method) return null;

    if (trimmed) {
      if (method.description === trimmed) return null;
      methods[index] = { ...method, description: trimmed };
    } else {
      if (typeof method.description !== "string") return null;
      const { description: _omit, ...rest } = method;
      methods[index] = rest;
    }
    return { data: { ...data, methods } };
  }

  const band = field.sectionIndex ?? 0;
  const methodIndex = Math.floor(band / 2);
  const kind: "params" | "returns" = band % 2 === 1 ? "returns" : "params";
  const method = methods[methodIndex];
  if (!method) return null;

  const rows = Array.isArray(method[kind]) ? [...method[kind]] : [];
  const row = rows[field.fieldIndex];
  if (!row) return null;

  if (trimmed) {
    if (row.description === trimmed) return null;
    rows[field.fieldIndex] = { ...row, description: trimmed };
  } else {
    if (typeof row.description !== "string") return null;
    const { description: _omit, ...rest } = row;
    rows[field.fieldIndex] = rest;
  }
  methods[methodIndex] = { ...method, [kind]: rows };
  return { data: { ...data, methods } };
}
