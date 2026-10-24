/**
 * Group membership: turns the optional `group` argument of a create/update call
 * into concrete `groupId` membership for a card.
 */
import type { CanvasElement } from "@/types";
import type { ValidationIssue } from "@/tools";
import { getElementName, nameKey } from "@/utils/naming";
import { GROUP_TYPE, isGroupEligibleChild } from "@/tools/groupCard/layout";

export interface GroupPlacement {
  /** True only when the call actually carried a `group` argument. */
  requested: boolean;
  groupId?: string;
  error?: { message: string; issues: ValidationIssue[] };
}

const GROUP_NOT_REQUESTED: GroupPlacement = { requested: false };

/**
 * `group` is the Group's name; an explicit empty `group` detaches the card from
 * any Group.
 *
 * Only definition/state/actor cards can join a Group, and a card in a Slice lane
 * is handled separately (lane and group membership are mutually exclusive).
 * Service cards always live in a Slice lane, never in a Group.
 */
export function resolveGroupMembership(
  elements: CanvasElement[],
  cardType: string,
  args: any,
): GroupPlacement {
  if (!args || typeof args !== "object" || !("group" in args)) return GROUP_NOT_REQUESTED;

  const groupName = typeof args.group === "string" ? args.group.trim() : "";
  if (!groupName) return { requested: true, groupId: undefined };

  const issue = (code: string, message: string): GroupPlacement => ({
    requested: true,
    error: { message, issues: [{ path: "group", code, message }] },
  });

  if (!isGroupEligibleChild(cardType)) {
    return issue(
      "group_ineligible_card",
      `${cardType} cards cannot join a Group (only Object, Enum, Alias, State and Actor cards can; Service cards belong in a Slice lane).`,
    );
  }

  const group = elements.find(
    (el) => el.type === GROUP_TYPE && nameKey(getElementName(el) ?? "") === nameKey(groupName),
  );
  if (!group) {
    return issue(
      "group_not_found",
      `No Group named "${groupName}" exists on the board. Create it first with create_group_card or use get_canvas_overview to list groups.`,
    );
  }

  return { requested: true, groupId: group.id };
}
