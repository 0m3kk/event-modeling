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
