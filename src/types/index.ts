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

export interface ToastMessage {
  id: string;
  type?: "info" | "success" | "error";
  text: string;
}

