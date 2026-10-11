import { toolRegistry, ToolValidationError } from "@/tools";
import { useCanvasStore } from "@/store";
import { collectBoardTags } from "@/utils/eventTags";
import { sendChatMessage, type AISettings, type ChatMessage } from "./client";
import type { Point } from "@/types";

export interface AgentStepCallback {
  onToolCall?: (toolName: string, args: any) => void;
  onAssistantMessage?: (content: string) => void;
}

function getViewportCenter(): Point {
  const vp = useCanvasStore.getState().viewport;
  const zoom = vp.zoom || 1;
  return {
    x: -vp.x / zoom + (vp.screenWidth || 800) / (2 * zoom),
    y: -vp.y / zoom + (vp.screenHeight || 600) / (2 * zoom),
  };
}

function isZodOptional(schema: any): boolean {
  const typeName = schema?._def?.typeName;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}

/**
 * Recursively converts a Zod schema into a JSON Schema object understood by the
 * OpenAI tools API. Unlike a flat shape dump, this preserves nested arrays and
 * objects (e.g. `queryItems[].tags[] = { tag, field }`) so the model knows the
 * exact structure it must produce.
 */
export function zodToJsonSchema(schema: any): any {
  if (!schema) return { type: "object" };

  const def = schema._def;
  const typeName = def?.typeName;
  const description: string | undefined = schema.description;
  const withDesc = (obj: any) => (description ? { ...obj, description } : obj);

  switch (typeName) {
    case "ZodString":
      return withDesc({ type: "string" });
    case "ZodNumber":
      return withDesc({ type: "number" });
    case "ZodBoolean":
      return withDesc({ type: "boolean" });
    case "ZodBigInt":
      return withDesc({ type: "integer" });
    case "ZodEnum":
      return withDesc({ type: "string", enum: def.values });
    case "ZodNativeEnum":
      return withDesc({ type: "string", enum: Object.values(def.values) });
    case "ZodLiteral":
      return withDesc({ type: typeof def.value, enum: [def.value] });
    case "ZodArray":
      return withDesc({ type: "array", items: zodToJsonSchema(def.type) });
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries<any>(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isZodOptional(value)) required.push(key);
      }
      return withDesc({
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      });
    }
    case "ZodOptional":
    case "ZodDefault":
      return withDesc(zodToJsonSchema(def.innerType));
    case "ZodEffects":
      return withDesc(zodToJsonSchema(def.schema));
    case "ZodRecord":
    case "ZodAny":
    case "ZodUnknown":
      return withDesc({ type: "object" });
    default:
      return withDesc({ type: "object" });
  }
}

export function buildOpenAITools(): any[] {
  const aiTools = toolRegistry.getAITools();
  const tools: any[] = [];

  // 1. Generic canvas overview tool
  tools.push({
    type: "function",
    function: {
      name: "get_canvas_overview",
      description:
        "Read all current elements on the canvas, including their IDs, types, and summary data. " +
        "Also returns `eventTypes` and `tagCatalog` (every DCB tag currently attached to an event field, " +
        "with its type and source events) so you can build valid State card query tags.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  });

  // 2. Generic clear canvas tool
  tools.push({
    type: "function",
    function: {
      name: "clear_canvas",
      description: "Delete all elements and clear the canvas.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  });

  // 3. Dynamic decoupled tools from registry!
  for (const t of aiTools) {
    tools.push({
      type: "function",
      function: {
        name: t.toolName,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters),
      },
    });
  }

  return tools;
}

export async function executeAITool(name: string, args: any): Promise<string> {
  const state = useCanvasStore.getState();

  if (name === "get_canvas_overview") {
    const summary = state.elements.map((el) => ({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      data: el.data,
    }));
    const eventTypes = state.elements
      .filter((el) => el.type === "eventCard")
      .map((el) => el.data?.name)
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
    const tagCatalog = collectBoardTags(state.elements);
    return JSON.stringify({
      count: summary.length,
      elements: summary,
      eventTypes,
      tagCatalog,
    });
  }

  if (name === "clear_canvas") {
    state.clearBoard();
    return JSON.stringify({ status: "success", message: "Canvas cleared" });
  }

  // Find tool in registry
  const aiTools = toolRegistry.getAITools();
  const matchedTool = aiTools.find((t) => t.toolName === name);

  if (matchedTool) {
    const center = getViewportCenter();
    // Offset slightly if multiple items exist
    const offset = (state.elements.length % 5) * 30;
    const spawnPoint = { x: center.x + offset, y: center.y + offset };

    try {
      const element = matchedTool.onCreate(args, spawnPoint);
      state.addElement(element);

      return JSON.stringify({
        status: "success",
        createdId: element.id,
        type: element.type,
      });
    } catch (error) {
      if (error instanceof ToolValidationError) {
        // Refuse to create the card and tell the model exactly what broke so it
        // can fix the data (e.g. create the missing event/tag first) and retry.
        const latest = useCanvasStore.getState();
        const tagCatalog = collectBoardTags(latest.elements);
        const eventTypes = latest.elements
          .filter((el) => el.type === "eventCard")
          .map((el) => el.data?.name)
          .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
        return JSON.stringify({
          status: "error",
          error: "validation_failed",
          message: "The card was NOT created because its data breaks domain rules.",
          issues: error.issues,
          tagCatalog,
          eventTypes,
        });
      }
      throw error;
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

export async function runAgentConversation(
  settings: AISettings,
  conversationHistory: ChatMessage[],
  callbacks?: AgentStepCallback,
): Promise<string> {
  const systemPrompt = `You are the AI Event Modeling Architect.
You help software architects and developers design domain events, business models, and reactive systems on an infinite canvas.
You have tools to read the canvas, create sticky notes, create domain event cards, create command cards, create query cards, create state (projection/decision-model) cards, create shared object definitions, create enum definitions, create type aliases, create service definitions (services expose methods with params and returns), create constraint cards (assert rules like "AccountStatus.status must be active" over State card fields), and clear the board.
When the user asks to add or create something, always call the appropriate creation tool!
For State cards: call get_canvas_overview first to discover existing event types and DCB tags. Every query tag is a { tag, field } pair where "tag" already exists on an event field and "field" is one of the card's params with the SAME type. If a creation tool returns status "error" with issues, fix them (e.g. create the missing event/tag first) and try again.
For Constraint cards: call get_canvas_overview first to discover existing State cards. List the State cards the constraint uses in "states" (by name); those must exist on the board. "rules" is a list of free-text assertions (e.g. "AccountStatus.status must be active").
Be concise, clear, and professional. Reply in the same language the user uses (Vietnamese or English).`;

  const wireMessages: any[] = [{ role: "system", content: systemPrompt }];

  for (const m of conversationHistory) {
    if (m.role === "tool") {
      wireMessages.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
      });
    } else if (m.role === "assistant" && m.toolCalls) {
      wireMessages.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls,
      });
    } else {
      wireMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  const tools = buildOpenAITools();
  let maxTurns = 5;

  while (maxTurns > 0) {
    maxTurns--;
    const response = await sendChatMessage(settings, wireMessages, tools);

    if (response.toolCalls.length > 0) {
      // Record assistant call
      wireMessages.push({
        role: "assistant",
        content: response.content || null,
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // Execute each tool
      for (const tc of response.toolCalls) {
        callbacks?.onToolCall?.(tc.name, tc.arguments);
        const resultString = await executeAITool(tc.name, tc.arguments);

        wireMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: resultString,
        });
      }
    } else {
      // Final message from assistant
      callbacks?.onAssistantMessage?.(response.content);
      return response.content;
    }
  }

  return "Task completed.";
}
