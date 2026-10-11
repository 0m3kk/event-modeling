export * from "./schema";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ToastMessage {
  id: string;
  type?: "info" | "success" | "error";
  text: string;
}
