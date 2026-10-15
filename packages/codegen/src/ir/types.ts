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
  /** Structural type, for dependency detection. */
  type: RustType;
  /** True when `rustName` differs from `name` (informational for custom templates). */
  needsRename: boolean;
  optional: boolean;
  array: boolean;
  /** DCB tag attached to this field, if any. */
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

/** A single generated Rust item (one file). */
export interface IrArtifact {
  kind: IrArtifactKind;
  /** Original name from the spec. */
  name: string;
  /** PascalCase Rust type name. */
  rustName: string;
  /** snake_case file name (without extension). */
  fileName: string;
  /** Module path from the crate root, e.g. `["sales", "events"]`. */
  modulePath: string[];
  doc?: string;
  /** Present for event/view/state and object types (a single struct's fields). */
  fields?: IrField[];
  /** Command/query inputs (the request struct's fields). */
  inputs?: IrField[];
  /** Command/query responses (a separate `...Response` struct). */
  responses?: IrField[];
  /** Present for enum types. */
  variants?: IrEnumVariant[];
  /** Present for `type` artifacts. */
  typeKind?: "object" | "enum" | "alias";
  /** Rendered Rust type an alias points at. */
  aliasOf?: string;
  /** Referenced data type name an alias points at, if non-primitive. */
  aliasRefName?: string;
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
  version: string;
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
  deps: IrDep[];
  tags: TagDef[];
  /**
   * Names of custom validation helpers the generated `validation` module must
   * provide, e.g. `["validate_date", "validate_uuid"]`. Empty when no field
   * uses a format `validator` cannot express on its own.
   */
  validationHelpers: string[];
}
