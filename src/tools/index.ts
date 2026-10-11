import { toolRegistry } from "./registry";
import { stickyNoteTool } from "./stickyNote";
import { eventCardTool } from "./eventCard";

// Register default decoupled tools
toolRegistry.register(stickyNoteTool);
toolRegistry.register(eventCardTool);

export * from "./types";
export * from "./registry";
export { stickyNoteTool, eventCardTool };
