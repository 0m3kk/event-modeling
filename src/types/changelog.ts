/**
 * Change-log (event-sourced modeling) types.
 *
 * The board's *modeling* data (card data, type, reference/membership links) is
 * stored as an ordered log of small deltas instead of a final-state snapshot.
 * Anything that is purely presentation — geometry, colours, viewport — lives in
 * a separate {@link UiSidecar} and never enters the log, so a change history
 * only ever reports what was modelled.
 */

/** A card reduced to its modeling fields (no geometry, no colour). */
export interface ModelElement {
  id: string;
  type: string;
  data: Record<string, unknown>;
  referenceId?: string;
  isOriginal?: boolean;
  groupId?: string;
  sliceId?: string;
  laneId?: string;
  domainId?: string;
}

/** A single JSON-Pointer edit applied to a {@link ModelElement}. */
export type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown };

/** A forward-only modeling event. Applying the whole log rebuilds the board. */
export type ModelEvent =
  | { t: "created"; el: ModelElement }
  | { t: "patched"; id: string; ops: PatchOp[] }
  | { t: "deleted"; id: string }
  | { t: "board.cleared" };

/**
 * A group of modeling events committed together. One change set is the unit
 * shown in the change log: an AI turn, or a short burst of user edits.
 */
export interface ChangeSet {
  id: string;
  /** Monotonic sequence within a project; used to bound log replay. */
  seq: number;
  /** ISO timestamp of the commit. */
  at: string;
  actor: "user" | "ai";
  /** Human label: the AI prompt, or a short action name for user edits. */
  label?: string;
  events: ModelEvent[];
}

/** Presentation-only geometry kept out of the log. */
export interface ElementGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  locked?: boolean;
}

/** Presentation-only state: geometry, colours and the viewport. */
export interface UiSidecar {
  viewport: { x: number; y: number; zoom: number };
  geometry: Record<string, ElementGeometry>;
  color: Record<string, string>;
}

/** A materialized modeling state at a given sequence, to speed up loading. */
export interface ProjectSnapshot {
  seq: number;
  elements: ModelElement[];
}

/** The v3 project file: an event log plus a presentation sidecar. */
export interface ProjectFileV3 {
  format: "eventmodel";
  version: 3;
  meta: { id: string; name: string; createdAt: string; updatedAt: string };
  log: ChangeSet[];
  snapshot: ProjectSnapshot | null;
  ui: UiSidecar;
}
