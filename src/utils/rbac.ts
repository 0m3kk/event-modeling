import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "@/tools/types";
import { getElementName } from "./naming";
import { memoizeArray } from "./memo";

/**
 * RBAC modeling helpers.
 *
 * A Command or Query card declares an `action` — a canonical permission token
 * such as `sales:placeOrder`. Actor cards hold `permissions` that reference those
 * actions, optionally through a `*` wildcard (`sales:*`, `*:getOrder`). This
 * module owns the token matching rules and the board-wide action index; it is
 * deliberately free of any Actor-card shape so both `rename.ts` and the Actor card
 * can depend on it without an import cycle.
 */

/** Card types that define an action (the RBAC "resource"). */
export const RBAC_RESOURCE_TYPES: ReadonlySet<string> = new Set(["commandCard", "queryCard"]);

export type RbacResourceType = "commandCard" | "queryCard";

/** One action declared by a Command/Query card on the board. */
export interface BoardAction {
  /** The token exactly as authored (used for display). */
  action: string;
  /** Normalized join key ({@link actionKey}). */
  key: string;
  cardId: string;
  cardType: RbacResourceType;
  cardName: string;
}

/**
 * Join key for an action token. Lower-cased and trimmed only — unlike
 * {@link nameKey}, it must preserve the `:` namespace separator and the `*`
 * wildcard, so it never splits on those characters.
 */
export function actionKey(action: string | undefined | null): string {
  return (action ?? "").trim().toLowerCase();
}

/** True when a permission references actions through a `*` wildcard. */
export function isWildcard(action: string | undefined | null): boolean {
  return typeof action === "string" && action.includes("*");
}

/**
 * A "match-all" pattern (only `*` and `:` characters: `*`, `*:*`, `**`). Granting
 * one of these hands over every action on the board, so they are forbidden — a
 * permission must contain at least one literal character (a namespace or verb).
 */
export function isMatchAllPattern(action: string | undefined | null): boolean {
  const p = (action ?? "").trim();
  return p.length > 0 && /^[*:]+$/.test(p);
}

/** Escapes regular-expression metacharacters so a literal token is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tests whether a permission `pattern` matches a concrete action key.
 * Only `*` is special (it matches any run of characters); every other character
 * is literal and the match is case-insensitive.
 */
export function matchesAction(pattern: string, key: string): boolean {
  const p = (pattern ?? "").trim().toLowerCase();
  if (!p.includes("*")) return p === key;
  const body = p.split("*").map(escapeRegExp).join(".*");
  try {
    return new RegExp(`^${body}$`).test(key);
  } catch {
    return false;
  }
}

/** The `action` of a Command/Query element, trimmed ("" when absent). */
export function getElementAction(el: { type?: string; data?: any }): string {
  if (!el || !RBAC_RESOURCE_TYPES.has(el.type ?? "")) return "";
  const value = el.data?.action;
  return typeof value === "string" ? value.trim() : "";
}

/** Every action declared by the Command/Query cards on the board. Memoized by board. */
export function collectBoardActions(elements: CanvasElement[]): BoardAction[] {
  return collectBoardActionsMemo(elements);
}

const collectBoardActionsMemo = memoizeArray(computeBoardActions);

function computeBoardActions(elements: CanvasElement[]): BoardAction[] {
  const list: BoardAction[] = [];
  for (const el of elements ?? []) {
    if (!RBAC_RESOURCE_TYPES.has(el.type)) continue;
    const action = getElementAction(el);
    if (!action) continue;
    list.push({
      action,
      key: actionKey(action),
      cardId: el.id,
      cardType: el.type as RbacResourceType,
      cardName: getElementName(el) ?? el.id,
    });
  }
  return list;
}

/**
 * The declared actions indexed by {@link actionKey}, so callers can resolve a
 * permission and detect duplicate declarations. Memoized and shared — treat the
 * result as read-only.
 */
export function boardActionsByKey(elements: CanvasElement[]): Map<string, BoardAction[]> {
  return boardActionsByKeyMemo(elements);
}

const boardActionsByKeyMemo = memoizeArray((elements: CanvasElement[]) => {
  const byKey = new Map<string, BoardAction[]>();
  for (const entry of collectBoardActions(elements)) {
    const list = byKey.get(entry.key);
    if (list) list.push(entry);
    else byKey.set(entry.key, [entry]);
  }
  return byKey;
});

/**
 * Tests whether permission `broad` grants every action that `narrow` grants,
 * using the concrete actions on the board. A `narrow` pattern that matches
 * nothing is treated as subsumed (nothing to grant).
 */
export function subsumesAction(
  broad: string,
  narrow: string,
  boardKeys: readonly string[],
): boolean {
  if (boardKeys.length === 0) return false;
  for (const key of boardKeys) {
    if (matchesAction(narrow, key) && !matchesAction(broad, key)) return false;
  }
  return true;
}

/** Strict subsumption: `broad` covers `narrow`, and they are not equivalent. */
export function strictlySubsumesAction(
  broad: string,
  narrow: string,
  boardKeys: readonly string[],
): boolean {
  return (
    subsumesAction(broad, narrow, boardKeys) && !subsumesAction(narrow, broad, boardKeys)
  );
}

/**
 * Validates an `action` declared on a Command/Query card: it must be a concrete
 * token (no wildcard — those belong on Actor permissions) and must be unique
 * across the board. Returns no issues for an empty action (optional field).
 */
export function validateActionToken(
  action: string | undefined | null,
  elements: CanvasElement[],
): ValidationIssue[] {
  const raw = (action ?? "").trim();
  if (!raw) return [];

  const issues: ValidationIssue[] = [];
  if (isWildcard(raw)) {
    issues.push({
      path: "action",
      code: "action_has_wildcard",
      message: `Action "${raw}" must be a concrete token; wildcards belong on Actor permissions.`,
    });
  }
  const key = actionKey(raw);
  const clash = collectBoardActions(elements).find((a) => a.key === key);
  if (clash) {
    issues.push({
      path: "action",
      code: "action_duplicate",
      message: `Action "${raw}" is already declared by "${clash.cardName}".`,
    });
  }
  return issues;
}
