/** Renders one file per Event. */
import { artifactJobs } from "./helpers";
import type { Generator, RenderJob } from "./contract";

export const eventsGenerator: Generator = {
  name: "events",
  generate({ crate }): RenderJob[] {
    return artifactJobs(crate, "event", "event.rs.njk");
  },
};
