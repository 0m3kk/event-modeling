/**
 * Pure helpers shared by the store slices: data normalization/repair, history
 * snapshots, content fitting and container layout. Kept free of `set`/`get` so
 * they can be reused and tested in isolation.
 */
import type { CanvasElement } from "@/types";
import { normalizeIdentifierNames } from "@/utils/naming";
import { toolRegistry } from "@/tools/registry";
import { reflowSlices } from "@/tools/sliceCard/layout";
import { reflowDomains } from "@/tools/domainCard/layout";
import { reflowGroups } from "@/tools/groupCard/layout";
import type { HistoryEntry } from "./types";

export const MAX_HISTORY = 50;

/**
 * Canonicalizes identifier casing (camelCase) inside an element's data before
 * it enters or changes on the canvas. This is the storage counterpart of the
 * human-readable display layer: however a human or AI writes a name, only one
 * form is persisted. Returns the same reference when nothing changed.
 */
export function normalizeDataIdentifiers(elementType: string, data: any): any {
  return normalizeIdentifierNames(data, elementType);
}

/**
 * Runs only the tool's own data repair (if any). Used where existing data must
 * be preserved as-is (loading a saved board), so old boards are not rewritten.
 */
export function repairElementData(
  element: CanvasElement,
  elements: CanvasElement[],
): CanvasElement {
  const tool = toolRegistry.get(element.type);
  if (!tool?.normalizeData) return element;
  const nextData = tool.normalizeData(element.data, { elements });
  return nextData === element.data ? element : { ...element, data: nextData };
}

/**
 * Canonicalizes identifier casing, then repairs the data through its tool's
 * normalizer. Applied when new data enters the canvas (new cards, edits,
 * AI/import/paste) so human- and AI-authored names land in one agreed form.
 */
export function normalizeElementData(
  element: CanvasElement,
  elements: CanvasElement[],
): CanvasElement {
  const identifiedData = normalizeDataIdentifiers(element.type, element.data);
  const identified =
    identifiedData === element.data ? element : { ...element, data: identifiedData };
  return repairElementData(identified, elements);
}

export function snapshotState(elements: CanvasElement[]): HistoryEntry {
  return {
    elements: JSON.parse(JSON.stringify(elements)),
  };
}

/**
 * Applies container layout after any structural change: slices first (size and
 * lane their cards), then groups (fit a frame around their definition/service
 * /state cards), then domains (fit a dashed frame around their children, which may
 * include slices and groups).
 */
export function applyContainerLayout(elements: CanvasElement[]): CanvasElement[] {
  return reflowDomains(reflowGroups(reflowSlices(elements)));
}

/**
 * Grows an opted-in card (`autoFitWidth`) to at least the width its content
 * needs and, for width-sensitive cards, reflows its height to that width. Cards
 * never shrink below the width already on the element, so a manually widened
 * card stays wide. Returns the same reference when nothing changed.
 */
export function fitElementToContent(element: CanvasElement): CanvasElement {
  const tool = toolRegistry.get(element.type);
  if (!tool?.autoFitWidth || !tool.computeSize) return element;

  const size = tool.computeSize(element.data, element.width);
  const width = Math.max(element.width, size.width);
  const height = tool.computeHeightForWidth
    ? tool.computeHeightForWidth(element.data, width)
    : size.height;

  if (width === element.width && height === element.height) return element;
  return { ...element, width, height };
}

/** Content-fits every card before laying out the containers around them. */
export function fitElementsToContent(elements: CanvasElement[]): CanvasElement[] {
  return elements.map(fitElementToContent);
}

/**
 * Drops arrangement patches that would not change anything, so repeating an
 * "Arrange" action never stacks identical undo entries.
 */
export function dropUnchangedPatches(
  elements: CanvasElement[],
  patches: Array<{ id: string } & Partial<CanvasElement>>,
): Array<{ id: string } & Partial<CanvasElement>> {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return patches.filter((patch) => {
    const el = byId.get(patch.id);
    if (!el) return false;
    const moved =
      (patch.x !== undefined && patch.x !== el.x) ||
      (patch.y !== undefined && patch.y !== el.y);
    const dataChanged =
      patch.data !== undefined &&
      JSON.stringify(patch.data) !== JSON.stringify(el.data);
    return moved || dataChanged;
  });
}
