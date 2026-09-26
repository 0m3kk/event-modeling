import type { CanvasObject, StormField, StormKind } from "@/types";
import { toDisplayName } from "./naming";

const TAG_KINDS: readonly StormKind[] = ["event", "state", "constraint", "bdd"];

export interface StormValidationCard {
  kind: StormKind;
  name: string;
  fields: StormField[];
  writtenFields?: StormField[];
  queryItems?: { types?: string[]; tagFields?: string[] }[];
}

export interface StormValidationInput {
  existing: CanvasObject[];
  cards: StormValidationCard[];
}

function collectEventNames(input: StormValidationInput): Set<string> {
  const names = new Set<string>();
  for (const object of input.existing) {
    if (object.type === "storm" && object.stormData?.kind === "event") {
      names.add(object.stormData.name.trim());
    }
  }
  for (const card of input.cards) {
    if (card.kind === "event") names.add(card.name.trim());
  }
  return names;
}

function collectEventTagsByType(
  input: StormValidationInput,
): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>();
  const addField = (field: StormField) => {
    const tag = (field.tag ?? "").trim();
    if (!tag) return;
    let names = byType.get(field.fieldType);
    if (!names) {
      names = new Set<string>();
      byType.set(field.fieldType, names);
    }
    names.add(tag);
  };
  for (const object of input.existing) {
    if (object.type === "storm" && object.stormData?.kind === "event") {
      object.stormData.fields.forEach(addField);
    }
  }
  for (const card of input.cards) {
    if (card.kind === "event") card.fields.forEach(addField);
  }
  return byType;
}

function findFieldByName(
  fields: StormField[],
  name: string,
): StormField | undefined {
  const target = toDisplayName(name);
  return fields.find((field) => toDisplayName(field.name) === target);
}

export function validateStormWrite(input: StormValidationInput): string[] {
  const eventNames = collectEventNames(input);
  const eventTags = collectEventTagsByType(input);
  const issues: string[] = [];

  for (const card of input.cards) {
    const label = `"${card.name}" (${card.kind})`;
    const writtenFields = card.writtenFields ?? card.fields;

    if (!TAG_KINDS.includes(card.kind)) {
      for (const field of writtenFields) {
        if ((field.tag ?? "").trim()) {
          issues.push(
            `${label} field "${field.name}" carries a tag, but tags are only valid on Event, Given/When/Then, State, and Constraint cards.`,
          );
        }
      }
    } else if (card.kind !== "event" && card.kind !== "bdd") {
      for (const field of writtenFields) {
        const tag = (field.tag ?? "").trim();
        if (!tag) continue;
        if (!eventTags.get(field.fieldType)?.has(tag)) {
          issues.push(
            `${label} field "${field.name}" has tag "${tag}", but no Event field of type "${field.fieldType}" carries that tag.`,
          );
        }
      }
    }

    for (const [index, item] of (card.queryItems ?? []).entries()) {
      for (const rawType of item.types ?? []) {
        const type = toDisplayName(rawType);
        if (!eventNames.has(type)) {
          issues.push(
            `${label} queryItems[${index}] type "${type}" does not match any Event card.`,
          );
        }
      }
      for (const rawName of item.tagFields ?? []) {
        const name = toDisplayName(rawName);
        const field = findFieldByName(card.fields, rawName);
        if (!field || !(field.tag ?? "").trim()) {
          issues.push(
            `${label} queryItems[${index}] tagField "${name}" is not a tagged field on this card.`,
          );
        }
      }
    }
  }

  return issues;
}

export function describeStormOptions(input: StormValidationInput): string {
  const events = [...collectEventNames(input)].sort();
  const tags = [...collectEventTagsByType(input).entries()]
    .flatMap(([type, names]) =>
      [...names].sort().map((name) => `${name} (${type})`),
    )
    .sort();
  return [
    `Event types available: ${events.length ? events.map((name) => `"${name}"`).join(", ") : "(none yet)"}.`,
    `Event tags available: ${tags.length ? tags.map((tag) => `"${tag}"`).join(", ") : "(none yet)"}.`,
  ].join(" ");
}
