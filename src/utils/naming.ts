import type { CanvasObject } from "@/types";
import { stormDefaultTitle } from "@/constants/storm";
import { MODEL_KIND_LABELS } from "@/constants/model";

const ACRONYMS = new Set([
  "id",
  "api",
  "url",
  "uri",
  "json",
  "http",
  "https",
  "csv",
  "tsv",
  "uuid",
  "guid",
  "sql",
  "db",
  "html",
  "css",
  "xml",
  "yaml",
  "jwt",
  "ip",
  "os",
  "ai",
  "sdk",
  "cli",
  "dto",
  "crud",
  "rest",
  "ui",
  "ux",
  "pdf",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "otp",
  "sms",
  "gps",
  "sku",
  "seo",
  "sso",
  "tls",
  "ssl",
  "utc",
  "gmt",
  "cors",
  "cdn",
  "faq",
  "kpi",
  "roi",
  "mvp",
  "b2b",
  "b2c",
]);

function splitWords(input: string): string[] {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function formatWord(word: string): string {
  if (/^\d+$/.test(word)) return word;
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (lower.endsWith("s") && ACRONYMS.has(lower.slice(0, -1))) {
    return `${lower.slice(0, -1).toUpperCase()}s`;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toDisplayName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return input;
  return splitWords(trimmed).map(formatWord).join(" ");
}

/**
 * Comparison key for component names. Two names are considered the same when
 * their display form matches, so `"create order"`, `"CreateOrder"` and
 * `"Create Order"` all collapse to `"create order"`. An empty key means
 * "unnamed" — blank names are never treated as duplicates.
 */
export function nameKey(name: string | undefined): string {
  if (!name) return "";
  return toDisplayName(name).replace(/\s+/g, " ").trim().toLowerCase();
}

/** Title of a storm card / model node; `undefined` for unnamed object types. */
export function componentNameOf(obj: CanvasObject): string | undefined {
  if (obj.type === "storm") return obj.stormData?.name;
  if (obj.type === "model") return obj.modelData?.name;
  return undefined;
}

/**
 * Visible title a component falls back to when it has no name of its own:
 * the kind label ("Command", "Object", …) or the BDD phase step for
 * Given/When/Then cards. Renderers already show these, so seeding them as real
 * names keeps the displayed titles unambiguous.
 */
export function defaultComponentName(obj: CanvasObject): string | undefined {
  if (obj.type === "storm" && obj.stormData) {
    return stormDefaultTitle(obj.stormData.kind, obj.stormData.phase);
  }
  if (obj.type === "model" && obj.modelData) {
    return MODEL_KIND_LABELS[obj.modelData.kind];
  }
  return undefined;
}

/** Name that represents this component for uniqueness checks. */
function effectiveComponentName(obj: CanvasObject): string | undefined {
  const name = componentNameOf(obj);
  return name && name.trim() ? name : defaultComponentName(obj);
}

/**
 * Normalized names already taken by storm cards / model nodes. Unnamed cards
 * count as their default label so a new "Command" cannot duplicate the one a
 * legacy blank card is already showing. `excludeId` skips a single object —
 * used when renaming it so it does not clash with its own previous name.
 */
export function collectComponentNameKeys(
  objects: CanvasObject[],
  excludeId?: string,
): Set<string> {
  const keys = new Set<string>();
  for (const obj of objects) {
    if (obj.id === excludeId) continue;
    const key = nameKey(effectiveComponentName(obj));
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Returns a name that does not collide with `taken`. `taken` may hold raw
 * names or normalized keys (as returned by `collectComponentNameKeys`) — both
 * are compared through `nameKey`. Blank names pass through untouched,
 * otherwise collisions get a `" 2"`, `" 3"`, … suffix.
 */
export function makeUniqueName(base: string, taken: Iterable<string>): string {
  const takenSet = new Set<string>();
  for (const entry of taken) {
    const entryKey = nameKey(entry);
    if (entryKey) takenSet.add(entryKey);
  }
  const key = nameKey(base);
  if (!key || !takenSet.has(key)) return base;
  let n = 2;
  while (takenSet.has(nameKey(`${base} ${n}`))) n += 1;
  return `${base} ${n}`;
}

/** Returns `obj` with its component name replaced (or unchanged if it has none). */
function withComponentName(obj: CanvasObject, name: string): CanvasObject {
  if (obj.type === "storm" && obj.stormData) {
    return { ...obj, stormData: { ...obj.stormData, name } };
  }
  if (obj.type === "model" && obj.modelData) {
    return { ...obj, modelData: { ...obj.modelData, name } };
  }
  return obj;
}

/**
 * Returns `obj` with a board-unique component name, or the object unchanged
 * when it carries no nameable payload. A blank name resolves to the component's
 * default label (so it is stored and deduplicated instead of silently
 * collapsing two cards onto the same rendered title).
 */
export function ensureUniqueComponentName(
  obj: CanvasObject,
  existing: CanvasObject[],
): CanvasObject {
  const raw = componentNameOf(obj);
  const base = raw && raw.trim() ? raw.trim() : defaultComponentName(obj);
  if (!base) return obj;

  const unique = makeUniqueName(
    base,
    collectComponentNameKeys(existing, obj.id),
  );
  if (unique === raw) return obj;
  return withComponentName(obj, unique);
}
