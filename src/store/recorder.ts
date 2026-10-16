/**
 * Change-log recorder: the in-memory event log for modeling changes.
 *
 * It is a tiny observable store (not part of the zustand canvas store) so that
 * persisting the log never trips the undo/redo history or re-renders the canvas.
 *
 * Grouping rules:
 * - While an explicit scope is open (an AI turn) every recorded event lands in
 *   one change set, however many tool calls the turn makes.
 * - Otherwise user edits accumulate in a pending change set that is committed
 *   once the user pauses for {@link USER_DEBOUNCE_MS}.
 */
import { useSyncExternalStore } from "react";
import { nanoid } from "nanoid";
import type { CanvasElement, ChangeSet, ModelEvent } from "@/types";
import { diffElements } from "@/utils/modelDiff";

/** How long a burst of user edits is coalesced before it becomes one change set. */
export const USER_DEBOUNCE_MS = 700;

interface PendingChangeSet {
  actor: "user" | "ai";
  label?: string;
  events: ModelEvent[];
}

interface Scope {
  actor: "user" | "ai";
  label?: string;
}

type Listener = () => void;

class ChangeLogRecorder {
  private log: ChangeSet[] = [];
  private pending: PendingChangeSet | null = null;
  private scope: Scope | null = null;
  private nextSeq = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable snapshot: the same array reference until the log changes. */
  getLog = (): ChangeSet[] => this.log;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private append(events: ModelEvent[], actor: "user" | "ai", label?: string): void {
    if (events.length === 0) return;
    if (!this.pending) this.pending = { actor, label, events: [] };
    if (this.scope) {
      this.pending.actor = this.scope.actor;
      this.pending.label = this.scope.label;
    }
    this.pending.events.push(...events);
    // Inside an explicit scope the commit happens on scope close.
    if (!this.scope) this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, USER_DEBOUNCE_MS);
  }

  /** Records the modeling difference between two board snapshots. */
  recordDiff(
    prev: CanvasElement[],
    next: CanvasElement[],
    label?: string,
    actor: "user" | "ai" = "user",
  ): void {
    this.append(diffElements(prev, next), actor, label);
  }

  /** Records an explicit board-cleared event. */
  recordBoardCleared(label = "Clear board"): void {
    this.append([{ t: "board.cleared" }], "user", label);
  }

  /** Opens an explicit scope (an AI turn) that groups every following event. */
  openScope(actor: "user" | "ai", label?: string): void {
    this.flush();
    this.scope = { actor, label };
  }

  /** Closes the current scope, committing its events as one change set. */
  closeScope(): void {
    this.flush();
    this.scope = null;
  }

  /** Commits any pending events immediately. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.events.length === 0) return;
    const changeSet: ChangeSet = {
      id: `cs-${nanoid(8)}`,
      seq: this.nextSeq++,
      at: new Date().toISOString(),
      actor: pending.actor,
      label: pending.label,
      events: pending.events,
    };
    this.log = [...this.log, changeSet];
    this.notify();
  }

  /** Replaces the whole log (on project load / new board). */
  setLog(log: ChangeSet[]): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
    this.scope = null;
    this.log = log;
    this.nextSeq = log.reduce((max, cs) => Math.max(max, cs.seq), 0) + 1;
    this.notify();
  }

  /** Clears the log back to empty. */
  reset(): void {
    this.setLog([]);
  }

  /** True while there are uncommitted events (used before saving). */
  hasPending(): boolean {
    return Boolean(this.pending && this.pending.events.length > 0);
  }
}

export const changeRecorder = new ChangeLogRecorder();

/** Subscribes a component to the committed change log. */
export function useChangeLog(): ChangeSet[] {
  return useSyncExternalStore(
    changeRecorder.subscribe,
    changeRecorder.getLog,
    changeRecorder.getLog,
  );
}
