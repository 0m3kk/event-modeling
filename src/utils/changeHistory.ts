/**
 * Builds a display-oriented change history from a raw event log.
 *
 * The log stores forward-only patches; "before" values are resolved here by
 * replaying the log once, so the log itself stays small.
 *
 * The history is *net* per change set: a card created and then edited by the
 * same AI turn appears once as "created", and repeated edits collapse into the
 * final before → after. Internal bookkeeping that a modeller cannot act on
 * (`referenceId`, `isOriginal`, colour, lane ids) is dropped.
 */
import type { ChangeSet, ModelElement } from "@/types";
import { applyOps, deepEqual, diffModelElement, getByPointer } from "./modelDiff";
import { getElementName } from "./naming";

export interface HistoryField {
  path: string;
  before: unknown;
  after: unknown;
}

/** A container a card belongs to, resolved to something a human recognises. */
export type MembershipTarget =
  | { kind: "group" | "slice" | "domain"; name?: string }
  | { kind: "lane"; childType?: string | null; sliceName?: string; index: number };

export type HistoryItem =
  | { kind: "created"; id: string; type: string; model: ModelElement }
  | {
      kind: "updated";
      id: string;
      type: string;
      /** The card at the start of the change set. */
      before: ModelElement;
      /** The card at the end of the change set. */
      model: ModelElement;
      fields: HistoryField[];
    }
  | { kind: "deleted"; id: string; type: string; model: ModelElement }
  | { kind: "cleared" };

export interface HistoryEntry {
  cs: ChangeSet;
  items: HistoryItem[];
  /**
   * Membership ids referenced by this change set, resolved while the replay
   * still knows the container's name/lane type.
   */
  targets: Record<string, MembershipTarget>;
}

/** Membership paths and the kind of container they point at. */
const MEMBERSHIP_KINDS: Record<string, MembershipTarget["kind"]> = {
  "/groupId": "group",
  "/sliceId": "slice",
  "/laneId": "lane",
  "/domainId": "domain",
};

/**
 * Paths that only describe internal bookkeeping. They are still in the log
 * (replay needs them) but never shown as modelling changes.
 */
const NOISE_PATHS = [
  /^\/referenceId$/,
  /^\/isOriginal$/,
  /^\/data\/color$/,
  /^\/data\/lanes\/\d+\/id$/,
];

export function isNoiseChange(path: string): boolean {
  return NOISE_PATHS.some((pattern) => pattern.test(path));
}

interface PendingItem {
  kind: "created" | "updated" | "deleted";
  id: string;
}

function dropPending(order: PendingItem[], kind: PendingItem["kind"], id: string): void {
  const index = order.findIndex((item) => item.kind === kind && item.id === id);
  if (index >= 0) order.splice(index, 1);
}

function indexBy(elements: ModelElement[]): Map<string, ModelElement> {
  return new Map(elements.map((element) => [element.id, element]));
}

/** Resolves a membership id against the board at the end, then the start. */
function resolveTarget(
  id: string,
  kind: MembershipTarget["kind"],
  after: Map<string, ModelElement>,
  before: Map<string, ModelElement>,
): MembershipTarget {
  if (kind === "lane") {
    for (const state of [after, before]) {
      for (const element of state.values()) {
        if (element.type !== "sliceCard") continue;
        const lanes = element.data?.lanes;
        if (!Array.isArray(lanes)) continue;
        const index = lanes.findIndex(
          (lane) => lane !== null && typeof lane === "object" && (lane as { id?: unknown }).id === id,
        );
        if (index < 0) continue;
        const lane = lanes[index] as { childType?: unknown };
        return {
          kind: "lane",
          childType: typeof lane.childType === "string" ? lane.childType : null,
          sliceName: getElementName(element),
          index,
        };
      }
    }
    return { kind: "lane", index: 0 };
  }

  for (const state of [after, before]) {
    const element = state.get(id);
    if (element) return { kind, name: getElementName(element) };
  }
  return { kind };
}

function collectTargets(
  fields: HistoryField[],
  after: Map<string, ModelElement>,
  before: Map<string, ModelElement>,
): Record<string, MembershipTarget> {
  const targets: Record<string, MembershipTarget> = {};
  for (const field of fields) {
    const kind = MEMBERSHIP_KINDS[field.path];
    if (!kind) continue;
    for (const value of [field.before, field.after]) {
      if (typeof value === "string" && value && !targets[value]) {
        targets[value] = resolveTarget(value, kind, after, before);
      }
    }
  }
  return targets;
}

/** The identity of a list item, matching the one used by the array diff. */
function listItemKey(item: unknown): string | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (typeof record.name === "string") return record.name;
  return null;
}

/**
 * Turns "the whole `fields` array was replaced" into one row per added or
 * removed field. Only safe when the remaining items are unchanged; otherwise
 * the caller keeps the readable whole-list row.
 */
function expandListChange(field: HistoryField): HistoryField[] {
  const tokens = field.path.split("/").slice(1);
  if (tokens.length !== 2 || tokens[0] !== "data") return [field];
  if (!Array.isArray(field.before) || !Array.isArray(field.after)) return [field];

  const before = field.before as unknown[];
  const after = field.after as unknown[];
  if (before.length === after.length) return [field];

  const beforeEntries = before.map((item, index) => ({ item, index, key: listItemKey(item) }));
  const afterEntries = after.map((item, index) => ({ item, index, key: listItemKey(item) }));
  if (
    beforeEntries.some((entry) => entry.key === null) ||
    afterEntries.some((entry) => entry.key === null)
  ) {
    return [field];
  }

  const afterByKey = new Map(afterEntries.map((entry) => [entry.key!, entry]));
  const beforeByKey = new Map(beforeEntries.map((entry) => [entry.key!, entry]));
  const rows: HistoryField[] = [];

  for (const entry of beforeEntries) {
    const next = afterByKey.get(entry.key!);
    if (!next) {
      rows.push({ path: `${field.path}/${entry.index}`, before: entry.item, after: undefined });
    } else if (!deepEqual(entry.item, next.item)) {
      // The same item was edited as well: keep the single whole-list row.
      return [field];
    }
  }
  for (const entry of afterEntries) {
    if (!beforeByKey.has(entry.key!)) {
      rows.push({ path: `${field.path}/${entry.index}`, before: undefined, after: entry.item });
    }
  }

  return rows.length > 0 ? rows : [field];
}

function resolveFields(
  before: ModelElement,
  after: ModelElement,
): HistoryField[] {
  return diffModelElement(before, after)
    .filter((op) => !isNoiseChange(op.path))
    .flatMap((op) => {
      const path = op.path;
      const fieldBefore = getByPointer(before, path);
      const fieldAfter = op.op === "remove" ? undefined : op.value;
      return expandListChange({ path, before: fieldBefore, after: fieldAfter });
    });
}

/**
 * Replays the log into per-change-set items with resolved before/after values.
 * Change sets that end up with no modelling effect are omitted entirely.
 */
export function buildChangeHistory(
  log: ChangeSet[],
  base: ModelElement[] = [],
): HistoryEntry[] {
  const state = indexBy(base);
  const entries: HistoryEntry[] = [];

  for (const cs of log) {
    const beforeState = new Map(state);
    const created = new Map<string, ModelElement>();
    const deleted = new Map<string, ModelElement>();
    /** First state of each element updated in this change set. */
    const updateBefore = new Map<string, ModelElement>();
    const order: PendingItem[] = [];
    let cleared = false;

    for (const event of cs.events) {
      switch (event.t) {
        case "board.cleared":
          state.clear();
          created.clear();
          deleted.clear();
          updateBefore.clear();
          order.length = 0;
          cleared = true;
          break;

        case "created": {
          const id = event.el.id;
          state.set(id, event.el);
          if (deleted.has(id)) {
            // Deleted then re-created in the same set: a net edit, not a create.
            const previous = deleted.get(id)!;
            deleted.delete(id);
            dropPending(order, "deleted", id);
            updateBefore.set(id, previous);
            order.push({ kind: "updated", id });
          } else {
            if (!created.has(id)) order.push({ kind: "created", id });
            created.set(id, event.el);
          }
          break;
        }

        case "patched": {
          const previous = state.get(event.id);
          if (!previous) break;
          const next = applyOps(previous, event.ops);
          state.set(event.id, next);
          if (created.has(event.id)) {
            // Fold edits into the creation instead of showing both.
            created.set(event.id, next);
          } else if (!deleted.has(event.id) && !updateBefore.has(event.id)) {
            updateBefore.set(event.id, previous);
            order.push({ kind: "updated", id: event.id });
          }
          break;
        }

        case "deleted": {
          const previous = state.get(event.id);
          if (!previous) break;
          state.delete(event.id);
          if (created.has(event.id)) {
            // Created and deleted in the same set: no net change.
            created.delete(event.id);
            dropPending(order, "created", event.id);
          } else {
            // Edits before a deletion collapse into the deletion itself.
            dropPending(order, "updated", event.id);
            updateBefore.delete(event.id);
            if (!deleted.has(event.id)) order.push({ kind: "deleted", id: event.id });
            deleted.set(event.id, previous);
          }
          break;
        }
      }
    }

    const items: HistoryItem[] = [];
    const targets: Record<string, MembershipTarget> = {};
    if (cleared) items.push({ kind: "cleared" });

    for (const pending of order) {
      if (pending.kind === "created") {
        const model = created.get(pending.id);
        if (!model) continue;
        items.push({ kind: "created", id: model.id, type: model.type, model });
        continue;
      }

      if (pending.kind === "deleted") {
        const model = deleted.get(pending.id);
        if (!model) continue;
        items.push({ kind: "deleted", id: model.id, type: model.type, model });
        continue;
      }

      const before = updateBefore.get(pending.id);
      const model = state.get(pending.id);
      if (!before || !model) continue;

      const fields = resolveFields(before, model);
      if (fields.length === 0) continue;

      Object.assign(targets, collectTargets(fields, state, beforeState));
      items.push({
        kind: "updated",
        id: model.id,
        type: model.type,
        before,
        model,
        fields,
      });
    }

    if (items.length > 0) entries.push({ cs, items, targets });
  }

  return entries;
}
