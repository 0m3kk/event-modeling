/**
 * Optional `rustfmt` post-processing.
 *
 * Templates aim for readable output but do not fuss over whitespace; `rustfmt`
 * gives the final, idiomatic layout. If `rustfmt` is not installed the content
 * is returned untouched and the caller can warn once.
 */
import { spawnSync } from "node:child_process";

let available: boolean | undefined;

/** True when a usable `rustfmt` is on PATH (checked once per process). */
export function rustfmtAvailable(): boolean {
  if (available === undefined) {
    try {
      const result = spawnSync("rustfmt", ["--version"], { stdio: "ignore" });
      available = result.status === 0;
    } catch {
      available = false;
    }
  }
  return available;
}

/** Formats Rust source, falling back to the input when formatting is unavailable. */
export function formatRust(content: string, edition: string): string {
  if (!rustfmtAvailable()) return content;
  const result = spawnSync("rustfmt", ["--edition", edition, "--emit", "stdout", "--quiet"], {
    input: content,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status === 0 && typeof result.stdout === "string" && result.stdout.length > 0) {
    return result.stdout;
  }
  return content;
}
