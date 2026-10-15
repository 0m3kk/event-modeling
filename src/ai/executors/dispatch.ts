/**
 * Top-level dispatch for AI tool calls: routes the generic canvas tools, then
 * the update tools, then falls back to the registry's create tools.
 */
import { toolRegistry, ToolValidationError } from "@/tools";
import { useCanvasStore } from "@/store";
import { normalizeIdentifierNames } from "@/utils/naming";
import { readOverviewFilters, resolveCanvasOverview } from "../canvasOverview";
import { resolveCreatedPlacement } from "../placement";
import { buildValidationError, getViewportCenter } from "./common";
import {
  executeCreateReferenceCopy,
  executeCreateServiceMethodExecution,
  executeDeleteElement,
} from "./copy";
import { executeUpdateElement } from "./update";

export async function executeAITool(name: string, args: any): Promise<string> {
  const state = useCanvasStore.getState();

  if (name === "get_canvas_overview") {
    const filters = readOverviewFilters(args);
    return resolveCanvasOverview(state.elements, filters);
  }

  if (name === "clear_canvas") {
    state.clearBoard();
    return JSON.stringify({ status: "success", message: "Canvas cleared" });
  }

  if (name === "delete_element") {
    return executeDeleteElement(args);
  }

  if (name === "create_reference_copy") {
    return executeCreateReferenceCopy(args);
  }

  if (name === "create_service_method_execution") {
    return executeCreateServiceMethodExecution(args);
  }

  if (name.startsWith("update_")) {
    return executeUpdateElement(name, args);
  }

  // Find tool in registry
  const aiTools = toolRegistry.getAITools();
  const matchedTool = aiTools.find((t) => t.toolName === name);
  const toolDefinition = toolRegistry.getByAIToolName(name);

  if (matchedTool) {
    const spawnPoint = getViewportCenter();

    try {
      const created = matchedTool.onCreate(args, spawnPoint);
      // Normalize identifiers before validating so any casing the model used
      // still resolves (e.g. a type written as "Customer Id" -> "customerId").
      const normalizedData = normalizeIdentifierNames(created.data, created.type);
      let element =
        normalizedData === created.data ? created : { ...created, data: normalizedData };

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

      // Optional slice/lane, group and domain placement carried by the create
      // call, plus a nudge to the nearest free slot when the card stands alone.
      const placed = resolveCreatedPlacement(element, args);
      if ("error" in placed) {
        return placed.error;
      }
      element = { ...element, ...placed.delta };

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
