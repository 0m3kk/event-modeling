import type { CanvasElement, SelectedField } from "@/types";

/**
 * A field row that can carry a description. Shared shape across the Event and
 * Command card plugins (they all expose `name` and an optional `description`).
 */
export interface DescribableField {
  name?: string;
  description?: string;
}

export type FieldSectionKey = "fields" | "inputs" | "responses";

export interface FieldSection {
  /** Key on `element.data` that holds this section's array. */
  key: FieldSectionKey;
  fields: DescribableField[];
}

/**
 * Resolves the ordered field bands of an element, matching the `sectionIndex`
 * used by `SelectedField` (Event = single "fields" band; Command = inputs then
 * responses). Elements without field rows (e.g. Sticky Notes) yield an empty
 * list and only support a card-level description.
 */
export function getFieldSections(element: CanvasElement): FieldSection[] {
  const data = element.data ?? {};

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
