/**
 * Domain definitions for Data Model Builder nodes
 */

import type { FieldValidation } from "./validation";

export type ModelNodeKind = "object" | "enum" | "array" | "wrap";

export interface ModelField {
  id: string;
  name: string;
  fieldType: string; // Primitive or another Model node name
  required?: boolean;
  description?: string;
  /** Object nodes only: per-field input validation. */
  validation?: FieldValidation;
}

export interface ModelEnumValue {
  id: string;
  name: string;
  description?: string;
  value?: string;
}

export interface ModelData {
  kind: ModelNodeKind;
  name: string;
  description?: string;
  fields?: ModelField[]; // object only
  itemType?: string; // array only (primitive or model node name)
  innerType?: string; // wrap only (e.g. nullable/optional target)
  values?: ModelEnumValue[]; // enum only
  /**
   * Node-level validation for array (minItems/maxItems) and wrap (value
   * rules). Enum has none; object validation lives on each field.
   */
  validation?: FieldValidation;
}

export interface ModelInlineEditState {
  objectId: string;
  fieldId?: string;
  target?: "value";
}
