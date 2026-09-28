import type { ModelNodeKind } from "@/types";

/**
 * Visual model node (Object / Array / Wrap / Enum) constants.
 */

export const MODEL_KIND_COLORS: Record<ModelNodeKind, string> = {
  object: "#0891b2", // cyan
  array: "#dc2626", // red
  wrap: "#ca8a04", // yellow
  enum: "#65a30d", // lime
};

export const MODEL_KIND_LABELS: Record<ModelNodeKind, string> = {
  object: "Object",
  array: "Array",
  wrap: "Wrap",
  enum: "Enum",
};

export const MODEL_LAYOUT = {
  cardWidth: 240,
  minWidth: 200,
  headerHeight: 36,
  rowHeight: 28,
  padding: 12,
  borderRadius: 8,
};
