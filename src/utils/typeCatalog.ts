import type { CanvasElement } from "@/types";
import { getElementName, nameKey } from "./naming";

/**
 * Built-in primitive field types that are always valid as a field type. This is
 * the whole vocabulary: `string`, `integer`, `float`, `boolean` and `json`.
 * `json` models free-form structured data that has no dedicated Object/Enum
 * shape. Anything else (a UUID, a date, a timestamp, an email...) is modelled as
 * a `string` with a validation `format` (see `FIELD_FORMAT_PRESETS`). The AI may
 * otherwise only use a type that is defined on the board (an Object, Enum or
 * Alias card) — see {@link collectDefinedTypeNames}.
 */
export const PRIMITIVE_FIELD_TYPES = new Set<string>([
  "string",
  "integer",
  "float",
  "boolean",
  "json",
]);

/**
 * Canonical form of a type token: trimmed and with any trailing `[]` markers
 * stripped, since arrays are modelled separately via a field's `isArray` flag.
 * e.g. `" string[] "` -> `"string"`.
 */
export function normalizeTypeName(type: string | undefined): string {
  return (type ?? "").trim().replace(/(\[\])+$/, "").trim();
}

/** True when `type` is one of the built-in primitive types. */
export function isPrimitiveFieldType(type: string): boolean {
  return PRIMITIVE_FIELD_TYPES.has(normalizeTypeName(type).toLowerCase());
}

/**
 * Collects the names of every type defined on the board — Object, Enum and
 * Alias cards — lower-cased for case-insensitive matching. These are the only
 * non-primitive names a field type may reference.
 */
export function collectDefinedTypeNames(elements: CanvasElement[]): Set<string> {
  const names = new Set<string>();
  for (const el of elements ?? []) {
    if (el.type !== "objectCard" && el.type !== "enumCard" && el.type !== "aliasCard") {
      continue;
    }
    const name = getElementName(el);
    if (name) names.add(name.toLowerCase());
  }
  return names;
}

/** True when `type` is a primitive or a type defined on the board. */
export function isKnownFieldType(type: string, defined: Set<string>): boolean {
  const normalized = normalizeTypeName(type).toLowerCase();
  if (!normalized) return false;
  return PRIMITIVE_FIELD_TYPES.has(normalized) || defined.has(normalized);
}

/**
 * The canonical names of every type defined on the board (Object/Enum/Alias),
 * de-duplicated and sorted. Used to tell the AI which names it may reference.
 */
export function listDefinedTypeNames(elements: CanvasElement[]): string[] {
  const names = new Set<string>();
  for (const el of elements ?? []) {
    if (el.type !== "objectCard" && el.type !== "enumCard" && el.type !== "aliasCard") {
      continue;
    }
    const name = getElementName(el);
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Indexes every Event card on the board by its normalized name
 * (`nameKey` -> canonical name), so query items can be checked against the
 * event types that actually exist.
 */
export function collectEventTypeNames(elements: CanvasElement[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of elements ?? []) {
    if (el.type !== "eventCard") continue;
    const name = getElementName(el);
    if (!name) continue;
    const key = nameKey(name);
    if (key && !map.has(key)) map.set(key, name);
  }
  return map;
}
