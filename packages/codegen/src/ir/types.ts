/**
 * The intermediate representation (IR) the generator works on.
 *
 * The IR is the single extension surface: templates render it, lowering passes
 * transform it, and generators pick artifacts out of it by kind. It is already
 * Rust-flavoured — every field carries a rendered `rustType`, every artifact a
 * `rustName`, a snake_case `fileName` and a `modulePath` — so templates stay
 * declarative and independent of the raw spec.
 */
import type { TagDef } from "@em/spec";

/** A Rust type, kept structural so it can be inspected (for dependency detection). */
export type RustType =
  | { kind: "primitive"; name: string }
  | { kind: "named"; name: string }
  | { kind: "vec"; inner: RustType }
  | { kind: "option"; inner: RustType };

/** A struct / message field. */
export interface IrField {
  /** Original field name (used as the serde name). */
  name: string;
  /** snake_case Rust identifier. */
  rustName: string;
  /** Rendered Rust type, e.g. `Option<Vec<String>>`. */
  rustType: string;
  /**
   * Rust type accepted by the generated `with_<field>` builder. Equal to
   * `rustType` for required fields; for optional fields it is the unwrapped
   * inner type, so `with_<field>` can wrap the value in `Some` for the caller.
   */
  valueType: string;
  /** Structural type, for dependency detection. */
  type: RustType;
  /** True when `rustName` differs from `name` (informational for custom templates). */
  needsRename: boolean;
  optional: boolean;
  array: boolean;
  /** snake_case DCB tag attached to this field, if any (e.g. `order`, `order_item`). */
  tag?: string;
  doc?: string;
  /** `validator` attribute expressions, e.g. `["length(min = 1, max = 100)", "email"]`. */
  validations: string[];
  /** Notes about validation that could not be expressed and was skipped. */
  validationNotes: string[];
  /** Original name of a referenced (non-primitive) data type, if any. */
  refName?: string;
}

export interface IrEnumVariant {
  /** Original member name. */
  name: string;
  /** PascalCase Rust variant. */
  rustName: string;
  doc?: string;
}

export type IrArtifactKind =
  | "event"
  | "command"
  | "query"
  | "view"
  | "state"
  | "service"
  | "type";

/** A DCB tag binding inside a projection query item. */
export interface IrQueryTag {
  /** snake_case tag name as declared on the event (e.g. `order`, `order_item`). */
  tag: string;
  /** Original name of the param the tag binds to (e.g. `orderId`). */
  field: string;
  /** snake_case accessor on the projection struct (e.g. `order_id`). */
  rustName: string;
}

/** A reference from a projection query to a generated event. */
export interface IrEventRef {
  /** PascalCase Rust type of the event. */
  rustName: string;
  /** snake_case event type string, matching `DomainEvent::event_type()`. */
  eventType: string;
  /** Module path from the crate root, e.g. `["domains", "sales", "events"]`. */
  modulePath: string[];
}

/**
 * One DCB query item of a projection: event `types` (matched with OR) and
 * `tags` (all required). Carries the resolved events and any resolution notes.
 */
export interface IrQueryItem {
  /** Event type names as written in the spec. */
  types: string[];
  /** Per-type resolution: an event type name or a literal fallback when unresolved. */
  typeRefs: IrQueryTypeRef[];
  tags: IrQueryTag[];
  doc?: string;
  /** Events resolved from `types` (unresolved names are omitted). */
  events: IrEventRef[];
  /** Notes about types/tags that could not be resolved. */
  notes: string[];
}

/** A single event type inside a query item, resolved to a generated event when possible. */
export interface IrQueryTypeRef {
  /** snake_case event type literal (used when the type does not resolve to an event). */
  literal: string;
  /** PascalCase Rust event type, present when the type resolves to a generated event. */
  rustName?: string;
}

/** A grouped `use` of events a projection folds, e.g. `crate::domains::sales::events::{A, B}`. */
export interface IrEventImport {
  modulePath: string[];
  names: string[];
}

/** A single generated Rust item (one file). */
export interface IrArtifact {
  kind: IrArtifactKind;
  /** Original name from the spec. */
  name: string;
  /** PascalCase Rust type name. */
  rustName: string;
  /** snake_case file name (without extension). */
  fileName: string;
  /** Module path from the crate root, e.g. `["domains", "sales", "events"]`. */
  modulePath: string[];
  doc?: string;
  /** Present for event/view/state and object types (a single struct's fields). */
  fields?: IrField[];
  /** Command/query inputs (the request struct's fields). */
  inputs?: IrField[];
  /** Command/query responses (a separate `...Response` struct). */
  responses?: IrField[];
  /** Present for state/view projections: the identity/query params. */
  params?: IrField[];
  /** Present for state/view projections: the DCB query items. */
  queryItems?: IrQueryItem[];
  /** Present for state/view projections: unique events to fold, in first-seen order. */
  projectionEvents?: IrEventRef[];
  /** Present for state/view projections: grouped `use` paths of the folded events. */
  eventImports?: IrEventImport[];
  /** Present for state/view projections: notes about items that could not resolve. */
  projectionNotes?: string[];
  /** Present for enum types. */
  variants?: IrEnumVariant[];
  /** Present for `type` artifacts. */
  typeKind?: "object" | "enum" | "alias";
  /** Rendered Rust type an alias points at (the full wrapped type, e.g. `Vec<String>`). */
  aliasOf?: string;
  /** Referenced data type name an alias points at, if non-primitive. */
  aliasRefName?: string;
  /** True when the alias target is `uuid::Uuid` (so `new()` can use `now_v7`). */
  aliasIsUuid?: boolean;
  /** True when the alias target can derive `Eq + Hash` (i.e. is not a float/array-of-float). */
  aliasEqHash?: boolean;
  /** True when the alias target can implement `Display` (a scalar, non-array target). */
  aliasDisplay?: boolean;
  /** `validator` attributes on a newtype alias. */
  validations?: string[];
  /** Present for services. */
  methods?: IrMethod[];
  /** Command / query action token. */
  action?: string;
  /** True when the item references another generated data type (needs the prelude). */
  usesPrelude?: boolean;
  /** True when any field carries a `validator` attribute (`Validate` is derived). */
  validates?: boolean;
  /** Notes about validation skipped at the item level (e.g. on an alias). */
  validationNotes?: string[];
}

export interface IrMethod {
  name: string;
  rustName: string;
  doc?: string;
  params: IrField[];
  returns: IrField[];
  /** Rendered return type: `()`, the single field type, or the result struct name. */
  returnType: string;
  /** Name of the generated result struct when the method returns more than one field. */
  resultTypeName?: string;
}

export interface IrDomain {
  name: string;
  /** snake_case module segment. */
  module: string;
}

/** A directory in the generated module tree (drives `mod.rs` emission). */
export interface IrModuleDir {
  /** Folder segment (`""` for the crate root). */
  name: string;
  /** Artifacts whose file lives directly in this folder. */
  files: IrArtifact[];
  /** Child folders, sorted by name. */
  dirs: IrModuleDir[];
}

export interface IrDep {
  name: string;
  /** Registry version; ignored when `path` or `git` is set. */
  version?: string;
  /** Local path dependency, relative to the generated `Cargo.toml`. */
  path?: string;
  /** Git repository URL. */
  git?: string;
  /** Git branch to pin. */
  branch?: string;
  /** Git tag to pin. */
  tag?: string;
  /** Git revision to pin. */
  rev?: string;
  features?: string[];
}

export interface IrCrate {
  /** Crate / package name, snake_case. */
  name: string;
  edition: string;
  version: string;
  domains: IrDomain[];
  artifacts: IrArtifact[];
  /** Root of the generated module tree. */
  modules: IrModuleDir;
  /** Domain module names that contain a `types` folder (for the prelude). */
  typeModules: string[];
  /**
   * True when the crate declares a command or query, which makes the generator
   * emit the `execution_context` module and thread it through handler traits.
   */
  executionContext: boolean;
  /**
   * True when the `api` generator is enabled and the crate has at least one
   * command or query, which makes the generator emit the `src/transports` module.
   */
  api: boolean;
  /**
   * True when the generated API also emits utoipa `ToSchema` derives and the
   * OpenAPI document (the `api` generator's `openapi` option, on by default).
   */
  openapi: boolean;
  deps: IrDep[];
  tags: TagDef[];
  /**
   * Names of custom validation helpers the generated `validation` module must
   * provide, e.g. `["validate_date", "validate_uuid"]`. Empty when no field
   * uses a format `validator` cannot express on its own.
   */
  validationHelpers: string[];
}
