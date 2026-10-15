/** Renders one file per Query. */
import { artifactJobs } from "./helpers";
import type { Generator, RenderJob } from "./contract";

export const queriesGenerator: Generator = {
  name: "queries",
  generate({ crate }): RenderJob[] {
    return artifactJobs(crate, "query", "query.rs.njk");
  },
};
