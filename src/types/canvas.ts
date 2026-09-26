/**
 * Core Canvas definitions
 */

import type { StormData } from "./storm";
import type { ModelData } from "./model";

import type { ElbowConnectorData } from "./connector";

export type ObjectType =
  "storm" | "model" | "connector" | "stickyNote" | "textBox";

export type Tool =
  | "select"
  | "hand"
  | "connector"
  | "storm"
  | "model"
  | "stickyNote"
  | "textBox"
  | "group";

export interface CanvasObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
  groupId?: string; // Group membership

  /**
   * Reference-copy set id. Objects sharing a `referenceId` are linked
   * duplicates: content/style/size stay in sync across the set while position
   * and group membership stay independent (see utils/reference.ts).
   */
  referenceId?: string;

  // Specific object payloads
  stormData?: StormData;
  modelData?: ModelData;
  connectorData?: ElbowConnectorData;

  // Minimal sticky/text fields
  text?: string;
  fill?: string;
  stroke?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  /**
   * Visible canvas size in screen pixels, synced from the Pixi engine. Used to
   * place new objects at the center of the current view.
   */
  screenWidth: number;
  screenHeight: number;
}

export interface CanvasProject {
  id: string;
  name: string;
  objects: CanvasObject[];
  groups: import("./group").GroupInfo[];
  viewport: Viewport;
  updatedAt: string;
}
