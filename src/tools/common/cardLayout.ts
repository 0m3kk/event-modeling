import { Container, Graphics, Text } from "pixi.js";
import type {
  CanvasElement,
  Point,
  SelectedField,
  InlineEditState,
} from "@/types";
import { getContrastTextColor } from "@/utils/color";
import { useCanvasStore } from "@/store";
import { addDescZone } from "./descZones";

export const CARD_HEADER_HEIGHT = 32;
export const CARD_ROW_HEIGHT = 28;
export const CARD_CORNER_RADIUS = 8;
export const CARD_DEFAULT_WIDTH = 220;

/** Radius of the header ⓘ badge (its center sits at the header mid-line). */
export const DESC_HEADER_BADGE_RADIUS = 7;
/** Radius of a field-row ⓘ badge. */
export const DESC_ROW_BADGE_RADIUS = 6;
/**
 * Distance from the card's right edge to the center of a header ⓘ badge.
 * Reference-copy cards host the ❖/🔗 badge at the corner, so the ⓘ is nudged
 * further left to avoid overlapping it.
 */
export const DESC_HEADER_BADGE_RIGHT = 17;
export const DESC_HEADER_BADGE_RIGHT_WITH_REF = 40;
/** Gap between a row ⓘ badge center and the left edge of the type label. */
export const DESC_ROW_BADGE_GAP = 12;
/** Half-size of the square hover hit box around a ⓘ badge. */
export const DESC_HIT_HALF = 9;

export interface CardFieldItem {
  name: string;
  type: string;
  isTag?: boolean;
  tag?: string;
  isArray?: boolean;
  description?: string;
}

export interface InfoBadgeStyle {
  radius: number;
  stroke: number;
  strokeWidth?: number;
  fill: number;
  fontSize: number;
  bold?: boolean;
  /** Badges dim when the target has no description yet (an "add info" cue). */
  alpha?: number;
  glyph?: string;
  textResolution?: number;
}

/**
 * Draws a small circular badge (circle + centered glyph) used for the ⓘ
 * description indicator. The glyph is anchored at its own center so it stays
 * optically centered regardless of font metrics.
 */
export function drawInfoBadge(
  g: Graphics,
  container: Container,
  cx: number,
  cy: number,
  {
    radius,
    stroke,
    strokeWidth = 1,
    fill,
    fontSize,
    bold = false,
    alpha = 1,
    glyph = "i",
    textResolution,
  }: InfoBadgeStyle,
): void {
  g.circle(cx, cy, radius).stroke({ color: stroke, width: strokeWidth, alpha });

  const glyphText = new Text({
    text: glyph,
    style: {
      fontSize,
      fontFamily: '"Geist Mono", monospace',
      fontWeight: bold ? "bold" : "normal",
      fill,
    },
    resolution: textResolution,
  });
  glyphText.anchor.set(0.5);
  glyphText.x = cx;
  glyphText.y = cy;
  glyphText.alpha = alpha;
  container.addChild(glyphText);
}

/** Screen-space center of a card header's ⓘ badge. */
export function getHeaderDescBadgeCenter(
  width: number,
  hasReference: boolean,
): { x: number; y: number } {
  return {
    x: width - (hasReference ? DESC_HEADER_BADGE_RIGHT_WITH_REF : DESC_HEADER_BADGE_RIGHT),
    y: CARD_HEADER_HEIGHT / 2,
  };
}

export interface HeaderDescBadgeOptions {
  elementId: string;
  width: number;
  isDark: boolean;
  isSelected: boolean;
  hasDescription: boolean;
  hasReference: boolean;
  /** Description text; a hover zone is only registered when present. */
  text?: string;
  textResolution: number;
}

/**
 * Renders the header ⓘ badge for a card. It shows whenever the card has a
 * description or is selected (dimmed as an "add info" affordance), mirroring
 * the reference implementation. Returns the badge hit box in element-local
 * coordinates, or null when nothing was drawn.
 */
export function renderHeaderDescBadge(
  container: Container,
  options: HeaderDescBadgeOptions,
): { x: number; y: number; width: number; height: number } | null {
  if (typeof document === "undefined") return null;

  const { elementId, width, isDark, isSelected, hasDescription, hasReference, text, textResolution } =
    options;
  if (!hasDescription && !isSelected) return null;

  const center = getHeaderDescBadgeCenter(width, hasReference);
  const g = new Graphics();
  drawInfoBadge(g, container, center.x, center.y, {
    radius: DESC_HEADER_BADGE_RADIUS,
    stroke: isDark ? 0xe4e4e7 : 0xffffff,
    strokeWidth: 1.2,
    fill: isDark ? 0xe4e4e7 : 0xffffff,
    fontSize: 9,
    bold: true,
    alpha: hasDescription ? 1 : 0.5,
    textResolution,
  });
  container.addChild(g);

  if (hasDescription && text) {
    addDescZone(elementId, {
      elementId,
      text,
      iconBounds: {
        x: center.x - DESC_HIT_HALF,
        y: center.y - DESC_HIT_HALF,
        width: DESC_HIT_HALF * 2,
        height: DESC_HIT_HALF * 2,
      },
    });
  }

  const r = DESC_HEADER_BADGE_RADIUS;
  return { x: center.x - r, y: center.y - r, width: r * 2, height: r * 2 };
}

export interface StandardCardFrameOptions {
  width: number;
  height: number;
  headerColor: string | number;
  isDark: boolean;
  isSelected: boolean;
  selectedFieldIndex?: number;
  fieldCount: number;
}

export interface RenderStandardCardFieldsOptions {
  elementId: string;
  fields?: CardFieldItem[];
  selectedFieldIndex: number;
  width: number;
  isDark: boolean;
  textResolution: number;
  emptyHintText?: string;
}

/**
 * Computes standard height for a domain card based on its field count.
 */
export function computeStandardCardSize(
  fieldCount: number,
  customWidth = CARD_DEFAULT_WIDTH,
): { width: number; height: number } {
  const contentCount = Math.max(1, fieldCount);
  const height = CARD_HEADER_HEIGHT + contentCount * CARD_ROW_HEIGHT;
  return { width: customWidth, height };
}

/**
 * Draws the standard domain card frame:
 * 1. Rounded top header banner with vibrant category color
 * 2. Theme-aware body background (rounded bottom corners)
 * 3. Full-width edge-to-edge sunken selection highlight for active field
 * 4. Crisp outer border stroke
 */
export function drawStandardCardFrame(
  g: Graphics,
  options: StandardCardFrameOptions,
): void {
  const {
    width: w,
    height: h,
    headerColor,
    isDark,
    isSelected,
    selectedFieldIndex = -1,
    fieldCount,
  } = options;
  const r = CARD_CORNER_RADIUS;
  const headerH = CARD_HEADER_HEIGHT;
  const cardBg = isDark ? 0x18181b : 0xffffff;
  const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;

  // 1. Fill top header banner (rounded top corners, flat bottom)
  g.moveTo(0, r);
  g.arcTo(0, 0, r, 0, r);
  g.lineTo(w - r, 0);
  g.arcTo(w, 0, w, r, r);
  g.lineTo(w, headerH);
  g.lineTo(0, headerH);
  g.closePath();
  g.fill({ color: headerColor });

  // 2. Fill card body background (flat top, rounded bottom corners)
  g.moveTo(0, headerH);
  g.lineTo(w, headerH);
  g.lineTo(w, h - r);
  g.arcTo(w, h, w - r, h, r);
  g.lineTo(r, h);
  g.arcTo(0, h, 0, h - r, r);
  g.closePath();
  g.fill({ color: cardBg });

  // 3. Highlight selected field: FULL-WIDTH edge-to-edge
  if (selectedFieldIndex >= 0 && selectedFieldIndex < fieldCount) {
    const isLast = selectedFieldIndex === fieldCount - 1;
    const highlightY = headerH + selectedFieldIndex * CARD_ROW_HEIGHT;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

    if (isLast) {
      // Flat top, rounded bottom corners (radius r)
      g.moveTo(0, highlightY);
      g.lineTo(w, highlightY);
      g.lineTo(w, h - r);
      g.arcTo(w, h, w - r, h, r);
      g.lineTo(r, h);
      g.arcTo(0, h, 0, h - r, r);
      g.closePath();
      g.fill({ color: sunkenColor });
    } else {
      g.rect(0, highlightY, w, CARD_ROW_HEIGHT);
      g.fill({ color: sunkenColor });
    }
  }

  // 4. Draw single uniform border stroke around entire card (after all fills)
  g.roundRect(0, 0, w, h, r);
  g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });
}

/**
 * Renders the card header title with Geist Mono font and contrast-aware color.
 */
export function renderStandardCardTitle(
  container: Container,
  titleText: string,
  headerColor: string | number,
  textResolution: number,
): Text | null {
  if (typeof document === "undefined") return null;

  const hexColor =
    typeof headerColor === "number"
      ? `#${headerColor.toString(16).padStart(6, "0")}`
      : headerColor;

  const title = new Text({
    text: titleText,
    style: {
      fontSize: 13,
      fontWeight: "bold",
      fontFamily: '"Geist Mono", monospace',
      fill: getContrastTextColor(hexColor),
    },
    resolution: textResolution,
  });
  title.x = 12;
  title.y = 8;
  container.addChild(title);
  return title;
}

/**
 * Renders the field rows with Geist Mono typography, optional #tag badge, and selection awareness.
 */
export function renderStandardCardFields(
  container: Container,
  options: RenderStandardCardFieldsOptions,
): void {
  if (typeof document === "undefined") return;

  const {
    elementId,
    fields,
    selectedFieldIndex,
    width,
    isDark,
    textResolution,
    emptyHintText = "(no fields)",
  } = options;
  let currentY = CARD_HEADER_HEIGHT;

  if (fields && fields.length > 0) {
    fields.forEach((field, idx) => {
      const isFieldSelected = idx === selectedFieldIndex;

      const fieldName = new Text({
        text: field.name,
        style: {
          fontSize: 12,
          fontWeight: isFieldSelected ? "bold" : "normal",
          fontFamily: '"Geist Mono", monospace',
          fill: isFieldSelected
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
      fieldName.y = currentY + 7;
      container.addChild(fieldName);

      const typeLabel = new Text({
        text: `${field.type}${field.isArray ? "[]" : ""}`,
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xa1a1aa : 0x71717a,
        },
        resolution: textResolution,
      });

      // Row ⓘ badge sits just left of the type label when the row has a
      // description or is selected (dimmed as an "add info" affordance).
      const showDescBadge = Boolean(field.description) || isFieldSelected;
      typeLabel.x = width - typeLabel.width - 12;
      typeLabel.y = currentY + 8;
      container.addChild(typeLabel);

      if (showDescBadge) {
        const badgeCx = typeLabel.x - DESC_ROW_BADGE_GAP;
        const badgeCy = currentY + CARD_ROW_HEIGHT / 2;
        const badgeG = new Graphics();
        drawInfoBadge(badgeG, container, badgeCx, badgeCy, {
          radius: DESC_ROW_BADGE_RADIUS,
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
            fieldIndex: idx,
            sectionIndex: 0,
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

      // Render #tag badge if field is tagged
      if (field.isTag || field.tag) {
        const tagText = new Text({
          text: field.tag ? `#${field.tag}` : "#tag",
          style: {
            fontSize: 9,
            fontWeight: "bold",
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0xfbbf24 : 0xd97706,
          },
          resolution: textResolution,
        });

        const badgeW = tagText.width + 8;
        const badgeH = 15;
        const badgeX = fieldName.x + fieldName.width + 6;
        const badgeY = currentY + 6.5;

        if (badgeX + badgeW < typeLabel.x - 4) {
          const tagBadge = new Graphics();
          tagBadge.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
          tagBadge.fill({ color: isDark ? 0x451a03 : 0xfef3c7, alpha: 0.9 });
          tagBadge.stroke({ color: isDark ? 0xb45309 : 0xf59e0b, width: 1, alpha: 0.8 });
          container.addChild(tagBadge);

          tagText.x = badgeX + 4;
          tagText.y = badgeY + 1.5;
          container.addChild(tagText);
        }
      }

      currentY += CARD_ROW_HEIGHT;
    });
  } else {
    const emptyHint = new Text({
      text: emptyHintText,
      style: {
        fontSize: 11,
        fontFamily: '"Geist Mono", monospace',
        fill: isDark ? 0x71717a : 0xa1a1aa,
      },
      resolution: textResolution,
    });
    emptyHint.x = 12;
    emptyHint.y = currentY + 7;
    container.addChild(emptyHint);
  }
}

/**
 * Returns field index under local pointer, or null if on header / outside.
 */
export function getStandardCardSubSelect(
  localPoint: Point,
  fieldCount: number,
): number | null {
  if (localPoint.y <= CARD_HEADER_HEIGHT) return null;
  const index = Math.floor((localPoint.y - CARD_HEADER_HEIGHT) / CARD_ROW_HEIGHT);
  if (index >= 0 && index < fieldCount) {
    return index;
  }
  return null;
}

/**
 * Navigates between fields via ArrowUp / ArrowDown within section.
 */
export function navigateStandardCardSubSelect(
  elementId: string,
  current: SelectedField,
  direction: "up" | "down",
  fieldCount: number,
  sectionId = "fields",
  sectionIndex = 0,
): SelectedField | null {
  if (fieldCount === 0) return null;
  const currentIndex = Math.max(0, Math.min(current.fieldIndex, fieldCount - 1));
  const nextIndex =
    direction === "down"
      ? Math.min(fieldCount - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
  return {
    elementId,
    sectionIndex,
    sectionId,
    fieldIndex: nextIndex,
  };
}

/**
 * Standard inline edit target resolution for domain cards:
 * - Header double-click edits card name
 * - Field row double-click edits field name
 */
export function getStandardCardInlineEditTarget<
  TData extends { name?: string; fields?: CardFieldItem[] },
>(
  element: CanvasElement<TData>,
  localPoint: Point,
  fallbackName = "Card",
): InlineEditState | null {
  // 1. Double click on Header -> Edit Card Name
  if (localPoint.y <= CARD_HEADER_HEIGHT) {
    return {
      elementId: element.id,
      worldBounds: {
        x: element.x + 8,
        y: element.y + 4,
        width: element.width - 16,
        height: 24,
      },
      initialValue: element.data?.name || fallbackName,
      multiline: false,
      onCommit: (newValue) => {
        const trimmed = newValue.trim();
        if (trimmed && trimmed !== element.data?.name) {
          useCanvasStore.getState().updateElement(element.id, {
            data: { ...element.data, name: trimmed },
          });
        }
      },
    };
  }

  // 2. Double click on Field Name
  const fields = element.data?.fields;
  const fieldCount = fields?.length || 0;
  const index = getStandardCardSubSelect(localPoint, fieldCount);
  if (index !== null && fields && fields[index]) {
    const field = fields[index];
    useCanvasStore.getState().setSelectedField({
      elementId: element.id,
      fieldIndex: index,
    });

    return {
      elementId: element.id,
      worldBounds: {
        x: element.x + 10,
        y: element.y + CARD_HEADER_HEIGHT + index * CARD_ROW_HEIGHT + 2,
        width: Math.max(80, element.width - 80),
        height: 24,
      },
      initialValue: field.name,
      multiline: false,
      onCommit: (newName) => {
        const trimmed = newName.trim();
        if (trimmed && trimmed !== field.name) {
          const nextFields = [...fields];
          nextFields[index] = { ...field, name: trimmed };
          useCanvasStore.getState().updateElement(element.id, {
            data: { ...element.data, fields: nextFields },
          });
        }
      },
    };
  }

  return null;
}
