/** Renders one file per View. */
import { artifactJobs } from "./helpers";
import type { Generator, RenderJob } from "./contract";

export const viewsGenerator: Generator = {
  name: "views",
  generate({ crate }): RenderJob[] {
    return artifactJobs(crate, "view", "view.rs.njk");
  },
};
