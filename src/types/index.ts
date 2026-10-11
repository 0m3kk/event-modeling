export * from "./schema";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface SelectedField {
  elementId: string;
  fieldIndex: number;
  sectionIndex?: number;
  sectionId?: string;
}

export interface InlineEditState {
  elementId: string;
  worldBounds: { x: number; y: number; width: number; height: number };
  initialValue: string;
  multiline?: boolean;
  onCommit: (newValue: string) => void;
}

/**
 * Target of the description (ⓘ) hover tooltip.
 * `fieldIndex`/`sectionIndex` omitted means the card's own description.
 * `iconBounds` is the ⓘ hit box in element-local coordinates, used to anchor
 * the tooltip above the icon.
 */
export interface DescHoverTarget {
  elementId: string;
  fieldIndex?: number;
  sectionIndex?: number;
  text: string;
  iconBounds: { x: number; y: number; width: number; height: number };
}

export interface ToastMessage {
  id: string;
  type?: "info" | "success" | "error";
  text: string;
}

