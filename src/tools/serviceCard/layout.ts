import type { SelectedField } from "@/types";

/**
 * Pure geometry + data helpers for the Service card.
 *
 * The Service card lists one or more methods stacked vertically. Each method is
 * its own "section": a header row (the method name) followed by a PARAMS group
 * and a RETURNS group. Keeping the layout math here (free of React / Pixi /
 * store imports) lets both the Pixi renderer and the store's reference-sync
 * logic reuse it without creating import cycles.
 */
export const SERVICE_HEADER_HEIGHT = 32;
export const SERVICE_METHOD_HEADER_HEIGHT = 24;
export const SERVICE_GROUP_LABEL_HEIGHT = 16;
export const SERVICE_ROW_HEIGHT = 26;
export const SERVICE_DEFAULT_WIDTH = 240;

/** A typed row inside a method's `params` or `returns` list. */
export interface ServiceField {
  name: string;
  type: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
}

export interface ServiceMethod {
  /** Stable id so method-execution copies can live-link to this method. */
  id: string;
  name: string;
  params: ServiceField[];
  returns: ServiceField[];
  description?: string;
}

/**
 * Marker placed on a method-execution copy: points back at the source service
 * element and the specific method it mirrors.
 */
export interface ServiceMethodRef {
  serviceId: string;
  methodId: string;
}

export interface ServiceCardData {
  name: string;
  methods: ServiceMethod[];
  color?: string;
  description?: string;
  /** Present only on a method-execution copy. */
  methodRef?: ServiceMethodRef;
}

export type ServiceGroup = "params" | "returns";

export interface MethodLayout {
  method: ServiceMethod;
  methodIndex: number;
  /** Top of the method's header row (the selectable method name band). */
  headerTop: number;
  paramsLabelTop: number;
  paramsRowsTop: number;
  /** Rendered row count, floored at 1 so an empty group still shows a hint row. */
  paramsRowCount: number;
  returnsLabelTop: number;
  returnsRowsTop: number;
  returnsRowCount: number;
  /** Bottom edge of the whole method block (exclusive). */
  bottom: number;
}

export function paramsRowCount(method: ServiceMethod): number {
  return Math.max(1, method.params?.length || 0);
}

export function returnsRowCount(method: ServiceMethod): number {
  return Math.max(1, method.returns?.length || 0);
}

/** Total vertical size of one method block (header + labels + rows). */
export function methodBlockHeight(method: ServiceMethod): number {
  return (
    SERVICE_METHOD_HEADER_HEIGHT +
    SERVICE_GROUP_LABEL_HEIGHT +
    paramsRowCount(method) * SERVICE_ROW_HEIGHT +
    SERVICE_GROUP_LABEL_HEIGHT +
    returnsRowCount(method) * SERVICE_ROW_HEIGHT
  );
}

/** Vertical layout of every method, in top-to-bottom order. */
export function getMethodLayouts(data: ServiceCardData): MethodLayout[] {
  const methods = data.methods ?? [];
  const layouts: MethodLayout[] = [];
  let y = SERVICE_HEADER_HEIGHT;

  methods.forEach((method, methodIndex) => {
    const pCount = paramsRowCount(method);
    const rCount = returnsRowCount(method);
    const headerTop = y;
    const paramsLabelTop = headerTop + SERVICE_METHOD_HEADER_HEIGHT;
    const paramsRowsTop = paramsLabelTop + SERVICE_GROUP_LABEL_HEIGHT;
    const returnsLabelTop = paramsRowsTop + pCount * SERVICE_ROW_HEIGHT;
    const returnsRowsTop = returnsLabelTop + SERVICE_GROUP_LABEL_HEIGHT;
    const bottom = returnsRowsTop + rCount * SERVICE_ROW_HEIGHT;

    layouts.push({
      method,
      methodIndex,
      headerTop,
      paramsLabelTop,
      paramsRowsTop,
      paramsRowCount: pCount,
      returnsLabelTop,
      returnsRowsTop,
      returnsRowCount: rCount,
      bottom,
    });
    y = bottom;
  });

  return layouts;
}

export function computeServiceCardSize(
  data: ServiceCardData,
  width = SERVICE_DEFAULT_WIDTH,
): { width: number; height: number } {
  const methods = data.methods ?? [];
  if (methods.length === 0) {
    return { width, height: SERVICE_HEADER_HEIGHT + SERVICE_ROW_HEIGHT };
  }
  let height = SERVICE_HEADER_HEIGHT;
  for (const method of methods) {
    height += methodBlockHeight(method);
  }
  return { width, height };
}

/**
 * A single stop in the card's linear sub-selection order:
 * a method header, then its params rows, then its returns rows, and so on.
 */
export type ServiceItem =
  | { kind: "method"; methodIndex: number }
  | { kind: "field"; methodIndex: number; group: ServiceGroup; fieldIndex: number };

/**
 * `sectionIndex` for a field row. Each method contributes two bands: its params
 * (even) and its returns (odd). This order matches `getSubSelectSections`, so
 * the store's generic post-delete adjacency logic keeps working.
 */
export function bandIndex(methodIndex: number, group: ServiceGroup): number {
  return methodIndex * 2 + (group === "returns" ? 1 : 0);
}

export function bandToMethodIndex(band: number): number {
  return Math.floor(band / 2);
}

export function bandToGroup(band: number): ServiceGroup {
  return band % 2 === 1 ? "returns" : "params";
}

export function buildServiceItems(data: ServiceCardData): ServiceItem[] {
  const items: ServiceItem[] = [];
  (data.methods ?? []).forEach((method, methodIndex) => {
    items.push({ kind: "method", methodIndex });
    (method.params ?? []).forEach((_, fieldIndex) =>
      items.push({ kind: "field", methodIndex, group: "params", fieldIndex }),
    );
    (method.returns ?? []).forEach((_, fieldIndex) =>
      items.push({ kind: "field", methodIndex, group: "returns", fieldIndex }),
    );
  });
  return items;
}

export function itemToSelectedField(elementId: string, item: ServiceItem): SelectedField {
  if (item.kind === "method") {
    return {
      elementId,
      sectionId: "method",
      sectionIndex: item.methodIndex,
      fieldIndex: -1,
    };
  }
  return {
    elementId,
    sectionId: item.group,
    sectionIndex: bandIndex(item.methodIndex, item.group),
    fieldIndex: item.fieldIndex,
  };
}

export function selectedFieldToItem(field: SelectedField | null): ServiceItem | null {
  if (!field) return null;
  if (field.sectionId === "method") {
    return { kind: "method", methodIndex: field.sectionIndex ?? 0 };
  }
  if (field.fieldIndex < 0) return null;
  return {
    kind: "field",
    methodIndex: bandToMethodIndex(field.sectionIndex ?? 0),
    group: field.sectionId === "returns" ? "returns" : "params",
    fieldIndex: field.fieldIndex,
  };
}

export function serviceItemsEqual(a: ServiceItem, b: ServiceItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "method" && b.kind === "method") {
    return a.methodIndex === b.methodIndex;
  }
  if (a.kind === "field" && b.kind === "field") {
    return (
      a.methodIndex === b.methodIndex &&
      a.group === b.group &&
      a.fieldIndex === b.fieldIndex
    );
  }
  return false;
}
