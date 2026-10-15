/** Renders one file per data type (object / enum / alias). */
import { artifactPath } from "./helpers";
import type { Generator, RenderJob } from "./contract";

const TEMPLATE_BY_KIND: Record<string, string> = {
  object: "type_object.rs.njk",
  enum: "type_enum.rs.njk",
  alias: "type_alias.rs.njk",
};

export const typesGenerator: Generator = {
  name: "types",
  generate({ crate }): RenderJob[] {
    return crate.artifacts
      .filter((artifact) => artifact.kind === "type")
      .map((artifact) => ({
        template: TEMPLATE_BY_KIND[artifact.typeKind ?? "object"] ?? "type_object.rs.njk",
        outPath: artifactPath(artifact),
        context: { crate, artifact },
      }));
  },
};
