/**
 * Domain definitions for Data Model Builder nodes
 */

export type ModelNodeKind = "object" | "enum" | "array" | "wrap";

export interface ModelField {
  id: string;
  name: string;
  fieldType: string; // Primitive or another Model node name
  required?: boolean;
  description?: string;
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
}

export interface ModelInlineEditState {
  objectId: string;
  fieldId?: string;
  target?: "value";
}
