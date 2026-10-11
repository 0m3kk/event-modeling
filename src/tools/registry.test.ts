import { describe, it, expect } from "vitest";
import { toolRegistry } from "./index";
import { stickyNoteTool } from "./stickyNote";
import { eventCardTool } from "./eventCard";
import { commandCardTool } from "./commandCard";
import { constraintCardTool } from "./constraintCard";
import { domainCardTool } from "./domainCard";
import { queryCardTool } from "./queryCard";
import { stateCardTool } from "./stateCard";
import { viewCardTool } from "./viewCard";
import { enumCardTool } from "./enumCard";
import { aliasCardTool } from "./aliasCard";
import { serviceCardTool } from "./serviceCard";
import { sliceCardTool } from "./sliceCard";

describe("toolRegistry", () => {
  it("registers and retrieves tools", () => {
    expect(toolRegistry.get("commandCard")).toBe(commandCardTool);
    expect(toolRegistry.get("queryCard")).toBe(queryCardTool);
    expect(toolRegistry.get("stateCard")).toBe(stateCardTool);
    expect(toolRegistry.get("viewCard")).toBe(viewCardTool);
    expect(toolRegistry.get("constraintCard")).toBe(constraintCardTool);
    expect(toolRegistry.get("stickyNote")).toBe(stickyNoteTool);
    expect(toolRegistry.get("eventCard")).toBe(eventCardTool);
    expect(toolRegistry.get("enumCard")).toBe(enumCardTool);
    expect(toolRegistry.get("aliasCard")).toBe(aliasCardTool);
    expect(toolRegistry.get("serviceCard")).toBe(serviceCardTool);
    expect(toolRegistry.get("sliceCard")).toBe(sliceCardTool);
    expect(toolRegistry.get("domainCard")).toBe(domainCardTool);
    expect(toolRegistry.get("nonexistent")).toBeUndefined();
  });

  it("returns all registered tools", () => {
    const all = toolRegistry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.some((t) => t.type === "commandCard")).toBe(true);
    expect(all.some((t) => t.type === "queryCard")).toBe(true);
    expect(all.some((t) => t.type === "stateCard")).toBe(true);
    expect(all.some((t) => t.type === "viewCard")).toBe(true);
    expect(all.some((t) => t.type === "constraintCard")).toBe(true);
    expect(all.some((t) => t.type === "eventCard")).toBe(true);
    expect(all.some((t) => t.type === "serviceCard")).toBe(true);
    expect(all.some((t) => t.type === "sliceCard")).toBe(true);
    expect(all.some((t) => t.type === "domainCard")).toBe(true);
  });

  it("extracts AI tools from registered tools", () => {
    const aiTools = toolRegistry.getAITools();
    expect(aiTools.length).toBeGreaterThanOrEqual(3);
    expect(aiTools.some((t) => t.toolName === "create_command_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_query_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_state_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_view_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_constraint_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_event_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_sticky_note")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_service_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_slice")).toBe(true);
  });
});
