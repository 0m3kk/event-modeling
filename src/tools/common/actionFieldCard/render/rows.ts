/**
 * Row-level drawing for the action field cards: a field row (name + required +
 * validation + type + ⓘ) plus the small section-banner and placeholder labels.
 */
import { Graphics, Text, type Container } from "pixi.js";
import { toDisplayName, toDisplayType } from "@/utils/naming";
import { hasValidation } from "@/utils/fieldValidation";
import {
  DESC_HIT_HALF,
  DESC_ROW_BADGE_GAP,
  VALIDATION_BADGE_H,
  VALIDATION_BADGE_W,
  appendFieldValidationBadge,
  drawInfoBadge,
} from "../../cardLayout";
import { addDescZone } from "../../descZones";
import { ACTION_ROW_HEIGHT } from "../metrics";
import type { ActionField } from "../types";

const MONO = '"Geist Mono", monospace';

/**
 * Draws a field row's ⓘ badge just left of its type label and records the
 * hover hit box (only when the row carries a description).
 */
function renderRowDescBadge(
  container: Container,
  elementId: string,
  field: ActionField,
  sectionIndex: number,
  fieldIndex: number,
  typeLabelX: number,
  rowY: number,
  textResolution: number,
): void {
  const badgeCx = typeLabelX - DESC_ROW_BADGE_GAP;
  const badgeCy = rowY + ACTION_ROW_HEIGHT / 2;
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

/** Renders one field row (name + required marker + validation + type + ⓘ). */
export function renderFieldRow(
  container: Container,
  opts: {
    elementId: string;
    field: ActionField;
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

  // Required marker: a "*" right after the field name.
  let nameEndX = fieldName.x + fieldName.width;
  if (field.isRequired) {
    const requiredStar = new Text({
      text: "*",
      style: { fontSize: 13, fontWeight: "bold", fontFamily: MONO, fill: isDark ? 0xf87171 : 0xdc2626 },
      resolution: textResolution,
    });
    requiredStar.x = fieldName.x + fieldName.width + 2;
    requiredStar.y = rowY + 6;
    container.addChild(requiredStar);
    nameEndX = requiredStar.x + requiredStar.width;
  }

  const typeLabel = new Text({
    text: toDisplayType(field.type, field.isArray),
    style: { fontSize: 11, fontFamily: MONO, fill: isDark ? 0xa1a1aa : 0x71717a },
    resolution: textResolution,
  });
  typeLabel.x = width - typeLabel.width - 12;
  typeLabel.y = rowY + 8;
  container.addChild(typeLabel);

  // Validation marker: shield badge when the field declares rules.
  if (hasValidation(field.validation) && nameEndX + 6 + VALIDATION_BADGE_W < typeLabel.x - 4) {
    appendFieldValidationBadge(container, {
      x: nameEndX + 6,
      y: rowY + (ACTION_ROW_HEIGHT - VALIDATION_BADGE_H) / 2,
      isDark,
      validation: field.validation,
    });
  }

  if (field.description || isSelectedRow) {
    renderRowDescBadge(
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

/** Draws a section banner label (font 10, bold). */
export function sectionLabel(
  container: Container,
  text: string,
  y: number,
  isDark: boolean,
  textResolution: number,
): void {
  const label = new Text({
    text,
    style: { fontSize: 10, fontWeight: "bold", fontFamily: MONO, fill: isDark ? 0xa1a1aa : 0x71717a },
    resolution: textResolution,
  });
  label.x = 12;
  label.y = y;
  container.addChild(label);
}

/** Empty-section placeholder label (font 11). */
export function emptyRow(
  container: Container,
  text: string,
  y: number,
  isDark: boolean,
  textResolution: number,
): void {
  const label = new Text({
    text,
    style: { fontSize: 11, fontFamily: MONO, fill: isDark ? 0x71717a : 0xa1a1aa },
    resolution: textResolution,
  });
  label.x = 12;
  label.y = y;
  container.addChild(label);
}
