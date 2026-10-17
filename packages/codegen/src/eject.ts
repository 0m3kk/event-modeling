/** Copies the built-in templates into a project so they can be edited. */
import fs from "node:fs/promises";
import path from "node:path";
import { builtinTemplatesDir } from "./render/env";

/** Copies every built-in template into `targetDir`. Returns the copied names. */
export async function ejectTemplates(
  targetDir: string,
  options: { skipExisting?: boolean } = {},
): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(builtinTemplatesDir, { withFileTypes: true });
  const copied: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const from = path.join(builtinTemplatesDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (options.skipExisting) {
      try {
        await fs.access(to);
        continue; // keep the project's edited template
      } catch {
        // absent: copy it
      }
    }
    await fs.copyFile(from, to);
    copied.push(entry.name);
  }
  return copied.sort();
}
