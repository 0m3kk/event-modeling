import type { CanvasElement } from "@/types";
import { toCamelIdentifier } from "./naming";

/**
 * DCB tag metadata collected from the Event cards on the board.
 *
 * In DCB an event can carry tags (`course:c1`) which partition the global event
 * log. On the board a tag is attached to a single event field (`isTag`/`tag`),
 * so that field's type becomes the type the tag "identifies". State/Query cards
 * may only reference tags that already exist on an event, and the param field
 * they map the tag to must share this same type.
 */
export interface BoardTagInfo {
  /** The tag name (e.g. `course`). */
  tag: string;
  /** Distinct field types (with `[]` for arrays) the tag is attached to. */
  types: string[];
  /** Names of the event cards that carry this tag. */
  fromEvents: string[];
}

/**
 * Canonical type key for a field, including its array-ness, so `string` and
 * `string[]` are treated as different types when matching tag fields.
 */
export function fieldTypeKey(field: { type?: string; isArray?: boolean }): string {
  const type = (field?.type || "").trim();
  return field?.isArray ? `${type}[]` : type;
}

/**
 * Scans every Event card on the board and returns the tag catalog: each tag
 * paired with the type(s) of the event field(s) it is attached to.
 */
export function collectBoardTags(elements: CanvasElement[]): BoardTagInfo[] {
  const map = new Map<string, { types: Set<string>; events: Set<string> }>();

  for (const el of elements) {
    if (el.type !== "eventCard") continue;
    const fields = Array.isArray(el.data?.fields) ? el.data.fields : [];
    for (const field of fields) {
      // Tags are stored canonically in camelCase; normalize again here so a
      // legacy board (not rewritten on load) still matches its references.
      const tag = toCamelIdentifier(typeof field?.tag === "string" ? field.tag : "");
      if (!tag) continue;
      const entry = map.get(tag) ?? { types: new Set<string>(), events: new Set<string>() };
      entry.types.add(fieldTypeKey(field));
      if (typeof el.data?.name === "string" && el.data.name.trim()) {
        entry.events.add(el.data.name);
      }
      map.set(tag, entry);
    }
  }

  return Array.from(map.entries()).map(([tag, value]) => ({
    tag,
    types: Array.from(value.types),
    fromEvents: Array.from(value.events),
  }));
}

/**
 * Convenience shape of {@link collectBoardTags} indexed by tag name, mapping to
 * the set of acceptable field type keys. Used to validate tag references.
 */
export function collectBoardTagCatalog(elements: CanvasElement[]): Map<string, Set<string>> {
  const catalog = new Map<string, Set<string>>();
  for (const info of collectBoardTags(elements)) {
    catalog.set(info.tag, new Set(info.types));
  }
  return catalog;
}
