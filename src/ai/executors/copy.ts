/**
 * Canvas operations that add or remove elements: single delete, live reference
 * copies and Service method-execution copies.
 */
import { useCanvasStore } from "@/store";
import { getElementName, nameKey } from "@/utils/naming";
import type { ServiceMethod } from "@/tools/serviceCard/layout";
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

/**
 * Creates a method-execution copy of a Service method: a live Service card that
 * renders just that one method and stays linked to the source service. Locates
 * the source Service by name (ignoring existing execution copies, which share
 * the name) and the method by its name.
 */
export function executeCreateServiceMethodExecution(args: any): string {
  const state = useCanvasStore.getState();
  const serviceName = typeof args?.service === "string" ? args.service.trim() : "";
  const methodName = typeof args?.method === "string" ? args.method.trim() : "";

  if (!serviceName || !methodName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "Both `service` and `method` are required.",
      issues: [
        ...(serviceName
          ? []
          : [{ path: "service", code: "service_missing", message: "Service name is required." }]),
        ...(methodName
          ? []
          : [{ path: "method", code: "method_missing", message: "Method name is required." }]),
      ],
    });
  }

  // Prefer a real Service over an execution copy, which shares its name but
  // renders a single method.
  const service =
    state.elements.find(
      (el) =>
        el.type === "serviceCard" &&
        !(el.data as { methodRef?: unknown } | undefined)?.methodRef &&
        nameKey(getElementName(el) ?? "") === nameKey(serviceName),
    ) ?? findElementByName(state.elements, serviceName, "serviceCard");
  if (!service) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No Service named "${serviceName}" exists on the board. Create it first with create_service_card or use get_canvas_overview to list services.`,
      name: serviceName,
    });
  }

  const methods =
    ((service.data as { methods?: ServiceMethod[] } | undefined)?.methods ?? []) as ServiceMethod[];
  const method = methods.find((m) => nameKey(m.name) === nameKey(methodName));
  if (!method) {
    return JSON.stringify({
      status: "error",
      error: "method_not_found",
      message: `Service "${getElementName(service) ?? serviceName}" has no method named "${methodName}".`,
      availableMethods: methods.map((m) => m.name),
    });
  }

  const copy = state.createMethodCopy(service.id, method.id);
  if (!copy) {
    return JSON.stringify({
      status: "error",
      error: "method_copy_failed",
      message: `Could not create an execution copy of "${methodName}" from "${serviceName}".`,
    });
  }

  const placementError = applyCreatedPlacement(copy.id, args);
  if (placementError) return placementError;

  const serviceLabel = getElementName(service) ?? serviceName;
  return JSON.stringify({
    status: "success",
    createdId: copy.id,
    type: copy.type,
    service: serviceLabel,
    method: method.name,
    note: `Execution copy of "${method.name}" created; it stays linked to "${serviceLabel}".`,
  });
}
