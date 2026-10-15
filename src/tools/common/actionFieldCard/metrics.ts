/**
 * Measuring and layout maths for the action field cards (Command / Query).
 * Presentation-free, so it can be unit-tested without Pixi.
 */
import { measureFullWidthRowWidth, measureStandardCardContentWidth } from "../cardLayout";
import { toDisplayAction } from "@/utils/naming";
import type { ActionField } from "./types";

export const ACTION_HEADER_HEIGHT = 32;
export const ACTION_SECTION_HEADER_HEIGHT = 22;
export const ACTION_ROW_HEIGHT = 28;
export const ACTION_DEFAULT_WIDTH = 220;
/**
 * The action token is shown as a single field-like row directly under the
 * header (no section band, since there is only ever one action).
 */
export const ACTION_TOKEN_ROW_TOP = ACTION_HEADER_HEIGHT;
/** Y of the primary section's header band (below the action row). */
export const ACTION_PRIMARY_BAND_TOP = ACTION_TOKEN_ROW_TOP + ACTION_ROW_HEIGHT;

/** Resolved geometry shared by the renderer and hit testing. */
export interface ActionLayout {
  primary: ActionField[];
  responses: ActionField[];
  primaryCount: number;
  responsesCount: number;
  primaryStartY: number;
  respHeaderY: number;
  respStartY: number;
}

export function computeActionLayout(primary: ActionField[], responses: ActionField[]): ActionLayout {
  const primaryCount = Math.max(1, primary.length);
  const responsesCount = Math.max(1, responses.length);
  const primaryStartY = ACTION_PRIMARY_BAND_TOP + ACTION_SECTION_HEADER_HEIGHT;
  const respHeaderY = primaryStartY + primaryCount * ACTION_ROW_HEIGHT;
  const respStartY = respHeaderY + ACTION_SECTION_HEADER_HEIGHT;
  return { primary, responses, primaryCount, responsesCount, primaryStartY, respHeaderY, respStartY };
}

export function computeActionCardSize(
  name: string,
  action: string | undefined,
  primary: ActionField[],
  responses: ActionField[],
  customWidth = ACTION_DEFAULT_WIDTH,
): { width: number; height: number } {
  const primaryCount = Math.max(1, primary.length);
  const responsesCount = Math.max(1, responses.length);
  const height =
    ACTION_HEADER_HEIGHT +
    ACTION_ROW_HEIGHT +
    ACTION_SECTION_HEADER_HEIGHT +
    primaryCount * ACTION_ROW_HEIGHT +
    ACTION_SECTION_HEADER_HEIGHT +
    responsesCount * ACTION_ROW_HEIGHT;
  // Widen to fit the title, the action row and every field row's name and
  // right-aligned type so nothing is clipped.
  const rows = [...primary, ...responses];
  let width = measureStandardCardContentWidth(name, rows, customWidth);
  const actionLabel = action ? toDisplayAction(action) : "(not set)";
  width = Math.max(width, Math.ceil(measureFullWidthRowWidth(actionLabel)));
  return { width, height };
}
