import { ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { nameKey } from "@/utils/naming";
import { ConstraintCardOptions } from "./ConstraintCardOptions";
import {
  renderStandardCardTitle,
  renderHeaderDescBadge,
  CARD_CORNER_RADIUS,
} from "../common/cardLayout";
import { beginDescZones, hitDescZone } from "../common/descZones";
import {
  collectBoardStateCards,
  getConstraintStates,
  getConstraintRules,
  validateConstraintCardData,
  type ConstraintCardData,
  type ConstraintState,
} from "./rules";

export const CONSTRAINT_HEADER_HEIGHT = 32;
export const CONSTRAINT_SECTION_HEADER_HEIGHT = 22;
export const CONSTRAINT_ROW_HEIGHT = 28;
export const CONSTRAINT_DEFAULT_WIDTH = 260;

export type { ConstraintCardData, ConstraintState } from "./rules";
export {
  getConstraintStates,
  getConstraintRules,
  collectBoardStateCards,
} from "./rules";

interface ConstraintLayout {
  states: ConstraintState[];
  rules: string[];
  statesCount: number;
  rulesCount: number;
  statesStartY: number;
  rulesHeaderY: number;
  rulesStartY: number;
}

/** Row geometry shared by the renderer, hit-testing and inline editing. */
function computeLayout(data: ConstraintCardData): ConstraintLayout {
  const states = getConstraintStates(data);
  const rules = getConstraintRules(data);
  const statesCount = Math.max(1, states.length);
  const rulesCount = Math.max(1, rules.length);

  const statesStartY = CONSTRAINT_HEADER_HEIGHT + CONSTRAINT_SECTION_HEADER_HEIGHT;
  const rulesHeaderY = statesStartY + statesCount * CONSTRAINT_ROW_HEIGHT;
  const rulesStartY = rulesHeaderY + CONSTRAINT_SECTION_HEADER_HEIGHT;

  return { states, rules, statesCount, rulesCount, statesStartY, rulesHeaderY, rulesStartY };
}

export function computeConstraintCardSize(
  data: ConstraintCardData,
  customWidth = CONSTRAINT_DEFAULT_WIDTH,
): { width: number; height: number } {
  const { rulesStartY, rulesCount } = computeLayout(data);
  return { width: customWidth, height: rulesStartY + rulesCount * CONSTRAINT_ROW_HEIGHT };
}

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
    text: state.name,
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

/** One RULES row: a free-text assertion, left-aligned on the row. */
function renderRuleRow(
  container: Container,
  opts: {
    text: string;
    rowY: number;
    isDark: boolean;
    isSelectedRow: boolean;
    textResolution: number;
  },
): void {
  const { text, rowY, isDark, isSelectedRow, textResolution } = opts;

  const rule = new Text({
    text,
    style: {
      fontSize: 12,
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
  rule.y = rowY + 7;
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
    "A Constraint: declares free-text rules over the fields of one or more State cards (e.g. AccountStatus.status must be active)",
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
  defaultSize: { width: CONSTRAINT_DEFAULT_WIDTH, height: 132 },

  computeSize: (data) => computeConstraintCardSize(data),

  optionsBar: ConstraintCardOptions,

  normalizeData: (data, context) => validateConstraintCardData(data, context).data,

  validateData: (data, context) => validateConstraintCardData(data, context),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = element.data.color || constraintCardTool.color;
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;

    const { states, rules, rulesCount, statesStartY, rulesHeaderY, rulesStartY } =
      computeLayout(element.data);

    const boardByName = new Map(
      collectBoardStateCards(useCanvasStore.getState().elements).map((card) => [
        nameKey(card.name),
        card,
      ]),
    );

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
      let isBottomRow = false;

      if (activeSection === 0 && activeFieldIndex < states.length) {
        rowY = statesStartY + activeFieldIndex * CONSTRAINT_ROW_HEIGHT;
      } else if (activeSection === 1 && activeFieldIndex < rules.length) {
        rowY = rulesStartY + activeFieldIndex * CONSTRAINT_ROW_HEIGHT;
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
          g.rect(0, rowY, w, CONSTRAINT_ROW_HEIGHT);
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

    // 8. Rules rows
    if (rules.length > 0) {
      rules.forEach((rule, idx) => {
        renderRuleRow(container, {
          text: rule,
          rowY: rulesStartY + idx * CONSTRAINT_ROW_HEIGHT,
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
      empty.y = rulesStartY + 7;
      container.addChild(empty);
    }
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const { states, rules, statesStartY, rulesStartY } = computeLayout(element.data);

    const statesEndY = statesStartY + Math.max(1, states.length) * CONSTRAINT_ROW_HEIGHT;
    if (localPoint.y >= statesStartY && localPoint.y < statesEndY) {
      if (states.length === 0) return null;
      const index = Math.floor((localPoint.y - statesStartY) / CONSTRAINT_ROW_HEIGHT);
      if (index >= 0 && index < states.length) {
        return { elementId: element.id, sectionIndex: 0, sectionId: "states", fieldIndex: index };
      }
      return null;
    }

    const rulesEndY = rulesStartY + Math.max(1, rules.length) * CONSTRAINT_ROW_HEIGHT;
    if (localPoint.y >= rulesStartY && localPoint.y < rulesEndY) {
      if (rules.length === 0) return null;
      const index = Math.floor((localPoint.y - rulesStartY) / CONSTRAINT_ROW_HEIGHT);
      if (index >= 0 && index < rules.length) {
        return { elementId: element.id, sectionIndex: 1, sectionId: "rules", fieldIndex: index };
      }
      return null;
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

    const nextSize = computeConstraintCardSize(nextData);
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
        initialValue: element.data?.name || "Constraint",
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

    const { states, rules, statesStartY, rulesStartY } = computeLayout(element.data);

    // 2. States row -> select it (the state is chosen from the options bar)
    const statesEndY = statesStartY + Math.max(1, states.length) * CONSTRAINT_ROW_HEIGHT;
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
    const rulesEndY = rulesStartY + Math.max(1, rules.length) * CONSTRAINT_ROW_HEIGHT;
    if (localPoint.y >= rulesStartY && localPoint.y < rulesEndY) {
      const index = Math.floor((localPoint.y - rulesStartY) / CONSTRAINT_ROW_HEIGHT);
      if (index >= 0 && index < rules.length) {
        const text = rules[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 1,
          sectionId: "rules",
          fieldIndex: index,
        });
        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 8,
            y: element.y + rulesStartY + index * CONSTRAINT_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 16),
            height: 24,
          },
          initialValue: text,
          multiline: false,
          onCommit: (newValue) => {
            const trimmed = newValue.trim();
            if (trimmed && trimmed !== text) {
              const nextRules = [...rules];
              nextRules[index] = trimmed;
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, rules: nextRules },
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
    toolName: "create_constraint_card",
    description:
      "Create a Constraint card that declares rules over the fields of one or more State cards. " +
      "It has two sections: states (the State cards this constraint reads from, referenced by name) " +
      "and rules (free-text assertions, e.g. 'AccountStatus.status must be active'). " +
      "RULE: every entry in `states` must match the name of an existing State card on the board; use " +
      "get_canvas_overview to discover existing State cards and their fields first. The card is rejected " +
      "if a state is unknown.",
    parameters: z.object({
      name: z.string().describe("PascalCase constraint name (e.g. AccountMustBeActive)"),
      states: z
        .array(z.string())
        .optional()
        .describe("Names of the State cards this constraint reads from (must exist on the board)"),
      rules: z
        .array(z.string())
        .optional()
        .describe(
          "Free-text rules, one per entry (e.g. 'AccountStatus.status must be active')",
        ),
      color: z.string().optional().describe("Optional header color hex code"),
      description: z.string().optional().describe("Optional plain-language description of the constraint"),
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
