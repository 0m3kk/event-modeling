import { toolRegistry } from "@/tools";
import { useCanvasStore } from "@/store";
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

export function buildOpenAITools(): any[] {
  const aiTools = toolRegistry.getAITools();
  const tools: any[] = [];

  // 1. Generic canvas overview tool
  tools.push({
    type: "function",
    function: {
      name: "get_canvas_overview",
      description: "Read all current elements on the canvas, including their IDs, types, and summary data.",
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
    // Generate JSON Schema parameters from Zod definition
    const shape = (t.parameters as any).shape || {};
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries<any>(shape)) {
      const typeName = val._def?.typeName;
      let propType = "string";
      if (typeName === "ZodNumber") propType = "number";
      else if (typeName === "ZodBoolean") propType = "boolean";
      else if (typeName === "ZodArray") propType = "array";
      else if (typeName === "ZodObject") propType = "object";

      properties[key] = {
        type: propType,
        description: val.description || key,
      };

      if (!val.isOptional?.()) {
        required.push(key);
      }
    }

    tools.push({
      type: "function",
      function: {
        name: t.toolName,
        description: t.description,
        parameters: {
          type: "object",
          properties,
          required: required.length > 0 ? required : undefined,
        },
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
    return JSON.stringify({ count: summary.length, elements: summary });
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

    const element = matchedTool.onCreate(args, spawnPoint);
    state.addElement(element);

    return JSON.stringify({
      status: "success",
      createdId: element.id,
      type: element.type,
    });
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
You have tools to read the canvas, create sticky notes, create domain event cards, create command cards, create shared object definitions, create enum definitions, create type aliases, and clear the board.
When the user asks to add or create something, always call the appropriate creation tool!
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
