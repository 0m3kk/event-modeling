/**
 * Serializes the board to a human-readable, tool-agnostic domain specification
 * in YAML.
 *
 * The spec is *semantic*: it is organised by meaning (domains, slices, events,
 * commands, queries, views, states, constraints, services, actors, DCB tags)
 * rather than by canvas geometry, so it reads like a design document and can be
 * diffed, reviewed or fed to code generators. Board positions, sizes, colours
 * and internal ids are deliberately omitted. There is no bookkeeping summary
 * either — the document is just the model.
 *
 * Data containers (Object / Enum / Alias cards) are collected once in the
 * top-level `types` registry; fields reference them by name. Their Domain/Group
 * placement is recorded in the usual membership lists (`domains[].cards`,
 * `groups[].cards`), so a generator can tell which domain owns a type.
 *
 * Reference copies share the name of the card they mirror, so definitions
 * de-duplicate by name while Slice lanes still reference the copies that appear
 * inside them.
 *
 * The document contract (types, emitter) lives in `@em/spec`; this module wires
 * the board builder to it.
 */
import { toYaml } from "@em/spec";
import { buildSpecification, type SpecificationInput } from "./build";
import { downloadSpecification } from "./file";

export * from "@em/spec";
export * from "./build";
export { specFileName, downloadSpecification } from "./file";

/** Serializes the board to a YAML specification string. */
export function serializeSpecification(input: SpecificationInput): string {
  const spec = buildSpecification(input);
  return `${toYaml(spec)}\n`;
}

/**
 * Saves the board's specification to a `.spec.yaml` file. Convenience wrapper
 * that serializes the board and then downloads it.
 */
export async function exportSpecificationToFile(input: SpecificationInput): Promise<void> {
  await downloadSpecification(serializeSpecification(input), input.name);
}
