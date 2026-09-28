import type { CanvasObject } from "@/types";

/**
 * Strips array suffix '[]' and trims whitespace from a type string.
 * Returns null if empty.
 */
export function getBaseModelType(fieldType?: string): string | null {
  if (!fieldType) return null;
  let t = fieldType.trim();
  if (t.endsWith("[]")) {
    t = t.slice(0, -2).trim();
  }
  return t || null;
}

/**
 * Finds a CanvasObject of type "model" on the canvas whose name matches
 * the given type name (case-insensitive).
 */
export function findModelByName(
  objects: CanvasObject[],
  typeName?: string,
): CanvasObject | null {
  const base = getBaseModelType(typeName);
  if (!base) return null;

  const target = base.toLowerCase();
  return (
    objects.find((o) => {
      if (o.type !== "model" || !o.modelData) return false;
      const name = o.modelData.name || o.text || "";
      return name.trim().toLowerCase() === target;
    }) || null
  );
}

/**
 * Returns true if the given type name matches any model on the canvas.
 */
export function isModelType(
  objects: CanvasObject[],
  typeName?: string,
): boolean {
  return findModelByName(objects, typeName) !== null;
}

/**
 * Builds a fast lookup map for models by lowercase trimmed name.
 */
export function buildModelMap(objects: CanvasObject[]): Map<string, CanvasObject> {
  const map = new Map<string, CanvasObject>();
  for (const o of objects) {
    if (o.type === "model" && o.modelData) {
      const name = (o.modelData.name || o.text || "").trim().toLowerCase();
      if (name) {
        map.set(name, o);
      }
    }
  }
  return map;
}

/**
 * Resolves a model CanvasObject from either an array of CanvasObjects or a prebuilt Map.
 */
export function resolveTargetModel(
  allObjectsOrMap?: CanvasObject[] | Map<string, CanvasObject>,
  typeName?: string,
): CanvasObject | null {
  if (!allObjectsOrMap || !typeName) return null;
  const base = getBaseModelType(typeName);
  if (!base) return null;
  const key = base.toLowerCase();
  if (allObjectsOrMap instanceof Map) {
    return allObjectsOrMap.get(key) || null;
  }
  return (
    allObjectsOrMap.find((o) => {
      if (o.type !== "model" || !o.modelData) return false;
      const name = (o.modelData.name || o.text || "").trim().toLowerCase();
      return name === key;
    }) || null
  );
}

