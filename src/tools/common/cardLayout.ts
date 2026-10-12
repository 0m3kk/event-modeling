import { Container, Graphics, Text } from "pixi.js";
import type {
  CanvasElement,
  Point,
  SelectedField,
  InlineEditState,
} from "@/types";
import { getContrastTextColor } from "@/utils/color";
import { isSameIdentifier, toDisplayName, toDisplayType } from "@/utils/naming";
import { useCanvasStore } from "@/store";
import { hasValidation, type FieldValidation } from "@/utils/fieldValidation";
import { measureMonospaceText } from "@/utils/textWrap";
import { addDescZone } from "./descZones";

export const CARD_HEADER_HEIGHT = 32;
export const CARD_ROW_HEIGHT = 28;
export const CARD_CORNER_RADIUS = 8;
export const CARD_DEFAULT_WIDTH = 220;

/** Size of the small "has validation" shield badge shown on a field row. */
export const VALIDATION_BADGE_W = 15;
export const VALIDATION_BADGE_H = 13;

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
  /** Optional: typeless rows (e.g. Enum members) omit the type column. */
  type?: string;
  isTag?: boolean;
  tag?: string;
  isArray?: boolean;
  isRequired?: boolean;
  description?: string;
  /** Optional validation constraints; a shield badge marks rows that have them. */
  validation?: FieldValidation;
}

/**
 * Draws the small shield-check badge that marks a field as carrying validation
 * constraints. `x`/`y` is the top-left corner of the badge. Kept in this module
 * so every card renders the marker identically.
 */
export function drawValidationBadge(
  g: Graphics,
  x: number,
  y: number,
  isDark: boolean,
): void {
  const fill = isDark ? 0x1e3a8a : 0xdbeafe;
  const stroke = isDark ? 0x3b82f6 : 0x93c5fd;
  const check = isDark ? 0xbfdbfe : 0x1d4ed8;

  g.roundRect(x, y, VALIDATION_BADGE_W, VALIDATION_BADGE_H, 3);
  g.fill({ color: fill, alpha: 0.95 });
  g.stroke({ color: stroke, width: 1 });

  // Checkmark: two strokes hugging the badge centre.
  g.moveTo(x + 3.5, y + 6.6);
  g.lineTo(x + 6, y + 9);
  g.lineTo(x + 11, y + 3.6);
  g.stroke({ color: check, width: 1.6 });
}

/**
 * Appends a validation shield badge to `container` at the given top-left corner
 * when `validation` carries rules. Returns the horizontal space the badge
 * occupies (0 when nothing was drawn) so callers can lay out what follows.
 */
export function appendFieldValidationBadge(
  container: Container,
  options: { x: number; y: number; isDark: boolean; validation?: FieldValidation },
): number {
  const { x, y, isDark, validation } = options;
  if (!hasValidation(validation)) return 0;
  const g = new Graphics();
  drawValidationBadge(g, x, y, isDark);
  container.addChild(g);
  return VALIDATION_BADGE_W;
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
  headerHeight: number = CARD_HEADER_HEIGHT,
): { x: number; y: number } {
  return {
    x: width - (hasReference ? DESC_HEADER_BADGE_RIGHT_WITH_REF : DESC_HEADER_BADGE_RIGHT),
    y: headerHeight / 2,
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
  /** Header height, so the badge stays vertically centered on taller headers. */
  headerHeight?: number;
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

  const { elementId, width, isDark, isSelected, hasDescription, hasReference, text, textResolution, headerHeight } =
    options;
  if (!hasDescription && !isSelected) return null;

  const center = getHeaderDescBadgeCenter(width, hasReference, headerHeight);
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
  /**
   * When true (default) field names are treated as identifiers and shown via
   * {@link toDisplayName} (camelCase/snake_case -> "Human Readable"). Enum
   * members are domain values whose casing is stored verbatim, so their card
   * passes false to show the stored value untouched (underscores included).
   */
  humanizeFieldNames?: boolean;
  /**
   * Display-only uppercase pass applied after the humanize/verbatim choice.
   * Used by Enum to render value names in ALL CAPS while the stored value and
   * the inline editor keep their original casing.
   */
  uppercaseFieldNames?: boolean;
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

/** Horizontal padding before a row's name text (mirrors the renderers' `x = 12`). */
export const ROW_LEFT_PADDING = 12;
/** Horizontal padding kept on a row's right edge (type label anchor). */
export const ROW_RIGHT_PADDING = 12;
/** Font size of a standard card title (`renderStandardCardTitle`). */
export const CARD_TITLE_FONT_SIZE = 13;
/** Font size of a field-row name (`renderStandardCardFields`). */
export const CARD_NAME_FONT_SIZE = 12;
/** Font size of a field-row type label. */
export const CARD_TYPE_FONT_SIZE = 11;
/** Font size of the required `*` marker. */
export const CARD_REQUIRED_FONT_SIZE = 13;
/** Font size of a `#tag` badge label. */
export const CARD_TAG_FONT_SIZE = 9;
/**
 * Space kept right of a title so it clears the header ⓘ badge. The badge sits
 * at `width - 17` on its own, but is nudged to `width - 40` when the card shows
 * a reference ❖/🔗 corner badge (see {@link getHeaderDescBadgeCenter}). Reserve
 * for the worst case so a title never overlaps the ⓘ whichever state the card
 * is in — reference state can change without the data changing, so the width
 * cannot rely on re-fitting.
 */
export const CARD_TITLE_RIGHT_RESERVE =
  DESC_HEADER_BADGE_RIGHT_WITH_REF + DESC_HEADER_BADGE_RADIUS + 8;
/**
 * Minimum gap kept between a row's name block and its right-aligned type. Wide
 * enough for the row's ⓘ description badge (`DESC_ROW_BADGE_GAP` + radius) so
 * the name block never collides with it.
 */
export const CARD_ROW_CONTENT_GAP = DESC_ROW_BADGE_GAP + DESC_ROW_BADGE_RADIUS + 12;

/**
 * Pixel width a title needs so it never collides with the header ⓘ badge.
 */
export function measureCardTitleWidth(name: string | undefined): number {
  return (
    ROW_LEFT_PADDING +
    measureMonospaceText(toDisplayName(name || ""), CARD_TITLE_FONT_SIZE) +
    CARD_TITLE_RIGHT_RESERVE
  );
}

/**
 * Pixel width one standard field row needs so neither the left name block
 * (name, required `*`, validation shield, `#tag` badge) nor the right-aligned
 * type label is clipped.
 */
export function measureFieldRowWidth(field: CardFieldItem): number {
  let left =
    ROW_LEFT_PADDING + measureMonospaceText(toDisplayName(field.name), CARD_NAME_FONT_SIZE);
  if (field.isRequired) left += 2 + measureMonospaceText("*", CARD_REQUIRED_FONT_SIZE);
  if (hasValidation(field.validation)) left += 6 + VALIDATION_BADGE_W;
  if (field.isTag || field.tag) {
    const label = field.tag ? `#${toDisplayName(field.tag)}` : "#tag";
    left += 6 + measureMonospaceText(label, CARD_TAG_FONT_SIZE) + 8;
  }
  const typeText = toDisplayType(field.type, field.isArray);
  const typeWidth = typeText ? measureMonospaceText(typeText, CARD_TYPE_FONT_SIZE) : 0;
  return left + CARD_ROW_CONTENT_GAP + typeWidth + ROW_RIGHT_PADDING;
}

/**
 * Minimum card width that fits a title and every field row without clipping,
 * never dropping below `baseWidth`. This is the text-driven floor used by the
 * cards whose names/types must stay readable (Event, Command, Query, State,
 * View). Callers combine it with their own content constraints (e.g. a State's
 * query-item badges) by passing the larger of the two as `baseWidth`.
 */
export function measureStandardCardContentWidth(
  name: string | undefined,
  fields: CardFieldItem[] | undefined,
  baseWidth = CARD_DEFAULT_WIDTH,
): number {
  let required = baseWidth;
  required = Math.max(required, measureCardTitleWidth(name));
  for (const field of fields ?? []) {
    required = Math.max(required, measureFieldRowWidth(field));
  }
  return Math.ceil(required);
}

/**
 * Pixel width a single full-width text row (e.g. a Command's action token)
 * needs. Kept generic: callers pass the already-formatted display label.
 */
export function measureFullWidthRowWidth(label: string): number {
  return ROW_LEFT_PADDING + measureMonospaceText(label, CARD_NAME_FONT_SIZE) + CARD_TITLE_RIGHT_RESERVE;
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
    text: toDisplayName(titleText),
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
 * Produces the on-canvas label for a field/value row. Kept separate from the
 * Pixi render path so the display rules (humanize vs. verbatim, optional ALL
 * CAPS) are testable without a DOM. Display-only: never changes stored data.
 */
export function formatFieldNameLabel(
  name: string | undefined,
  { humanize = true, uppercase = false }: { humanize?: boolean; uppercase?: boolean } = {},
): string {
  const label = humanize ? toDisplayName(name) : name ?? "";
  return uppercase ? label.toUpperCase() : label;
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
    humanizeFieldNames = true,
    uppercaseFieldNames = false,
  } = options;
  let currentY = CARD_HEADER_HEIGHT;

  if (fields && fields.length > 0) {
    fields.forEach((field, idx) => {
      const isFieldSelected = idx === selectedFieldIndex;

      const label = formatFieldNameLabel(field.name, {
        humanize: humanizeFieldNames,
        uppercase: uppercaseFieldNames,
      });
      const fieldName = new Text({
        text: label,
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

      // Required marker: a "*" right after the field name.
      let nameEndX = fieldName.x + fieldName.width;
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
        requiredStar.x = nameEndX + 2;
        requiredStar.y = currentY + 6;
        container.addChild(requiredStar);
        nameEndX = requiredStar.x + requiredStar.width;
      }

      // Reserve space for a validation shield badge. It is drawn once the type
      // label position is known (below) so it never overlaps the right-aligned
      // type text.
      const hasFieldValidation = hasValidation(field.validation);
      const validationBadgeX = nameEndX + 6;

      // Type label is optional: typeless rows (e.g. Enum members) only render
      // a name, so the right-edge anchor falls back to the row padding.
      const typeText = toDisplayType(field.type, field.isArray);
      let rightAnchorX = width - 12;
      if (typeText) {
        const typeLabel = new Text({
          text: typeText,
          style: {
            fontSize: 11,
            fontFamily: '"Geist Mono", monospace',
            fill: isDark ? 0xa1a1aa : 0x71717a,
          },
          resolution: textResolution,
        });
        typeLabel.x = width - typeLabel.width - 12;
        typeLabel.y = currentY + 8;
        container.addChild(typeLabel);
        rightAnchorX = typeLabel.x;
      }

      // Validation marker: a small shield badge when the field declares rules.
      if (hasFieldValidation && validationBadgeX + VALIDATION_BADGE_W < rightAnchorX - 4) {
        appendFieldValidationBadge(container, {
          x: validationBadgeX,
          y: currentY + (CARD_ROW_HEIGHT - VALIDATION_BADGE_H) / 2,
          isDark,
          validation: field.validation,
        });
        nameEndX = validationBadgeX + VALIDATION_BADGE_W;
      }

      // Row ⓘ badge sits just left of the type label (or the right edge for
      // typeless rows) when the row has a description or is selected (dimmed
      // as an "add info" affordance).
      const showDescBadge = Boolean(field.description) || isFieldSelected;

      if (showDescBadge) {
        const badgeCx = rightAnchorX - DESC_ROW_BADGE_GAP;
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
          // Tags are stored as camelCase identifiers; show them human-readable
          // like the field names/types on the same row.
          text: field.tag ? `#${toDisplayName(field.tag)}` : "#tag",
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
        const badgeX = nameEndX + 6;
        const badgeY = currentY + 6.5;

        if (badgeX + badgeW < rightAnchorX - 4) {
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

export interface StandardCardInlineEditOptions<TData> {
  /**
   * Mirrors {@link RenderStandardCardFieldsOptions.humanizeFieldNames}: when
   * false the field editor shows the stored value verbatim instead of a
   * humanized label (used for Enum members).
   */
  humanizeFieldNames?: boolean;
  /**
   * Mirrors {@link RenderStandardCardFieldsOptions.uppercaseFieldNames}: when
   * true the field editor shows the value in ALL CAPS to match the card.
   */
  uppercaseFieldNames?: boolean;
  /**
   * Optional content-driven size resolver. When set, a committed header/field
   * edit also resizes the card (e.g. Enum widens to fit a longer value).
   */
  resolveSize?: (data: TData) => { width: number; height: number } | null;
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
  options: StandardCardInlineEditOptions<TData> = {},
): InlineEditState | null {
  const {
    humanizeFieldNames = true,
    uppercaseFieldNames = false,
    resolveSize,
  } = options;

  /** Resizes the card alongside a data patch when a resolver is configured. */
  const sizePatch = (nextData: TData) => {
    const size = resolveSize ? resolveSize(nextData) : null;
    return size ? { width: size.width, height: size.height } : {};
  };

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
      initialValue: toDisplayName(element.data?.name) || fallbackName,
      multiline: false,
      onCommit: (newValue) => {
        const trimmed = newValue.trim();
        if (trimmed && !isSameIdentifier(trimmed, element.data?.name)) {
          const nextData = { ...element.data, name: trimmed };
          useCanvasStore.getState().updateElement(element.id, {
            ...sizePatch(nextData),
            data: nextData,
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
      initialValue: formatFieldNameLabel(field.name, {
        humanize: humanizeFieldNames,
        uppercase: uppercaseFieldNames,
      }),
      multiline: false,
      onCommit: (newName) => {
        const trimmed = newName.trim();
        // The committed value is stored verbatim, so separators such as `_`
        // are preserved (Enum members are stored values, not identifiers).
        const changed = humanizeFieldNames
          ? !isSameIdentifier(trimmed, field.name)
          : trimmed !== field.name;
        if (trimmed && changed) {
          const nextFields = [...fields];
          nextFields[index] = { ...field, name: trimmed };
          const nextData = { ...element.data, fields: nextFields };
          useCanvasStore.getState().updateElement(element.id, {
            ...sizePatch(nextData),
            data: nextData,
          });
        }
      },
    };
  }

  return null;
}
