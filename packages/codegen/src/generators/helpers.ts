/** Shared helpers for the per-artifact generators. */
import type { IrArtifact, IrArtifactKind, IrCrate } from "../ir/types";
import type { RenderJob } from "./contract";

/** One job per artifact of `kind`, rendered from `template`. */
export function artifactJobs(
  crate: IrCrate,
  kind: IrArtifactKind,
  template: string,
): RenderJob[] {
  return crate.artifacts
    .filter((artifact) => artifact.kind === kind)
    .map((artifact) => ({
      template,
      outPath: `src/${artifact.modulePath.join("/")}/${artifact.fileName}.rs`,
      context: { crate, artifact },
    }));
}

/** Output path for a single artifact file. */
export function artifactPath(artifact: IrArtifact): string {
  return `src/${artifact.modulePath.join("/")}/${artifact.fileName}.rs`;
}
