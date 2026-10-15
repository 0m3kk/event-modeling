/**
 * Minimal YAML emitter for the specification export.
 *
 * Supports objects, arrays, strings, numbers, booleans and null; keys with
 * `undefined` values are omitted. Complex array items are emitted block-style
 * (`- key: value`) so the output reads like a hand-written spec.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when a string must be quoted to stay a string in YAML: it looks like
 * another scalar type, starts with an indicator character, or carries
 * significant whitespace.
 */
export function needsQuotes(value: string): boolean {
  if (value === "") return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/[:#]\s/.test(value) || /:\s*$/.test(value)) return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/[\n\r\t]/.test(value)) return true;
  return false;
}

export function scalarToYaml(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  const text = String(value);
  // JSON string syntax is a valid YAML double-quoted scalar (escapes included).
  return needsQuotes(text) ? JSON.stringify(text) : text;
}

function isEmptyContainer(value: unknown): boolean {
  return (
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

export function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (isEmptyContainer(item) || !isPlainObject(item)) {
          return `${pad}- ${scalarToYaml(item)}`;
        }
        // Render the object one level in, then fold its first line onto the dash.
        const block = toYaml(item, indent + 1);
        const childPad = "  ".repeat(indent + 1);
        return `${pad}- ${block.slice(childPad.length)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined);
    if (keys.length === 0) return "{}";
    return keys
      .map((key) => {
        const child = value[key];
        const keyText = needsQuotes(key) ? JSON.stringify(key) : key;
        if (!isPlainObject(child) && !Array.isArray(child)) {
          return `${pad}${keyText}: ${scalarToYaml(child)}`;
        }
        if (isEmptyContainer(child)) {
          return `${pad}${keyText}: ${Array.isArray(child) ? "[]" : "{}"}`;
        }
        return `${pad}${keyText}:\n${toYaml(child, indent + 1)}`;
      })
      .join("\n");
  }

  return `${pad}${scalarToYaml(value)}`;
}
