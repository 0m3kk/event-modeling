import { Table2 } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { collectBoardTagCatalog, fieldTypeKey } from "@/utils/eventTags";
import { measureMonospaceText } from "@/utils/textWrap";
import {
  isSameIdentifier,
  toCamelIdentifier,
  toDisplayName,
  toDisplayType,
} from "@/utils/naming";
import { ViewCardOptions } from "./ViewCardOptions";
import {
  getViewParams,
  getViewItems,
  getViewStates,
  validateViewCardData,
  type ViewCardData,
  type ViewField,
  type ViewQueryItem,
  type ViewQueryTag,
} from "./rules";
import {
  renderStandardCardTitle,
  renderHeaderDescBadge,
  drawInfoBadge,
  measureStandardCardContentWidth,
  CARD_CORNER_RADIUS,
  DESC_HIT_HALF,
  DESC_ROW_BADGE_GAP,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { beginDescZones, addDescZone, hitDescZone } from "../common/descZones";

export const VIEW_HEADER_HEIGHT = 32;
export const VIEW_SECTION_HEADER_HEIGHT = 22;
export const VIEW_ROW_HEIGHT = 28;
export const VIEW_DEFAULT_WIDTH = 220;
/** Vertical step between lines inside an (expandable) query item. */
export const VIEW_QUERY_LINE_HEIGHT = 18;
/** Vertical padding above/below the lines of a query item. */
export const VIEW_QUERY_ITEM_PADDING_Y = 5;
/** Font size of an event-type badge label in a query item. */
export const VIEW_QUERY_TYPE_FONT_SIZE = 11;
/** Horizontal padding inside an event-type badge (badge width = label width + this). */
export const VIEW_QUERY_TYPE_PADDING_X = 8;
/** Font size of a tag badge label in a query item. */
export const VIEW_QUERY_TAG_FONT_SIZE = 9;
/** Horizontal padding inside a tag badge (badge width = label width + this). */
export const VIEW_QUERY_TAG_PADDING_X = 8;
/** Horizontal padding on each side of a query column's centered content. */
export const VIEW_QUERY_COLUMN_PADDING = 8;
/**
 * Extra width a query column needs when its item carries a description: the
 * item then shows an ⓘ badge in the right gutter, so the tag column must stay
 * clear of it.
 */
export const VIEW_QUERY_DESC_GUTTER = 20;

export type { ViewCardData, ViewField, ViewQueryItem, ViewQueryTag } from "./rules";
export { getViewParams, getViewItems, getViewStates } from "./rules";

interface ViewLayout {
  params: ViewField[];
  items: ViewQueryItem[];
  states: ViewField[];
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

/** Height of one query item: 2 columns whose line count grows the row. */
export function queryItemHeight(item: ViewQueryItem): number {
  const lines = Math.max(1, item.types?.length ?? 0, item.tags?.length ?? 0);
  return VIEW_QUERY_ITEM_PADDING_Y * 2 + lines * VIEW_QUERY_LINE_HEIGHT;
}

/** Display label of a query item's event-type badge (kept in sync with the renderer). */
export function queryTypeLabel(type: string | undefined): string {
  return toDisplayName(type || "");
}

/** Width of a query item's event-type badge, including its horizontal padding. */
export function queryTypeBadgeWidth(type: string | undefined): number {
  return measureMonospaceText(queryTypeLabel(type), VIEW_QUERY_TYPE_FONT_SIZE) + VIEW_QUERY_TYPE_PADDING_X;
}

/** Display label of a query item's tag badge (kept in sync with the renderer). */
export function queryTagLabel(tag: string | undefined, field: string | undefined): string {
  return `#${toDisplayName(tag || "")}:{${toDisplayName(field || "")}}`;
}

/** Width of a query item's tag badge, including its horizontal padding. */
export function queryTagBadgeWidth(tag: string | undefined, field: string | undefined): number {
  return measureMonospaceText(queryTagLabel(tag, field), VIEW_QUERY_TAG_FONT_SIZE) + VIEW_QUERY_TAG_PADDING_X;
}

/**
 * Minimum card width that keeps every query item's two columns fully inside the
 * card with breathing room. Event-type badges fill the left half and tag badges
 * the right half, both centered, so a column's content (plus its padding on both
 * sides) needs the card to be twice as wide. The card grows to this width
 * instead of clipping a long event type or tag.
 */
export function computeQueryContentWidth(items: ViewQueryItem[]): number {
  let required = 0;

  for (const item of items) {
    // Column width = content + padding on both sides; the card holds two
    // columns. A described item hosts an ⓘ badge in the right gutter, so its
    // columns get extra room to keep the badges clear of it.
    const padding =
      VIEW_QUERY_COLUMN_PADDING * 4 + (item.description ? VIEW_QUERY_DESC_GUTTER : 0);

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
function queryItemOffsets(items: ViewQueryItem[]): number[] {
  const offsets: number[] = [];
  let y = 0;
  for (const item of items) {
    offsets.push(y);
    y += queryItemHeight(item);
  }
  return offsets;
}

/** Total height of the query rows (a single placeholder row when empty). */
function computeQuerySectionHeight(items: ViewQueryItem[]): number {
  if (items.length === 0) return VIEW_ROW_HEIGHT;
  return items.reduce((sum, item) => sum + queryItemHeight(item), 0);
}

function computeLayout(data: ViewCardData): ViewLayout {
  const params = getViewParams(data);
  const items = getViewItems(data);
  const states = getViewStates(data);
  const paramsCount = Math.max(1, params.length);
  const statesCount = Math.max(1, states.length);
  const queryItemsHeight = computeQuerySectionHeight(items);
  const queryOffsets = queryItemOffsets(items);

  const paramStartY = VIEW_HEADER_HEIGHT + VIEW_SECTION_HEADER_HEIGHT;
  const queryHeaderY = paramStartY + paramsCount * VIEW_ROW_HEIGHT;
  const queryStartY = queryHeaderY + VIEW_SECTION_HEADER_HEIGHT;
  const stateHeaderY = queryStartY + queryItemsHeight;
  const stateStartY = stateHeaderY + VIEW_SECTION_HEADER_HEIGHT;

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

export function computeViewCardSize(
  data: ViewCardData,
  customWidth = VIEW_DEFAULT_WIDTH,
): { width: number; height: number } {
  const paramsCount = Math.max(1, getViewParams(data).length);
  const statesCount = Math.max(1, getViewStates(data).length);
  const queryItems = getViewItems(data);
  const queryItemsHeight = computeQuerySectionHeight(queryItems);
  const height =
    VIEW_HEADER_HEIGHT +
    (VIEW_SECTION_HEADER_HEIGHT + paramsCount * VIEW_ROW_HEIGHT) +
    (VIEW_SECTION_HEADER_HEIGHT + queryItemsHeight) +
    (VIEW_SECTION_HEADER_HEIGHT + statesCount * VIEW_ROW_HEIGHT);
  // Widen past the requested width when a query item's event type or tag badge
  // would otherwise be clipped, or when the title/field rows need more room.
  const queryWidth = Math.ceil(computeQueryContentWidth(queryItems));
  const width = measureStandardCardContentWidth(
    data.name,
    [...getViewParams(data), ...getViewStates(data)],
    Math.max(customWidth, queryWidth),
  );
  return { width, height };
}

/**
 * Draws a field row's ⓘ badge just left of its type label and records the
 * hover hit box (only when the row carries a description).
 */
function renderFieldRowDescBadge(
  container: Container,
  elementId: string,
  field: ViewField,
  sectionIndex: number,
  fieldIndex: number,
  typeLabelX: number,
  rowY: number,
  textResolution: number,
): void {
  const badgeCx = typeLabelX - DESC_ROW_BADGE_GAP;
  const badgeCy = rowY + VIEW_ROW_HEIGHT / 2;
  const badgeG = new Graphics();
  drawInfoBadge(badgeG, container, badgeCx, badgeCy, {
    radius: 6,
    stroke: 0x94a3b8,
    fill: 0x64748b,
    fontSize: 7,
    alpha: field.description ? 1 : 0.5,
    textResolution,
  });
  container.addChild(badgeG);

  if (field.description) {
    addDescZone(elementId, {
      elementId,
      fieldIndex,
      sectionIndex,
      text: field.description,
      iconBounds: {
        x: badgeCx - DESC_HIT_HALF,
        y: badgeCy - DESC_HIT_HALF,
        width: DESC_HIT_HALF * 2,
        height: DESC_HIT_HALF * 2,
      },
    });
  }
}

/** Renders one params/states field row (name + required marker + type + ⓘ). */
function renderFieldRow(
  container: Container,
  opts: {
    elementId: string;
    field: ViewField;
    sectionIndex: number;
    fieldIndex: number;
    rowY: number;
    width: number;
    isDark: boolean;
    isSelectedRow: boolean;
    textResolution: number;
  },
): void {
  const { elementId, field, sectionIndex, fieldIndex, rowY, width, isDark, isSelectedRow, textResolution } =
    opts;

  const fieldName = new Text({
    text: toDisplayName(field.name),
    style: {
      fontSize: 12,
      fontWeight: isSelectedRow ? "bold" : "normal",
      fontFamily: '"Geist Mono", monospace',
      fill: isSelectedRow
        ? isDark
          ? 0xf4f4f5
          : 0x09090b
        : isDark
          ? 0xe4e4e7
          : 0x27272a,
    },
    resolution: textResolution,
  });
  fieldName.x = 12;
  fieldName.y = rowY + 7;
  container.addChild(fieldName);

  if (field.isRequired) {
    const requiredStar = new Text({
      text: "*",
      style: {
        fontSize: 13,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: isDark ? 0xf87171 : 0xdc2626,
      },
      resolution: textResolution,
    });
    requiredStar.x = fieldName.x + fieldName.width + 2;
    requiredStar.y = rowY + 6;
    container.addChild(requiredStar);
  }

  const typeLabel = new Text({
    text: toDisplayType(field.type, field.isArray),
    style: {
      fontSize: 11,
      fontFamily: '"Geist Mono", monospace',
      fill: isDark ? 0xa1a1aa : 0x71717a,
    },
    resolution: textResolution,
  });
  typeLabel.x = width - typeLabel.width - 12;
  typeLabel.y = rowY + 8;
  container.addChild(typeLabel);

  if (field.description || isSelectedRow) {
    renderFieldRowDescBadge(
      container,
      elementId,
      field,
      sectionIndex,
      fieldIndex,
      typeLabel.x,
      rowY,
      textResolution,
    );
  }
}

/**
 * Renders one query item as TWO centered columns: event-type badges on the left,
 * `tag:{field}` badges on the right. Each type/tag takes its own line, so the
 * item grows vertically. Tag badges turn red when they violate the DCB rules.
 * An ⓘ badge sits in the right gutter when the item carries a description.
 */
function renderViewQueryItemRow(
  container: Container,
  opts: {
    elementId: string;
    item: ViewQueryItem;
    fieldIndex: number;
    itemY: number;
    itemHeight: number;
    width: number;
    isDark: boolean;
    isSelectedRow: boolean;
    textResolution: number;
    tagCatalog: Map<string, Set<string>>;
    paramByName: Map<string, ViewField>;
  },
): void {
  const {
    elementId,
    item,
    fieldIndex,
    itemY,
    itemHeight,
    width,
    isDark,
    isSelectedRow,
    textResolution,
    tagCatalog,
    paramByName,
  } = opts;

  const types = Array.isArray(item.types) ? item.types.filter(Boolean) : [];
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const isEmpty = types.length === 0 && tags.length === 0;

  const lines = Math.max(1, types.length, tags.length);
  const typeLines = types.length > 0 ? types.length : 1;
  const tagLines = tags.length;
  // Vertically center each column's block when the two sides have different
  // line counts.
  const typesOffset = ((lines - typeLines) * VIEW_QUERY_LINE_HEIGHT) / 2;
  const tagsOffset = ((lines - tagLines) * VIEW_QUERY_LINE_HEIGHT) / 2;

  // ⓘ badge sits at the far right (outside the two centered columns).
  const descBadgeCx = width - 14;
  const descBadgeCy = itemY + itemHeight / 2;
  const showDescBadge = Boolean(item.description) || isSelectedRow;

  // Two equal columns split the full item width; content is centered in each.
  const colWidth = width / 2;
  const leftCenter = colWidth / 2;
  const rightCenter = colWidth + colWidth / 2;
  const rightLimit = width - (showDescBadge ? 24 : 8);
  const lineTop = itemY + VIEW_QUERY_ITEM_PADDING_Y;

  const dimColor = isDark ? 0x71717a : 0xa1a1aa;

  // Subtle vertical separator between the two columns.
  if (!isEmpty) {
    const separator = new Graphics();
    separator.moveTo(colWidth, itemY + VIEW_QUERY_ITEM_PADDING_Y);
    separator.lineTo(colWidth, itemY + itemHeight - VIEW_QUERY_ITEM_PADDING_Y);
    separator.stroke({ color: isDark ? 0x3f3f46 : 0xe4e4e7, width: 1, alpha: 0.7 });
    container.addChild(separator);
  }

  if (isEmpty) {
    const text = new Text({
      text: "(match all)",
      style: {
        fontSize: 11,
        fontFamily: '"Geist Mono", monospace',
        fill: dimColor,
      },
      resolution: textResolution,
    });
    text.anchor.set(0.5, 0);
    text.x = width / 2;
    text.y = lineTop + 3;
    container.addChild(text);
  } else {
    // Left column: event-type badges (one per line, centered).
    if (types.length > 0) {
      types.forEach((type, i) => {
        const label = new Text({
          text: queryTypeLabel(type),
          style: {
            fontSize: VIEW_QUERY_TYPE_FONT_SIZE,
            fontWeight: "bold",
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0x5eead4 : 0x0f766e,
          },
          resolution: textResolution,
        });

        const badgeW = label.width + VIEW_QUERY_TYPE_PADDING_X;
        const badgeH = 17;
        const lineY = lineTop + typesOffset + i * VIEW_QUERY_LINE_HEIGHT;
        // Center in the left column, but never spill past the column edges.
        let badgeX = leftCenter - badgeW / 2;
        if (badgeX + badgeW > colWidth - 2) badgeX = colWidth - 2 - badgeW;
        if (badgeX < 2) badgeX = 2;
        const badgeY = lineY + (VIEW_QUERY_LINE_HEIGHT - badgeH) / 2;

        const badge = new Graphics();
        badge.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
        badge.fill({ color: isDark ? 0x042f2e : 0xccfbf1, alpha: 0.9 });
        badge.stroke({ color: isDark ? 0x0f766e : 0x5eead4, width: 1, alpha: 0.8 });
        container.addChild(badge);

        label.x = badgeX + VIEW_QUERY_TYPE_PADDING_X / 2;
        label.y = badgeY + (badgeH - label.height) / 2;
        container.addChild(label);
      });
    } else {
      const text = new Text({
        text: "(any type)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: dimColor,
        },
        resolution: textResolution,
      });
      text.anchor.set(0.5, 0);
      text.x = leftCenter;
      text.y = lineTop + typesOffset + 3;
      container.addChild(text);
    }

    // Right column: tag badges (one per line, centered).
    tags.forEach((ref, i) => {
      const tag = toCamelIdentifier(ref.tag || "");
      const fieldName = ref.field || "";
      const paramField = paramByName.get(fieldName);
      const allowed = tagCatalog.get(tag);
      const valid = Boolean(allowed && paramField && allowed.has(fieldTypeKey(paramField)));

      const label = new Text({
        text: queryTagLabel(ref.tag, ref.field),
        style: {
          fontSize: VIEW_QUERY_TAG_FONT_SIZE,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: valid ? (isDark ? 0xfbbf24 : 0xd97706) : isDark ? 0xf87171 : 0xdc2626,
        },
        resolution: textResolution,
      });

      const badgeW = label.width + VIEW_QUERY_TAG_PADDING_X;
      const badgeH = 15;
      const lineY = lineTop + tagsOffset + i * VIEW_QUERY_LINE_HEIGHT;
      // Center in the right column, but never spill past the ⓘ gutter.
      let badgeX = rightCenter - badgeW / 2;
      if (badgeX + badgeW > rightLimit) badgeX = rightLimit - badgeW;
      if (badgeX < colWidth + 2) badgeX = colWidth + 2;
      const badgeY = lineY + (VIEW_QUERY_LINE_HEIGHT - badgeH) / 2;

      const badge = new Graphics();
      badge.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      if (valid) {
        badge.fill({ color: isDark ? 0x451a03 : 0xfef3c7, alpha: 0.9 });
        badge.stroke({ color: isDark ? 0xb45309 : 0xf59e0b, width: 1, alpha: 0.8 });
      } else {
        badge.fill({ color: isDark ? 0x450a0a : 0xfee2e2, alpha: 0.9 });
        badge.stroke({ color: isDark ? 0xb91c1c : 0xef4444, width: 1, alpha: 0.8 });
      }
      container.addChild(badge);

      label.x = badgeX + 4;
      label.y = badgeY + 1.5;
      container.addChild(label);
    });
  }

  if (showDescBadge) {
    const badgeG = new Graphics();
    drawInfoBadge(badgeG, container, descBadgeCx, descBadgeCy, {
      radius: 6,
      stroke: 0x94a3b8,
      fill: 0x64748b,
      fontSize: 7,
      alpha: item.description ? 1 : 0.5,
      textResolution,
    });
    container.addChild(badgeG);

    if (item.description) {
      addDescZone(elementId, {
        elementId,
        sectionIndex: 1,
        fieldIndex,
        text: item.description,
        iconBounds: {
          x: descBadgeCx - DESC_HIT_HALF,
          y: descBadgeCy - DESC_HIT_HALF,
          width: DESC_HIT_HALF * 2,
          height: DESC_HIT_HALF * 2,
        },
      });
    }
  }
}

export const ViewCardSchema = z.object({
  name: z.string().default("ViewName"),
  params: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        isArray: z.boolean().optional(),
        isRequired: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  queryItems: z
    .array(
      z.object({
        types: z.array(z.string()).default([]),
        tags: z
          .array(
            z.object({
              tag: z.string(),
              field: z.string(),
            }),
          )
          .default([]),
        description: z.string().optional(),
      }),
    )
    .default([]),
  states: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        isArray: z.boolean().optional(),
        isRequired: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const viewCardTool: ToolDefinition<ViewCardData> = {
  type: "viewCard",
  name: "View",
  description:
    "A View/Read Model: projects events matching a DCB query into a persisted read model for sorting, searching and filtering",
  icon: Table2,
  color: "#0891b2",
  category: "modeling",

  schema: ViewCardSchema,
  createDefaultData: () => ({
    name: "NewView",
    params: [],
    queryItems: [],
    states: [],
    color: "#0891b2",
  }),

  // Minimum height with empty sections: 32 + 3 * (22 + 28) = 182
  defaultSize: { width: VIEW_DEFAULT_WIDTH, height: 182 },

  computeSize: (data, width) => computeViewCardSize(data, width),

  autoFitWidth: true,

  optionsBar: ViewCardOptions,

  normalizeData: (data, context) => validateViewCardData(data, context).data,

  validateData: (data, context) => validateViewCardData(data, context),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || viewCardTool.color, isDark);
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;

    const {
      params,
      items,
      states,
      statesCount,
      queryOffsets,
      paramStartY,
      queryHeaderY,
      queryStartY,
      stateHeaderY,
      stateStartY,
    } = computeLayout(element.data);

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const sectionHeaderBg = isDark ? 0x27272a : 0xf4f4f5;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

    const isThisElement = context.selectedField?.elementId === element.id;
    const activeSection = isThisElement ? context.selectedField?.sectionIndex ?? 0 : -1;
    const activeFieldIndex = isThisElement ? context.selectedField?.fieldIndex ?? -1 : -1;

    const g = new Graphics();

    // 1. Header banner (rounded top, flat bottom)
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, VIEW_HEADER_HEIGHT);
    g.lineTo(0, VIEW_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Card body (flat top, rounded bottom)
    g.moveTo(0, VIEW_HEADER_HEIGHT);
    g.lineTo(w, VIEW_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Section banners
    g.rect(0, VIEW_HEADER_HEIGHT, w, VIEW_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });
    g.rect(0, queryHeaderY, w, VIEW_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });
    g.rect(0, stateHeaderY, w, VIEW_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 4. Sunken highlight for the active row
    if (isThisElement && activeFieldIndex >= 0 && activeSection >= 0) {
      let rowY = -1;
      let rowH = VIEW_ROW_HEIGHT;
      let isBottomRow = false;

      if (activeSection === 0 && activeFieldIndex < params.length) {
        rowY = paramStartY + activeFieldIndex * VIEW_ROW_HEIGHT;
      } else if (activeSection === 1 && activeFieldIndex < items.length) {
        rowY = queryStartY + queryOffsets[activeFieldIndex];
        rowH = queryItemHeight(items[activeFieldIndex]);
      } else if (activeSection === 2 && activeFieldIndex < states.length) {
        rowY = stateStartY + activeFieldIndex * VIEW_ROW_HEIGHT;
        isBottomRow = activeFieldIndex === statesCount - 1;
      }

      if (rowY >= 0) {
        if (isBottomRow) {
          g.moveTo(0, rowY);
          g.lineTo(w, rowY);
          g.lineTo(w, h - r);
          g.arcTo(w, h, w - r, h, r);
          g.lineTo(r, h);
          g.arcTo(0, h, 0, h - r, r);
          g.closePath();
          g.fill({ color: sunkenColor });
        } else {
          g.rect(0, rowY, w, rowH);
          g.fill({ color: sunkenColor });
        }
      }
    }

    // 5. Border
    g.roundRect(0, 0, w, h, r);
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });

    container.addChild(g);

    // 6. Header title + card ⓘ badge
    renderStandardCardTitle(
      container,
      element.data.name || "View",
      headerColor,
      context.textResolution,
    );

    renderHeaderDescBadge(container, {
      elementId: element.id,
      width: w,
      isDark,
      isSelected,
      hasDescription: Boolean(element.data.description),
      hasReference: Boolean(element.referenceId),
      text: element.data.description,
      textResolution: context.textResolution,
    });

    if (typeof document === "undefined") return;

    const sectionLabel = (text: string, y: number) => {
      const label = new Text({
        text,
        style: {
          fontSize: 10,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xa1a1aa : 0x71717a,
        },
        resolution: context.textResolution,
      });
      label.x = 12;
      label.y = y;
      container.addChild(label);
    };

    sectionLabel("PARAM", VIEW_HEADER_HEIGHT + 4);
    sectionLabel("QUERY", queryHeaderY + 4);
    sectionLabel("STATE", stateHeaderY + 4);

    // 7. Param rows
    if (params.length > 0) {
      params.forEach((field, idx) => {
        renderFieldRow(container, {
          elementId: element.id,
          field,
          sectionIndex: 0,
          fieldIndex: idx,
          rowY: paramStartY + idx * VIEW_ROW_HEIGHT,
          width: w,
          isDark,
          isSelectedRow: activeSection === 0 && activeFieldIndex === idx,
          textResolution: context.textResolution,
        });
      });
    } else {
      const empty = new Text({
        text: "(no params)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      empty.x = 12;
      empty.y = paramStartY + 7;
      container.addChild(empty);
    }

    // 8. Query item rows
    if (items.length > 0) {
      const tagCatalog = collectBoardTagCatalog(useCanvasStore.getState().elements);
      const paramByName = new Map(params.map((p) => [p.name, p]));
      items.forEach((item, idx) => {
        renderViewQueryItemRow(container, {
          elementId: element.id,
          item,
          fieldIndex: idx,
          itemY: queryStartY + queryOffsets[idx],
          itemHeight: queryItemHeight(item),
          width: w,
          isDark,
          isSelectedRow: activeSection === 1 && activeFieldIndex === idx,
          textResolution: context.textResolution,
          tagCatalog,
          paramByName,
        });
      });
    } else {
      const empty = new Text({
        text: "(no query items)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      empty.x = 12;
      empty.y = queryStartY + 7;
      container.addChild(empty);
    }

    // 9. State rows
    if (states.length > 0) {
      states.forEach((field, idx) => {
        renderFieldRow(container, {
          elementId: element.id,
          field,
          sectionIndex: 2,
          fieldIndex: idx,
          rowY: stateStartY + idx * VIEW_ROW_HEIGHT,
          width: w,
          isDark,
          isSelectedRow: activeSection === 2 && activeFieldIndex === idx,
          textResolution: context.textResolution,
        });
      });
    } else {
      const empty = new Text({
        text: "(no states)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      empty.x = 12;
      empty.y = stateStartY + 7;
      container.addChild(empty);
    }
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const {
      params,
      items,
      states,
      paramsCount,
      queryOffsets,
      queryItemsHeight,
      statesCount,
      paramStartY,
      queryStartY,
      stateStartY,
    } = computeLayout(element.data);

    const paramEndY = paramStartY + paramsCount * VIEW_ROW_HEIGHT;
    if (localPoint.y >= paramStartY && localPoint.y < paramEndY) {
      if (params.length === 0) return null;
      const index = Math.floor((localPoint.y - paramStartY) / VIEW_ROW_HEIGHT);
      if (index >= 0 && index < params.length) {
        return { elementId: element.id, sectionIndex: 0, sectionId: "params", fieldIndex: index };
      }
      return null;
    }

    const queryEndY = queryStartY + queryItemsHeight;
    if (localPoint.y >= queryStartY && localPoint.y < queryEndY) {
      if (items.length === 0) return null;
      const local = localPoint.y - queryStartY;
      for (let i = 0; i < items.length; i++) {
        const start = queryOffsets[i];
        const end = start + queryItemHeight(items[i]);
        if (local >= start && local < end) {
          return { elementId: element.id, sectionIndex: 1, sectionId: "query", fieldIndex: i };
        }
      }
      return null;
    }

    const stateEndY = stateStartY + statesCount * VIEW_ROW_HEIGHT;
    if (localPoint.y >= stateStartY && localPoint.y < stateEndY) {
      if (states.length === 0) return null;
      const index = Math.floor((localPoint.y - stateStartY) / VIEW_ROW_HEIGHT);
      if (index >= 0 && index < states.length) {
        return { elementId: element.id, sectionIndex: 2, sectionId: "states", fieldIndex: index };
      }
      return null;
    }

    return null;
  },

  onDeleteSubSelect: (element, fieldIndex, sectionIndex = 0) => {
    const params = getViewParams(element.data);
    const items = getViewItems(element.data);
    const states = getViewStates(element.data);

    let nextParams = [...params];
    let nextItems = [...items];
    let nextStates = [...states];

    if (sectionIndex === 2) {
      if (fieldIndex < 0 || fieldIndex >= states.length) return null;
      nextStates = states.filter((_, i) => i !== fieldIndex);
    } else if (sectionIndex === 1) {
      if (fieldIndex < 0 || fieldIndex >= items.length) return null;
      nextItems = items.filter((_, i) => i !== fieldIndex);
    } else {
      if (fieldIndex < 0 || fieldIndex >= params.length) return null;
      nextParams = params.filter((_, i) => i !== fieldIndex);
    }

    const nextData: ViewCardData = {
      ...element.data,
      params: nextParams,
      queryItems: nextItems,
      states: nextStates,
    };
    const nextSize = computeViewCardSize(nextData, element.width);
    return { width: nextSize.width, height: nextSize.height, data: nextData };
  },

  onUpdateSubSelectType: (element, field, type) => {
    const trimmed = type.trim();
    if (!trimmed) return null;

    if (field.sectionIndex === 0) {
      const params = getViewParams(element.data);
      if (field.fieldIndex < 0 || field.fieldIndex >= params.length) return null;
      const nextParams = [...params];
      nextParams[field.fieldIndex] = { ...params[field.fieldIndex], type: trimmed };
      return { data: { ...element.data, params: nextParams } };
    }

    if (field.sectionIndex === 2) {
      const states = getViewStates(element.data);
      if (field.fieldIndex < 0 || field.fieldIndex >= states.length) return null;
      const nextStates = [...states];
      nextStates[field.fieldIndex] = { ...states[field.fieldIndex], type: trimmed };
      return { data: { ...element.data, states: nextStates } };
    }

    return null;
  },

  onToggleSubSelectArray: (element, field) => {
    if (field.sectionIndex === 0) {
      const params = getViewParams(element.data);
      if (field.fieldIndex < 0 || field.fieldIndex >= params.length) return null;
      const nextParams = [...params];
      const cur = nextParams[field.fieldIndex];
      nextParams[field.fieldIndex] = { ...cur, isArray: !cur.isArray };
      return { data: { ...element.data, params: nextParams } };
    }

    if (field.sectionIndex === 2) {
      const states = getViewStates(element.data);
      if (field.fieldIndex < 0 || field.fieldIndex >= states.length) return null;
      const nextStates = [...states];
      const cur = nextStates[field.fieldIndex];
      nextStates[field.fieldIndex] = { ...cur, isArray: !cur.isArray };
      return { data: { ...element.data, states: nextStates } };
    }

    return null;
  },

  onToggleSubSelectRequired: (element, field) => {
    if (field.sectionIndex === 0) {
      const params = getViewParams(element.data);
      if (field.fieldIndex < 0 || field.fieldIndex >= params.length) return null;
      const nextParams = [...params];
      const cur = nextParams[field.fieldIndex];
      nextParams[field.fieldIndex] = { ...cur, isRequired: !cur.isRequired };
      return { data: { ...element.data, params: nextParams } };
    }

    if (field.sectionIndex === 2) {
      const states = getViewStates(element.data);
      if (field.fieldIndex < 0 || field.fieldIndex >= states.length) return null;
      const nextStates = [...states];
      const cur = nextStates[field.fieldIndex];
      nextStates[field.fieldIndex] = { ...cur, isRequired: !cur.isRequired };
      return { data: { ...element.data, states: nextStates } };
    }

    return null;
  },

  getSelectedFieldItem: (element, field) => {
    if (field.sectionIndex === 1) {
      // Query items are not name/type fields; label them by their event types
      // and let the options bar use the dedicated types/tags popovers instead.
      const items = getViewItems(element.data);
      const item = items[field.fieldIndex];
      if (!item) return null;
      const label = item.types.length > 0 ? item.types.join(" | ") : "Query item";
      return { name: label, type: "" };
    }
    if (field.sectionIndex === 2) {
      const states = getViewStates(element.data);
      return states[field.fieldIndex] ?? null;
    }
    const params = getViewParams(element.data);
    return params[field.fieldIndex] ?? null;
  },

  getSubSelectSections: (element) => [
    { id: "params", name: "params", count: getViewParams(element.data).length },
    { id: "query", name: "query", count: getViewItems(element.data).length },
    { id: "states", name: "states", count: getViewStates(element.data).length },
  ],

  getInlineEditTarget: (element, localPoint) => {
    // 1. Header -> edit state name
    if (localPoint.y <= VIEW_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: toDisplayName(element.data?.name) || "View",
        multiline: false,
        onCommit: (newValue) => {
          const trimmed = newValue.trim();
          if (trimmed && !isSameIdentifier(trimmed, element.data?.name)) {
            useCanvasStore.getState().updateElement(element.id, {
              data: { ...element.data, name: trimmed },
            });
          }
        },
      };
    }

    const {
      params,
      items,
      states,
      paramsCount,
      queryOffsets,
      queryItemsHeight,
      paramStartY,
      queryStartY,
      stateStartY,
    } = computeLayout(element.data);

    const paramEndY = paramStartY + paramsCount * VIEW_ROW_HEIGHT;
    if (localPoint.y >= paramStartY && localPoint.y < paramEndY) {
      const index = Math.floor((localPoint.y - paramStartY) / VIEW_ROW_HEIGHT);
      if (index >= 0 && index < params.length) {
        const field = params[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "params",
          fieldIndex: index,
        });
        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 10,
            y: element.y + paramStartY + index * VIEW_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 80),
            height: 24,
          },
          initialValue: toDisplayName(field.name),
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && !isSameIdentifier(trimmed, field.name)) {
              const nextParams = [...params];
              nextParams[index] = { ...field, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, params: nextParams },
              });
            }
          },
        };
      }
      return null;
    }

    const queryEndY = queryStartY + queryItemsHeight;
    if (localPoint.y >= queryStartY && localPoint.y < queryEndY) {
      const local = localPoint.y - queryStartY;
      for (let i = 0; i < items.length; i++) {
        const start = queryOffsets[i];
        const end = start + queryItemHeight(items[i]);
        if (local >= start && local < end) {
          // Query items have no editable text; just select them so the options
          // bar exposes the types/tags editors.
          useCanvasStore.getState().setSelectedField({
            elementId: element.id,
            sectionIndex: 1,
            sectionId: "query",
            fieldIndex: i,
          });
          break;
        }
      }
      return null;
    }

    const stateEndY = stateStartY + Math.max(1, states.length) * VIEW_ROW_HEIGHT;
    if (localPoint.y >= stateStartY && localPoint.y < stateEndY) {
      const index = Math.floor((localPoint.y - stateStartY) / VIEW_ROW_HEIGHT);
      if (index >= 0 && index < states.length) {
        const field = states[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 2,
          sectionId: "states",
          fieldIndex: index,
        });
        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 10,
            y: element.y + stateStartY + index * VIEW_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 80),
            height: 24,
          },
          initialValue: toDisplayName(field.name),
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && !isSameIdentifier(trimmed, field.name)) {
              const nextStates = [...states];
              nextStates[index] = { ...field, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, states: nextStates },
              });
            }
          },
        };
      }
      return null;
    }

    return null;
  },

  ai: {
    toolName: "create_view_card",
    description:
      "Create a View (persisted read model / DCB projection) with sections: params (inputs), query items " +
      "(event types + DCB tags) and states (projected view fields). Unlike an in-memory State, a View is " +
      "stored in a database so its rows can be sorted, searched and filtered later. Same tag/param rules " +
      "as a State: every { tag, field } tag must already exist on an event field and match a param's type.",
    parameters: z.object({
      name: z.string().describe("PascalCase view name (e.g. OrderList)"),
      params: z
        .array(
          z.object({
            name: z.string().describe("Param field name in camelCase"),
            type: z.string().describe("Field type"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z
              .string()
              .optional()
              .describe("What this param means"),
          }),
        )
        .optional()
        .describe("Input params. Each query tag's `field` must reference one of these by name."),
      queryItems: z
        .array(
          z.object({
            types: z
              .array(z.string())
              .optional()
              .describe("Event types matched (OR within the item)"),
            tags: z
              .array(
                z.object({
                  tag: z
                    .string()
                    .describe("Existing event-field tag name"),
                  field: z
                    .string()
                    .describe(
                      "Param name whose type matches the tagged event field",
                    ),
                }),
              )
              .optional()
              .describe("DCB tags the item requires"),
            description: z
              .string()
              .optional()
              .describe("What this query item selects"),
          }),
        )
        .optional()
        .describe("DCB query items (OR-combined)"),
      states: z
        .array(
          z.object({
            name: z.string().describe("View field name in camelCase"),
            type: z.string().describe("Field type"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z
              .string()
              .optional()
              .describe("What this view field means"),
          }),
        )
        .optional()
        .describe("Projected view fields"),
      color: z.string().optional().describe("Optional hex color"),
      description: z.string().optional().describe("Description of the view"),
    }),
    onCreate: (params, center: Point): CanvasElement<ViewCardData> => {
      const paramsList: ViewField[] = (params.params || []).map((p: ViewField) => ({
        name: p.name,
        type: p.type,
        ...(p.isArray ? { isArray: true } : {}),
        ...(p.isRequired ? { isRequired: true } : {}),
        ...(p.description ? { description: p.description } : {}),
      }));
      const queryItems: ViewQueryItem[] = (params.queryItems || []).map((item: ViewQueryItem) => ({
        types: Array.isArray(item.types) ? item.types : [],
        tags: Array.isArray(item.tags)
          ? item.tags.map((t: ViewQueryTag) => ({ tag: t.tag, field: t.field }))
          : [],
        ...(item.description ? { description: item.description } : {}),
      }));
      const statesList: ViewField[] = (params.states || []).map((s: ViewField) => ({
        name: s.name,
        type: s.type,
        ...(s.isArray ? { isArray: true } : {}),
        ...(s.isRequired ? { isRequired: true } : {}),
        ...(s.description ? { description: s.description } : {}),
      }));

      const data: ViewCardData = {
        name: params.name || "View",
        params: paramsList,
        queryItems,
        states: statesList,
        color: params.color || viewCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };

      const size = computeViewCardSize(data);
      return {
        id: `view-${nanoid(6)}`,
        type: "viewCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
