/**
 * Resolves where a freshly-created element should sit: a concrete
 * position/membership delta, or a JSON error string to hand back to the model.
 *
 * Placement precedence mirrors ordinary AI-created cards: a Slice lane wins
 * over a Group, which wins over the Domain it may sit in; otherwise the card is
 * nudged to the nearest free slot.
 */
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { findFreeSpot } from "@/utils/placement";
import { DOMAIN_LABEL_HEIGHT, DOMAIN_PADDING } from "@/tools/domainCard/layout";
import { GROUP_LABEL_HEIGHT, GROUP_PADDING } from "@/tools/groupCard/layout";
import { summarizeDomains, summarizeGroups, summarizeSlices } from "../canvasOverview";
import { resolveDomainMembership } from "./domain";
import { resolveGroupMembership } from "./group";
import { resolveSliceMembership } from "./slice";

/** Breathing room kept between free-standing AI-created cards. */
export const AI_PLACEMENT_GAP = 40;

/**
 * Top-left of a container's content area — the spot its first child occupies.
 *
 * AI cards spawn at the viewport centre, which can be far from the Group/Domain
 * frame they are being placed into. Anchoring the free-spot search here keeps
 * the new card inside (or right beside) the frame instead of dragging the frame
 * across the canvas — and over other cards — to reach a distant spawn point.
 */
export function containerContentOrigin(
  container: { x: number; y: number } | undefined,
  padding: number,
  labelHeight: number,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  return container
    ? { x: container.x + padding, y: container.y + padding + labelHeight }
    : fallback;
}

/** Result of resolving where a freshly-created element should sit. */
type CreatedPlacement = { error: string } | { delta: Partial<CanvasElement> };

/**
 * The element's own id is ignored when looking for a free spot so an
 * already-added copy does not collide with itself.
 */
export function resolveCreatedPlacement(element: CanvasElement, args: any): CreatedPlacement {
  const state = useCanvasStore.getState();
  const others = state.elements.filter((el) => el.id !== element.id);
  const rect = {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };

  // Optional Slice/lane placement carried by the call.
  const placement = resolveSliceMembership(state.elements, element.type, args);
  if (placement.error) {
    return {
      error: JSON.stringify({
        status: "error",
        error: "slice_placement_failed",
        message: placement.error.message,
        issues: placement.error.issues,
        slices: summarizeSlices(state.elements),
      }),
    };
  }
  if (placement.requested && placement.sliceId) {
    // Lane membership: the card sits inside its slice lane and leaves any
    // Group/Domain it used to belong to.
    return {
      delta: {
        sliceId: placement.sliceId,
        laneId: placement.laneId,
        groupId: undefined,
        domainId: undefined,
      },
    };
  }

  // Optional Group / Domain placement. Lanes take precedence; a Group is more
  // specific than the Domain it sits in, so it wins over a Domain.
  const groupPlacement = resolveGroupMembership(state.elements, element.type, args);
  if (groupPlacement.error) {
    return {
      error: JSON.stringify({
        status: "error",
        error: "group_placement_failed",
        message: groupPlacement.error.message,
        issues: groupPlacement.error.issues,
        groups: summarizeGroups(state.elements),
      }),
    };
  }
  if (groupPlacement.requested && groupPlacement.groupId) {
    // Anchor to the group's content area, then land beside its other children
    // so a batch spreads out instead of stacking, and the frame barely grows.
    const group = state.elements.find((el) => el.id === groupPlacement.groupId);
    const groupChildren = state.elements.filter(
      (el) => el.groupId === groupPlacement.groupId && el.id !== element.id,
    );
    const origin = containerContentOrigin(group, GROUP_PADDING, GROUP_LABEL_HEIGHT, {
      x: element.x,
      y: element.y,
    });
    const spot = findFreeSpot(groupChildren, { ...rect, x: origin.x, y: origin.y }, AI_PLACEMENT_GAP);
    return {
      delta: {
        x: spot.x,
        y: spot.y,
        groupId: groupPlacement.groupId,
        domainId: undefined,
      },
    };
  }

  const domainPlacement = resolveDomainMembership(state.elements, element.type, args);
  if (domainPlacement.error) {
    return {
      error: JSON.stringify({
        status: "error",
        error: "domain_placement_failed",
        message: domainPlacement.error.message,
        issues: domainPlacement.error.issues,
        domains: summarizeDomains(state.elements),
      }),
    };
  }
  if (domainPlacement.requested && domainPlacement.domainId) {
    // Anchor to the domain's content area, then land beside its other children
    // so a batch spreads out instead of stacking, and the frame barely grows.
    const domain = state.elements.find((el) => el.id === domainPlacement.domainId);
    const domainChildren = state.elements.filter(
      (el) => el.domainId === domainPlacement.domainId && el.id !== element.id,
    );
    const origin = containerContentOrigin(domain, DOMAIN_PADDING, DOMAIN_LABEL_HEIGHT, {
      x: element.x,
      y: element.y,
    });
    const spot = findFreeSpot(domainChildren, { ...rect, x: origin.x, y: origin.y }, AI_PLACEMENT_GAP);
    return {
      delta: {
        x: spot.x,
        y: spot.y,
        domainId: domainPlacement.domainId,
        groupId: undefined,
      },
    };
  }

  // Free-standing card: nudge it to the nearest free slot so a batch of cards
  // spreads out instead of stacking on the same spot.
  const spot = findFreeSpot(others, rect, AI_PLACEMENT_GAP);
  return { delta: { x: spot.x, y: spot.y } };
}

/**
 * Applies a resolved placement to an element that a copy tool just added to the
 * board. Skips the store write when nothing actually changes, so a copy that
 * already sits in a free spot does not add a redundant undo step. Returns a JSON
 * error string when the requested placement is invalid, otherwise null.
 */
export function applyCreatedPlacement(id: string, args: any): string | null {
  const state = useCanvasStore.getState();
  const element = state.elements.find((el) => el.id === id);
  if (!element) return null;

  const placed = resolveCreatedPlacement(element, args);
  if ("error" in placed) return placed.error;

  const changed = Object.entries(placed.delta).some(
    ([key, value]) => (element as any)[key] !== value,
  );
  if (changed) state.updateElement(id, placed.delta);
  return null;
}
