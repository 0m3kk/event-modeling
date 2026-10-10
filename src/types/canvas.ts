/**
 * Core Canvas definitions
 */

import type { StormData } from "./storm";
import type { ModelData } from "./model";

import type { ElbowConnectorData } from "./connector";
import type { LineData } from "./line";

export type ObjectType =
  | "storm"
  | "model"
  | "connector"
  | "line"
  | "stickyNote"
  | "textBox";

export type Tool =
  | "select"
  | "connector"
  | "line"
  | "storm"
  | "model"
  | "stickyNote"
  | "textBox"
  | "group"
  | "slice";

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
   * Set when the user manually resizes the card's width. Automated (AI)
   * updates then leave the width untouched so a hand-tuned width survives,
   * while height still reflows to the content.
   */
  widthLocked?: boolean;

  /**
   * Domain this element belongs to (e.g. "Order", "User"). Independent of the
   * slice/group domain; shown as a pill on the card header and emitted in the
   * codegen spec.
   */
  domain?: string;

  /**
   * Reference-copy set id. Objects sharing a `referenceId` are linked
   * duplicates: content/style/size stay in sync across the set while position
   * and group membership stay independent (see utils/reference.ts).
   */
  referenceId?: string;

  /**
   * For Service model nodes: IDs of methods hidden on this specific card
   * instance. Allows reference copies in flows to show only the method(s)
   * called in that flow while keeping the service definition in sync.
   */
  hiddenMethodIds?: string[];

  // Specific object payloads
  stormData?: StormData;
  modelData?: ModelData;
  connectorData?: ElbowConnectorData;
  lineData?: LineData;

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
