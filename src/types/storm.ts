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
  | "query"
  | "bdd";

/** BDD Scenario Phase for Given-When-Then cards */
export type BddPhase = "given" | "when" | "then";

/**
 * What a BDD scenario step stands for.
 *
 * - Given steps are Events ("the story so far")
 * - When steps are Commands or Queries (the action under test)
 * - Then steps are outcomes: Events, a State, or an Error
 *
 * `error` is not a storm card kind — it is the failure outcome a scenario
 * asserts (e.g. a rejected command), so it only ever appears as a step ref.
 */
export type BddStepRef =
  | "event"
  | "command"
  | "query"
  | "state"
  | "error";

/**
 * One concrete key/value pair in a scenario step payload.
 *
 * Payloads are examples, not schemas: a scenario only fills the fields it
 * needs to tell the story, so any field may be omitted.
 */
export interface BddPayloadField {
  id: string;
  key: string;
  value: string;
}

/**
 * A single Given/When/Then scenario step: a named Event/Command/Query/State
 * (etc.) plus the concrete payload values used in this scenario.
 */
export interface BddStep {
  id: string;
  ref: BddStepRef;
  /** Free-typed name of the referenced card (e.g. "OrderPlaced"). */
  name: string;
  /** Concrete example values — partial by design. */
  payload: BddPayloadField[];
}

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
  /**
   * Projection assignment for output fields when matched events occur:
   * Maps outputField name (or ID) -> derivation expression.
   * e.g. { "Status": "'Pending'", "Email": "event.email" }
   */
  set?: Record<string, string>;
}

/**
 * Business rule / invariant constraint line on a Constraint card.
 * Supports both human-readable text and structured codegen expressions.
 */
export interface StormConstraint {
  id: string;
  /** Human-readable rule text / description */
  text: string;
  /** Unique machine-readable error/rule code, e.g. "USER_NOT_FOUND" */
  code?: string;
  /**
   * Executable invariant expression in CEL / JS boolean syntax.
   * e.g. "output.userId != null", "!output.isDeleted", "now() < output.expiresAt"
   */
  assert?: string;
  /** Client-facing error message, e.g. "User account does not exist." */
  message?: string;
  /** Error severity: "error" (default) or "warning" */
  severity?: "error" | "warning";
  /** Optional HTTP status code for API codegen (e.g. 400, 401, 403, 404, 409) */
  status?: number;
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
 * Every other kind keeps using `fields` (and `responseFields` on Query and
 * Command cards).
 * State/Constraint do not reuse `fields`: it stays empty for them so input and
 * output never blur together.
 *
 * A Command's `fields` are its payload and `responseFields` the response the
 * handler returns; unlike Query its payload band stays unlabeled (no PARAMS
 * heading) while the RESPONSE band is always shown.
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
  /** Primary fields (payload on Command/Event/BDD; Query params). Empty on State/Constraint. */
  fields: StormField[];
  /** State cards only: INPUT params; their tags feed Query Items. */
  inputFields?: StormField[];
  /** State cards only: OUTPUT fields produced by projecting matching events. */
  outputFields?: StormField[];
  /** Query & Command cards (Response fields) */
  responseFields?: StormField[]; // Query & Command cards (Response fields)
  queryItems?: StormQueryItem[]; // State cards only (DCB Query)
  constraints?: StormConstraint[]; // Constraint cards only (decision rules)
  /** Constraint cards: ID of the referenced reusable State card */
  stateId?: string;
  /** Constraint cards: Optional list of referenced State IDs */
  stateIds?: string[];
  /**
   * BDD (Given/When/Then) cards only: the scenario steps of this phase card.
   * Each step is a named Event/Command/Query/State/Error plus the concrete
   * payload values that describe the scenario. Replaces `fields` for `bdd`.
   */
  steps?: BddStep[];
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
