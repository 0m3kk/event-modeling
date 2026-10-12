import { ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { isSameIdentifier, nameKey, toDisplayName } from "@/utils/naming";
import { ConstraintCardOptions } from "./ConstraintCardOptions";
import {
  renderStandardCardTitle,
  renderHeaderDescBadge,
  CARD_CORNER_RADIUS,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { beginDescZones, hitDescZone } from "../common/descZones";
import {
  collectBoardStateCards,
  boardStateCardsByName,
  getConstraintStates,
  getConstraintRules,
  validateConstraintCardData,
  type ConstraintCardData,
  type ConstraintState,
} from "./rules";
import {
  CONSTRAINT_HEADER_HEIGHT,
  CONSTRAINT_SECTION_HEADER_HEIGHT,
  CONSTRAINT_ROW_HEIGHT,
  CONSTRAINT_DEFAULT_WIDTH,
  CONSTRAINT_RULE_LINE_HEIGHT,
  CONSTRAINT_RULE_FONT_SIZE,
  computeConstraintLayout,
  computeConstraintCardSize,
  findRuleIndexAt,
  getRuleRowTop,
  getStatesEndY,
} from "./layout";

export {
  CONSTRAINT_HEADER_HEIGHT,
  CONSTRAINT_SECTION_HEADER_HEIGHT,
  CONSTRAINT_ROW_HEIGHT,
  CONSTRAINT_DEFAULT_WIDTH,
  computeConstraintCardSize,
} from "./layout";
export type { ConstraintCardData, ConstraintState } from "./rules";
export {
  getConstraintStates,
  getConstraintRules,
  collectBoardStateCards,
} from "./rules";

/** One STATES row: the referenced state's name (+ a resolved badge/hint). */
function renderStateRow(
  container: Container,
  opts: {
    state: ConstraintState;
    resolvable: boolean;
    fieldCount: number;
    rowY: number;
    width: number;
    isDark: boolean;
    isSelectedRow: boolean;
    textResolution: number;
  },
): void {
  const { state, resolvable, fieldCount, rowY, width, isDark, isSelectedRow, textResolution } = opts;

  const name = new Text({
    text: toDisplayName(state.name),
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
  name.x = 12;
  name.y = rowY + 7;
  container.addChild(name);

  const hint = new Text({
    text: resolvable ? `${fieldCount} field${fieldCount === 1 ? "" : "s"}` : "missing",
    style: {
      fontSize: 10,
      fontFamily: '"Geist Mono", monospace',
      fill: resolvable
        ? isDark
          ? 0x71717a
          : 0xa1a1aa
        : isDark
          ? 0xf87171
          : 0xdc2626,
    },
    resolution: textResolution,
  });
  hint.x = width - hint.width - 12;
  hint.y = rowY + 8;
  container.addChild(hint);
}

/**
 * One RULES row: a free-text assertion, left-aligned on the row. The text is
 * pre-wrapped to the card width (see {@link computeConstraintLayout}) and
 * rendered with explicit line breaks so the row height always matches the
 * layout and the text never spills past the card edge.
 */
function renderRuleRow(
  container: Container,
  opts: {
    lines: string[];
    rowY: number;
    rowHeight: number;
    isDark: boolean;
    isSelectedRow: boolean;
    textResolution: number;
  },
): void {
  const { lines, rowY, rowHeight, isDark, isSelectedRow, textResolution } = opts;

  const rule = new Text({
    text: lines.join("\n"),
    style: {
      fontSize: CONSTRAINT_RULE_FONT_SIZE,
      lineHeight: CONSTRAINT_RULE_LINE_HEIGHT,
      fontWeight: isSelectedRow ? "bold" : "normal",
      fontFamily: '"Geist Mono", monospace',
      fill: isSelectedRow
        ? isDark
          ? 0xf4f4f5
          : 0x09090b
        : isDark
          ? 0x7dd3fc
          : 0x0369a1,
    },
    resolution: textResolution,
  });
  rule.x = 12;
  // Vertically center the wrapped block within the (possibly taller) row.
  rule.y = rowY + Math.max(0, (rowHeight - lines.length * CONSTRAINT_RULE_LINE_HEIGHT) / 2);
  container.addChild(rule);
}

export const ConstraintCardSchema = z.object({
  name: z.string().default("NewConstraint"),
  states: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  rules: z.array(z.string()).default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const constraintCardTool: ToolDefinition<ConstraintCardData> = {
  type: "constraintCard",
  name: "Constraint",
  description:
    "A Constraint: declares free-text INPUT preconditions in plain language over one or more State cards (e.g. The account must be active). Rules gate the command/query and decide whether the event is emitted.",
  icon: ShieldCheck,
  color: "#e11d48",
  category: "modeling",

  schema: ConstraintCardSchema,
  createDefaultData: () => ({
    name: "NewConstraint",
    states: [],
    rules: [],
    color: "#e11d48",
  }),

  // Header + two sections ("STATES" and "RULES") that each reserve one row.
  defaultSize: { width: CONSTRAINT_DEFAULT_WIDTH, height: 126 },

  computeSize: (data) => computeConstraintCardSize(data),

  // Rules wrap to the card width, so widening/narrowing the card reflows its
  // height to keep the wrapped text inside the frame.
  computeHeightForWidth: (data, width) => computeConstraintCardSize(data, width).height,

  optionsBar: ConstraintCardOptions,

  normalizeData: (data, context) => validateConstraintCardData(data, context).data,

  validateData: (data, context) => validateConstraintCardData(data, context),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || constraintCardTool.color, isDark);
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;

    const layout = computeConstraintLayout(element.data, w);
    const { states, ruleRows, rulesCount, statesStartY, rulesHeaderY, rulesStartY } = layout;

    const boardByName = boardStateCardsByName(useCanvasStore.getState().elements);

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const sectionHeaderBg = isDark ? 0x27272a : 0xf4f4f5;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

    const isThisElement = context.selectedField?.elementId === element.id;
    const activeSection = isThisElement ? (context.selectedField?.sectionIndex ?? 0) : -1;
    const activeFieldIndex = isThisElement ? (context.selectedField?.fieldIndex ?? -1) : -1;

    const g = new Graphics();

    // 1. Header banner (rounded top, flat bottom)
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, CONSTRAINT_HEADER_HEIGHT);
    g.lineTo(0, CONSTRAINT_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Card body (flat top, rounded bottom)
    g.moveTo(0, CONSTRAINT_HEADER_HEIGHT);
    g.lineTo(w, CONSTRAINT_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Section banners
    g.rect(0, CONSTRAINT_HEADER_HEIGHT, w, CONSTRAINT_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });
    g.rect(0, rulesHeaderY, w, CONSTRAINT_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 4. Sunken highlight for the active row
    if (isThisElement && activeFieldIndex >= 0) {
      let rowY = -1;
      let rowH = CONSTRAINT_ROW_HEIGHT;
      let isBottomRow = false;

      if (activeSection === 0 && activeFieldIndex < states.length) {
        rowY = statesStartY + activeFieldIndex * CONSTRAINT_ROW_HEIGHT;
      } else if (activeSection === 1 && activeFieldIndex < ruleRows.length) {
        rowY = getRuleRowTop(layout, activeFieldIndex);
        rowH = ruleRows[activeFieldIndex].height;
        isBottomRow = activeFieldIndex === rulesCount - 1;
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
      element.data.name || "Constraint",
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

    sectionLabel("STATES", CONSTRAINT_HEADER_HEIGHT + 4);
    sectionLabel("RULES", rulesHeaderY + 4);

    // 7. States rows
    if (states.length > 0) {
      states.forEach((state, idx) => {
        const boardCard = boardByName.get(nameKey(state.name));
        renderStateRow(container, {
          state,
          resolvable: Boolean(boardCard),
          fieldCount: boardCard?.fields.length ?? 0,
          rowY: statesStartY + idx * CONSTRAINT_ROW_HEIGHT,
          width: w,
          isDark,
          isSelectedRow: activeSection === 0 && activeFieldIndex === idx,
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
      empty.y = statesStartY + 7;
      container.addChild(empty);
    }

    // 8. Rules rows (each wrapped to the card width; row height grows with it)
    if (ruleRows.length > 0) {
      ruleRows.forEach((row, idx) => {
        renderRuleRow(container, {
          lines: row.lines,
          rowY: getRuleRowTop(layout, idx),
          rowHeight: row.height,
          isDark,
          isSelectedRow: activeSection === 1 && activeFieldIndex === idx,
          textResolution: context.textResolution,
        });
      });
    } else {
      const empty = new Text({
        text: "(no rules)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      empty.x = 12;
      empty.y = rulesStartY + 5;
      container.addChild(empty);
    }
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const layout = computeConstraintLayout(element.data, element.width);
    const { states, statesStartY } = layout;

    const statesEndY = getStatesEndY(layout);
    if (localPoint.y >= statesStartY && localPoint.y < statesEndY) {
      if (states.length === 0) return null;
      const index = Math.floor((localPoint.y - statesStartY) / CONSTRAINT_ROW_HEIGHT);
      if (index >= 0 && index < states.length) {
        return { elementId: element.id, sectionIndex: 0, sectionId: "states", fieldIndex: index };
      }
      return null;
    }

    const index = findRuleIndexAt(layout, localPoint.y);
    if (index !== null) {
      return { elementId: element.id, sectionIndex: 1, sectionId: "rules", fieldIndex: index };
    }

    return null;
  },

  onDeleteSubSelect: (element, fieldIndex, sectionIndex = 0) => {
    const states = getConstraintStates(element.data);
    const rules = getConstraintRules(element.data);

    let nextData: ConstraintCardData;

    if (sectionIndex === 1) {
      if (fieldIndex < 0 || fieldIndex >= rules.length) return null;
      nextData = { ...element.data, rules: rules.filter((_, i) => i !== fieldIndex) };
    } else {
      if (fieldIndex < 0 || fieldIndex >= states.length) return null;
      nextData = { ...element.data, states: states.filter((_, i) => i !== fieldIndex) };
    }

    const nextSize = computeConstraintCardSize(nextData, element.width);
    return { height: nextSize.height, data: nextData };
  },

  getSelectedFieldItem: (element, field) => {
    if (field.sectionIndex === 1) {
      const rules = getConstraintRules(element.data);
      const rule = rules[field.fieldIndex];
      if (rule === undefined) return null;
      return { name: rule, type: "" };
    }
    const states = getConstraintStates(element.data);
    const state = states[field.fieldIndex];
    if (!state) return null;
    return { name: state.name, type: "" };
  },

  getSubSelectSections: (element) => [
    { id: "states", name: "states", count: getConstraintStates(element.data).length },
    { id: "rules", name: "rules", count: getConstraintRules(element.data).length },
  ],

  getInlineEditTarget: (element, localPoint): InlineEditState | null => {
    // 1. Header -> edit constraint name
    if (localPoint.y <= CONSTRAINT_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: toDisplayName(element.data?.name) || "Constraint",
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

    const layout = computeConstraintLayout(element.data, element.width);
    const { states, rules, ruleRows, statesStartY } = layout;

    // 2. States row -> select it (the state is chosen from the options bar)
    const statesEndY = getStatesEndY(layout);
    if (localPoint.y >= statesStartY && localPoint.y < statesEndY) {
      const index = Math.floor((localPoint.y - statesStartY) / CONSTRAINT_ROW_HEIGHT);
      if (index >= 0 && index < states.length) {
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "states",
          fieldIndex: index,
        });
      }
      return null;
    }

    // 3. Rules row -> inline-edit the rule text
    const index = findRuleIndexAt(layout, localPoint.y);
    if (index !== null) {
      const text = rules[index];
      const rowTop = getRuleRowTop(layout, index);
      const lineCount = ruleRows[index].lines.length;
      useCanvasStore.getState().setSelectedField({
        elementId: element.id,
        sectionIndex: 1,
        sectionId: "rules",
        fieldIndex: index,
      });
      return {
        elementId: element.id,
        worldBounds: {
          // Stretch the editor nearly edge-to-edge. Its height tracks the
          // wrapped line count (plus room for the textarea's own padding and
          // border) so the full text shows without an inner scrollbar.
          x: element.x + 4,
          y: element.y + rowTop + 2,
          width: Math.max(80, element.width - 8),
          height: Math.max(24, lineCount * CONSTRAINT_RULE_LINE_HEIGHT + 10),
        },
        initialValue: text,
        // Rules wrap onto multiple lines on the card, so let the editor grow to
        // match the row (Enter commits, Shift+Enter inserts a line break).
        multiline: true,
        onCommit: (newValue) => {
          const trimmed = newValue.trim();
          if (trimmed && trimmed !== text) {
            const nextRules = [...rules];
            nextRules[index] = trimmed;
            const nextData = { ...element.data, rules: nextRules };
            useCanvasStore.getState().updateElement(element.id, {
              data: nextData,
              height: computeConstraintCardSize(nextData, element.width).height,
            });
          }
        },
      };
    }

    return null;
  },

  ai: {
    toolName: "create_constraint_card",
    description:
      "Create a Constraint card declaring business invariants over one or more State cards. Sections: `states` " +
      "(existing State card names it reads) and `rules` (plain-language invariants, e.g. 'The account must be " +
      "active' — never field-name notation). A rule is an INPUT gate: it must be checkable from the " +
      "Command/Query inputs plus the referenced State, and must not describe data storage or the event " +
      "payload. A rule is NOT data validation — do not write required/type/format/empty checks like 'field " +
      "must not be empty'. The State params a rule compares must be supplied by that Command's inputs / " +
      "Query's params. Call get_canvas_overview first; unknown state names are rejected.",
    parameters: z.object({
      name: z.string().describe("PascalCase constraint name (e.g. AccountMustBeActive)"),
      states: z
        .array(z.string())
        .optional()
        .describe("Names of existing State cards this constraint reads"),
      rules: z
        .array(z.string())
        .optional()
        .describe(
          "Plain-language business invariants (one per entry), e.g. 'The account must be active'. Each " +
            "must be checkable from the Command/Query inputs plus the referenced State; never describe " +
            "storage or the event payload, and never write data validation like required/empty/format checks.",
        ),
      color: z.string().optional().describe("Optional hex color"),
      description: z.string().optional().describe("Description of the constraint"),
    }),
    onCreate: (params, center: Point): CanvasElement<ConstraintCardData> => {
      const states: ConstraintState[] = (params.states || [])
        .map((name: string) => ({ name: (name || "").trim() }))
        .filter((s: ConstraintState) => s.name.length > 0);

      const rules: string[] = (params.rules || [])
        .map((rule: string) => (rule ?? "").toString().trim())
        .filter((rule: string) => rule.length > 0);

      const data: ConstraintCardData = {
        name: params.name || "Constraint",
        states,
        rules,
        color: params.color || constraintCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };

      const size = computeConstraintCardSize(data);
      return {
        id: `constraint-${nanoid(6)}`,
        type: "constraintCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
