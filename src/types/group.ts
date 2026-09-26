/**
 * Group definitions
 */

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LineStyle = "solid" | "dashed" | "dotted";

export interface GroupInfo {
  id: string;
  name: string; // Group name (e.g. "Order Processing")
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  locked?: boolean;
  tagColor?: string; // Pill tag background color
  customBounds?: GroupBounds;
  parentId?: string; // Nested sub-group parent ID
}
