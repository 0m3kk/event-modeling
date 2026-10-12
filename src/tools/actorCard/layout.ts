import {
  getActorPermissions,
  type ActorCardData,
  type ActorPermission,
} from "./rules";
import { measureMonospaceText } from "@/utils/textWrap";
import { toDisplayAction } from "@/utils/naming";
import {
  measureCardTitleWidth,
  CARD_NAME_FONT_SIZE,
  ROW_LEFT_PADDING,
} from "../common/cardLayout";

/**
 * Pure geometry for the Actor card.
 *
 * The card is a header plus a single PERMISSIONS section whose rows are one
 * action pattern each. Layout math lives here (free of React/Pixi/store) so the
 * renderer, the options bar and the store's sizing all agree.
 */
export const ACTOR_HEADER_HEIGHT = 32;
export const ACTOR_SECTION_HEADER_HEIGHT = 22;
/** Height of one PERMISSIONS row. */
export const ACTOR_ROW_HEIGHT = 28;
export const ACTOR_DEFAULT_WIDTH = 260;

export interface ActorCardLayout {
  permissions: ActorPermission[];
  count: number;
  /** Y of the first permission row (top). */
  rowsStartY: number;
  /** Y of the bottom edge of the content area. */
  contentHeight: number;
}

export function computeActorCardLayout(data: ActorCardData): ActorCardLayout {
  const permissions = getActorPermissions(data);
  const count = Math.max(1, permissions.length);
  const rowsStartY = ACTOR_HEADER_HEIGHT + ACTOR_SECTION_HEADER_HEIGHT;
  return {
    permissions,
    count,
    rowsStartY,
    contentHeight: rowsStartY + count * ACTOR_ROW_HEIGHT,
  };
}

/** Space kept right of a permission row for its right-aligned status hint. */
export const ACTOR_STATUS_RESERVE = 80;

export function computeActorCardSize(
  data: ActorCardData,
  customWidth = ACTOR_DEFAULT_WIDTH,
): { width: number; height: number } {
  const width = Math.max(customWidth, computeActorContentWidth(data));
  return { width, height: computeActorCardLayout(data).contentHeight };
}

/**
 * Minimum width that fits the Actor title and every permission row's action
 * token (plus room for the row's right-aligned status hint: `overlap`,
 * `missing` or the wildcard reach count).
 */
export function computeActorContentWidth(data: ActorCardData): number {
  let required = measureCardTitleWidth(data.name);
  for (const permission of getActorPermissions(data)) {
    const actionWidth =
      ROW_LEFT_PADDING +
      measureMonospaceText(toDisplayAction(permission.action), CARD_NAME_FONT_SIZE);
    required = Math.max(required, actionWidth + ACTOR_STATUS_RESERVE);
  }
  return Math.ceil(required);
}
