/** Renders one file per View, plus its SQL migration when `views.migrations` is on. */
import { artifactJobs } from "./helpers";
import { migrationJobs } from "./migrations";
import type { Generator, RenderJob } from "./contract";

export const viewsGenerator: Generator = {
  name: "views",
  generate({ crate, config }): RenderJob[] {
    const jobs = artifactJobs(crate, "view", "view.rs.njk");
    const setting = config.generators?.views;
    if (typeof setting === "object" && setting !== null && setting.migrations === true) {
      jobs.push(...migrationJobs(crate));
    }
    return jobs;
  },
};
