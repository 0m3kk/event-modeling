/**
 * Canvas operations that add or remove elements: single delete and live
 * reference copies.
 */
import { useCanvasStore } from "@/store";
import { getElementName } from "@/utils/naming";
import { findElementByName } from "../lookup";
import { applyCreatedPlacement } from "../placement";

/** Deletes a single element located by name (and optional type). */
export function executeDeleteElement(args: any): string {
  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  const type = typeof args?.type === "string" ? args.type.trim() : "";

  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the element name) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Element name is required." }],
    });
  }

  const element = findElementByName(state.elements, targetName, type || undefined);
  if (!element) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${type || "element"} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      name: targetName,
    });
  }

  state.deleteElements([element.id]);
  return JSON.stringify({ status: "success", deletedId: element.id, type: element.type });
}

/**
 * Creates a live reference copy of an existing card, linked to the original via
 * a shared `referenceId`. Both cards mirror each other's data and size until
 * unlinked. Locates the original by name (optionally narrowed by `type`).
 */
export function executeCreateReferenceCopy(args: any): string {
  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  const type = typeof args?.type === "string" ? args.type.trim() : "";

  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the card name to copy) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Card name is required." }],
    });
  }

  const source = findElementByName(state.elements, targetName, type || undefined);
  if (!source) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${type || "element"} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      name: targetName,
    });
  }

  const copy = state.createReferenceCopy(source.id);
  if (!copy) {
    return JSON.stringify({
      status: "error",
      error: "reference_copy_failed",
      message: `Could not create a reference copy of "${targetName}".`,
    });
  }

  const placementError = applyCreatedPlacement(copy.id, args);
  if (placementError) return placementError;

  return JSON.stringify({
    status: "success",
    createdId: copy.id,
    type: copy.type,
    referenceId: copy.referenceId,
    sourceId: source.id,
    note: `Reference copy of "${getElementName(source) ?? targetName}" created; it stays in sync with the original.`,
  });
}
