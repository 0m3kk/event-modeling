import { toolRegistry } from "./registry";
import { aliasCardTool } from "./aliasCard";
import { commandCardTool } from "./commandCard";
import { queryCardTool } from "./queryCard";
import { enumCardTool } from "./enumCard";
import { eventCardTool } from "./eventCard";
import { objectCardTool } from "./objectCard";
import { stickyNoteTool } from "./stickyNote";

// Register default decoupled tools (order here drives the toolbar order)
toolRegistry.register(commandCardTool);
toolRegistry.register(queryCardTool);
toolRegistry.register(eventCardTool);
toolRegistry.register(objectCardTool);
toolRegistry.register(enumCardTool);
toolRegistry.register(aliasCardTool);
toolRegistry.register(stickyNoteTool);

export * from "./types";
export * from "./registry";
export {
  aliasCardTool,
  commandCardTool,
  queryCardTool,
  enumCardTool,
  eventCardTool,
  objectCardTool,
  stickyNoteTool,
};
