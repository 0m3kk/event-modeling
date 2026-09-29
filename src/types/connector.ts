/**
 * Orthogonal Elbow Connector definitions
 */

import type { LineStyle } from "./group";

export type CardinalAnchor = "top" | "right" | "bottom" | "left";

export interface ConnectorEndpoint {
  objectId: string;
  anchor: CardinalAnchor;
}

export interface Point {
  x: number;
  y: number;
}

export interface ElbowBend {
  id: string;
  x: number;
  y: number;
}

export interface ElbowConnectorData {
  start: ConnectorEndpoint;
  end: ConnectorEndpoint;
  bends?: ElbowBend[];
  stroke?: string;
  strokeWidth?: number;
  /** Stroke pattern: solid (default), dashed, or dotted. */
  lineStyle?: LineStyle;
  /** Draw an arrowhead at the start endpoint (defaults to false). */
  arrowStart?: boolean;
  /** Draw an arrowhead at the end endpoint (defaults to true). */
  arrowEnd?: boolean;
}
