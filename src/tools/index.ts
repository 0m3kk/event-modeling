import { toolRegistry } from "./registry";
import { commandCardTool } from "./commandCard";
import { eventCardTool } from "./eventCard";
import { stickyNoteTool } from "./stickyNote";

// Register default decoupled tools
toolRegistry.register(commandCardTool);
toolRegistry.register(eventCardTool);
toolRegistry.register(stickyNoteTool);

export * from "./types";
export * from "./registry";
export { commandCardTool, eventCardTool, stickyNoteTool };
