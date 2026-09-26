import type { StormData, ModelData } from "@/types";
import {
  stormHasParamsSection,
  stormHasQueryItems,
  stormHasResponseFields,
} from "@/constants/storm";

/**
 * Calculates the exact pixel height required to display all fields,
 * query items, constraints, and section headers of a Storm card. The
 * authorization action is a header badge, so it adds no height.
 */
export function computeStormCardHeight(data: StormData): number {
  const kind = data.kind;
  const headerHeight = 36;
  let h = headerHeight + 6;

  const rowHeight = 26;
  const sectionLabelHeight = 22;
  const hasParams = stormHasParamsSection(kind);
  const hasResponse = stormHasResponseFields(kind);
  const fields = data.fields ?? [];
  const responseFields = data.responseFields ?? [];
  const queryItems = data.queryItems ?? [];
  const constraints = data.constraints ?? [];
  const permissions = data.permissions ?? [];

  if (hasParams && (fields.length > 0 || hasResponse)) {
    h += sectionLabelHeight;
  }
  h += fields.length * rowHeight;

  if (hasResponse) {
    h += sectionLabelHeight + responseFields.length * rowHeight;
  }

  if (kind === "actor" && permissions.length > 0 && fields.length === 0) {
    h += permissions.length * rowHeight;
  }

  if (stormHasQueryItems(kind) && queryItems.length > 0) {
    h += sectionLabelHeight + queryItems.length * rowHeight;
  }

  if (kind === "constraint" && constraints.length > 0) {
    h += sectionLabelHeight + constraints.length * rowHeight;
  }

  h += 10; // bottom padding
  return Math.max(80, h);
}

/**
 * Calculates the exact pixel height required for a Model node.
 */
export function computeModelNodeHeight(data: ModelData): number {
  const headerHeight = 34;
  const rowHeight = 26;
  let h = headerHeight + 6;

  const kind = data.kind;
  const fields = data.fields ?? [];
  const values = data.values ?? [];

  if (kind === "object") {
    h += fields.length * rowHeight;
  } else if (kind === "enum") {
    h += values.length * rowHeight;
  } else if (kind === "array" || kind === "wrap") {
    h += rowHeight;
  }

  h += 10; // bottom padding
  return Math.max(80, h);
}
