/** Renders one file per State. */
import { artifactJobs } from "./helpers";
import type { Generator, RenderJob } from "./contract";

export const statesGenerator: Generator = {
  name: "states",
  generate({ crate }): RenderJob[] {
    return artifactJobs(crate, "state", "state.rs.njk");
  },
};
