/** Renders one file per Command. */
import { artifactJobs } from "./helpers";
import type { Generator, RenderJob } from "./contract";

export const commandsGenerator: Generator = {
  name: "commands",
  generate({ crate }): RenderJob[] {
    return artifactJobs(crate, "command", "command.rs.njk");
  },
};
