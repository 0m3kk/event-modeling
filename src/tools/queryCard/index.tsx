import { Search } from "lucide-react";
import { validateActionToken } from "@/utils/rbac";
import {
  ACTION_DEFAULT_WIDTH,
  ACTION_HEADER_HEIGHT,
  ACTION_PRIMARY_BAND_TOP,
  ACTION_ROW_HEIGHT,
  ACTION_SECTION_HEADER_HEIGHT,
  ACTION_TOKEN_ROW_TOP,
  buildActionSchema,
  computeActionCardSize,
  createActionFieldCardTool,
} from "../common/actionFieldCard";
import type { ActionCardData, ActionField } from "../common/actionFieldCard/types";
import { validateFieldTypes } from "../common/typeValidation";
import { QueryCardOptions } from "./QueryCardOptions";

export type QueryField = ActionField;
export type QueryCardData = ActionCardData;

export function getQueryParams(data: QueryCardData): QueryField[] {
  return Array.isArray(data.params) ? data.params : [];
}

export function getQueryResponses(data: QueryCardData): QueryField[] {
  return Array.isArray(data.responses) ? data.responses : [];
}

// Query-flavoured aliases for the shared action card metrics, kept so existing
// imports keep working.
export const QUERY_HEADER_HEIGHT = ACTION_HEADER_HEIGHT;
export const QUERY_SECTION_HEADER_HEIGHT = ACTION_SECTION_HEADER_HEIGHT;
export const QUERY_ROW_HEIGHT = ACTION_ROW_HEIGHT;
export const QUERY_DEFAULT_WIDTH = ACTION_DEFAULT_WIDTH;
export const QUERY_ACTION_ROW_TOP = ACTION_TOKEN_ROW_TOP;
export const QUERY_PARAM_BAND_TOP = ACTION_PRIMARY_BAND_TOP;

export function computeQueryCardSize(
  data: QueryCardData,
  customWidth = QUERY_DEFAULT_WIDTH,
): { width: number; height: number } {
  return computeActionCardSize(
    data.name,
    data.action,
    getQueryParams(data),
    getQueryResponses(data),
    customWidth,
  );
}

export const QueryCardSchema = buildActionSchema("params", "QueryName");

export const queryCardTool = createActionFieldCardTool({
  type: "queryCard",
  name: "Query",
  description: "A Query representing a read/intent with parameter and response fields",
  icon: Search,
  color: "#16a34a",
  defaultName: "NewQuery",
  schemaDefaultName: "QueryName",
  title: "Query",
  primaryKey: "params",
  primarySectionLabel: "PARAM",
  emptyPrimaryLabel: "(no params)",
  actionTint: { dark: 0x86efac, light: 0x16a34a },
  getPrimary: getQueryParams,
  optionsBar: QueryCardOptions,
  validateData: (data, context) => ({
    data,
    issues: [
      ...validateFieldTypes(getQueryParams(data), "params", context.elements ?? []),
      ...validateFieldTypes(getQueryResponses(data), "responses", context.elements ?? []),
      ...validateActionToken(data.action, context.elements ?? []),
    ],
  }),
  ai: {
    toolName: "create_query_card",
    description: "Create a domain Query card in the Event Model with param and response fields",
    nameDescribe: "PascalCase query name (e.g. GetOrder, ListUsers)",
    actionDescribe:
      "RBAC permission token this query declares, 'domain:verb' in camelCase (e.g. sales:getOrder). " +
      "Unique across the board; defaults to the query name when omitted.",
    primaryDescribe: "Parameters / input payload carried by the query",
    primaryKey: "params",
    includeLegacyFields: false,
    entityWord: "query",
    type: "queryCard",
    idPrefix: "query",
    title: "Query",
    color: "#16a34a",
  },
});
