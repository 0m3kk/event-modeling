/**
 * Card-level drawing for the action field cards (Command / Query): frame,
 * header, action token row, section banners and the assembled field rows.
 */
import { Graphics, Text, type Container } from "pixi.js";
import type { CanvasElement } from "@/types";
import { resolveHeaderColor } from "@/utils/color";
import { toDisplayAction } from "@/utils/naming";
import { CARD_CORNER_RADIUS, renderHeaderDescBadge, renderStandardCardTitle } from "../../cardLayout";
import { beginDescZones } from "../../descZones";
import type { RenderContext } from "../../../types";
import {
  ACTION_HEADER_HEIGHT,
  ACTION_PRIMARY_BAND_TOP,
  ACTION_ROW_HEIGHT,
  ACTION_SECTION_HEADER_HEIGHT,
  ACTION_TOKEN_ROW_TOP,
  computeActionLayout,
} from "../metrics";
import type { ActionCardData, ActionField } from "../types";
import { emptyRow, renderFieldRow, sectionLabel } from "./rows";

export interface ActionRenderConfig {
  /** Title shown when the card has no name (e.g. "Command"). */
  title: string;
  /** Module colour used when the card has none. */
  color: string;
  /** Primary section banner label (e.g. "INPUT" / "PARAM"). */
  primarySectionLabel: string;
  /** Placeholder shown when the primary section is empty (e.g. "(no inputs)"). */
  emptyPrimaryLabel: string;
  /** Action token text colour by theme. */
  actionTint: { dark: number; light: number };
  /** Reads the primary section fields (handles the Command legacy alias). */
  getPrimary: (data: ActionCardData) => ActionField[];
}

const MONO = '"Geist Mono", monospace';

export function renderActionFieldCard(
  container: Container,
  element: CanvasElement<ActionCardData>,
  context: RenderContext,
  config: ActionRenderConfig,
): void {
  container.removeChildren();
  beginDescZones(element.id);

  const isSelected = context.isSelected;
  const isDark = context.theme === "dark";
  const headerColor = resolveHeaderColor(element.data.color || config.color, isDark);
  const w = element.width;
  const h = element.height;
  const r = CARD_CORNER_RADIUS;

  const primary = config.getPrimary(element.data);
  const responses = element.data.responses ?? [];
  const { primaryCount, responsesCount, primaryStartY, respHeaderY, respStartY } = computeActionLayout(
    primary,
    responses,
  );

  const cardBg = isDark ? 0x18181b : 0xffffff;
  const sectionHeaderBg = isDark ? 0x27272a : 0xf4f4f5;
  const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
  const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

  const isThisElement = context.selectedField?.elementId === element.id;
  const activeSection = context.selectedField?.sectionIndex ?? 0;
  const activeFieldIndex = isThisElement ? context.selectedField?.fieldIndex ?? -1 : -1;

  const g = new Graphics();

  // 1. Header banner (rounded top, flat bottom)
  g.moveTo(0, r);
  g.arcTo(0, 0, r, 0, r);
  g.lineTo(w - r, 0);
  g.arcTo(w, 0, w, r, r);
  g.lineTo(w, ACTION_HEADER_HEIGHT);
  g.lineTo(0, ACTION_HEADER_HEIGHT);
  g.closePath();
  g.fill({ color: headerColor });

  // 2. Card body (flat top, rounded bottom)
  g.moveTo(0, ACTION_HEADER_HEIGHT);
  g.lineTo(w, ACTION_HEADER_HEIGHT);
  g.lineTo(w, h - r);
  g.arcTo(w, h, w - r, h, r);
  g.lineTo(r, h);
  g.arcTo(0, h, 0, h - r, r);
  g.closePath();
  g.fill({ color: cardBg });

  // 3. Primary section header banner
  g.rect(0, ACTION_PRIMARY_BAND_TOP, w, ACTION_SECTION_HEADER_HEIGHT);
  g.fill({ color: sectionHeaderBg });

  // 4. Response section header banner
  g.rect(0, respHeaderY, w, ACTION_SECTION_HEADER_HEIGHT);
  g.fill({ color: sectionHeaderBg });

  // 5. Sunken highlight for the active selected field
  if (isThisElement && activeFieldIndex >= 0) {
    if (activeSection === 0 && activeFieldIndex < primary.length) {
      const highlightY = primaryStartY + activeFieldIndex * ACTION_ROW_HEIGHT;
      g.rect(0, highlightY, w, ACTION_ROW_HEIGHT);
      g.fill({ color: sunkenColor });
    } else if (activeSection === 1 && activeFieldIndex < responses.length) {
      const highlightY = respStartY + activeFieldIndex * ACTION_ROW_HEIGHT;
      if (activeFieldIndex === responsesCount - 1) {
        // Flat top, rounded bottom corners (last row of the card).
        g.moveTo(0, highlightY);
        g.lineTo(w, highlightY);
        g.lineTo(w, h - r);
        g.arcTo(w, h, w - r, h, r);
        g.lineTo(r, h);
        g.arcTo(0, h, 0, h - r, r);
        g.closePath();
        g.fill({ color: sunkenColor });
      } else {
        g.rect(0, highlightY, w, ACTION_ROW_HEIGHT);
        g.fill({ color: sunkenColor });
      }
    }
  }

  // 6. Outer crisp border
  g.roundRect(0, 0, w, h, r);
  g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });

  container.addChild(g);

  // 7. Header title
  renderStandardCardTitle(container, element.data.name || config.title, headerColor, context.textResolution);

  // 8. Header ⓘ badge (shows when present or selected)
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

  // 9. Action token as a single field-like row under the header.
  const hasAction = Boolean(element.data.action);
  const actionText = new Text({
    text: hasAction ? toDisplayAction(element.data.action) : "(not set)",
    style: {
      fontSize: 12,
      fontFamily: MONO,
      fill: hasAction
        ? isDark
          ? config.actionTint.dark
          : config.actionTint.light
        : isDark
          ? 0x52525b
          : 0xc4c4c8,
    },
    resolution: context.textResolution,
  });
  actionText.x = 12;
  actionText.y = ACTION_TOKEN_ROW_TOP + 7;
  container.addChild(actionText);

  // 10. Primary section label + rows
  sectionLabel(container, config.primarySectionLabel, ACTION_PRIMARY_BAND_TOP + 4, isDark, context.textResolution);
  if (primary.length > 0) {
    primary.forEach((field, idx) => {
      renderFieldRow(container, {
        elementId: element.id,
        field,
        sectionIndex: 0,
        fieldIndex: idx,
        rowY: primaryStartY + idx * ACTION_ROW_HEIGHT,
        width: w,
        isDark,
        isSelectedRow: isThisElement && activeSection === 0 && activeFieldIndex === idx,
        textResolution: context.textResolution,
      });
    });
  } else {
    emptyRow(container, config.emptyPrimaryLabel, primaryStartY + 7, isDark, context.textResolution);
  }

  // 11. Response section label + rows
  sectionLabel(container, "RESPONSE", respHeaderY + 4, isDark, context.textResolution);
  if (responses.length > 0) {
    responses.forEach((field, idx) => {
      renderFieldRow(container, {
        elementId: element.id,
        field,
        sectionIndex: 1,
        fieldIndex: idx,
        rowY: respStartY + idx * ACTION_ROW_HEIGHT,
        width: w,
        isDark,
        isSelectedRow: isThisElement && activeSection === 1 && activeFieldIndex === idx,
        textResolution: context.textResolution,
      });
    });
  } else {
    emptyRow(container, "(no responses)", respStartY + 7, isDark, context.textResolution);
  }
}
