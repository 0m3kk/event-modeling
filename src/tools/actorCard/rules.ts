import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "../types";
import { getElementName, nameKey } from "@/utils/naming";
import { memoizeArray } from "@/utils/memo";
import {
  actionKey,
  boardActionsByKey,
  collectBoardActions,
  isMatchAllPattern,
  isWildcard,
  matchesAction,
  strictlySubsumesAction,
} from "@/utils/rbac";

/**
 * Actor card: the RBAC side of the model.
 *
 * An Actor holds `permissions` — a list of action patterns referring to the
 * `action` tokens declared on Command/Query cards. A pattern is either an exact
 * token (`sales:placeOrder`) or a `*` wildcard (`sales:*`, `*:getOrder`); a bare
 * match-all pattern (`*`, `*:*`) is forbidden.
 */

export interface ActorPermission {
  /** Exact action token or wildcard pattern (e.g. `sales:*`). */
  action: string;
}

export interface ActorCardData {
  name: string;
  description?: string;
  permissions?: ActorPermission[];
  color?: string;
}

export function getActorPermissions(data: ActorCardData): ActorPermission[] {
  return Array.isArray(data.permissions) ? data.permissions : [];
}

/** An Actor card on the board plus its name. */
export interface BoardActor {
  id: string;
  name: string;
  data: ActorCardData;
}

/** Every Actor card on the board. Memoized by board; treat the result as read-only. */
export function collectBoardActors(elements: CanvasElement[]): BoardActor[] {
  return collectBoardActorsMemo(elements);
}

const collectBoardActorsMemo = memoizeArray((elements: CanvasElement[]) => {
  const actors: BoardActor[] = [];
  for (const el of elements ?? []) {
    if (el.type !== "actorCard") continue;
    const name = getElementName(el) ?? "";
    if (!name) continue;
    actors.push({ id: el.id, name, data: (el.data ?? {}) as ActorCardData });
  }
  return actors;
});

/** Actor cards indexed by normalized name. Memoized and shared. */
export function boardActorsByName(elements: CanvasElement[]): Map<string, BoardActor> {
  return boardActorsByNameMemo(elements);
}

const boardActorsByNameMemo = memoizeArray((elements: CanvasElement[]) => {
  const byName = new Map<string, BoardActor>();
  for (const actor of collectBoardActors(elements)) {
    const key = nameKey(actor.name);
    if (key && !byName.has(key)) byName.set(key, actor);
  }
  return byName;
});

export interface ActorValidationContext {
  /** All elements currently on the board (used to resolve actions). */
  elements: CanvasElement[];
}

/**
 * Normalized permissions after dropping the safely-repairable problems
 * (empty rows, forbidden match-all patterns, unknown actions, exact duplicates,
 * and permissions fully covered by a broader one). Partial overlaps — where
 * neither permission covers the other — are kept, since collapsing them would
 * silently change intent; they are reported instead.
 */
function repairPermissions(
  permissions: ActorPermission[],
  boardKeys: readonly string[],
): ActorPermission[] {
  const drop = new Set<number>();
  for (let i = 0; i < permissions.length; i += 1) {
    for (let j = 0; j < permissions.length; j += 1) {
      if (i === j) continue;
      if (strictlySubsumesAction(permissions[j].action, permissions[i].action, boardKeys)) {
        drop.add(i);
        break;
      }
    }
  }
  return permissions.filter((_, i) => !drop.has(i));
}

/**
 * Validates an Actor card against the board:
 * - every permission must be a non-empty pattern that matches at least one
 *   declared action (or, when exact, an existing action);
 * - match-all patterns (`*`, `*:*`) are forbidden;
 * - permissions within one actor must not overlap.
 *
 * Returns a repaired copy (invalid/forbidden/duplicate/subsumed permissions
 * dropped) plus the issues found. Callers decide whether to repair (store) or
 * reject (AI): the AI path rejects on any issue, the board path applies the
 * repaired data.
 */
export function validateActorCardData(
  data: ActorCardData,
  ctx: ActorValidationContext,
): { data: ActorCardData; issues: ValidationIssue[] } {
  const elements = ctx.elements ?? [];
  const issues: ValidationIssue[] = [];
  const byKey = boardActionsByKey(elements);
  const boardKeys = collectBoardActions(elements).map((a) => a.key);

  const seen = new Set<string>();
  const cleaned: ActorPermission[] = [];

  getActorPermissions(data).forEach((perm, index) => {
    const raw = typeof perm?.action === "string" ? perm.action.trim() : "";
    const path = `permissions[${index}].action`;

    if (!raw) {
      issues.push({ path, code: "permission_empty", message: "Permission action is empty." });
      return;
    }
    if (isMatchAllPattern(raw)) {
      issues.push({
        path,
        code: "wildcard_all_forbidden",
        message: `Permission "${raw}" grants every action. Use a namespaced pattern such as "sales:*".`,
      });
      return;
    }

    const dupKey = raw.toLowerCase();
    if (seen.has(dupKey)) {
      issues.push({
        path,
        code: "duplicate_permission",
        message: `Permission "${raw}" is listed more than once.`,
      });
      return;
    }
    seen.add(dupKey);

    if (!isWildcard(raw)) {
      if (!byKey.has(actionKey(raw))) {
        issues.push({
          path,
          code: "action_not_found",
          message: `No Command/Query on the board declares the action "${raw}".`,
        });
        return;
      }
    } else if (!boardKeys.some((k) => matchesAction(raw, k))) {
      issues.push({
        path,
        code: "wildcard_matches_nothing",
        message: `Permission "${raw}" matches no action on the board.`,
      });
      return;
    }

    cleaned.push({ action: raw });
  });

  // Overlap: any two permissions that match a common action. Reported as an
  // error; the repair below drops only strictly subsumed ones.
  for (let i = 0; i < cleaned.length; i += 1) {
    for (let j = i + 1; j < cleaned.length; j += 1) {
      const overlaps = boardKeys.some(
        (k) => matchesAction(cleaned[i].action, k) && matchesAction(cleaned[j].action, k),
      );
      if (overlaps) {
        issues.push({
          path: `permissions[${j}].action`,
          code: "permission_overlap",
          message: `Permission "${cleaned[j].action}" overlaps "${cleaned[i].action}".`,
        });
      }
    }
  }

  return { data: { ...data, permissions: repairPermissions(cleaned, boardKeys) }, issues };
}

export interface ActorAllowingEntry {
  actor: string;
  /** The pattern that grants the action. */
  pattern: string;
}

/** Every actor that can execute the given action. */
export function actorsAllowing(
  actionKeyValue: string,
  elements: CanvasElement[],
): ActorAllowingEntry[] {
  const out: ActorAllowingEntry[] = [];
  for (const actor of collectBoardActors(elements)) {
    const match = getActorPermissions(actor.data).find((p) =>
      matchesAction(p.action, actionKeyValue),
    );
    if (match) out.push({ actor: actor.name, pattern: match.action });
  }
  return out;
}

/** Indices of permissions that overlap another permission in the same actor. */
export function overlappingPermissionIndices(
  permissions: ActorPermission[],
  boardKeys: readonly string[],
): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < permissions.length; i += 1) {
    for (let j = 0; j < permissions.length; j += 1) {
      if (i === j) continue;
      const shares = boardKeys.some(
        (k) => matchesAction(permissions[i].action, k) && matchesAction(permissions[j].action, k),
      );
      if (shares) overlapping.add(i);
    }
  }
  return overlapping;
}
