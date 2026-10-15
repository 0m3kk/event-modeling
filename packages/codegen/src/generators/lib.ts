/**
 * Renders `src/lib.rs` and a `mod.rs` in every generated module folder.
 *
 * `lib.rs` re-exports the crate root's child modules (one per domain, plus
 * `common`); each folder's `mod.rs` wires its child modules and re-exports the
 * items of its own files.
 */
import type { IrModuleDir } from "../ir/types";
import type { Generator, RenderJob } from "./contract";

function modJobs(dir: IrModuleDir, prefix: string[]): RenderJob[] {
  const jobs: RenderJob[] = [];
  for (const child of dir.dirs) {
    const path = [...prefix, child.name];
    jobs.push({
      template: "mod.rs.njk",
      outPath: `src/${path.join("/")}/mod.rs`,
      context: { dir: child, path },
    });
    jobs.push(...modJobs(child, path));
  }
  return jobs;
}

export const libGenerator: Generator = {
  name: "lib",
  generate({ crate }): RenderJob[] {
    return [
      { template: "lib.rs.njk", outPath: "src/lib.rs", context: { crate } },
      { template: "prelude.rs.njk", outPath: "src/prelude.rs", context: { crate } },
      ...modJobs(crate.modules, []),
    ];
  },
};
