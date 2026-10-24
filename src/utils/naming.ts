import type { CanvasElement } from "@/types";

/**
 * Normalizes a name for duplicate comparison.
 * Collapses whitespace, removes casing differences, handles camelCase/snake_case/kebab-case.
 * E.g. "OrderPlaced", "orderPlaced", "Order Placed", "ORDER_PLACED" all normalize to "order placed".
 */
export function nameKey(name: string | undefined): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Splits an identifier-ish string into words across camelCase, PascalCase,
 * snake_case and kebab-case boundaries. Shared by the display and storage
 * normalizers so both agree on where word boundaries are.
 * E.g. "OrderPlaced", "order_placed", "Order Placed" -> ["Order", "Placed"].
 */
function splitIdentifierWords(input: string): string[] {
  return input
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Common initialisms that should stay fully uppercase in a display label.
 * Only whole-word matches are affected, so "contactUs" is left alone but
 * "userId" becomes "User ID".
 */
const DISPLAY_ACRONYMS = new Set([
  "id",
  "url",
  "uri",
  "api",
  "http",
  "https",
  "html",
  "json",
  "xml",
  "sql",
  "uuid",
  "guid",
  "ip",
  "ui",
  "ux",
  "db",
  "os",
  "cpu",
  "gpu",
  "sdk",
  "jwt",
  "css",
  "ssh",
  "tcp",
  "udp",
  "dns",
  "cors",
  "csrf",
  "pdf",
  "csv",
  "ttl",
  "crud",
  "rest",
  "iam",
  "sku",
  "iso",
  "utc",
  "gmt",
  "aws",
  "gcp",
  "otp",
  "sms",
  "kyc",
  "gdpr",
]);

/**
 * Converts an identifier-ish name into a human-readable display label.
 *
 * This is a *display-only* transform: the underlying data keeps its original
 * casing. It splits camelCase, PascalCase, snake_case and kebab-case into
 * words, then Title Cases each word while keeping known initialisms uppercase.
 *
 * E.g. "firstName" -> "First Name", "userId" -> "User ID",
 * "order_placed" -> "Order Placed", "HTMLParser" -> "HTML Parser",
 * "APIKey" -> "API Key". Already-human labels such as "First Name" are
 * returned unchanged (idempotent), so it is safe to apply more than once.
 */
export function toDisplayName(input: string | undefined | null): string {
  if (!input || !input.trim()) return "";

  return splitIdentifierWords(input)
    .map((word) => {
      const lower = word.toLowerCase();
      if (DISPLAY_ACRONYMS.has(lower)) return lower.toUpperCase();
      // Preserve words that are already all-caps (unknown initialisms, codes).
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Converts any user/AI-provided name into a canonical camelCase identifier.
 * This is the *storage* side of the display layer: whatever casing or
 * separators the input uses, the canvas stores a single agreed-upon form.
 *
 * E.g. "First Name" / "first name" / "first_name" / "FirstName" -> "firstName",
 * "User ID" -> "userId", "ORDER_PLACED" -> "orderPlaced", "UUID" -> "uuid".
 * Idempotent: applying it to an already-camelCase value returns it unchanged.
 */
export function toCamelIdentifier(input: string | undefined | null): string {
  if (!input || !input.trim()) return "";
  const words = splitIdentifierWords(input);
  if (words.length === 0) return "";

  const [first, ...rest] = words;
  const head = first.toLowerCase();
  const tail = rest
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  return head + tail;
}

/**
 * Converts any user/AI-provided name into a PascalCase label. Unlike
 * {@link toDisplayName} this keeps no word separators — it is used for action
 * tokens and permissions, which read as identifiers rather than prose.
 *
 * E.g. "placeOrder" -> "PlaceOrder", "Place Order" -> "PlaceOrder",
 * "userId" -> "UserId", "inventory:restockItem" segments -> "Inventory", "RestockItem".
 * Idempotent: applying it to an already-PascalCase value returns it unchanged.
 */
export function toPascalIdentifier(input: string | undefined | null): string {
  const camel = toCamelIdentifier(input);
  if (!camel) return "";
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Identifier-valued string keys inside element data. `name` covers card titles,
 * fields, params, responses, methods and constraint state references; `field`
 * is a query-tag field reference; `tag` is a DCB tag; `type`/`aliasedType` are
 * type references.
 */
const IDENTIFIER_STRING_KEYS = new Set(["name", "field", "tag", "type", "aliasedType"]);

/**
 * Card types whose `action` tokens (a Command/Query's declared `action`, an
 * Actor's `permissions[].action`) follow the identifier storage rule. Kept
 * separate from {@link IDENTIFIER_STRING_KEYS} because a token carries the `:`
 * namespace separator and the `*` wildcard, so it needs its own normalizer.
 */
const ACTION_TOKEN_TYPES = new Set(["commandCard", "queryCard", "actorCard"]);

/**
 * True when committing `input` would leave the stored identifier `current`
 * unchanged. Tolerance for the display layer: the inline editor shows the
 * human-readable form while the data holds camelCase, so an untouched commit
 * must not create a spurious edit (or undo step).
 */
export function isSameIdentifier(input: string, current: string | undefined): boolean {
  const trimmed = input.trim();
  return trimmed === current || toCamelIdentifier(trimmed) === current;
}

/**
 * Rewrites identifier names inside an element's data to canonical camelCase,
 * in place conceptually but returning a new object only when something changed
 * (so callers can cheaply detect no-ops). Display-only free text (`description`,
 * `text`, `tag`, `rules`) is left untouched, and enum members are treated as
 * domain values rather than identifiers, so they keep their original casing.
 *
 * Used by the store (new cards and edits) and the AI bridge, so any input —
 * typed by a human or generated by a model — is stored in one consistent form.
 */
export function normalizeIdentifierNames<T = any>(data: T, elementType?: string): T {
  const isEnumCard = elementType === "enumCard";
  const canonicalizesActions = ACTION_TOKEN_TYPES.has(elementType ?? "");

  function walk(value: any, normalizeName: boolean): any {
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const mapped = walk(item, normalizeName);
        if (mapped !== item) changed = true;
        return mapped;
      });
      return changed ? next : value;
    }

    if (value && typeof value === "object") {
      let changed = false;
      const next: Record<string, any> = {};

      for (const [key, child] of Object.entries(value)) {
        let nextChild = child;

        if (typeof child === "string" && canonicalizesActions && key === "action") {
          const canonical = toCanonicalAction(child);
          if (canonical !== child) {
            nextChild = canonical;
            changed = true;
          }
        } else if (typeof child === "string" && IDENTIFIER_STRING_KEYS.has(key)) {
          // Enum members live under `fields[].name` and are values, not names.
          if (key !== "name" || normalizeName) {
            const canonical = toCamelIdentifier(child);
            if (canonical !== child) {
              nextChild = canonical;
              changed = true;
            }
          }
        } else if (key === "types" && Array.isArray(child)) {
          // Query items hold event names as a plain string array.
          let listChanged = false;
          const list = child.map((entry) => {
            if (typeof entry !== "string") return entry;
            const canonical = toCamelIdentifier(entry);
            if (canonical !== entry) listChanged = true;
            return canonical;
          });
          if (listChanged) {
            nextChild = list;
            changed = true;
          }
        } else if (key === "fields" && isEnumCard) {
          // enumCard `fields` are member values; keep their casing.
          const mapped = walk(child, false);
          if (mapped !== child) {
            nextChild = mapped;
            changed = true;
          }
        } else if (child && typeof child === "object") {
          const mapped = walk(child, normalizeName);
          if (mapped !== child) {
            nextChild = mapped;
            changed = true;
          }
        }

        next[key] = nextChild;
      }

      return changed ? next : value;
    }

    return value;
  }

  return walk(data, true) as T;
}

/**
 * Formats a field's type for canvas display. The type name goes through the
 * same human-readable transform as {@link toDisplayName}, and the `[]` marker
 * is re-appended for array fields (e.g. "CustomerId" -> "Customer ID",
 * "string" + array -> "String[]"). Display-only: the stored type is untouched.
 */
export function toDisplayType(type: string | undefined | null, isArray?: boolean): string {
  const label = toDisplayName(type);
  if (!label) return "";
  return `${label}${isArray ? "[]" : ""}`;
}

/**
 * Converts an RBAC action token or permission pattern into a PascalCase display
 * label. The `:` namespace separator and the `*` wildcard are preserved, and each
 * literal segment runs through {@link toPascalIdentifier}.
 *
 * Display-only: the stored token keeps its canonical camelCase form.
 * E.g. "sales:placeOrder" -> "Sales:PlaceOrder", "sales:*" -> "Sales:*",
 * "*:getOrder" -> "*:GetOrder". Idempotent.
 */
export function toDisplayAction(input: string | undefined | null): string {
  if (!input || !input.trim()) return "";
  return input
    .split(":")
    .map((part) => (part.trim() === "*" ? "*" : toPascalIdentifier(part)))
    .join(":");
}

/**
 * Converts an action token or permission pattern into its canonical storage
 * form: the inverse of {@link toDisplayAction}. Each `:`-separated segment is
 * reduced to a camelCase identifier and `*` wildcards are preserved, so
 * however a human or AI writes the token it lands in one agreed form.
 *
 * E.g. "Sales:Place Order" -> "sales:placeOrder", "Sales:*" -> "sales:*",
 * "*:Get Order" -> "*:getOrder". Idempotent.
 */
export function toCanonicalAction(input: string | undefined | null): string {
  if (!input || !input.trim()) return "";
  return input
    .split(":")
    .map((part) => (part.trim() === "*" ? "*" : toCamelIdentifier(part)))
    .join(":");
}

/**
 * True when committing `input` would leave the stored action token `current`
 * unchanged. Tolerates the display form, so an untouched commit from the inline
 * editor ("Sales:Place Order" vs. "sales:placeOrder") is not a spurious edit.
 * The action-token counterpart of {@link isSameIdentifier}.
 */
export function isSameAction(input: string, current: string | undefined): boolean {
  const trimmed = input.trim();
  if (trimmed === (current ?? "")) return true;
  return toCanonicalAction(trimmed) === toCanonicalAction(current);
}

/**
 * Extract human-readable name from an element.
 * Prioritizes `data.name`, then `data.title`, then `data.text`.
 */
export function getElementName(el: { type?: string; data?: any }): string | undefined {
  if (!el.data) return undefined;
  if (typeof el.data.name === "string" && el.data.name.trim().length > 0) {
    return el.data.name.trim();
  }
  if (typeof el.data.title === "string" && el.data.title.trim().length > 0) {
    return el.data.title.trim();
  }
  if (typeof el.data.text === "string" && el.data.text.trim().length > 0) {
    return el.data.text.trim();
  }
  return undefined;
}

/**
 * Replaces the name in element data while preserving other fields.
 */
export function setElementName<T extends { data: any }>(el: T, name: string): T {
  if (!el.data) {
    return { ...el, data: { name } };
  }
  if ("name" in el.data) {
    return { ...el, data: { ...el.data, name } };
  }
  if ("title" in el.data) {
    return { ...el, data: { ...el.data, title: name } };
  }
  if ("text" in el.data) {
    return { ...el, data: { ...el.data, text: name } };
  }
  return { ...el, data: { ...el.data, name } };
}

/**
 * Generates a unique name by appending an incrementing number suffix if base is taken.
 * If `base` is not taken, returns `base`.
 * If `base` is taken:
 * - "Order" -> "Order 2"
 * - "Order 2" -> "Order 3"
 * - "Order 1" -> "Order 2"
 */
export function makeUniqueName(base: string, taken: Iterable<string>): string {
  const trimmed = base.trim();
  if (!trimmed) return base;

  const takenSet = new Set<string>();
  for (const item of taken) {
    const k = nameKey(item);
    if (k) takenSet.add(k);
  }

  if (!takenSet.has(nameKey(trimmed))) {
    return trimmed;
  }

  const match = trimmed.match(/^(.*?)(?:\s+(\d+))$/);
  const root = match ? match[1].trim() : trimmed;

  let n = 2;
  if (match) {
    n = parseInt(match[2], 10) + 1;
  }

  while (takenSet.has(nameKey(`${root} ${n}`))) {
    n++;
  }

  return `${root} ${n}`;
}

/**
 * Card types whose names are labels rather than global identifiers. Service
 * cards are single method executions, and different services may expose a
 * method with the same name, so they are allowed to share a name.
 */
const NAME_UNIQUENESS_EXEMPT_TYPES = new Set(["serviceCard"]);

/**
 * Ensures a newly added or updated element has a unique name among elements of the same type.
 * Reference copies (sharing referenceId with existing elements) and types that
 * may share names (Service) are NOT renamed.
 */
export function ensureUniqueElement(
  element: CanvasElement,
  existingElements: CanvasElement[],
): CanvasElement {
  // If element is a reference copy of an existing element, it must keep the referenced entity's name
  if (
    element.referenceId &&
    existingElements.some(
      (el) => el.id !== element.id && el.referenceId === element.referenceId,
    )
  ) {
    return element;
  }

  if (NAME_UNIQUENESS_EXEMPT_TYPES.has(element.type)) return element;

  const rawName = getElementName(element);
  if (!rawName) return element;

  // Collect taken names of the same type (cùng loại)
  const candidateElements = existingElements.filter((el) => {
    if (el.id === element.id) return false;
    if (el.type !== element.type) return false;
    if (element.referenceId && el.referenceId === element.referenceId) return false;
    return true;
  });

  const takenNames = candidateElements
    .map(getElementName)
    .filter((n): n is string => Boolean(n));

  const uniqueName = makeUniqueName(rawName, takenNames);
  if (uniqueName === rawName) return element;

  return setElementName(element, uniqueName);
}

/**
 * Resolves a unique data payload when an element is being updated.
 * If patchData specifies a new name that collides with an element of the same type
 * (ignoring itself and reference siblings), adjusts the name to be unique.
 */
export function resolveUniqueDataOnUpdate<T extends Record<string, any>>(
  target: CanvasElement,
  patchData: T,
  elements: CanvasElement[],
): T {
  if (NAME_UNIQUENESS_EXEMPT_TYPES.has(target.type)) return patchData;

  const currentName = getElementName(target);
  const nextName = getElementName({ ...target, data: patchData });
  if (!nextName || nextName === currentName) {
    return patchData;
  }

  const candidates = elements.filter((el) => {
    if (el.id === target.id) return false;
    if (el.type !== target.type) return false;
    if (target.referenceId && el.referenceId === target.referenceId) return false;
    return true;
  });
  const takenNames = candidates.map(getElementName).filter((n): n is string => Boolean(n));
  const uniqueName = makeUniqueName(nextName, takenNames);
  if (uniqueName !== nextName) {
    return setElementName({ ...target, data: patchData }, uniqueName).data as T;
  }
  return patchData;
}

