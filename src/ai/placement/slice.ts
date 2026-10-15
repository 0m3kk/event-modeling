/**
 * Slice-lane membership: turns the optional `slice` / `lane` arguments of a
 * create/update call into concrete `sliceId` / `laneId` membership for a card.
 */
import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "@/tools";
import { toolRegistry } from "@/tools";
import { nameKey } from "@/utils/naming";
import {
  isSliceEligibleChild,
  SLICE_TYPE,
  type SliceElement,
  type SliceLane,
} from "@/tools/sliceCard/layout";
import { findElementByName } from "../lookup";

export interface SlicePlacement {
  /** True only when the call actually carried a `slice` argument. */
  requested: boolean;
  sliceId?: string;
  laneId?: string;
  error?: { message: string; issues: ValidationIssue[] };
}

const NOT_REQUESTED: SlicePlacement = { requested: false };

/**
 * `slice` is the slice's name; `lane` (optional) is the lane's card type
 * (e.g. "eventCard" or its display name "Event") or its 1-based position from
 * the top. Without `lane`, the card's own type picks the lane, which is enough
 * for the typed lanes create_slice produces. An explicit empty `slice` detaches
 * the card from any slice/lane.
 */
export function resolveSliceMembership(
  elements: CanvasElement[],
  cardType: string,
  args: any,
): SlicePlacement {
  if (!args || typeof args !== "object" || !("slice" in args)) return NOT_REQUESTED;

  const sliceName = typeof args.slice === "string" ? args.slice.trim() : "";
  if (!sliceName) return { requested: true, sliceId: undefined, laneId: undefined };

  const issue = (code: string, message: string, path = "slice"): SlicePlacement => ({
    requested: true,
    error: { message, issues: [{ path, code, message }] },
  });

  if (!isSliceEligibleChild(cardType)) {
    return issue(
      "slice_ineligible_card",
      `${cardType} cards cannot be placed in a slice lane (Enum, Object, Alias and Slice cards stay outside slices).`,
    );
  }

  const slice = findElementByName(elements, sliceName, SLICE_TYPE) as SliceElement | undefined;
  if (!slice) {
    return issue(
      "slice_not_found",
      `No Slice named "${sliceName}" exists on the board. Create it first or use get_canvas_overview to list slices.`,
    );
  }

  const lanes: SliceLane[] = slice.data?.lanes ?? [];
  if (lanes.length === 0) {
    return issue("lane_not_found", `Slice "${sliceName}" has no lanes.`, "lane");
  }

  const laneLabel = (lane: SliceLane): string =>
    lane.childType ? toolRegistry.get(lane.childType)?.name ?? lane.childType : "(empty lane)";

  const laneRef = typeof args.lane === "string" ? args.lane.trim() : "";
  let lane: SliceLane | undefined;

  if (laneRef) {
    const asIndex = Number(laneRef);
    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= lanes.length) {
      lane = lanes[asIndex - 1];
    } else {
      const ref = nameKey(laneRef);
      lane = lanes.find((l) => {
        if (!l.childType) return false;
        const typeKey = nameKey(l.childType);
        const nameK = nameKey(toolRegistry.get(l.childType)?.name ?? "");
        return ref === typeKey || (nameK.length > 0 && ref === nameK);
      });
    }
  } else {
    lane = lanes.find((l) => l.childType === cardType);
  }

  if (!lane) {
    const available = lanes.map((l, i) => `${i + 1}:${l.childType ?? "empty"}`).join(", ");
    return issue(
      "lane_not_found",
      `Slice "${sliceName}" has no lane for "${laneRef || cardType}". Available lanes: ${available}.`,
      "lane",
    );
  }

  if (lane.childType && lane.childType !== cardType) {
    return issue(
      "lane_type_mismatch",
      `Lane "${laneLabel(lane)}" only accepts ${lane.childType} cards, not ${cardType}.`,
      "lane",
    );
  }

  return { requested: true, sliceId: slice.id, laneId: lane.id };
}
