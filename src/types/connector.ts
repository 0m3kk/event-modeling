/**
 * Orthogonal Elbow Connector definitions
 */

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
  arrowEnd?: boolean;
}
