import type { ModelNodeKind } from "@/types";

/**
 * Visual model node (Object / Array / Wrap / Enum) constants.
 */

export const MODEL_KIND_COLORS: Record<ModelNodeKind, string> = {
  object: "#0891b2", // cyan
  array: "#dc2626", // red
  wrap: "#ca8a04", // yellow
  enum: "#65a30d", // lime
  service: "#6366f1", // indigo
};

/** Subdued/deeper header colors for dark mode to prevent harsh glare */
export const MODEL_KIND_DARK_COLORS: Record<ModelNodeKind, string> = {
  object: "#155e75", // cyan 800
  array: "#991b1b", // red 800
  wrap: "#854d0e", // yellow 800
  enum: "#3f6212", // lime 800
  service: "#4338ca", // indigo 800
};

export function modelKindColor(
  kind: ModelNodeKind,
  isDark: boolean = false,
): string {
  if (isDark) {
    return MODEL_KIND_DARK_COLORS[kind] ?? MODEL_KIND_COLORS[kind];
  }
  return MODEL_KIND_COLORS[kind] ?? "#0891b2";
}

export const MODEL_KIND_LABELS: Record<ModelNodeKind, string> = {
  object: "Object",
  array: "Array",
  wrap: "Wrap",
  enum: "Enum",
  service: "Service",
};

export const MODEL_LAYOUT = {
  cardWidth: 240,
  minWidth: 200,
  headerHeight: 36,
  rowHeight: 28,
  padding: 12,
  borderRadius: 8,
};
