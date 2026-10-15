/**
 * Shared factory for the projection cards (State / View).
 *
 * State and View are the same card — a DCB projection with params, query items
 * and projected fields — and differ only in metadata. Rather than keep two
 * ~1200-line copies in sync, both are produced by {@link createProjectionCardTool}
 * from a small {@link ProjectionCardConfig}.
 */
import type { CanvasElement } from "@/types";
import { hitDescZone } from "../descZones";
import type { ToolDataContext, ToolDefinition, ValidationIssue } from "../../types";
import { buildProjectionAI, type ProjectionAIConfig } from "./ai";
import {
  PROJECTION_DEFAULT_WIDTH,
  computeProjectionCardSize,
} from "./metrics";
import { buildProjectionSchema } from "./schema";
import { renderProjectionCard } from "./render";
import {
  projectionDeleteRow,
  projectionInlineEdit,
  projectionSections,
  projectionSelectedFieldItem,
  projectionSubSelect,
  projectionToggleFlag,
  projectionUpdateType,
} from "./handlers";
import type { ProjectionCardData } from "./types";

export interface ProjectionCardConfig {
  /** Tool type written on elements, e.g. `stateCard`. */
  type: string;
  /** Human card name, e.g. `State`. */
  name: string;
  description: string;
  icon: ToolDefinition<ProjectionCardData>["icon"];
  /** Module colour used for the header and as the default card colour. */
  color: string;
  /** Default element name on creation, e.g. `NewState`. */
  defaultName: string;
  /** Default value of the schema `name` field, e.g. `StateName`. */
  schemaDefaultName: string;
  /** Header/inline-edit fallback title, e.g. `State`. */
  title: string;
  /** Section banner labels: [params, query, states]. */
  sectionLabels: [string, string, string];
  optionsBar: ToolDefinition<ProjectionCardData>["optionsBar"];
  normalizeData?: (data: ProjectionCardData, context: ToolDataContext) => ProjectionCardData;
  validateData?: (
    data: ProjectionCardData,
    context: ToolDataContext,
  ) => { data: ProjectionCardData; issues: ValidationIssue[] };
  ai: ProjectionAIConfig;
}

/** Minimum height with empty sections: 32 + 3 * (22 + 28) = 182. */
const PROJECTION_MIN_HEIGHT = 182;

export function createProjectionCardTool(
  config: ProjectionCardConfig,
): ToolDefinition<ProjectionCardData> {
  return {
    type: config.type,
    name: config.name,
    description: config.description,
    icon: config.icon,
    color: config.color,
    category: "modeling",

    schema: buildProjectionSchema(config.schemaDefaultName),
    createDefaultData: () => ({
      name: config.defaultName,
      params: [],
      queryItems: [],
      states: [],
      color: config.color,
    }),

    defaultSize: { width: PROJECTION_DEFAULT_WIDTH, height: PROJECTION_MIN_HEIGHT },

    computeSize: (data, width) => computeProjectionCardSize(data, width),

    autoFitWidth: true,

    optionsBar: config.optionsBar,

    normalizeData: config.normalizeData,
    validateData: config.validateData,

    render: (container, element: CanvasElement<ProjectionCardData>, context) =>
      renderProjectionCard(container, element, context, config),

    getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

    onSubSelect: (element, localPoint) => projectionSubSelect(element, localPoint),

    onDeleteSubSelect: (element, fieldIndex, sectionIndex) =>
      projectionDeleteRow(element, fieldIndex, sectionIndex),

    onUpdateSubSelectType: (element, field, type) => projectionUpdateType(element, field, type),

    onToggleSubSelectArray: (element, field) => projectionToggleFlag(element, field, "isArray"),

    onToggleSubSelectRequired: (element, field) => projectionToggleFlag(element, field, "isRequired"),

    getSelectedFieldItem: (element, field) => projectionSelectedFieldItem(element, field),

    getSubSelectSections: (element) => projectionSections(element),

    getInlineEditTarget: (element, localPoint) =>
      projectionInlineEdit(element, localPoint, config.title),

    ai: buildProjectionAI(config.ai),
  };
}

export { buildProjectionAI };
export type { ProjectionAIConfig };
export { buildProjectionSchema } from "./schema";
export type { ProjectionRenderConfig } from "./render";
export * from "./types";
export * from "./metrics";
