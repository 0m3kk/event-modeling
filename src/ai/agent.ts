import { toolRegistry, ToolValidationError } from "@/tools";
import type { ValidationIssue } from "@/tools";
import { useCanvasStore } from "@/store";
import { collectBoardTags } from "@/utils/eventTags";
import { getElementName, nameKey } from "@/utils/naming";
import {
  listDefinedTypeNames,
  PRIMITIVE_FIELD_TYPES,
} from "@/utils/typeCatalog";
import { z } from "zod";
import { sendChatMessage, type AISettings, type ChatMessage } from "./client";
import type { CanvasElement, Point } from "@/types";

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

/** Maps a create tool name to its generated update counterpart. */
function toUpdateToolName(createToolName: string): string {
  return createToolName.startsWith("create_")
    ? `update_${createToolName.slice("create_".length)}`
    : `update_${createToolName}`;
}

/** Maps an update tool name back to the create tool name it was derived from. */
function toCreateToolName(updateToolName: string): string {
  return updateToolName.startsWith("update_")
    ? `create_${updateToolName.slice("update_".length)}`
    : updateToolName;
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

  // 3. Generic single-element delete tool
  tools.push({
    type: "function",
    function: {
      name: "delete_element",
      description:
        "Delete one element, located by its current name (`target`). Optionally narrow by `type` " +
        "(e.g. eventCard, stateCard). Use get_canvas_overview to find the exact name first.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Current name of the element to delete (must exist on the board)",
          },
          type: {
            type: "string",
            description: "Optional element type to disambiguate (e.g. eventCard, stateCard)",
          },
        },
        required: ["target"],
      },
    },
  });

  // 4. Dynamic decoupled tools from registry: each create tool also gets a
  //    matching update tool that reuses the same payload schema plus a
  //    `target` locator (the card's current name).
  for (const t of aiTools) {
    tools.push({
      type: "function",
      function: {
        name: t.toolName,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters),
      },
    });

    tools.push({
      type: "function",
      function: {
        name: toUpdateToolName(t.toolName),
        description:
          "Update an existing element located by its current name (`target`). " +
          "Send the COMPLETE corrected definition: the payload replaces the existing data " +
          "(array sections like fields/params are replaced wholesale). " +
          t.description,
        parameters: zodToJsonSchema(
          (t.parameters as z.ZodObject<any>).extend({
            target: z
              .string()
              .describe("Current name of the element to update (must exist on the board)"),
          }),
        ),
      },
    });
  }

  return tools;
}

/**
 * Shared error payload returned to the model when a creation is rejected, so
 * it can fix the data (create a missing event/tag/type first) and retry.
 */
function buildValidationError(issues: ValidationIssue[]): string {
  const latest = useCanvasStore.getState();
  const eventTypes = latest.elements
    .filter((el) => el.type === "eventCard")
    .map((el) => el.data?.name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  return JSON.stringify({
    status: "error",
    error: "validation_failed",
    message: "The card was NOT created or updated because its data breaks domain rules.",
    issues,
    tagCatalog: collectBoardTags(latest.elements),
    eventTypes,
    definedTypes: listDefinedTypeNames(latest.elements),
    primitiveTypes: Array.from(PRIMITIVE_FIELD_TYPES),
  });
}

/** Finds a board element by name (and optional type) using normalized names. */
function findElementByName(
  elements: CanvasElement[],
  name: string,
  type?: string,
): CanvasElement | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return elements.find(
    (el) => (!type || el.type === type) && nameKey(getElementName(el) ?? "") === key,
  );
}

/** Deletes a single element located by name (and optional type). */
function executeDeleteElement(args: any): string {
  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  const type = typeof args?.type === "string" ? args.type.trim() : "";

  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the element name) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Element name is required." }],
    });
  }

  const element = findElementByName(state.elements, targetName, type || undefined);
  if (!element) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${type || "element"} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      name: targetName,
    });
  }

  state.deleteElements([element.id]);
  return JSON.stringify({ status: "success", deletedId: element.id, type: element.type });
}

/**
 * Updates an existing element in place, keeping its id, position and width.
 *
 * The payload reuses the matching create tool's schema (minus `target`, which
 * locates the card by its current name) and is rebuilt through that tool's
 * `onCreate`, so param->data mappings (e.g. enum `values` -> `fields`) are
 * handled uniformly. The rebuilt data is validated against the board with the
 * element itself excluded, so its own tags never conflict with themselves.
 */
function executeUpdateElement(updateName: string, args: any): string {
  const definition = toolRegistry.getByAIToolName(toCreateToolName(updateName));
  const ai = definition?.ai;
  if (!definition || !ai) {
    return JSON.stringify({ error: `Unknown tool: ${updateName}` });
  }

  const state = useCanvasStore.getState();
  const targetName = typeof args?.target === "string" ? args.target.trim() : "";
  if (!targetName) {
    return JSON.stringify({
      status: "error",
      error: "validation_failed",
      message: "`target` (the current card name) is required.",
      issues: [{ path: "target", code: "target_missing", message: "Target name is required." }],
    });
  }

  const existing = findElementByName(state.elements, targetName, definition.type);
  if (!existing) {
    return JSON.stringify({
      status: "error",
      error: "element_not_found",
      message: `No ${definition.type} named "${targetName}" exists on the board. Use get_canvas_overview to find the exact name.`,
      type: definition.type,
      name: targetName,
    });
  }

  const { target: _target, ...payload } = args ?? {};
  const built = ai.onCreate(payload, { x: existing.x, y: existing.y });

  // Preserve identity/meta the payload did not mention so an update never
  // silently drops the card's name, colour, description or live links.
  const existingData = existing.data ?? {};
  let nextData: any = built.data;
  if (!("name" in payload) && existingData.name !== undefined) {
    nextData = { ...nextData, name: existingData.name };
  }
  if (!("color" in payload) && existingData.color !== undefined) {
    nextData = { ...nextData, color: existingData.color };
  }
  if (!("description" in payload) && existingData.description !== undefined) {
    nextData = { ...nextData, description: existingData.description };
  }
  if (!("text" in payload) && existingData.text !== undefined) {
    nextData = { ...nextData, text: existingData.text };
  }
  if (existingData.methodRef !== undefined) {
    nextData = { ...nextData, methodRef: existingData.methodRef };
  }

  // Validate against the board WITHOUT this element, otherwise its own tags
  // would look like a conflict with themselves.
  const others = state.elements.filter((el) => el.id !== existing.id);
  if (definition.validateData) {
    const { issues } = definition.validateData(nextData, { elements: others });
    if (issues.length > 0) {
      return buildValidationError(issues);
    }
  }
  if (definition.normalizeData) {
    nextData = definition.normalizeData(nextData, { elements: others });
  }

  const size = definition.computeSize
    ? definition.computeSize(nextData)
    : { width: existing.width, height: existing.height };

  // Keep the card's position and width; only the content-driven height changes.
  state.updateElement(existing.id, { data: nextData, height: size.height });

  return JSON.stringify({ status: "success", updatedId: existing.id, type: existing.type });
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
    const definedTypes = listDefinedTypeNames(state.elements);
    return JSON.stringify({
      count: summary.length,
      elements: summary,
      eventTypes,
      tagCatalog,
      definedTypes,
      primitiveTypes: Array.from(PRIMITIVE_FIELD_TYPES),
    });
  }

  if (name === "clear_canvas") {
    state.clearBoard();
    return JSON.stringify({ status: "success", message: "Canvas cleared" });
  }

  if (name === "delete_element") {
    return executeDeleteElement(args);
  }

  if (name.startsWith("update_")) {
    return executeUpdateElement(name, args);
  }

  // Find tool in registry
  const aiTools = toolRegistry.getAITools();
  const matchedTool = aiTools.find((t) => t.toolName === name);
  const toolDefinition = toolRegistry.getByAIToolName(name);

  if (matchedTool) {
    const center = getViewportCenter();
    // Offset slightly if multiple items exist
    const offset = (state.elements.length % 5) * 30;
    const spawnPoint = { x: center.x + offset, y: center.y + offset };

    try {
      const element = matchedTool.onCreate(args, spawnPoint);

      // Reject before touching the canvas if the built data breaks domain
      // rules (unknown types, unknown event types/tags, tag type conflicts...).
      if (toolDefinition?.validateData) {
        const { issues } = toolDefinition.validateData(element.data, {
          elements: state.elements,
        });
        if (issues.length > 0) {
          return buildValidationError(issues);
        }
      }

      state.addElement(element);

      return JSON.stringify({
        status: "success",
        createdId: element.id,
        type: element.type,
      });
    } catch (error) {
      if (error instanceof ToolValidationError) {
        return buildValidationError(error.issues);
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
To change an existing card, prefer its matching update tool (e.g. update_event_card) over deleting and recreating it: pass "target" = the card's current name and send the COMPLETE corrected definition. This preserves the card's id, position and links. Use delete_element (by "target" name) to remove a card.
Data types: every field "type" MUST be either a primitive (${Array.from(PRIMITIVE_FIELD_TYPES).join(", ")}) or the exact name of an Object, Enum or Alias card that already exists on the board. Any other type is rejected — create the Object/Enum/Alias card first, then reference it by name.
For Event cards: a DCB tag identifies ONE field type across the whole board. Reusing a tag with a different field type is rejected, so keep the type identical whenever you reuse a tag.
For State cards: call get_canvas_overview first to discover existing event types, DCB tags and defined types. Every query item's "types" must be names of Event cards on the board. Every query tag is a { tag, field } pair where "tag" already exists on an event field and "field" is one of the card's params with the SAME type. If a creation tool returns status "error" with issues, fix them (e.g. create the missing event/tag/type first) and try again.
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
