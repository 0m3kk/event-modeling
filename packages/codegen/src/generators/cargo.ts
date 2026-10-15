/** Renders `Cargo.toml` and a `.gitignore` for the generated crate. */
import type { Generator, RenderJob } from "./contract";

export const cargoGenerator: Generator = {
  name: "cargo",
  generate({ crate }): RenderJob[] {
    return [
      { template: "Cargo.toml.njk", outPath: "Cargo.toml", context: { crate } },
      { template: "gitignore.njk", outPath: ".gitignore", context: {} },
    ];
  },
};
