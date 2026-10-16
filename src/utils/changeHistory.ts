/**
 * Builds a display-oriented change history from a raw event log.
 *
 * The log stores forward-only patches; "before" values are resolved here by
 * replaying the log once, so the log itself stays small.
 */
import type { ChangeSet, ModelElement } from "@/types";
import { applyOps, getByPointer } from "./modelDiff";

export interface HistoryField {
  path: string;
  before: unknown;
  after: unknown;
}

export type HistoryItem =
  | { kind: "created"; id: string; type: string; model: ModelElement }
  | { kind: "updated"; id: string; type: string; fields: HistoryField[] }
  | { kind: "deleted"; id: string; type: string; model: ModelElement }
  | { kind: "cleared" };

export interface HistoryEntry {
  cs: ChangeSet;
  items: HistoryItem[];
}

/** Replays the log, returning per-change-set items with resolved before/after. */
export function buildChangeHistory(
  log: ChangeSet[],
  base: ModelElement[] = [],
): HistoryEntry[] {
  const state = new Map<string, ModelElement>();
  for (const el of base) state.set(el.id, el);

  const entries: HistoryEntry[] = [];
  for (const cs of log) {
    const items: HistoryItem[] = [];
    for (const event of cs.events) {
      switch (event.t) {
        case "created":
          state.set(event.el.id, event.el);
          items.push({
            kind: "created",
            id: event.el.id,
            type: event.el.type,
            model: event.el,
          });
          break;
        case "patched": {
          const before = state.get(event.id);
          if (!before) break;
          const fields: HistoryField[] = event.ops.map((op) => ({
            path: op.path,
            before: getByPointer(before, op.path),
            after: op.op === "remove" ? undefined : op.value,
          }));
          state.set(event.id, applyOps(before, event.ops));
          items.push({ kind: "updated", id: event.id, type: before.type, fields });
          break;
        }
        case "deleted": {
          const before = state.get(event.id);
          if (!before) break;
          state.delete(event.id);
          items.push({ kind: "deleted", id: event.id, type: before.type, model: before });
          break;
        }
        case "board.cleared":
          state.clear();
          items.push({ kind: "cleared" });
          break;
      }
    }
    entries.push({ cs, items });
  }
  return entries;
}
