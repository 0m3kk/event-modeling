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

  /** True if this group represents an Event Modeling vertical slice */
  isSlice?: boolean;
  /** Domain name for grouping slices of the same domain together (e.g. "Order", "User") */
  domain?: string;
  /** Alias for domain (deprecated: use domain instead) */
  tag?: string;
  /** ID of the root Command or Query card associated with this slice */
  commandOrQueryId?: string;
  /** Name of the root Command or Query card associated with this slice */
  commandOrQueryName?: string;
}
