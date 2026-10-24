/**
 * Updates an existing element in place, keeping its id, position and width.
 *
 * The payload reuses the matching create tool's schema (minus `target`, which
 * locates the card by its current name) and is rebuilt through that tool's
 * `onCreate`, so param->data mappings (e.g. enum `values` -> `fields`) are
 * handled uniformly. The rebuilt data is validated against the board with the
 * element itself excluded, so its own tags never conflict with themselves.
 */
import { toolRegistry } from "@/tools";
import { useCanvasStore } from "@/store";
import { normalizeIdentifierNames } from "@/utils/naming";
import { findFreeSpot } from "@/utils/placement";
import type { CanvasElement } from "@/types";
import { toCreateToolName } from "../jsonSchema";
import { findElementByName } from "../lookup";
import {
  AI_PLACEMENT_GAP,
  resolveDomainMembership,
  resolveGroupMembership,
  resolveSliceMembership,
} from "../placement";
import { buildValidationError, carryOverDescriptions } from "./common";

export function executeUpdateElement(updateName: string, args: any): string {
  const definition = toolRegistry.getByAIToolName(toCreateToolName(updateName));
  const ai = definition?.ai;
  if (!definition || !ai) {
    return JSON.stringify({ error: `Unknown tool: ${updateName}` });
  }

  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the current card name) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Target name is required." }],
    });
  }

  const existing = findElementByName(state.elements, targetName, definition.type);
  if (!existing) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${definition.type} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      type: definition.type,
      name: targetName,
    });
  }

  const { target: _target, ...payload } = args ?? {};
  // A tool may reconcile an update against the existing element (e.g. a Slice
  // reusing its lane ids so its cards stay put); otherwise rebuild from scratch.
  const built = ai.onUpdate
    ? ai.onUpdate(existing, payload)
    : ai.onCreate(payload, { x: existing.x, y: existing.y });

  // Preserve identity/meta the payload did not mention so an update never
  // silently drops the card's name, colour, description or live links.
  const existingData = existing.data ?? {};
  let nextData: any = built.data;
  if (!("name" in payload) && existingData.name !== undefined) {
    nextData = { ...nextData, name: existingData.name };
  }
  if (!("color" in payload) && existingData.color !== undefined) {
    nextData = { ...nextData, color: existingData.color };
  }
  if (!("description" in payload) && existingData.description !== undefined) {
    nextData = { ...nextData, description: existingData.description };
  }
  if (!("serviceName" in payload) && existingData.serviceName !== undefined) {
    nextData = { ...nextData, serviceName: existingData.serviceName };
  }
  if (!("text" in payload) && existingData.text !== undefined) {
    nextData = { ...nextData, text: existingData.text };
  }
  // The canvas overview omits field-item descriptions, so carry the existing
  // ones over by name when the model leaves them out of the payload.
  nextData = carryOverDescriptions(nextData, existingData);

  // Enforce canonical camelCase identifiers before validating, so type/name
  // references the model wrote in any casing still resolve against the board.
  nextData = normalizeIdentifierNames(nextData, definition.type);

  // Validate against the board WITHOUT this element, otherwise its own tags
  // would look like a conflict with themselves.
  const others = state.elements.filter((el) => el.id !== existing.id);
  if (definition.validateData) {
    const { issues } = definition.validateData(nextData, { elements: others });
    if (issues.length > 0) {
      return buildValidationError(issues);
    }
  }
  if (definition.normalizeData) {
    nextData = definition.normalizeData(nextData, { elements: others });
  }

  const size = definition.computeSize
    ? definition.computeSize(nextData)
    : { width: existing.width, height: existing.height };

  // Optional slice/lane placement carried by the update.
  const placement = resolveSliceMembership(state.elements, definition.type, args);
  if (placement.error) {
    return JSON.stringify({
      status: "error",
      error: "slice_placement_failed",
      message: placement.error.message,
      issues: placement.error.issues,
    });
  }
  const inLane = placement.requested && Boolean(placement.sliceId);
  const membership: Partial<CanvasElement> = placement.requested
    ? { sliceId: placement.sliceId, laneId: placement.laneId, groupId: undefined, domainId: undefined }
    : {};
  const nextWidth = Math.max(existing.width, size.width);

  // Optional Group / Domain placement carried by the update. A card in a Slice
  // lane cannot belong to a Group or Domain, so a lane placement wins. A Group
  // is more specific than the Domain it may sit in, so it wins over a Domain.
  const movedToContainer: Partial<CanvasElement> = {};
  if (!inLane) {
    const groupPlacement = resolveGroupMembership(state.elements, definition.type, args);
    if (groupPlacement.error) {
      return JSON.stringify({
        status: "error",
        error: "group_placement_failed",
        message: groupPlacement.error.message,
        issues: groupPlacement.error.issues,
      });
    }
    if (groupPlacement.requested) {
      membership.groupId = groupPlacement.groupId;
      membership.domainId = undefined;
      // When landing in a real Group, sit beside its other children so the
      // frame grows around the card instead of stretching to its old position.
      if (groupPlacement.groupId) {
        const groupChildren = state.elements.filter(
          (el) => el.groupId === groupPlacement.groupId && el.id !== existing.id,
        );
        const spot = findFreeSpot(
          groupChildren,
          { x: existing.x, y: existing.y, width: nextWidth, height: size.height },
          AI_PLACEMENT_GAP,
        );
        movedToContainer.x = spot.x;
        movedToContainer.y = spot.y;
      }
    } else {
      const domainPlacement = resolveDomainMembership(state.elements, definition.type, args);
      if (domainPlacement.error) {
        return JSON.stringify({
          status: "error",
          error: "domain_placement_failed",
          message: domainPlacement.error.message,
          issues: domainPlacement.error.issues,
        });
      }
      if (domainPlacement.requested) {
        membership.domainId = domainPlacement.domainId;
        membership.groupId = undefined;
        // When landing in a real Domain, sit beside its other children so the
        // frame grows around the card instead of stretching to its old position.
        if (domainPlacement.domainId) {
          const domainChildren = state.elements.filter(
            (el) => el.domainId === domainPlacement.domainId && el.id !== existing.id,
          );
          const spot = findFreeSpot(
            domainChildren,
            { x: existing.x, y: existing.y, width: nextWidth, height: size.height },
            AI_PLACEMENT_GAP,
          );
          movedToContainer.x = spot.x;
          movedToContainer.y = spot.y;
        }
      }
    }
  }

  // Keep the card's position. Height is always content-driven; width only ever
  // grows, so wide query items (event types / tag badges) still fit after an AI
  // edit without undoing a deliberately narrower card.
  state.updateElement(existing.id, {
    data: nextData,
    height: size.height,
    width: nextWidth,
    ...movedToContainer,
    ...membership,
  });

  return JSON.stringify({ status: "success", updatedId: existing.id, type: existing.type });
}
