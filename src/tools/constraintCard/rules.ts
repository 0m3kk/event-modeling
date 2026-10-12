import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import { nameKey } from "@/utils/naming";

/**
 * A Constraint card declares business rules that must hold over one or more
 * State cards. It has two sections:
 * - `states`: the State cards this constraint reads from (picked from the board);
 * - `rules`: free-text INPUT preconditions, one per row, written in plain language
 *   (e.g. "The account must be active"). A rule gates the command/query and decides
 *   whether the event is emitted, so it describes an input check — not how data is
 *   stored or what the event payload contains. Rules are intentionally unstructured
 *   so they stay readable; each row is edited inline.
 */

/** A State card referenced by the constraint (kept by name, like DCB tags). */
export interface ConstraintState {
  name: string;
  description?: string;
}

export interface ConstraintCardData {
  name: string;
  states?: ConstraintState[];
  /** One free-text rule per entry. */
  rules?: string[];
  color?: string;
  description?: string;
}

export function getConstraintStates(data: ConstraintCardData): ConstraintState[] {
  return Array.isArray(data.states) ? data.states : [];
}

/** Returns the free-text rules as strings, ignoring any malformed entries. */
export function getConstraintRules(data: ConstraintCardData): string[] {
  return Array.isArray(data.rules)
    ? data.rules.filter((r): r is string => typeof r === "string")
    : [];
}

/** A State card on the board plus the field names it exposes. */
export interface BoardStateCard {
  id: string;
  name: string;
  /** Union of the card's param and state field names, de-duplicated. */
  fields: string[];
}

/**
 * Scans the board for State cards and the field names they expose (params +
 * projected states), so a constraint can offer valid targets and validate refs.
 */
export function collectBoardStateCards(elements: CanvasElement[]): BoardStateCard[] {
  const cards: BoardStateCard[] = [];

  for (const el of elements) {
    if (el.type !== "stateCard") continue;
    const name = typeof el.data?.name === "string" ? el.data.name.trim() : "";
    if (!name) continue;

    const params = Array.isArray(el.data?.params) ? el.data.params : [];
    const states = Array.isArray(el.data?.states) ? el.data.states : [];
    const fields = [...params, ...states]
      .map((f: { name?: unknown }) => (typeof f?.name === "string" ? f.name.trim() : ""))
      .filter((n: string) => n.length > 0);

    cards.push({ id: el.id, name, fields: Array.from(new Set(fields)) });
  }

  return cards;
}

export interface ConstraintValidationContext {
  /** All elements currently on the board (used to resolve state cards). */
  elements: CanvasElement[];
}

/**
 * Enforces the Constraint card invariants:
 * - every listed state must resolve to a State card on the board;
 * - rules are free text, so only blank rows are dropped.
 *
 * Returns a normalized copy (blank/duplicate states and blank rules dropped)
 * plus the list of issues. Callers decide whether to repair (store) or reject
 * (AI) based on the result.
 */
export function validateConstraintCardData(
  data: ConstraintCardData,
  ctx: ConstraintValidationContext,
): { data: ConstraintCardData; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const board = collectBoardStateCards(ctx.elements ?? []);

  const boardByName = new Map<string, BoardStateCard>();
  for (const card of board) {
    const key = nameKey(card.name);
    if (key && !boardByName.has(key)) boardByName.set(key, card);
  }

  // 1. Normalize the states section: drop blanks/duplicates, flag unknown cards.
  const seenKeys = new Set<string>();
  const nextStates: ConstraintState[] = [];

  getConstraintStates(data).forEach((state, index) => {
    const name = (state?.name || "").trim();
    const path = `states[${index}].name`;

    if (!name) {
      issues.push({ path, code: "state_name_missing", message: "Constraint state name is empty." });
      return;
    }

    const key = nameKey(name);
    if (seenKeys.has(key)) {
      issues.push({
        path,
        code: "state_duplicate",
        message: `State "${name}" is listed more than once.`,
      });
      return;
    }
    seenKeys.add(key);

    if (!boardByName.has(key)) {
      issues.push({
        path,
        code: "state_not_found",
        message: `State card "${name}" does not exist on the board.`,
      });
    }

    nextStates.push({
      name,
      ...(state.description ? { description: state.description } : {}),
    });
  });

  // 2. Normalize the rules section: rules are free text, so just drop blanks.
  const nextRules: string[] = [];

  getConstraintRules(data).forEach((rule, index) => {
    const text = (rule || "").trim();
    if (!text) {
      issues.push({
        path: `rules[${index}]`,
        code: "rule_empty",
        message: "Constraint rule text is empty.",
      });
      return;
    }
    nextRules.push(text);
  });

  return { data: { ...data, states: nextStates, rules: nextRules }, issues };
}
