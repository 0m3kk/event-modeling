import { z } from "zod";
import type { OpenAITool } from "../client";
import type { AIToolContext, AIToolDefinition } from "./types";

export function toToolParameters(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}

export function defineTool<S extends z.ZodType>(tool: {
  name: string;
  description: string;
  schema: S;
  execute: (
    args: z.output<S>,
    ctx: AIToolContext,
  ) => unknown | Promise<unknown>;
}): AIToolDefinition {
  return tool as unknown as AIToolDefinition;
}

export function toOpenAITools(tools: AIToolDefinition[]): OpenAITool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toToolParameters(tool.schema),
    },
  }));
}

export const MAX_TOOL_RESULT_CHARS = 4000;

export function serializeToolResult(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value ?? null);
  } catch {
    text = JSON.stringify({ error: "Tool result was not serializable." });
  }
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…(truncated)`;
  }
  return text;
}

export function toolError(message: string): string {
  return JSON.stringify({ error: message });
}
