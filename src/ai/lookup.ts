/** Locating board elements by name for the AI tools. */
import type { CanvasElement } from "@/types";
import { getElementName, nameKey } from "@/utils/naming";

/** Finds a board element by name (and optional type) using normalized names. */
export function findElementByName(
  elements: CanvasElement[],
  name: string,
  type?: string,
): CanvasElement | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return elements.find(
    (el) => (!type || el.type === type) && nameKey(getElementName(el) ?? "") === key,
  );
}
