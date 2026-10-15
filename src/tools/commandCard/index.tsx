import { Terminal } from "lucide-react";
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
import { CommandCardOptions } from "./CommandCardOptions";

export type CommandField = ActionField;
export type CommandCardData = ActionCardData;

export function getCommandInputs(data: CommandCardData): CommandField[] {
  if (Array.isArray(data.inputs)) return data.inputs;
  if (Array.isArray(data.fields)) return data.fields;
  return [];
}

export function getCommandResponses(data: CommandCardData): CommandField[] {
  return Array.isArray(data.responses) ? data.responses : [];
}

// Command-flavoured aliases for the shared action card metrics, kept so existing
// imports keep working.
export const COMMAND_HEADER_HEIGHT = ACTION_HEADER_HEIGHT;
export const COMMAND_SECTION_HEADER_HEIGHT = ACTION_SECTION_HEADER_HEIGHT;
export const COMMAND_ROW_HEIGHT = ACTION_ROW_HEIGHT;
export const COMMAND_DEFAULT_WIDTH = ACTION_DEFAULT_WIDTH;
export const COMMAND_ACTION_ROW_TOP = ACTION_TOKEN_ROW_TOP;
export const COMMAND_INPUT_BAND_TOP = ACTION_PRIMARY_BAND_TOP;

export function computeCommandCardSize(
  data: CommandCardData,
  customWidth = COMMAND_DEFAULT_WIDTH,
): { width: number; height: number } {
  return computeActionCardSize(
    data.name,
    data.action,
    getCommandInputs(data),
    getCommandResponses(data),
    customWidth,
  );
}

export const CommandCardSchema = buildActionSchema("inputs", "CommandName");

export const commandCardTool = createActionFieldCardTool({
  type: "commandCard",
  name: "Command",
  description: "A Command representing an intent or action with inputs and response fields",
  icon: Terminal,
  color: "#2563eb",
  defaultName: "NewCommand",
  schemaDefaultName: "CommandName",
  title: "Command",
  primaryKey: "inputs",
  primarySectionLabel: "INPUT",
  emptyPrimaryLabel: "(no inputs)",
  actionTint: { dark: 0x93c5fd, light: 0x2563eb },
  getPrimary: getCommandInputs,
  optionsBar: CommandCardOptions,
  validateData: (data, context) => ({
    data,
    issues: [
      ...validateFieldTypes(getCommandInputs(data), "inputs", context.elements ?? []),
      ...validateFieldTypes(getCommandResponses(data), "responses", context.elements ?? []),
      ...validateActionToken(data.action, context.elements ?? []),
    ],
  }),
  ai: {
    toolName: "create_command_card",
    description: "Create a domain Command card in the Event Model with inputs and response fields",
    nameDescribe: "PascalCase command name (e.g. PlaceOrder, RegisterUser)",
    actionDescribe:
      "RBAC permission token this command declares, 'domain:verb' in camelCase (e.g. sales:placeOrder). " +
      "Unique across the board; defaults to the command name when omitted.",
    primaryDescribe: "Input parameters / payload carried by the command",
    primaryKey: "inputs",
    includeLegacyFields: true,
    entityWord: "command",
    type: "commandCard",
    idPrefix: "command",
    title: "Command",
    color: "#2563eb",
  },
});
