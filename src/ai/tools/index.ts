import type { AIToolResult } from "@/types";
import type { AIToolContext, AIToolDefinition } from "./types";
import { serializeToolResult, toolError } from "./schema";
import { readTools } from "./read";
import { stormTools } from "./storm";
import { modelTools } from "./model";
import { writeTools } from "./write";
import { updatePlanTool } from "./plan";

export const allTools: AIToolDefinition[] = [
  ...readTools,
  ...stormTools,
  ...modelTools,
  ...writeTools,
  updatePlanTool,
];

const toolByName = new Map(allTools.map((tool) => [tool.name, tool]));

export function buildToolRegistry(
  tools: AIToolDefinition[],
): Map<string, AIToolDefinition> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function formatIssues(error: import("zod").ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");
}

export async function executeToolCall(
  call: { id: string; name: string; arguments: string },
  ctx: AIToolContext,
  registry: Map<string, AIToolDefinition> = toolByName,
): Promise<AIToolResult> {
  const fail = (message: string): AIToolResult => ({
    toolCallId: call.id,
    name: call.name,
    content: toolError(message),
    isError: true,
  });

  const tool = registry.get(call.name);
  if (!tool) {
    return fail(`Unknown tool "${call.name}".`);
  }

  let raw: unknown = {};
  const rawArgs = call.arguments?.trim();
  if (rawArgs) {
    try {
      raw = JSON.parse(rawArgs);
    } catch {
      return fail(`Arguments for "${call.name}" were not valid JSON.`);
    }
  }

  const parsed = tool.schema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      `Invalid arguments for "${call.name}": ${formatIssues(parsed.error)}`,
    );
  }

  try {
    const result = await tool.execute(parsed.data as never, ctx);
    return {
      toolCallId: call.id,
      name: call.name,
      content: serializeToolResult(result),
    };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : `Tool "${call.name}" failed.`,
    );
  }
}

export type { AIToolContext, AIToolDefinition } from "./types";
