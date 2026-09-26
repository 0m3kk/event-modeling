export type CardHitZoneType =
  | "header"
  | "action"
  | "fieldName"
  | "fieldTag"
  | "fieldType"
  | "enumValue"
  | "itemType"
  | "innerType"
  | "queryItem"
  | "constraint"
  | "desc"
  | "stickyText"
  | "textBoxText";

export interface CardHitZone {
  type: CardHitZoneType;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fieldId?: string;
  section?: "params" | "response";
  constraintId?: string;
  queryItemId?: string;
  valueId?: string;
  currentText?: string;
}

export interface RenderResult {
  height: number;
  hitZones: CardHitZone[];
}
