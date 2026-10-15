/**
 * Parses a `*.spec.yaml` document into a validated {@link Specification}.
 *
 * Uses the `yaml` package for parsing and the zod schema for validation, so a
 * malformed document is rejected with a readable, path-annotated error before
 * it ever reaches the generator.
 */
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import { specificationSchema } from "./schema";
import type { Specification } from "./types";

/** Thrown when a document cannot be parsed or does not match the spec contract. */
export class SpecParseError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = "SpecParseError";
  }
}

/** Formats a zod error into one `path: message` line per issue. */
function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/** Parses and validates a spec YAML string. Throws {@link SpecParseError}. */
export function parseSpecification(source: string): Specification {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SpecParseError(`Invalid YAML: ${message}`);
  }

  try {
    return specificationSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = formatIssues(error);
      throw new SpecParseError(`Specification does not match the schema:\n  ${issues.join("\n  ")}`, issues);
    }
    throw error;
  }
}
