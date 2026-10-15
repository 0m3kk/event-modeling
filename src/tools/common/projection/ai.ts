/**
 * AI tool contract for the projection cards (State / View).
 *
 * The parameter shape is identical for both cards; only the descriptive text
 * ("what this field means") and the created element metadata differ, so the
 * caller passes those through {@link ProjectionAIConfig}.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasElement, Point } from "@/types";
import type { ToolAIOperation } from "../../types";
import { computeProjectionCardSize } from "./metrics";
import type {
  ProjectionCardData,
  ProjectionField,
  ProjectionQueryItem,
  ProjectionQueryTag,
} from "./types";

export interface ProjectionAIConfig {
  toolName: string;
  description: string;
  /** PascalCase hint for the name param, e.g. `PascalCase state name (e.g. OrderState)`. */
  nameDescribe: string;
  /** What the params array means (card-specific provenance/tag rules). */
  paramsDescribe: string;
  /** Field-name hint, e.g. `State field name in camelCase`. */
  fieldNameDescribe: string;
  /** Per-field description hint, e.g. `What this state field means`. */
  fieldDescribe: string;
  /** What the states array means (card-specific). */
  statesDescribe: string;
  /** Human word for the card, used in `Description of the {word}`. */
  entityWord: string;
  /** Tool `type` written on created elements, e.g. `stateCard`. */
  type: string;
  /** Element id prefix, e.g. `state`. */
  idPrefix: string;
  /** Fallback name when the model omits one, e.g. `State`. */
  title: string;
  /** Module colour used when the model omits one. */
  color: string;
}

function toFields(raw: Partial<ProjectionField>[] | undefined): ProjectionField[] {
  return (raw || []).map((f) => ({
    name: f.name ?? "",
    type: f.type ?? "",
    ...(f.isArray ? { isArray: true } : {}),
    ...(f.isRequired ? { isRequired: true } : {}),
    ...(f.description ? { description: f.description } : {}),
  }));
}

function toQueryItems(raw: Partial<ProjectionQueryItem>[] | undefined): ProjectionQueryItem[] {
  return (raw || []).map((item) => ({
    types: Array.isArray(item.types) ? item.types : [],
    tags: Array.isArray(item.tags)
      ? item.tags.map((t: ProjectionQueryTag) => ({ tag: t.tag, field: t.field }))
      : [],
    ...(item.description ? { description: item.description } : {}),
  }));
}

export function buildProjectionAI(config: ProjectionAIConfig): ToolAIOperation<ProjectionCardData> {
  return {
    toolName: config.toolName,
    description: config.description,
    parameters: z.object({
      name: z.string().describe(config.nameDescribe),
      params: z
        .array(
          z.object({
            name: z.string().describe("Param field name in camelCase"),
            type: z.string().describe("Field type"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z.string().optional().describe("What this param means"),
          }),
        )
        .optional()
        .describe(config.paramsDescribe),
      queryItems: z
        .array(
          z.object({
            types: z.array(z.string()).optional().describe("Event types matched (OR within the item)"),
            tags: z
              .array(
                z.object({
                  tag: z.string().describe("Existing event-field tag name"),
                  field: z.string().describe("Param name whose type matches the tagged event field"),
                }),
              )
              .optional()
              .describe("DCB tags the item requires"),
            description: z.string().optional().describe("What this query item selects"),
          }),
        )
        .optional()
        .describe("DCB query items (OR-combined)"),
      states: z
        .array(
          z.object({
            name: z.string().describe(config.fieldNameDescribe),
            type: z.string().describe("Field type"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z.string().optional().describe(config.fieldDescribe),
          }),
        )
        .optional()
        .describe(config.statesDescribe),
      color: z.string().optional().describe("Optional hex color"),
      description: z.string().optional().describe(`Description of the ${config.entityWord}`),
    }),
    onCreate: (params, center: Point): CanvasElement<ProjectionCardData> => {
      const data: ProjectionCardData = {
        name: params.name || config.title,
        params: toFields(params.params),
        queryItems: toQueryItems(params.queryItems),
        states: toFields(params.states),
        color: params.color || config.color,
        ...(params.description ? { description: params.description } : {}),
      };

      const size = computeProjectionCardSize(data);
      return {
        id: `${config.idPrefix}-${nanoid(6)}`,
        type: config.type,
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  };
}
