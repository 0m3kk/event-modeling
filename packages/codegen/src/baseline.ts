/**
 * Stored merge bases for `merge` strategy files.
 *
 * A three-way merge needs the content the generator wrote last time. The
 * manifest only keeps a hash, so the pipeline mirrors every generated merge file
 * under `<config dir>/.codegen/baseline/<base>/<path>`. The copy is the base side
 * of the next merge; it is local tool state and can be recreated (with
 * `--force`) if lost.
 */
import fs from "node:fs/promises";
import path from "node:path";

export type BaselineBase = "out" | "root";

/** Directory holding every stored merge base. */
export function baselineDir(configDir: string): string {
  return path.join(configDir, ".codegen", "baseline");
}

/** Absolute path of the stored base for one generated file. */
export function baselinePath(
  configDir: string,
  base: BaselineBase,
  relPath: string,
): string {
  return path.join(baselineDir(configDir), base, ...relPath.split("/"));
}

/** Reads a stored base, or `undefined` when none has been recorded yet. */
export async function readBaseline(
  configDir: string,
  base: BaselineBase,
  relPath: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(baselinePath(configDir, base, relPath), "utf8");
  } catch {
    return undefined;
  }
}

/** Records the content written by the generator for the next merge. */
export async function writeBaseline(
  configDir: string,
  base: BaselineBase,
  relPath: string,
  content: string,
): Promise<void> {
  const file = baselinePath(configDir, base, relPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

/** Removes a stored base (when the project deleted the generated file). */
export async function removeBaseline(
  configDir: string,
  base: BaselineBase,
  relPath: string,
): Promise<void> {
  await fs.rm(baselinePath(configDir, base, relPath), { force: true });
}

/** Lists the POSIX-separated paths stored under one baseline root. */
export async function listBaseline(
  configDir: string,
  base: BaselineBase,
): Promise<string[]> {
  const root = path.join(baselineDir(configDir), base);
  const found: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), next);
      else if (entry.isFile()) found.push(next);
    }
  }

  await walk(root, "");
  return found.sort();
}
