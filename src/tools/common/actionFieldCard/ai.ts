/**
 * AI tool contract for the action field cards (Command / Query).
 *
 * The parameter shape is the same for both (an action token, a primary field
 * list and a response list); Command additionally accepts a legacy flat
 * `fields` alias. Callers pass the differing text via {@link ActionAIConfig}.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import type { CanvasElement, Point } from "@/types";
import type { ToolAIOperation } from "../../types";
import { FieldValidationSchema } from "@/utils/fieldValidation";
import { computeActionCardSize } from "./metrics";
import type { ActionCardData, ActionField } from "./types";

export interface ActionAIConfig {
  toolName: string;
  description: string;
  /** PascalCase hint, e.g. `PascalCase command name (e.g. PlaceOrder, RegisterUser)`. */
  nameDescribe: string;
  /** Action-token description shown to the model. */
  actionDescribe: string;
  /** Primary list description, e.g. `Input parameters / payload carried by the command`. */
  primaryDescribe: string;
  /** Primary data key (`inputs` / `params`). */
  primaryKey: "inputs" | "params";
  /** When true, accept the legacy flat `fields` alias (Command). */
  includeLegacyFields?: boolean;
  /** Human word for the card, used in `Description of the {word}`. */
  entityWord: string;
  /** Tool `type` written on created elements. */
  type: string;
  /** Element id prefix, e.g. `command`. */
  idPrefix: string;
  /** Fallback name when the model omits one. */
  title: string;
  /** Module colour used when the model omits one. */
  color: string;
}

function toFields(raw: ActionField[] | undefined): ActionField[] {
  return (raw ?? []).map((f) => ({
    name: f.name,
    type: f.type,
    ...(f.isArray ? { isArray: true } : {}),
    ...(f.isRequired ? { isRequired: true } : {}),
    ...(f.description ? { description: f.description } : {}),
    ...(f.validation ? { validation: f.validation } : {}),
  }));
}

function toResponseFields(raw: ActionField[] | undefined): ActionField[] {
  return (raw ?? []).map((f) => ({
    name: f.name,
    type: f.type,
    ...(f.isArray ? { isArray: true } : {}),
    ...(f.isRequired ? { isRequired: true } : {}),
    ...(f.description ? { description: f.description } : {}),
  }));
}

const primaryFieldParams = z.object({
  name: z.string().describe("Field name in camelCase"),
  type: z.string().describe("Field type"),
  isArray: z.boolean().optional().describe("Array of this type"),
  isRequired: z.boolean().optional().describe("Required"),
  description: z.string().optional().describe("What this field means"),
  validation: FieldValidationSchema.optional().describe("Validation constraints for this field"),
});

const responseFieldParams = z.object({
  name: z.string().describe("Response field name in camelCase"),
  type: z.string().describe("Field type"),
  isArray: z.boolean().optional().describe("Array of this type"),
  isRequired: z.boolean().optional().describe("Required"),
  description: z.string().optional().describe("What this field means"),
});

export function buildActionAI(config: ActionAIConfig): ToolAIOperation<ActionCardData> {
  const parameters = z.object({
    name: z.string().describe(config.nameDescribe),
    action: z.string().optional().describe(config.actionDescribe),
    [config.primaryKey]: z.array(primaryFieldParams).optional().describe(config.primaryDescribe),
    responses: z.array(responseFieldParams).optional().describe(`Return / response fields produced by the ${config.entityWord}`),
    ...(config.includeLegacyFields
      ? {
          fields: z
            .array(primaryFieldParams)
            .optional()
            .describe(`Legacy flat fields list (treated as ${config.primaryKey})`),
        }
      : {}),
    color: z.string().optional().describe("Optional hex color"),
    description: z.string().optional().describe(`Description of the ${config.entityWord}`),
  });

  return {
    toolName: config.toolName,
    description: config.description,
    parameters,
    onCreate: (params, center: Point): CanvasElement<ActionCardData> => {
      const primary = toFields(params[config.primaryKey] || params.fields || []);
      const responses = toResponseFields(params.responses);
      const base: ActionCardData = {
        name: params.name || config.title,
        responses,
        color: params.color || config.color,
        ...(params.action ? { action: params.action } : {}),
        ...(params.description ? { description: params.description } : {}),
      };
      const data: ActionCardData =
        config.primaryKey === "inputs" ? { ...base, inputs: primary } : { ...base, params: primary };

      const size = computeActionCardSize(data.name, data.action, primary, responses);
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
