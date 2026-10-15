/**
 * Row-level drawing for the projection cards: a params/states field row and a
 * query item's two-column badge row, plus the small banner/placeholder labels.
 */
import { Graphics, Text, type Container } from "pixi.js";
import { collectBoardTagCatalog, fieldTypeKey } from "@/utils/eventTags";
import { toCamelIdentifier, toDisplayName, toDisplayType } from "@/utils/naming";
import { DESC_HIT_HALF, DESC_ROW_BADGE_GAP, drawInfoBadge } from "../../cardLayout";
import { addDescZone } from "../../descZones";
import {
  PROJECTION_QUERY_ITEM_PADDING_Y,
  PROJECTION_QUERY_LINE_HEIGHT,
  PROJECTION_QUERY_TAG_FONT_SIZE,
  PROJECTION_QUERY_TAG_PADDING_X,
  PROJECTION_QUERY_TYPE_FONT_SIZE,
  PROJECTION_QUERY_TYPE_PADDING_X,
  PROJECTION_ROW_HEIGHT,
  queryTagLabel,
  queryTypeLabel,
} from "../metrics";
import type { ProjectionField, ProjectionQueryItem } from "../types";

const MONO = '"Geist Mono", monospace';

/**
 * Draws a field row's ⓘ badge just left of its type label and records the
 * hover hit box (only when the row carries a description).
 */
function renderFieldRowDescBadge(
  container: Container,
  elementId: string,
  field: ProjectionField,
  sectionIndex: number,
  fieldIndex: number,
  typeLabelX: number,
  rowY: number,
  textResolution: number,
): void {
  const badgeCx = typeLabelX - DESC_ROW_BADGE_GAP;
  const badgeCy = rowY + PROJECTION_ROW_HEIGHT / 2;
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
export function renderFieldRow(
  container: Container,
  opts: {
    elementId: string;
    field: ProjectionField;
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
      fontFamily: MONO,
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
        fontFamily: MONO,
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
      fontFamily: MONO,
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
export function renderQueryItemRow(
  container: Container,
  opts: {
    elementId: string;
    item: ProjectionQueryItem;
    fieldIndex: number;
    itemY: number;
    itemHeight: number;
    width: number;
    isDark: boolean;
    isSelectedRow: boolean;
    textResolution: number;
    tagCatalog: Map<string, Set<string>>;
    paramByName: Map<string, ProjectionField>;
  },
): void {
  const {
    item,
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
  const typesOffset = ((lines - typeLines) * PROJECTION_QUERY_LINE_HEIGHT) / 2;
  const tagsOffset = ((lines - tagLines) * PROJECTION_QUERY_LINE_HEIGHT) / 2;

  // The ⓘ badge lives in the right gutter; its presence reserves space here.
  const showDescBadge = Boolean(item.description) || isSelectedRow;

  // Two equal columns split the full item width; content is centered in each.
  const colWidth = width / 2;
  const leftCenter = colWidth / 2;
  const rightCenter = colWidth + colWidth / 2;
  const rightLimit = width - (showDescBadge ? 24 : 8);
  const lineTop = itemY + PROJECTION_QUERY_ITEM_PADDING_Y;

  const dimColor = isDark ? 0x71717a : 0xa1a1aa;

  // Subtle vertical separator between the two columns.
  if (!isEmpty) {
    const separator = new Graphics();
    separator.moveTo(colWidth, itemY + PROJECTION_QUERY_ITEM_PADDING_Y);
    separator.lineTo(colWidth, itemY + itemHeight - PROJECTION_QUERY_ITEM_PADDING_Y);
    separator.stroke({ color: isDark ? 0x3f3f46 : 0xe4e4e7, width: 1, alpha: 0.7 });
    container.addChild(separator);
  }

  if (isEmpty) {
    const text = new Text({
      text: "(match all)",
      style: { fontSize: 11, fontFamily: MONO, fill: dimColor },
      resolution: textResolution,
    });
    text.anchor.set(0.5, 0);
    text.x = width / 2;
    text.y = lineTop + 3;
    container.addChild(text);
    return;
  }

  // Left column: event-type badges (one per line, centered).
  if (types.length > 0) {
    types.forEach((type, i) => {
      const label = new Text({
        text: queryTypeLabel(type),
        style: {
          fontSize: PROJECTION_QUERY_TYPE_FONT_SIZE,
          fontWeight: "bold",
          fontFamily: MONO,
          fill: isDark ? 0x5eead4 : 0x0f766e,
        },
        resolution: textResolution,
      });

      const badgeW = label.width + PROJECTION_QUERY_TYPE_PADDING_X;
      const badgeH = 17;
      const lineY = lineTop + typesOffset + i * PROJECTION_QUERY_LINE_HEIGHT;
      // Center in the left column, but never spill past the column edges.
      let badgeX = leftCenter - badgeW / 2;
      if (badgeX + badgeW > colWidth - 2) badgeX = colWidth - 2 - badgeW;
      if (badgeX < 2) badgeX = 2;
      const badgeY = lineY + (PROJECTION_QUERY_LINE_HEIGHT - badgeH) / 2;

      const badge = new Graphics();
      badge.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      badge.fill({ color: isDark ? 0x042f2e : 0xccfbf1, alpha: 0.9 });
      badge.stroke({ color: isDark ? 0x0f766e : 0x5eead4, width: 1, alpha: 0.8 });
      container.addChild(badge);

      label.x = badgeX + PROJECTION_QUERY_TYPE_PADDING_X / 2;
      label.y = badgeY + (badgeH - label.height) / 2;
      container.addChild(label);
    });
  } else {
    const text = new Text({
      text: "(any type)",
      style: { fontSize: 11, fontFamily: MONO, fill: dimColor },
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
        fontSize: PROJECTION_QUERY_TAG_FONT_SIZE,
        fontWeight: "bold",
        fontFamily: MONO,
        fill: valid ? (isDark ? 0xfbbf24 : 0xd97706) : isDark ? 0xf87171 : 0xdc2626,
      },
      resolution: textResolution,
    });

    const badgeW = label.width + PROJECTION_QUERY_TAG_PADDING_X;
    const badgeH = 15;
    const lineY = lineTop + tagsOffset + i * PROJECTION_QUERY_LINE_HEIGHT;
    // Center in the right column, but never spill past the ⓘ gutter.
    let badgeX = rightCenter - badgeW / 2;
    if (badgeX + badgeW > rightLimit) badgeX = rightLimit - badgeW;
    if (badgeX < colWidth + 2) badgeX = colWidth + 2;
    const badgeY = lineY + (PROJECTION_QUERY_LINE_HEIGHT - badgeH) / 2;

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

/** Draws the ⓘ badge for a query item and registers its hover zone. */
export function renderQueryItemDescBadge(
  container: Container,
  elementId: string,
  item: ProjectionQueryItem,
  fieldIndex: number,
  cx: number,
  cy: number,
  textResolution: number,
): void {
  const badgeG = new Graphics();
  drawInfoBadge(badgeG, container, cx, cy, {
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
        x: cx - DESC_HIT_HALF,
        y: cy - DESC_HIT_HALF,
        width: DESC_HIT_HALF * 2,
        height: DESC_HIT_HALF * 2,
      },
    });
  }
}

/** Pushes a small dim label into the container (used for section banners and empty rows). */
export function addDimLabel(
  container: Container,
  text: string,
  x: number,
  y: number,
  { fontSize, bold, isDark, textResolution }: {
    fontSize: number;
    bold?: boolean;
    isDark: boolean;
    textResolution: number;
  },
): void {
  const label = new Text({
    text,
    style: {
      fontSize,
      fontWeight: bold ? "bold" : "normal",
      fontFamily: MONO,
      fill: isDark ? 0xa1a1aa : 0x71717a,
    },
    resolution: textResolution,
  });
  label.x = x;
  label.y = y;
  container.addChild(label);
}

/** Empty-row placeholder label (font 11, non-bold). */
export function addDimLabelSize(
  container: Container,
  text: string,
  y: number,
  isDark: boolean,
  textResolution: number,
): void {
  const label = new Text({
    text,
    style: {
      fontSize: 11,
      fontFamily: MONO,
      fill: isDark ? 0x71717a : 0xa1a1aa,
    },
    resolution: textResolution,
  });
  label.x = 12;
  label.y = y;
  container.addChild(label);
}
