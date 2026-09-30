import type { CanvasObject } from "@/types";
import {
  PRIMITIVE_TYPES,
  canonicalPrimitiveType,
  splitArraySuffix,
} from "@/constants/fieldType";

/**
 * Guards the field types the AI tools write.
 *
 * A written type must be either a known primitive (any casing / alias, stored
 * in its canonical spelling) or the name of a Model node that already exists on
 * the canvas or is created in the same batch. Anything else is rejected so an
 * invented type ("money", "datetime-string", …) never lands on the board.
 * Model nodes keep their own names; a reference is rewritten to the model's
 * display name when the AI spells it differently.
 */

export interface FieldTypeEnvironment {
  /** lowercased Model node name -> its display name */
  models: Map<string, string>;
}

export function buildFieldTypeEnvironment(
  objects: CanvasObject[],
  extraModelNames: Iterable<string> = [],
): FieldTypeEnvironment {
  const models = new Map<string, string>();
  for (const obj of objects) {
    if (obj.type === "model" && obj.modelData) {
      const name = (obj.modelData.name || obj.text || "").trim();
      if (name) models.set(name.toLowerCase(), name);
    }
  }
  for (const raw of extraModelNames) {
    const name = raw.trim();
    if (name) models.set(name.toLowerCase(), name);
  }
  return { models };
}

export interface FieldTypeResolution {
  /** Canonical storage form (empty when no type was supplied). */
  type: string;
  /** Set when the type is neither a primitive nor a known Model node. */
  error?: string;
}

/** Resolve one type string, preserving any `[]` array suffix. */
export function resolveFieldType(
  raw: string | undefined,
  env: FieldTypeEnvironment,
): FieldTypeResolution {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { type: "" };

  const { base, isArray } = splitArraySuffix(trimmed);
  const primitive = canonicalPrimitiveType(base);
  if (primitive) {
    return { type: isArray ? `${primitive}[]` : primitive };
  }

  const model = env.models.get(base.toLowerCase());
  if (model) {
    return { type: isArray ? `${model}[]` : model };
  }

  return { type: trimmed, error: describeInvalidType(trimmed, env) };
}

/** Human/agent-facing explanation of the valid type vocabulary. */
export function describeInvalidType(
  raw: string,
  env: FieldTypeEnvironment,
): string {
  const models = [...new Set(env.models.values())].sort();
  const modelHint =
    models.length > 0
      ? `Available Model node types: ${models.map((m) => `"${m}"`).join(", ")}.`
      : "There are no Model nodes on the canvas yet.";
  return `invalid type "${raw}". Valid types are the primitives (${PRIMITIVE_TYPES.join(
    ", ",
  )}) or the name of a Model node. ${modelHint}`;
}

/** Build the rejection message shared by the storm / model write tools. */
export function fieldTypeError(issues: string[]): string {
  return `Rejected: invalid field types. Fix these and retry:\n${issues
    .map((issue) => `- ${issue}`)
    .join("\n")}`;
}
