/**
 * Clipboard copy/paste helpers. Unlike {@link createReferenceCopy}, a pasted
 * element is a *standalone* duplicate: it gets a fresh id, an offset position
 * and no `referenceId`, so it never syncs with the original. Its name is made
 * unique by the store's normal add path (`ensureUniqueElement`).
 */
import { nanoid } from "nanoid";
import type { CanvasElement } from "@/types";

/** Distance each successive paste is nudged so copies do not stack exactly. */
export const PASTE_OFFSET_STEP = 24;

/**
 * Builds an independent copy of an element for pasting: new id, position
 * offset by `offset` on both axes, a deep-cloned data payload and no reference
 * link (`referenceId`/`isOriginal` dropped).
 */
export function cloneElementForPaste(element: CanvasElement, offset: number): CanvasElement {
  const { referenceId: _referenceId, isOriginal: _isOriginal, ...rest } = element;
  return {
    ...rest,
    id: `${element.type}-${nanoid(6)}`,
    x: element.x + offset,
    y: element.y + offset,
    data: JSON.parse(JSON.stringify(element.data)),
  };
}
