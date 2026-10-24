import type { SelectedField } from "@/types";
import { measureMonospaceText } from "@/utils/textWrap";
import { toDisplayName } from "@/utils/naming";
import {
  measureCardTitleWidth,
  measureFieldRowWidth,
  CARD_NAME_FONT_SIZE,
} from "../common/cardLayout";

/**
 * Pure geometry + data helpers for the Service card.
 *
 * A Service card is a single method execution: the card title is the method
 * name, followed by a PARAMS group and a RETURNS group. Keeping the layout math
 * here (free of React / Pixi / store imports) lets both the Pixi renderer and
 * the store's reference-sync logic reuse it without creating import cycles.
 */
export const SERVICE_HEADER_HEIGHT = 32;
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

export interface ServiceCardData {
  /** The method name this card executes. */
  name: string;
  params: ServiceField[];
  returns: ServiceField[];
  /**
   * Name of the service interface this method belongs to. Services that share
   * a `serviceName` are emitted as the methods of one generated interface.
   * Stored as a canonical camelCase identifier (e.g. `orderService`) and
   * displayed human-readable (`Order Service`).
   */
  serviceName?: string;
  color?: string;
  description?: string;
}

/** Font size of the interface-name chip in the Service header. */
export const SERVICE_NAME_FONT_SIZE = 9;
/** Horizontal padding inside the header interface chip. */
export const SERVICE_NAME_CHIP_PADDING = 10;
/** Gap between the method title and the interface-name chip. */
export const SERVICE_NAME_GAP = 8;

/** Display label of a Service's interface name (`orderService` -> `Order Service`). */
export function serviceNameLabel(serviceName: string | undefined): string {
  return serviceName ? toDisplayName(serviceName) : "";
}

/** Width of the header interface chip, padding included (0 when unnamed). */
export function measureServiceNameWidth(serviceName: string | undefined): number {
  const label = serviceNameLabel(serviceName);
  return label
    ? measureMonospaceText(label, SERVICE_NAME_FONT_SIZE) + SERVICE_NAME_CHIP_PADDING
    : 0;
}

export type ServiceGroup = "params" | "returns";

export interface ServiceLayout {
  paramsLabelTop: number;
  paramsRowsTop: number;
  /** Rendered row count, floored at 1 so an empty group still shows a hint row. */
  paramsRowCount: number;
  returnsLabelTop: number;
  returnsRowsTop: number;
  returnsRowCount: number;
  /** Bottom edge of the card content (exclusive). */
  bottom: number;
}

export function paramsRowCount(data: ServiceCardData): number {
  return Math.max(1, data.params?.length || 0);
}

export function returnsRowCount(data: ServiceCardData): number {
  return Math.max(1, data.returns?.length || 0);
}

/** Vertical layout of the card's params and returns groups. */
export function getServiceLayout(data: ServiceCardData): ServiceLayout {
  const pCount = paramsRowCount(data);
  const rCount = returnsRowCount(data);
  const paramsLabelTop = SERVICE_HEADER_HEIGHT;
  const paramsRowsTop = paramsLabelTop + SERVICE_GROUP_LABEL_HEIGHT;
  const returnsLabelTop = paramsRowsTop + pCount * SERVICE_ROW_HEIGHT;
  const returnsRowsTop = returnsLabelTop + SERVICE_GROUP_LABEL_HEIGHT;
  const bottom = returnsRowsTop + rCount * SERVICE_ROW_HEIGHT;

  return {
    paramsLabelTop,
    paramsRowsTop,
    paramsRowCount: pCount,
    returnsLabelTop,
    returnsRowsTop,
    returnsRowCount: rCount,
    bottom,
  };
}

/** Horizontal padding before a row name (mirrors the renderer's `x = 14`). */
export const SERVICE_ROW_LEFT_PADDING = 14;

/**
 * Minimum width that fits the Service title and every param/return row (name +
 * required marker + right-aligned type). Kept alongside the layout so reference
 * copies size themselves the same way the store re-fits them.
 */
export function computeServiceContentWidth(data: ServiceCardData): number {
  let required = measureCardTitleWidth(data.name);
  // The interface chip sits right of the title, so both must fit on the header line.
  const serviceNameWidth = measureServiceNameWidth(data.serviceName);
  if (serviceNameWidth > 0) {
    required = Math.max(
      required,
      measureCardTitleWidth(data.name) + SERVICE_NAME_GAP + serviceNameWidth,
    );
  }
  for (const field of [...(data.params ?? []), ...(data.returns ?? [])]) {
    required = Math.max(required, measureFieldRowWidth(field));
  }
  return Math.ceil(required);
}

/**
 * Content-driven size: the title header plus the PARAMS/RETURNS groups, with a
 * width that fits the title and every row without clipping. Never narrows below
 * `customWidth`, so a user-widened card stays wide.
 */
export function computeServiceCardSize(
  data: ServiceCardData,
  customWidth = SERVICE_DEFAULT_WIDTH,
): { width: number; height: number } {
  const width = Math.max(customWidth, computeServiceContentWidth(data));
  return { width, height: getServiceLayout(data).bottom };
}

/** `sectionIndex` used by sub-selection for each group. */
export const SERVICE_SECTION_INDEX: Record<ServiceGroup, number> = {
  params: 0,
  returns: 1,
};

export function groupFromSectionId(sectionId: string | undefined): ServiceGroup {
  return sectionId === "returns" ? "returns" : "params";
}

export function groupFromSectionIndex(sectionIndex: number | undefined): ServiceGroup {
  return (sectionIndex ?? 0) === SERVICE_SECTION_INDEX.returns ? "returns" : "params";
}

export function getServiceRows(data: ServiceCardData, group: ServiceGroup): ServiceField[] {
  return group === "returns" ? data.returns ?? [] : data.params ?? [];
}

/** A single stop in the card's linear sub-selection order. */
export interface ServiceItem {
  group: ServiceGroup;
  fieldIndex: number;
}

export function buildServiceItems(data: ServiceCardData): ServiceItem[] {
  const items: ServiceItem[] = [];
  (data.params ?? []).forEach((_, fieldIndex) => items.push({ group: "params", fieldIndex }));
  (data.returns ?? []).forEach((_, fieldIndex) => items.push({ group: "returns", fieldIndex }));
  return items;
}

export function itemToSelectedField(elementId: string, item: ServiceItem): SelectedField {
  return {
    elementId,
    sectionId: item.group,
    sectionIndex: SERVICE_SECTION_INDEX[item.group],
    fieldIndex: item.fieldIndex,
  };
}

export function selectedFieldToItem(field: SelectedField | null): ServiceItem | null {
  if (!field || field.fieldIndex < 0) return null;
  return { group: groupFromSectionId(field.sectionId), fieldIndex: field.fieldIndex };
}

export function serviceItemsEqual(a: ServiceItem, b: ServiceItem): boolean {
  return a.group === b.group && a.fieldIndex === b.fieldIndex;
}
