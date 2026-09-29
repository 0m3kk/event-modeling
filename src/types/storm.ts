/**
 * Domain definitions for Event Storming cards
 */

import type { FieldValidation } from "./validation";

/**
 * Event storming card kind.
 *
 * `bdd` is the Given/When/Then scenario step card. Its `phase`
 * (given/when/then) is its identity, so it is the only kind that exposes a
 * step switcher in the options bar; every other kind is fixed at creation.
 */
export type StormKind =
  | "command"
  | "event"
  | "actor"
  | "state"
  | "constraint"
  | "notify"
  | "query"
  | "bdd";

/** BDD Scenario Phase for Given-When-Then cards */
export type BddPhase = "given" | "when" | "then";

/**
 * One DCB Query Item of a State (or Constraint) card.
 *
 * Semantics:
 * - an Event matches this item when its type is in `types` (empty = matches all)
 *   AND it carries all of the item's tags (empty = matches all)
 * - Query Items on a State/Constraint card are combined with OR
 */
export interface StormQueryItem {
  id: string; // unique identifier
  /** Event type names — empty array = match all types */
  types: string[];
  /**
   * Ids of the card's INPUT fields (`inputFields`) whose tags filter Events.
   * Only input params can carry the tags a query item filters on; output
   * fields (projected after rehydrate) never contribute tags.
   */
  tagFieldIds: string[];
}

/**
 * Free-text business rule / constraint line on a Constraint card
 */
export interface StormConstraint {
  id: string;
  text: string;
}

/**
 * A single field row of an event storming card
 */
export interface StormField {
  id: string;
  name: string;
  fieldType: string; // primitive or Model node reference
  value?: string; // scenario / instance value (e.g. for BDD Given/When/Then)
  required?: boolean;
  description?: string;
  tag?: string; // tag name (e.g. 'order') forming '{tag}:{name}'
  /** Command payload / Query param validation. Only set on those kinds. */
  validation?: FieldValidation;
}

/**
 * Event storming card payload
 *
 * Input/output split for State & Constraint cards:
 * - `inputFields` — INPUT params of the card. Their tags are the only tags a
 *   Query Item can filter on; tags may only live here.
 * - `queryItems` — the DCB query that selects the Events feeding the card.
 * - `outputFields` — OUTPUT fields obtained after rehydrating / projecting the
 *   selected events (the read-model shape). Output fields never carry tags.
 *
 * Every other kind keeps using `fields` (and `responseFields` on Query cards).
 * State/Constraint do not reuse `fields`: it stays empty for them so input and
 * output never blur together.
 */
export interface StormData {
  kind: StormKind;
  name: string; // Card title
  /**
   * Given / When / Then step. Required on `bdd` cards (it drives their header
   * color and phase switcher); undefined on every other kind.
   */
  phase?: BddPhase;
  description?: string;
  /** Primary fields (payload on Command/Event/Notify/BDD; Query params). Empty on State/Constraint — use inputFields/outputFields. */
  fields: StormField[];
  /** State & Constraint cards only: INPUT params; their tags feed Query Items. */
  inputFields?: StormField[];
  /** State & Constraint cards only: OUTPUT fields produced by projecting matching events. */
  outputFields?: StormField[];
  responseFields?: StormField[]; // Query cards only (Response fields)
  queryItems?: StormQueryItem[]; // State & Constraint cards (DCB Query)
  constraints?: StormConstraint[]; // Constraint cards only
  isArray?: boolean; // Collection indicator '[]'
  action?: string; // Authorization action (resource:verb:scope)
  permissions?: string[]; // Actor cards only (wildcard patterns)
}

/** Inline editing state for active text entry */
export interface StormInlineEditState {
  objectId: string;
  fieldId?: string;
  target?: "tag" | "queryTypes" | "queryTags" | "constraintText" | "value";
}

/** Single selected row */
export interface StormFieldSelection {
  objectId: string;
  fieldId?: string;
}

/** Multi-selected field rows for copy/paste/reorder */
export interface FieldMultiSelection {
  objectId: string;
  fieldIds: string[];
}

export interface FieldClipboardEntry {
  name: string;
  fieldType: string;
  required?: boolean;
  description?: string;
  tag?: string;
  /** Carried through so copy/paste keeps Command / Query param validation. */
  validation?: FieldValidation;
}

export interface FieldClipboard {
  sourceKind: "model-object" | "model-enum" | "storm";
  entries: FieldClipboardEntry[];
}
