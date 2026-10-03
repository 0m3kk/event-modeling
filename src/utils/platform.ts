import { isTauri } from "@tauri-apps/api/core";

/**
 * True when the app runs inside the Tauri desktop shell. Always false in the
 * plain browser build, so web-only behavior is preserved.
 */
export function isDesktopApp(): boolean {
  const g =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : typeof globalThis !== "undefined"
        ? (globalThis as unknown as Record<string, unknown>)
        : undefined;
  if (!g) return false;
  return Boolean(isTauri() || g.__TAURI_INTERNALS__ || g.__TAURI__);
}
