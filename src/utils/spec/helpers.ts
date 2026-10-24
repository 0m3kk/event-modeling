/** Small shared helpers for the specification builder. */
import type { CanvasElement } from "@/types";
import { getElementName, nameKey } from "../naming";

/** One DCB query item as stored on State/View cards. */
export interface RawQueryItem {
  types?: string[];
  tags?: Array<{ tag?: string; field?: string }>;
  description?: string;
}

export function elementName(el: CanvasElement): string {
  return getElementName(el) ?? el.id;
}

/** Keeps the first element seen for each name, so mirror copies collapse. */
export function uniqueByName(elements: CanvasElement[]): CanvasElement[] {
  const seen = new Set<string>();
  const out: CanvasElement[] = [];
  for (const el of elements) {
    const name = getElementName(el);
    const key = name ? nameKey(name) : `#${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(el);
  }
  return out;
}

/**
 * Keeps the first element seen for each reference group. Unlike
 * {@link uniqueByName}, distinct elements that merely share a name are all
 * kept — Service cards are allowed to share a method name.
 */
export function uniqueByReference(elements: CanvasElement[]): CanvasElement[] {
  const seen = new Set<string>();
  const out: CanvasElement[] = [];
  for (const el of elements) {
    if (!el.referenceId) {
      out.push(el);
      continue;
    }
    if (seen.has(el.referenceId)) continue;
    seen.add(el.referenceId);
    out.push(el);
  }
  return out;
}

/** Maps DCB query items (`types` OR'd, `tags` AND'd) to their spec form. */
export function mapQueryItems(items: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items.map((raw) => {
    const item = (raw ?? {}) as RawQueryItem;
    const out: Record<string, unknown> = {
      types: Array.isArray(item.types)
        ? item.types.filter((t): t is string => typeof t === "string" && t.length > 0)
        : [],
    };
    const tags = Array.isArray(item.tags)
      ? item.tags
          .filter((t) => t && (t.tag || t.field))
          .map((t) => ({ tag: t.tag ?? "", field: t.field ?? "" }))
      : [];
    if (tags.length > 0) out.tags = tags;
    if (item.description) out.description = item.description;
    return out;
  });
}

/**
 * Renders a list of named items as plain strings, or as `{ name, description }`
 * objects when at least one item carries a description.
 */
export function listNamed(
  items: unknown,
): Array<string | { name: string; description?: string }> {
  if (!Array.isArray(items)) return [];
  const valid = items.filter(
    (i): i is { name: string; description?: string } =>
      Boolean(i) && typeof (i as { name?: unknown }).name === "string",
  );
  const anyDescription = valid.some((i) => i.description);
  return valid.map((i) =>
    anyDescription
      ? { name: i.name, ...(i.description ? { description: i.description } : {}) }
      : i.name,
  );
}
