/**
 * Shared factory for the action field cards (Command / Query).
 *
 * Both cards render an action token above a primary field section and a
 * response section, and differ only in metadata. Rather than keep two ~980-line
 * copies in sync, both are produced by {@link createActionFieldCardTool} from a
 * small {@link ActionFieldCardConfig}.
 */
import { hitDescZone } from "../descZones";
import type { ToolDefinition } from "../../types";
import { buildActionAI, type ActionAIConfig } from "./ai";
import { ACTION_DEFAULT_WIDTH, computeActionCardSize } from "./metrics";
import { buildActionSchema } from "./schema";
import { renderActionFieldCard, type ActionRenderConfig } from "./render";
import {
  actionDeleteRow,
  actionInlineEdit,
  actionSections,
  actionSelectedFieldItem,
  actionSubSelect,
  actionToggleFlag,
  actionUpdateType,
  actionUpdateValidation,
  type ActionHandlerConfig,
} from "./handlers";
import type { ActionCardData, ActionField } from "./types";

export interface ActionFieldCardConfig {
  /** Tool type written on elements, e.g. `commandCard`. */
  type: string;
  /** Human card name, e.g. `Command`. */
  name: string;
  description: string;
  icon: ToolDefinition<ActionCardData>["icon"];
  /** Module colour used for the header and as the default card colour. */
  color: string;
  /** Default element name on creation, e.g. `NewCommand`. */
  defaultName: string;
  /** Default value of the schema `name` field, e.g. `CommandName`. */
  schemaDefaultName: string;
  /** Header/inline-edit fallback title, e.g. `Command`. */
  title: string;
  /** Primary data key / section id (`inputs` for Command, `params` for Query). */
  primaryKey: "inputs" | "params";
  /** Primary section banner label, e.g. `INPUT` / `PARAM`. */
  primarySectionLabel: string;
  /** Placeholder when the primary section is empty, e.g. `(no inputs)`. */
  emptyPrimaryLabel: string;
  /** Action token text colour by theme. */
  actionTint: { dark: number; light: number };
  /** Reads the primary section (handles the Command legacy `fields` alias). */
  getPrimary: (data: ActionCardData) => ActionField[];
  optionsBar: ToolDefinition<ActionCardData>["optionsBar"];
  validateData?: ToolDefinition<ActionCardData>["validateData"];
  ai: ActionAIConfig;
}

/** Minimum height with empty sections: 32 + 28 + 22 + 28 + 22 + 28 = 160. */
const ACTION_MIN_HEIGHT = 160;

export function createActionFieldCardTool(
  config: ActionFieldCardConfig,
): ToolDefinition<ActionCardData> {
  const computeSize = (data: ActionCardData, width?: number) =>
    computeActionCardSize(data.name, data.action, config.getPrimary(data), data.responses ?? [], width);

  const handlerConfig: ActionHandlerConfig = {
    getPrimary: config.getPrimary,
    primaryKey: config.primaryKey,
    primarySectionId: config.primaryKey,
    title: config.title,
    computeSize,
  };

  const renderConfig: ActionRenderConfig = {
    title: config.title,
    color: config.color,
    primarySectionLabel: config.primarySectionLabel,
    emptyPrimaryLabel: config.emptyPrimaryLabel,
    actionTint: config.actionTint,
    getPrimary: config.getPrimary,
  };

  return {
    type: config.type,
    name: config.name,
    description: config.description,
    icon: config.icon,
    color: config.color,
    category: "modeling",

    schema: buildActionSchema(config.primaryKey, config.schemaDefaultName),

    createDefaultData: () =>
      config.primaryKey === "inputs"
        ? { name: config.defaultName, inputs: [], responses: [], color: config.color }
        : { name: config.defaultName, params: [], responses: [], color: config.color },

    defaultSize: { width: ACTION_DEFAULT_WIDTH, height: ACTION_MIN_HEIGHT },

    computeSize: (data, width) => computeSize(data, width),

    autoFitWidth: true,

    optionsBar: config.optionsBar,

    validateData: config.validateData,

    render: (container, element, context) => renderActionFieldCard(container, element, context, renderConfig),

    getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

    onSubSelect: (element, localPoint) => actionSubSelect(handlerConfig, element, localPoint),

    onDeleteSubSelect: (element, fieldIndex, sectionIndex) =>
      actionDeleteRow(handlerConfig, element, fieldIndex, sectionIndex),

    onUpdateSubSelectType: (element, field, type) => actionUpdateType(handlerConfig, element, field, type),

    onToggleSubSelectArray: (element, field) => actionToggleFlag(handlerConfig, element, field, "isArray"),

    onToggleSubSelectRequired: (element, field) => actionToggleFlag(handlerConfig, element, field, "isRequired"),

    onUpdateSubSelectValidation: (element, field, validation) =>
      actionUpdateValidation(handlerConfig, element, field, validation),

    getSelectedFieldItem: (element, field) => actionSelectedFieldItem(handlerConfig, element, field),

    getSubSelectSections: (element) => actionSections(handlerConfig, element),

    getInlineEditTarget: (element, localPoint) => actionInlineEdit(handlerConfig, element, localPoint),

    ai: buildActionAI(config.ai),
  };
}

export { buildActionAI };
export type { ActionAIConfig };
export { buildActionSchema } from "./schema";
export * from "./types";
export * from "./metrics";
