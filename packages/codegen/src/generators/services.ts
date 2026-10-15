/** Renders one file per Service. */
import { artifactJobs } from "./helpers";
import type { Generator, RenderJob } from "./contract";

export const servicesGenerator: Generator = {
  name: "services",
  generate({ crate }): RenderJob[] {
    return artifactJobs(crate, "service", "service.rs.njk");
  },
};
