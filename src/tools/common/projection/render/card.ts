/**
 * Card-level drawing for the projection cards (State / View): frame, header,
 * section banners, active-row highlight and the assembled rows.
 */
import { Graphics, type Container } from "pixi.js";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { collectBoardTagCatalog } from "@/utils/eventTags";
import { resolveHeaderColor } from "@/utils/color";
import {
  CARD_CORNER_RADIUS,
  renderHeaderDescBadge,
  renderStandardCardTitle,
} from "../../cardLayout";
import { beginDescZones } from "../../descZones";
import type { RenderContext } from "../../../types";
import {
  PROJECTION_HEADER_HEIGHT,
  PROJECTION_ROW_HEIGHT,
  PROJECTION_SECTION_HEADER_HEIGHT,
  computeProjectionLayout,
  queryItemHeight,
} from "../metrics";
import type { ProjectionCardData } from "../types";
import {
  addDimLabel,
  addDimLabelSize,
  renderFieldRow,
  renderQueryItemDescBadge,
  renderQueryItemRow,
} from "./rows";

export interface ProjectionRenderConfig {
  /** Title shown when the card has no name and the inline-edit fallback (e.g. "State"). */
  title: string;
  /** Module colour used when the card has none. */
  color: string;
  /** Section banner labels: [params, query, states]. */
  sectionLabels: [string, string, string];
}

export function renderProjectionCard(
  container: Container,
  element: CanvasElement<ProjectionCardData>,
  context: RenderContext,
  config: ProjectionRenderConfig,
): void {
  container.removeChildren();
  beginDescZones(element.id);

  const isSelected = context.isSelected;
  const isDark = context.theme === "dark";
  const headerColor = resolveHeaderColor(element.data.color || config.color, isDark);
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
  } = computeProjectionLayout(element.data);

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
  g.lineTo(w, PROJECTION_HEADER_HEIGHT);
  g.lineTo(0, PROJECTION_HEADER_HEIGHT);
  g.closePath();
  g.fill({ color: headerColor });

  // 2. Card body (flat top, rounded bottom)
  g.moveTo(0, PROJECTION_HEADER_HEIGHT);
  g.lineTo(w, PROJECTION_HEADER_HEIGHT);
  g.lineTo(w, h - r);
  g.arcTo(w, h, w - r, h, r);
  g.lineTo(r, h);
  g.arcTo(0, h, 0, h - r, r);
  g.closePath();
  g.fill({ color: cardBg });

  // 3. Section banners
  g.rect(0, PROJECTION_HEADER_HEIGHT, w, PROJECTION_SECTION_HEADER_HEIGHT);
  g.fill({ color: sectionHeaderBg });
  g.rect(0, queryHeaderY, w, PROJECTION_SECTION_HEADER_HEIGHT);
  g.fill({ color: sectionHeaderBg });
  g.rect(0, stateHeaderY, w, PROJECTION_SECTION_HEADER_HEIGHT);
  g.fill({ color: sectionHeaderBg });

  // 4. Sunken highlight for the active row
  if (isThisElement && activeFieldIndex >= 0 && activeSection >= 0) {
    let rowY = -1;
    let rowH = PROJECTION_ROW_HEIGHT;
    let isBottomRow = false;

    if (activeSection === 0 && activeFieldIndex < params.length) {
      rowY = paramStartY + activeFieldIndex * PROJECTION_ROW_HEIGHT;
    } else if (activeSection === 1 && activeFieldIndex < items.length) {
      rowY = queryStartY + queryOffsets[activeFieldIndex];
      rowH = queryItemHeight(items[activeFieldIndex]);
    } else if (activeSection === 2 && activeFieldIndex < states.length) {
      rowY = stateStartY + activeFieldIndex * PROJECTION_ROW_HEIGHT;
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
  renderStandardCardTitle(container, element.data.name || config.title, headerColor, context.textResolution);

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

  const [paramsLabel, queryLabel, statesLabel] = config.sectionLabels;
  addDimLabel(container, paramsLabel, 12, PROJECTION_HEADER_HEIGHT + 4, {
    fontSize: 10,
    bold: true,
    isDark,
    textResolution: context.textResolution,
  });
  addDimLabel(container, queryLabel, 12, queryHeaderY + 4, {
    fontSize: 10,
    bold: true,
    isDark,
    textResolution: context.textResolution,
  });
  addDimLabel(container, statesLabel, 12, stateHeaderY + 4, {
    fontSize: 10,
    bold: true,
    isDark,
    textResolution: context.textResolution,
  });

  // 7. Param rows
  if (params.length > 0) {
    params.forEach((field, idx) => {
      renderFieldRow(container, {
        elementId: element.id,
        field,
        sectionIndex: 0,
        fieldIndex: idx,
        rowY: paramStartY + idx * PROJECTION_ROW_HEIGHT,
        width: w,
        isDark,
        isSelectedRow: activeSection === 0 && activeFieldIndex === idx,
        textResolution: context.textResolution,
      });
    });
  } else {
    addDimLabelSize(container, "(no params)", paramStartY + 7, isDark, context.textResolution);
  }

  // 8. Query item rows
  if (items.length > 0) {
    const tagCatalog = collectBoardTagCatalog(useCanvasStore.getState().elements);
    const paramByName = new Map(params.map((p) => [p.name, p]));
    items.forEach((item, idx) => {
      const itemY = queryStartY + queryOffsets[idx];
      const itemH = queryItemHeight(item);
      renderQueryItemRow(container, {
        elementId: element.id,
        item,
        fieldIndex: idx,
        itemY,
        itemHeight: itemH,
        width: w,
        isDark,
        isSelectedRow: activeSection === 1 && activeFieldIndex === idx,
        textResolution: context.textResolution,
        tagCatalog,
        paramByName,
      });
      if (item.description || (activeSection === 1 && activeFieldIndex === idx)) {
        renderQueryItemDescBadge(
          container,
          element.id,
          item,
          idx,
          w - 14,
          itemY + itemH / 2,
          context.textResolution,
        );
      }
    });
  } else {
    addDimLabelSize(container, "(no query items)", queryStartY + 7, isDark, context.textResolution);
  }

  // 9. State rows
  if (states.length > 0) {
    states.forEach((field, idx) => {
      renderFieldRow(container, {
        elementId: element.id,
        field,
        sectionIndex: 2,
        fieldIndex: idx,
        rowY: stateStartY + idx * PROJECTION_ROW_HEIGHT,
        width: w,
        isDark,
        isSelectedRow: activeSection === 2 && activeFieldIndex === idx,
        textResolution: context.textResolution,
      });
    });
  } else {
    addDimLabelSize(container, "(no states)", stateStartY + 7, isDark, context.textResolution);
  }
}
