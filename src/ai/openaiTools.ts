/**
 * Builds the OpenAI tool definitions exposed to the model: the generic canvas
 * tools plus a create/update pair for every registered AI tool, augmented with
 * the optional slice/group/domain placement properties.
 */
import { z } from "zod";
import { toolRegistry } from "@/tools";
import { isSliceEligibleChild } from "@/tools/sliceCard/layout";
import { DOMAIN_TYPE } from "@/tools/domainCard/layout";
import { isGroupEligibleChild } from "@/tools/groupCard/layout";
import { toUpdateToolName, zodToJsonSchema } from "./jsonSchema";

/**
 * Extra JSON-schema properties injected into every lane-eligible card tool so
 * the model can place the card it creates (or moves) into a Slice lane in the
 * same call.
 */
const SLICE_PLACEMENT_PROPS: Record<string, any> = {
  slice: {
    type: "string",
    description: "Optional Slice name; place this card in one of its lanes.",
  },
  lane: {
    type: "string",
    description: "Optional lane in `slice`: its card type or 1-based position.",
  },
};

/**
 * Extra JSON-schema property injected into every non-Domain card tool so the
 * model can place the card (or slice) inside a Domain frame in the same call.
 */
const DOMAIN_PLACEMENT_PROPS: Record<string, any> = {
  domain: {
    type: "string",
    description: "Optional Domain name; place this card/Slice inside it (create it first if none exists).",
  },
};

/**
 * Extra JSON-schema property injected into every group-eligible card tool so
 * the model can place a definition/service/state/actor card inside a Group
 * frame in the same call.
 */
const GROUP_PLACEMENT_PROPS: Record<string, any> = {
  group: {
    type: "string",
    description: "Optional Group name; only Object/Enum/Alias/Service/State/Actor cards can join.",
  },
};

export function buildOpenAITools(): any[] {
  const aiTools = toolRegistry.getAITools();
  const tools: any[] = [];

  // 1. Generic canvas overview tool
  tools.push({
    type: "function",
    function: {
      name: "get_canvas_overview",
      description:
        "Read the board. With no arguments you get a compact list of every element plus the " +
        "board-wide catalogs (`eventTypes`, `tagCatalog`, `definedTypes`, `slices` with lanes and " +
        "their cards, `groups`, `domains`, `actions`, `actors`) so you can build valid State query " +
        "tags, target slice lanes, and place new items in the right Domain. Each element is " +
        "`{ type, name }` only; pass `detail: true` to include its full data (fields, params, query " +
        "items). Narrow the read with `type` (element type, e.g. eventCard) and/or `name` " +
        "(case-insensitive substring); a filtered read returns just the matching elements. " +
        "Descriptions and board coordinates are always omitted; updates keep existing descriptions " +
        "when you leave them out. Calling it again with the same filters and no board changes " +
        "returns `{ unchanged: true }`.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description:
              "Optional element type to filter by (e.g. eventCard, commandCard, stateCard, sliceCard).",
          },
          name: {
            type: "string",
            description: "Optional case-insensitive name substring to filter by.",
          },
          detail: {
            type: "boolean",
            description:
              "Include each element's full data (fields, params, query items). Defaults to false (type + name only).",
          },
        },
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
        "Delete one element by its current name (`target`), optionally narrowed by `type`. " +
        "Use get_canvas_overview to find the exact name.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Current name of the element to delete",
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

  // 4. Create a live reference copy of an existing card
  tools.push({
    type: "function",
    function: {
      name: "create_reference_copy",
      description:
        "Create a LIVE reference copy of an existing card (linked to the original; edits stay in " +
        "sync across the set). Locate the original by `target` name, optionally narrowed by `type`. " +
        "The copy shares the original's name, so use get_canvas_overview to see them together. " +
        "Optionally place the copy with `slice`/`lane`, `group` or `domain`.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Current name of the card to copy",
          },
          type: {
            type: "string",
            description: "Optional element type to disambiguate (e.g. eventCard, stateCard)",
          },
          ...SLICE_PLACEMENT_PROPS,
          ...GROUP_PLACEMENT_PROPS,
          ...DOMAIN_PLACEMENT_PROPS,
        },
        required: ["target"],
      },
    },
  });

  // 5. Create a live method-execution copy of a Service method
  tools.push({
    type: "function",
    function: {
      name: "create_service_method_execution",
      description:
        "Create a method-execution copy: a live Service card that renders ONE method of a source " +
        "Service and stays linked to it (edits to the method propagate). Use it as the serviceCard " +
        "lane of a write slice to show which service method the flow executes. Give the source " +
        "Service name in `service` and the method name in `method`.",
      parameters: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Name of the source Service that owns the method",
          },
          method: {
            type: "string",
            description: "Name of the method to execute (from that Service)",
          },
          ...SLICE_PLACEMENT_PROPS,
          ...GROUP_PLACEMENT_PROPS,
          ...DOMAIN_PLACEMENT_PROPS,
        },
        required: ["service", "method"],
      },
    },
  });

  // 6. Dynamic decoupled tools from registry: each create tool also gets a
  //    matching update tool that reuses the same payload schema plus a
  //    `target` locator (the card's current name). Lane-eligible card tools
  //    also accept `slice` / `lane` so the model can drop the card straight
  //    into a Slice lane instead of leaving AI-made slices empty.
  for (const t of aiTools) {
    const definition = toolRegistry.getByAIToolName(t.toolName);
    const eligibleForLane = isSliceEligibleChild(definition?.type ?? "");
    // Every card can live in a Domain except a Domain itself (no nesting).
    const eligibleForDomain = definition?.type !== DOMAIN_TYPE;
    // Only definition/service/state/actor cards can live in a Group.
    const eligibleForGroup = isGroupEligibleChild(definition?.type ?? "");
    const createParams = zodToJsonSchema(t.parameters);
    if (eligibleForLane) Object.assign(createParams.properties, SLICE_PLACEMENT_PROPS);
    if (eligibleForGroup) Object.assign(createParams.properties, GROUP_PLACEMENT_PROPS);
    if (eligibleForDomain) Object.assign(createParams.properties, DOMAIN_PLACEMENT_PROPS);

    tools.push({
      type: "function",
      function: {
        name: t.toolName,
        description: t.description,
        parameters: createParams,
      },
    });

    const updateParams = zodToJsonSchema(
      (t.parameters as z.ZodObject<any>).extend({
        target: z.string().describe("Element name to update"),
      }),
    );
    if (eligibleForLane) Object.assign(updateParams.properties, SLICE_PLACEMENT_PROPS);
    if (eligibleForGroup) Object.assign(updateParams.properties, GROUP_PLACEMENT_PROPS);
    if (eligibleForDomain) Object.assign(updateParams.properties, DOMAIN_PLACEMENT_PROPS);

    tools.push({
      type: "function",
      function: {
        name: toUpdateToolName(t.toolName),
        description:
          "Update the element named `target`; send the COMPLETE definition (array sections replace " +
          "the old ones). Same fields/rules as the matching create tool.",
        parameters: updateParams,
      },
    });
  }

  return tools;
}
