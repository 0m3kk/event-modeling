/**
 * Name normalization shared across the spec package.
 *
 * Collapses casing and separators so `OrderPlaced`, `order_placed` and
 * `Order Placed` compare equal. Mirrors the board's `nameKey` so definitions
 * de-duplicate the same way in the app and in the generator.
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

/** Splits an identifier-ish string into words across camel/snake/kebab/space boundaries. */
export function splitWords(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

/** `OrderPlaced` / `order placed` -> `OrderPlaced`. */
export function pascalCase(input: string | undefined | null): string {
  return splitWords(input)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/** `OrderPlaced` / `order placed` -> `orderPlaced`. */
export function camelCase(input: string | undefined | null): string {
  const pascal = pascalCase(input);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : "";
}

/** `OrderPlaced` / `order placed` -> `order_placed`. */
export function snakeCase(input: string | undefined | null): string {
  return splitWords(input)
    .map((word) => word.toLowerCase())
    .join("_");
}

/** `OrderPlaced` / `order placed` -> `order-placed`. */
export function kebabCase(input: string | undefined | null): string {
  return splitWords(input)
    .map((word) => word.toLowerCase())
    .join("-");
}
