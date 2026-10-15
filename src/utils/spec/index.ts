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
 * Data containers (Object / Enum / Alias cards) are never listed as standalone
 * entries — not in a section of their own, nor in the Domain/Group membership
 * lists. Each definition is expanded inline at the first field that references
 * its type; later references stay as the plain type name.
 *
 * Reference copies share the name of the card they mirror, so definitions
 * de-duplicate by name while Slice lanes still reference the copies that appear
 * inside them.
 */
import { buildSpecification, type SpecificationInput } from "./build";
import { downloadSpecification } from "./file";
import { toYaml } from "./yaml";

export * from "./yaml";
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
