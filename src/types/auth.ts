/**
 * RBAC authorization definitions (resource:verb:scope)
 */

export interface ParsedAction {
  resource: string;
  verb: string;
  scope: string;
}

export interface ActionHoverState {
  objectId: string;
  action: string;
  screenX: number;
  screenY: number;
}
