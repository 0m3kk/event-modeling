import { CanvasTextMetrics, TextStyle } from "pixi.js";
import {
  getConstraintRules,
  getConstraintStates,
  type ConstraintCardData,
  type ConstraintState,
} from "./rules";
import { measureMonospaceText, wrapMonospaceText } from "@/utils/textWrap";
import { toDisplayName } from "@/utils/naming";
import {
  measureCardTitleWidth,
  CARD_NAME_FONT_SIZE,
  ROW_LEFT_PADDING,
} from "../common/cardLayout";

export const CONSTRAINT_HEADER_HEIGHT = 32;
export const CONSTRAINT_SECTION_HEADER_HEIGHT = 22;
/** Height of one STATES row. */
export const CONSTRAINT_ROW_HEIGHT = 28;
export const CONSTRAINT_DEFAULT_WIDTH = 260;

/** Horizontal padding inside a row, per side. */
export const CONSTRAINT_ROW_PADDING_X = 12;
/** Font size used for a free-text rule. */
export const CONSTRAINT_RULE_FONT_SIZE = 12;
/** Line height used once a rule wraps onto several lines. */
export const CONSTRAINT_RULE_LINE_HEIGHT = 15;
/** Extra vertical breathing room around a rule's wrapped lines. */
export const CONSTRAINT_RULE_PADDING_Y = 4;
/** Minimum height of a RULES row (a single unwrapped line). */
export const CONSTRAINT_RULE_MIN_HEIGHT = 22;

/** A single RULES row: the source text, its wrapped lines, and its height. */
export interface ConstraintRuleRow {
  text: string;
  lines: string[];
  /** Row height grows with the line count so wrapped text is never clipped. */
  height: number;
}

export interface ConstraintLayout {
  states: ConstraintState[];
  rules: string[];
  /** Per-rule wrapped geometry, in display order. */
  ruleRows: ConstraintRuleRow[];
  statesCount: number;
  rulesCount: number;
  statesStartY: number;
  rulesHeaderY: number;
  rulesStartY: number;
  /** Y of the bottom edge of the content area. */
  contentHeight: number;
}

/** Pixel width available for rule text inside a card of `width`. */
export function getRuleWrapWidth(width: number): number {
  return Math.max(1, width - CONSTRAINT_ROW_PADDING_X * 2);
}

/** Measuring styles are cached per wrap width (they define the wrap breaks). */
const measureStyles = new Map<number, TextStyle>();

function getMeasureStyle(wrapWidth: number): TextStyle {
  const key = Math.round(wrapWidth);
  let style = measureStyles.get(key);
  if (!style) {
    style = new TextStyle({
      fontFamily: '"Geist Mono", monospace',
      fontSize: CONSTRAINT_RULE_FONT_SIZE,
      lineHeight: CONSTRAINT_RULE_LINE_HEIGHT,
      wordWrap: true,
      wordWrapWidth: key,
      breakWords: true,
    });
    measureStyles.set(key, style);
  }
  return style;
}

/**
 * Wraps one rule to `wrapWidth` using the SAME font metrics the canvas renders
 * with (via Pixi's text measurement), so the layout height always matches what
 * is drawn and text can never spill past the card edge.
 *
 * Without a DOM (unit tests, SSG) Pixi cannot measure, so we fall back to the
 * deterministic monospace estimate in {@link wrapMonospaceText}.
 */
export function wrapRuleText(text: string, wrapWidth: number): string[] {
  const value = typeof text === "string" ? text : "";

  if (typeof document !== "undefined") {
    try {
      const metrics = CanvasTextMetrics.measureText(value, getMeasureStyle(wrapWidth));
      if (metrics.lines.length > 0) return metrics.lines;
    } catch {
      // No canvas / font system available: fall through to the estimator.
    }
  }

  return wrapMonospaceText(value, wrapWidth, CONSTRAINT_RULE_FONT_SIZE);
}

/** Height a rule row needs for `lineCount` wrapped lines. */
function ruleRowHeight(lineCount: number): number {
  return Math.max(
    CONSTRAINT_RULE_MIN_HEIGHT,
    lineCount * CONSTRAINT_RULE_LINE_HEIGHT + CONSTRAINT_RULE_PADDING_Y,
  );
}

/**
 * Computes the vertical geometry of a Constraint card for a given width. Rules
 * wrap to the available width, so rows grow taller when their text is long.
 */
export function computeConstraintLayout(
  data: ConstraintCardData,
  width = CONSTRAINT_DEFAULT_WIDTH,
): ConstraintLayout {
  const states = getConstraintStates(data);
  const rules = getConstraintRules(data);
  const statesCount = Math.max(1, states.length);
  const rulesCount = Math.max(1, rules.length);

  const statesStartY = CONSTRAINT_HEADER_HEIGHT + CONSTRAINT_SECTION_HEADER_HEIGHT;
  const rulesHeaderY = statesStartY + statesCount * CONSTRAINT_ROW_HEIGHT;
  const rulesStartY = rulesHeaderY + CONSTRAINT_SECTION_HEADER_HEIGHT;

  const wrapWidth = getRuleWrapWidth(width);
  const ruleRows: ConstraintRuleRow[] = rules.map((text) => {
    const lines = wrapRuleText(text, wrapWidth);
    return { text, lines, height: ruleRowHeight(lines.length) };
  });

  const rulesHeight =
    ruleRows.length > 0
      ? ruleRows.reduce((sum, row) => sum + row.height, 0)
      : CONSTRAINT_RULE_MIN_HEIGHT;

  return {
    states,
    rules,
    ruleRows,
    statesCount,
    rulesCount,
    statesStartY,
    rulesHeaderY,
    rulesStartY,
    contentHeight: rulesStartY + rulesHeight,
  };
}

/** Y of the top edge of the rule row at `index` (relative to the card). */
export function getRuleRowTop(layout: ConstraintLayout, index: number): number {
  let y = layout.rulesStartY;
  for (let i = 0; i < index && i < layout.ruleRows.length; i += 1) {
    y += layout.ruleRows[i].height;
  }
  return y;
}

/** Bottom edge (exclusive) of the STATES content area. */
export function getStatesEndY(layout: ConstraintLayout): number {
  return layout.statesStartY + layout.statesCount * CONSTRAINT_ROW_HEIGHT;
}

/** Resolves the rule row index under a local Y, or null when outside the rows. */
export function findRuleIndexAt(layout: ConstraintLayout, y: number): number | null {
  if (layout.ruleRows.length === 0) return null;
  for (let i = 0; i < layout.ruleRows.length; i += 1) {
    const top = getRuleRowTop(layout, i);
    if (y >= top && y < top + layout.ruleRows[i].height) return i;
  }
  return null;
}

/** Space kept right of a STATES row name for its right-aligned hint. */
export const CONSTRAINT_STATE_HINT_RESERVE = 80;

/**
 * Content-driven size of a Constraint card at the given width. The height
 * accounts for rule text wrapping to the card width.
 *
 * The width grows to fit the card's structured content — its title and the
 * STATES rows (state name + right-aligned hint) — but deliberately ignores the
 * free-text RULES: those wrap to whatever width the card has instead of
 * stretching it.
 */
export function computeConstraintCardSize(
  data: ConstraintCardData,
  customWidth = CONSTRAINT_DEFAULT_WIDTH,
): { width: number; height: number } {
  const width = Math.max(customWidth, computeConstraintContentWidth(data));
  return {
    width,
    height: computeConstraintLayout(data, width).contentHeight,
  };
}

/**
 * Minimum width that fits the Constraint title and every STATES row name
 * (plus room for the row's right-aligned hint). Free-text rules are excluded
 * on purpose: they wrap to the card width instead of widening it.
 */
export function computeConstraintContentWidth(data: ConstraintCardData): number {
  let required = measureCardTitleWidth(data.name);
  for (const state of getConstraintStates(data)) {
    const nameWidth =
      ROW_LEFT_PADDING + measureMonospaceText(toDisplayName(state.name), CARD_NAME_FONT_SIZE);
    required = Math.max(required, nameWidth + CONSTRAINT_STATE_HINT_RESERVE);
  }
  return Math.ceil(required);
}
