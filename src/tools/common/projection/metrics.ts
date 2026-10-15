/**
 * Measuring and layout maths for the projection cards (State / View).
 *
 * Everything here is presentation-free: it only computes pixel sizes and row
 * offsets from the card data, so it can be unit-tested without Pixi.
 */
import { measureMonospaceText } from "@/utils/textWrap";
import { toDisplayName } from "@/utils/naming";
import { measureStandardCardContentWidth } from "../cardLayout";
import type { ProjectionCardData, ProjectionField, ProjectionQueryItem } from "./types";

export const PROJECTION_HEADER_HEIGHT = 32;
export const PROJECTION_SECTION_HEADER_HEIGHT = 22;
export const PROJECTION_ROW_HEIGHT = 28;
export const PROJECTION_DEFAULT_WIDTH = 220;
/** Vertical step between lines inside an (expandable) query item. */
export const PROJECTION_QUERY_LINE_HEIGHT = 18;
/** Vertical padding above/below the lines of a query item. */
export const PROJECTION_QUERY_ITEM_PADDING_Y = 5;
/** Font size of an event-type badge label in a query item. */
export const PROJECTION_QUERY_TYPE_FONT_SIZE = 11;
/** Horizontal padding inside an event-type badge (badge width = label width + this). */
export const PROJECTION_QUERY_TYPE_PADDING_X = 8;
/** Font size of a tag badge label in a query item. */
export const PROJECTION_QUERY_TAG_FONT_SIZE = 9;
/** Horizontal padding inside a tag badge (badge width = label width + this). */
export const PROJECTION_QUERY_TAG_PADDING_X = 8;
/** Horizontal padding on each side of a query column's centered content. */
export const PROJECTION_QUERY_COLUMN_PADDING = 8;
/**
 * Extra width a query column needs when its item carries a description: the
 * item then shows an ⓘ badge in the right gutter, so the tag column must stay
 * clear of it.
 */
export const PROJECTION_QUERY_DESC_GUTTER = 20;

export function getProjectionParams(data: ProjectionCardData): ProjectionField[] {
  return Array.isArray(data.params) ? data.params : [];
}

export function getProjectionItems(data: ProjectionCardData): ProjectionQueryItem[] {
  return Array.isArray(data.queryItems) ? data.queryItems : [];
}

export function getProjectionStates(data: ProjectionCardData): ProjectionField[] {
  return Array.isArray(data.states) ? data.states : [];
}

/** Height of one query item: 2 columns whose line count grows the row. */
export function queryItemHeight(item: ProjectionQueryItem): number {
  const lines = Math.max(1, item.types?.length ?? 0, item.tags?.length ?? 0);
  return PROJECTION_QUERY_ITEM_PADDING_Y * 2 + lines * PROJECTION_QUERY_LINE_HEIGHT;
}

/** Display label of a query item's event-type badge (kept in sync with the renderer). */
export function queryTypeLabel(type: string | undefined): string {
  return toDisplayName(type || "");
}

/** Width of a query item's event-type badge, including its horizontal padding. */
export function queryTypeBadgeWidth(type: string | undefined): number {
  return (
    measureMonospaceText(queryTypeLabel(type), PROJECTION_QUERY_TYPE_FONT_SIZE) +
    PROJECTION_QUERY_TYPE_PADDING_X
  );
}

/** Display label of a query item's tag badge (kept in sync with the renderer). */
export function queryTagLabel(tag: string | undefined, field: string | undefined): string {
  return `#${toDisplayName(tag || "")}:{${toDisplayName(field || "")}}`;
}

/** Width of a query item's tag badge, including its horizontal padding. */
export function queryTagBadgeWidth(tag: string | undefined, field: string | undefined): number {
  return (
    measureMonospaceText(queryTagLabel(tag, field), PROJECTION_QUERY_TAG_FONT_SIZE) +
    PROJECTION_QUERY_TAG_PADDING_X
  );
}

/**
 * Minimum card width that keeps every query item's two columns fully inside the
 * card with breathing room. Event-type badges fill the left half and tag badges
 * the right half, both centered, so a column's content (plus its padding on both
 * sides) needs the card to be twice as wide. The card grows to this width
 * instead of clipping a long event type or tag.
 */
export function computeQueryContentWidth(items: ProjectionQueryItem[]): number {
  let required = 0;

  for (const item of items) {
    // Column width = content + padding on both sides; the card holds two
    // columns. A described item hosts an ⓘ badge in the right gutter, so its
    // columns get extra room to keep the badges clear of it.
    const padding =
      PROJECTION_QUERY_COLUMN_PADDING * 4 + (item.description ? PROJECTION_QUERY_DESC_GUTTER : 0);

    const types = Array.isArray(item.types) ? item.types.filter(Boolean) : [];
    for (const type of types) {
      const badgeWidth = queryTypeBadgeWidth(type);
      required = Math.max(required, badgeWidth * 2 + padding);
    }

    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const ref of tags) {
      const badgeWidth = queryTagBadgeWidth(ref.tag, ref.field);
      required = Math.max(required, badgeWidth * 2 + padding);
    }
  }

  return required;
}

/** Cumulative vertical offsets of each query item within the query section. */
function queryItemOffsets(items: ProjectionQueryItem[]): number[] {
  const offsets: number[] = [];
  let y = 0;
  for (const item of items) {
    offsets.push(y);
    y += queryItemHeight(item);
  }
  return offsets;
}

/** Total height of the query rows (a single placeholder row when empty). */
function computeQuerySectionHeight(items: ProjectionQueryItem[]): number {
  if (items.length === 0) return PROJECTION_ROW_HEIGHT;
  return items.reduce((sum, item) => sum + queryItemHeight(item), 0);
}

/** Resolved geometry of a projection card, shared by the renderer and hit testing. */
export interface ProjectionLayout {
  params: ProjectionField[];
  items: ProjectionQueryItem[];
  states: ProjectionField[];
  paramsCount: number;
  statesCount: number;
  /** Cumulative y of each query item (relative to the query section start). */
  queryOffsets: number[];
  /** Total height of the query section rows. */
  queryItemsHeight: number;
  paramStartY: number;
  queryHeaderY: number;
  queryStartY: number;
  stateHeaderY: number;
  stateStartY: number;
}

export function computeProjectionLayout(data: ProjectionCardData): ProjectionLayout {
  const params = getProjectionParams(data);
  const items = getProjectionItems(data);
  const states = getProjectionStates(data);
  const paramsCount = Math.max(1, params.length);
  const statesCount = Math.max(1, states.length);
  const queryItemsHeight = computeQuerySectionHeight(items);
  const queryOffsets = queryItemOffsets(items);

  const paramStartY = PROJECTION_HEADER_HEIGHT + PROJECTION_SECTION_HEADER_HEIGHT;
  const queryHeaderY = paramStartY + paramsCount * PROJECTION_ROW_HEIGHT;
  const queryStartY = queryHeaderY + PROJECTION_SECTION_HEADER_HEIGHT;
  const stateHeaderY = queryStartY + queryItemsHeight;
  const stateStartY = stateHeaderY + PROJECTION_SECTION_HEADER_HEIGHT;

  return {
    params,
    items,
    states,
    paramsCount,
    statesCount,
    queryOffsets,
    queryItemsHeight,
    paramStartY,
    queryHeaderY,
    queryStartY,
    stateHeaderY,
    stateStartY,
  };
}

export function computeProjectionCardSize(
  data: ProjectionCardData,
  customWidth = PROJECTION_DEFAULT_WIDTH,
): { width: number; height: number } {
  const paramsCount = Math.max(1, getProjectionParams(data).length);
  const statesCount = Math.max(1, getProjectionStates(data).length);
  const queryItems = getProjectionItems(data);
  const queryItemsHeight = computeQuerySectionHeight(queryItems);
  const height =
    PROJECTION_HEADER_HEIGHT +
    (PROJECTION_SECTION_HEADER_HEIGHT + paramsCount * PROJECTION_ROW_HEIGHT) +
    (PROJECTION_SECTION_HEADER_HEIGHT + queryItemsHeight) +
    (PROJECTION_SECTION_HEADER_HEIGHT + statesCount * PROJECTION_ROW_HEIGHT);
  // Widen past the requested width when a query item's event type or tag badge
  // would otherwise be clipped, or when the title/field rows need more room.
  const queryWidth = Math.ceil(computeQueryContentWidth(queryItems));
  const width = measureStandardCardContentWidth(
    data.name,
    [...getProjectionParams(data), ...getProjectionStates(data)],
    Math.max(customWidth, queryWidth),
  );
  return { width, height };
}
