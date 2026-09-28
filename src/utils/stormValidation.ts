import type { CanvasObject, StormField, StormKind } from "@/types";
import { nameKey, splitWords, toDisplayName } from "./naming";
import { matchesPermission } from "./stormAuth";

const TAG_KINDS: readonly StormKind[] = ["event", "state", "constraint", "bdd"];

const KEY_WORDS = new Set([
  "id",
  "uuid",
  "guid",
  "code",
  "email",
  "slug",
  "token",
  "key",
  "no",
  "number",
  "ref",
  "reference",
  "hash",
  "username",
  "handle",
  "sku",
]);

export function isKeyField(name: string, fieldType?: string): boolean {
  const normType = (fieldType ?? "").trim().toLowerCase();
  if (normType === "uuid" || normType === "id" || normType === "email") {
    return true;
  }
  const clean = name.replace(/[_\-\s]+/g, " ").trim().toLowerCase();
  if (!clean) return false;
  const words = clean.split(" ");
  const lastWord = words[words.length - 1] ?? "";

  if (KEY_WORDS.has(clean) || KEY_WORDS.has(lastWord)) {
    return true;
  }
  if (
    clean.endsWith("id") ||
    clean.endsWith("uuid") ||
    clean.endsWith("code") ||
    clean.endsWith("email") ||
    clean.endsWith("key") ||
    clean.endsWith("ref") ||
    clean.endsWith("token")
  ) {
    return true;
  }
  return false;
}

const NOISE_WORDS = new Set([
  "create",
  "created",
  "place",
  "placed",
  "make",
  "made",
  "update",
  "updated",
  "delete",
  "deleted",
  "remove",
  "removed",
  "add",
  "added",
  "cancel",
  "cancelled",
  "send",
  "sent",
  "submit",
  "submitted",
  "process",
  "processed",
  "event",
  "command",
  "to",
  "for",
  "on",
  "in",
  "by",
  "a",
  "an",
  "the",
  "new",
  "old",
  "set",
]);

function extractDomainWords(name: string): string[] {
  return splitWords(name)
    .map((w) => w.toLowerCase())
    .filter((w) => !NOISE_WORDS.has(w) && w.length > 1);
}

function getCardOrObjectFields(
  source: StormValidationCard | CanvasObject,
): StormField[] {
  if ("stormData" in source) {
    return source.stormData?.fields ?? [];
  }
  return (
    (source as StormValidationCard).writtenFields ??
    (source as StormValidationCard).fields
  );
}

function getCardOrObjectName(
  source: StormValidationCard | CanvasObject,
): string {
  if ("stormData" in source) {
    return source.stormData?.name ?? "";
  }
  return (source as StormValidationCard).name;
}

function findCandidateSourcesForEvent(
  eventCard: StormValidationCard,
  input: StormValidationInput,
): (StormValidationCard | CanvasObject)[] {
  const batchCommands = input.cards.filter((c) => c.kind === "command");
  const batchConstraints = input.cards.filter((c) => c.kind === "constraint");

  if (batchCommands.length === 1) {
    return [...batchCommands, ...batchConstraints];
  }

  if (batchCommands.length > 1) {
    const eventWords = extractDomainWords(eventCard.name);
    const matchedCmds = batchCommands.filter((cmd) => {
      const cmdWords = extractDomainWords(cmd.name);
      return eventWords.some((w) => cmdWords.includes(w));
    });
    const matchedConstraints = batchConstraints.filter((c) => {
      const cWords = extractDomainWords(c.name);
      return eventWords.some((w) => cWords.includes(w));
    });
    if (matchedCmds.length > 0 || matchedConstraints.length > 0) {
      return [...matchedCmds, ...matchedConstraints];
    }
    return [...batchCommands, ...batchConstraints];
  }

  if (batchConstraints.length > 0) {
    return batchConstraints;
  }

  const existingCommands = input.existing.filter(
    (o) => o.type === "storm" && o.stormData?.kind === "command",
  );
  const existingConstraints = input.existing.filter(
    (o) => o.type === "storm" && o.stormData?.kind === "constraint",
  );

  if (existingCommands.length === 0 && existingConstraints.length === 0) {
    return [];
  }

  const eventWords = extractDomainWords(eventCard.name);
  const matchedExisting = [
    ...existingCommands,
    ...existingConstraints,
  ].filter((obj) => {
    const name = obj.stormData?.name ?? "";
    const objWords = extractDomainWords(name);
    return eventWords.some((w) => objWords.includes(w));
  });

  if (matchedExisting.length > 0) {
    return matchedExisting;
  }

  if (existingCommands.length === 1 && existingConstraints.length === 0) {
    return existingCommands;
  }

  return [];
}

export interface StormValidationCard {
  kind: StormKind;
  name: string;
  fields: StormField[];
  writtenFields?: StormField[];
  queryItems?: { types?: string[]; tagFields?: string[] }[];
  constraints?: (string | { id?: string; text: string })[];
  action?: string;
  permissions?: string[];
  writtenPermissions?: string[];
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

function collectCanvasActions(input: StormValidationInput): Set<string> {
  const actions = new Set<string>();
  for (const object of input.existing) {
    if (object.type === "storm" && object.stormData?.action) {
      const action = object.stormData.action.trim();
      if (action) actions.add(action);
    }
  }
  for (const card of input.cards) {
    if (card.action) {
      const action = card.action.trim();
      if (action) actions.add(action);
    }
  }
  return actions;
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
  const canvasActions = collectCanvasActions(input);
  const issues: string[] = [];

  for (const card of input.cards) {
    const label = `"${card.name}" (${card.kind})`;
    const writtenFields = card.writtenFields ?? card.fields;

    if (card.kind === "actor") {
      const rawList =
        card.writtenPermissions !== undefined
          ? card.writtenPermissions
          : (card.permissions ?? card.fields.map((f) => f.name));

      const uniquePerms = Array.from(
        new Set(rawList.map((p) => p.trim()).filter(Boolean)),
      );

      for (const permission of uniquePerms) {
        const hasMatch = Array.from(canvasActions).some((action) =>
          matchesPermission(permission, action),
        );

        if (!hasMatch) {
          issues.push(
            `${label} permission "${permission}" does not match any action on the canvas.`,
          );
        }
      }
    }

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

    if (card.kind === "event") {
      for (const field of writtenFields) {
        const tag = (field.tag ?? "").trim();
        if (tag && !isKeyField(field.name, field.fieldType)) {
          issues.push(
            `${label} field "${field.name}" carries tag "${tag}", but tags must only be applied to key/identifier fields (e.g. ID, unique email, code). Non-key fields should not be tagged.`,
          );
        }
      }

      if (writtenFields.length > 0) {
        const candidateSources = findCandidateSourcesForEvent(card, input);
        if (candidateSources.length > 0) {
          const allowedFieldKeys = new Set<string>();
          for (const src of candidateSources) {
            for (const f of getCardOrObjectFields(src)) {
              allowedFieldKeys.add(nameKey(f.name));
            }
          }
          for (const field of writtenFields) {
            const key = nameKey(field.name);
            if (!allowedFieldKeys.has(key)) {
              const srcNames = candidateSources
                .map((s) => `"${getCardOrObjectName(s)}"`)
                .join(", ");
              issues.push(
                `${label} field "${field.name}" does not exist in associated Command or Constraint (${srcNames}). Every event field must originate from a Command or Constraint payload.`,
              );
            }
          }
        }
      }
    }

    if (card.kind === "constraint" && card.constraints) {
      const COMMAND_VALIDATION_REGEX =
        /\b(cannot be (empty|blank|null)|must not be (empty|blank|null)|is required|valid email format|characters long)\b/i;
      for (const rule of card.constraints) {
        const text = typeof rule === "string" ? rule : rule.text;
        if (text && COMMAND_VALIDATION_REGEX.test(text)) {
          issues.push(
            `${label} rule "${text}" appears to perform command input validation. Constraints are reusable Decision Models that check business logic invariants against historical events, not command input validation.`,
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
  const actions = [...collectCanvasActions(input)].sort();
  return [
    `Event types available: ${events.length ? events.map((name) => `"${name}"`).join(", ") : "(none yet)"}.`,
    `Event tags available: ${tags.length ? tags.map((tag) => `"${tag}"`).join(", ") : "(none yet)"}.`,
    `Actions available: ${actions.length ? actions.map((act) => `"${act}"`).join(", ") : "(none yet)"}.`,
  ].join(" ");
}
