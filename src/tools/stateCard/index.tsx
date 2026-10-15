import { Database } from "lucide-react";
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
import { StateCardOptions } from "./StateCardOptions";
import { validateStateCardData } from "./rules";

export type { StateCardData, StateField, QueryItem, QueryTag } from "./rules";
export { getStateParams, getQueryItems, getStateFields } from "./rules";

// State-flavoured aliases for the shared projection metrics, kept so existing
// imports (options bar, tests) keep working.
export const STATE_HEADER_HEIGHT = PROJECTION_HEADER_HEIGHT;
export const STATE_SECTION_HEADER_HEIGHT = PROJECTION_SECTION_HEADER_HEIGHT;
export const STATE_ROW_HEIGHT = PROJECTION_ROW_HEIGHT;
export const STATE_DEFAULT_WIDTH = PROJECTION_DEFAULT_WIDTH;
export const STATE_QUERY_LINE_HEIGHT = PROJECTION_QUERY_LINE_HEIGHT;
export const STATE_QUERY_ITEM_PADDING_Y = PROJECTION_QUERY_ITEM_PADDING_Y;
export const STATE_QUERY_TYPE_FONT_SIZE = PROJECTION_QUERY_TYPE_FONT_SIZE;
export const STATE_QUERY_TYPE_PADDING_X = PROJECTION_QUERY_TYPE_PADDING_X;
export const STATE_QUERY_TAG_FONT_SIZE = PROJECTION_QUERY_TAG_FONT_SIZE;
export const STATE_QUERY_TAG_PADDING_X = PROJECTION_QUERY_TAG_PADDING_X;
export const STATE_QUERY_COLUMN_PADDING = PROJECTION_QUERY_COLUMN_PADDING;
export const STATE_QUERY_DESC_GUTTER = PROJECTION_QUERY_DESC_GUTTER;

export const computeStateCardSize = computeProjectionCardSize;
export { computeQueryContentWidth, queryItemHeight };

export const StateCardSchema = buildProjectionSchema("StateName");

export const stateCardTool = createProjectionCardTool({
  type: "stateCard",
  name: "State",
  description:
    "A State/Projection: reads events matching a DCB query to build a decision-model state",
  icon: Database,
  color: "#0d9488",
  defaultName: "NewState",
  schemaDefaultName: "StateName",
  title: "State",
  sectionLabels: ["PARAM", "QUERY", "STATE"],
  optionsBar: StateCardOptions,
  normalizeData: (data, context) => validateStateCardData(data, context).data,
  validateData: (data, context) => validateStateCardData(data, context),
  ai: {
    toolName: "create_state_card",
    description:
      "Create a State (DCB projection / decision model) with sections: params (inputs), query items " +
      "(event types + DCB tags) and states (projected fields). Every query tag is { tag, field }: `tag` " +
      "must already exist on an event field and `field` must be a param with the SAME type. Params are " +
      "inputs and must trace to a Command input / Query param of the same name, a query tag binding, an " +
      "Enum type, or a system value like now. A name in `params` must not repeat in `states`. Call " +
      "get_canvas_overview first; unknown tags, type mismatches (`param_source_unknown`) and param/state " +
      "echoes (`state_echoes_param`) are rejected.",
    nameDescribe: "PascalCase state name (e.g. OrderState)",
    paramsDescribe:
      "Input params; each must trace to a real source (Command input/Query param of the same name, " +
      "query tag binding, Enum/Object type, or a system value like now).",
    fieldNameDescribe: "State field name in camelCase",
    fieldDescribe: "What this state field means",
    statesDescribe: "Projected state fields. Do not repeat a name already in `params`.",
    entityWord: "state",
    type: "stateCard",
    idPrefix: "state",
    title: "State",
    color: "#0d9488",
  },
});
