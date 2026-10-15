import { Table2 } from "lucide-react";
import {
  PROJECTION_DEFAULT_WIDTH,
  PROJECTION_HEADER_HEIGHT,
  PROJECTION_QUERY_COLUMN_PADDING,
  PROJECTION_QUERY_DESC_GUTTER,
  PROJECTION_QUERY_ITEM_PADDING_Y,
  PROJECTION_QUERY_LINE_HEIGHT,
  PROJECTION_QUERY_TAG_FONT_SIZE,
  PROJECTION_QUERY_TAG_PADDING_X,
  PROJECTION_QUERY_TYPE_FONT_SIZE,
  PROJECTION_QUERY_TYPE_PADDING_X,
  PROJECTION_ROW_HEIGHT,
  PROJECTION_SECTION_HEADER_HEIGHT,
  buildProjectionSchema,
  computeProjectionCardSize,
  computeQueryContentWidth,
  createProjectionCardTool,
  queryItemHeight,
} from "../common/projection";
import { ViewCardOptions } from "./ViewCardOptions";
import { validateViewCardData } from "./rules";

export type { ViewCardData, ViewField, ViewQueryItem, ViewQueryTag } from "./rules";
export { getViewParams, getViewItems, getViewStates } from "./rules";

// View-flavoured aliases for the shared projection metrics, kept so existing
// imports (options bar, tests) keep working.
export const VIEW_HEADER_HEIGHT = PROJECTION_HEADER_HEIGHT;
export const VIEW_SECTION_HEADER_HEIGHT = PROJECTION_SECTION_HEADER_HEIGHT;
export const VIEW_ROW_HEIGHT = PROJECTION_ROW_HEIGHT;
export const VIEW_DEFAULT_WIDTH = PROJECTION_DEFAULT_WIDTH;
export const VIEW_QUERY_LINE_HEIGHT = PROJECTION_QUERY_LINE_HEIGHT;
export const VIEW_QUERY_ITEM_PADDING_Y = PROJECTION_QUERY_ITEM_PADDING_Y;
export const VIEW_QUERY_TYPE_FONT_SIZE = PROJECTION_QUERY_TYPE_FONT_SIZE;
export const VIEW_QUERY_TYPE_PADDING_X = PROJECTION_QUERY_TYPE_PADDING_X;
export const VIEW_QUERY_TAG_FONT_SIZE = PROJECTION_QUERY_TAG_FONT_SIZE;
export const VIEW_QUERY_TAG_PADDING_X = PROJECTION_QUERY_TAG_PADDING_X;
export const VIEW_QUERY_COLUMN_PADDING = PROJECTION_QUERY_COLUMN_PADDING;
export const VIEW_QUERY_DESC_GUTTER = PROJECTION_QUERY_DESC_GUTTER;

export const computeViewCardSize = computeProjectionCardSize;
export { computeQueryContentWidth, queryItemHeight };

export const ViewCardSchema = buildProjectionSchema("ViewName");

export const viewCardTool = createProjectionCardTool({
  type: "viewCard",
  name: "View",
  description:
    "A /Read Model: projects events matching a DCB query into a persisted read model for sorting, searching and filtering",
  icon: Table2,
  color: "#0891b2",
  defaultName: "NewView",
  schemaDefaultName: "ViewName",
  title: "View",
  sectionLabels: ["PARAM", "QUERY", "STATE"],
  optionsBar: ViewCardOptions,
  normalizeData: (data, context) => validateViewCardData(data, context).data,
  validateData: (data, context) => validateViewCardData(data, context),
  ai: {
    toolName: "create_view_card",
    description:
      "Create a View (persisted read model / DCB projection) with sections: params (inputs), query items " +
      "(event types + DCB tags) and states (projected view fields). Unlike an in-memory State, a View is " +
      "stored in a database so its rows can be sorted, searched and filtered later. Same tag/param rules " +
      "as a State: every { tag, field } tag must already exist on an event field and match a param's type.",
    nameDescribe: "PascalCase view name (e.g. OrderList)",
    paramsDescribe:
      "Input params. Each query tag's `field` must reference one of these by name.",
    fieldNameDescribe: "View field name in camelCase",
    fieldDescribe: "What this view field means",
    statesDescribe: "Projected view fields",
    entityWord: "view",
    type: "viewCard",
    idPrefix: "view",
    title: "View",
    color: "#0891b2",
  },
});
