/**
 * The generation manifest.
 *
 * Records a content hash for every file the tool last wrote, so a later run can
 * tell an untouched generated file apart from one a developer edited by hand
 * (and refuse to clobber the latter without `--force`).
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface Manifest {
  version: 1;
  /** Output path (relative to the crate root, POSIX-separated) -> content hash. */
  files: Record<string, string>;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function readManifest(file: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed && parsed.version === 1 && parsed.files) return parsed;
  } catch {
    // Missing or corrupt manifest: start fresh.
  }
  return { version: 1, files: {} };
}

export async function writeManifest(file: string, manifest: Manifest): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
