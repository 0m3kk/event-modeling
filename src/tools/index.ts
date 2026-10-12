import { toolRegistry } from "./registry";
import { aliasCardTool } from "./aliasCard";
import { commandCardTool } from "./commandCard";
import { constraintCardTool } from "./constraintCard";
import { domainCardTool } from "./domainCard";
import { groupCardTool } from "./groupCard";
import { queryCardTool } from "./queryCard";
import { stateCardTool } from "./stateCard";
import { viewCardTool } from "./viewCard";
import { enumCardTool } from "./enumCard";
import { eventCardTool } from "./eventCard";
import { objectCardTool } from "./objectCard";
import { serviceCardTool } from "./serviceCard";
import { sliceCardTool } from "./sliceCard";
import { stickyNoteTool } from "./stickyNote";
import { actorCardTool } from "./actorCard";

// Register default decoupled tools (order here drives the toolbar order)
toolRegistry.register(domainCardTool);
toolRegistry.register(sliceCardTool);
toolRegistry.register(groupCardTool);
toolRegistry.register(eventCardTool);
toolRegistry.register(commandCardTool);
toolRegistry.register(queryCardTool);
toolRegistry.register(stateCardTool);
toolRegistry.register(constraintCardTool);
toolRegistry.register(viewCardTool);
toolRegistry.register(serviceCardTool);
toolRegistry.register(objectCardTool);
toolRegistry.register(enumCardTool);
toolRegistry.register(aliasCardTool);
toolRegistry.register(actorCardTool);
toolRegistry.register(stickyNoteTool);

export * from "./types";
export * from "./registry";
export {
  aliasCardTool,
  commandCardTool,
  constraintCardTool,
  domainCardTool,
  groupCardTool,
  queryCardTool,
  stateCardTool,
  viewCardTool,
  enumCardTool,
  eventCardTool,
  objectCardTool,
  serviceCardTool,
  sliceCardTool,
  actorCardTool,
  stickyNoteTool,
};
