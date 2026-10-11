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
 * Ensures a newly added or updated element has a unique name among elements of the same type.
 * Reference copies (sharing referenceId with existing elements) are NOT renamed.
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

