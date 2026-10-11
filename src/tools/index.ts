import { toolRegistry } from "./registry";
import { commandCardTool } from "./commandCard";
import { eventCardTool } from "./eventCard";
import { objectCardTool } from "./objectCard";
import { stickyNoteTool } from "./stickyNote";

// Register default decoupled tools
toolRegistry.register(commandCardTool);
toolRegistry.register(eventCardTool);
toolRegistry.register(objectCardTool);
toolRegistry.register(stickyNoteTool);

export * from "./types";
export * from "./registry";
export { commandCardTool, eventCardTool, objectCardTool, stickyNoteTool };
