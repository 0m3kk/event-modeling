import { describe, it, expect } from "vitest";
import { toolRegistry } from "./index";
import { stickyNoteTool } from "./stickyNote";
import { eventCardTool } from "./eventCard";
import { commandCardTool } from "./commandCard";

describe("toolRegistry", () => {
  it("registers and retrieves tools", () => {
    expect(toolRegistry.get("commandCard")).toBe(commandCardTool);
    expect(toolRegistry.get("stickyNote")).toBe(stickyNoteTool);
    expect(toolRegistry.get("eventCard")).toBe(eventCardTool);
    expect(toolRegistry.get("nonexistent")).toBeUndefined();
  });

  it("returns all registered tools", () => {
    const all = toolRegistry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.some((t) => t.type === "commandCard")).toBe(true);
    expect(all.some((t) => t.type === "eventCard")).toBe(true);
  });

  it("extracts AI tools from registered tools", () => {
    const aiTools = toolRegistry.getAITools();
    expect(aiTools.length).toBeGreaterThanOrEqual(3);
    expect(aiTools.some((t) => t.toolName === "create_command_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_event_card")).toBe(true);
    expect(aiTools.some((t) => t.toolName === "create_sticky_note")).toBe(true);
  });
});
