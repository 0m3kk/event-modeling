import { describe, it, expect, beforeEach } from "vitest";
import { buildOpenAITools, executeAITool } from "./agent";
import { useCanvasStore } from "@/store";

describe("AIAgent", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      elements: [],
      selectedIds: [],
      viewport: { x: 0, y: 0, zoom: 1, screenWidth: 1000, screenHeight: 800 },
    });
  });

  it("builds OpenAI tools from tool registry", () => {
    const tools = buildOpenAITools();
    expect(tools.length).toBeGreaterThanOrEqual(4);

    const toolNames = tools.map((t) => t.function.name);
    expect(toolNames).toContain("get_canvas_overview");
    expect(toolNames).toContain("clear_canvas");
    expect(toolNames).toContain("create_event_card");
    expect(toolNames).toContain("create_sticky_note");
  });

  it("executes create_event_card via AI bridge", async () => {
    const res = await executeAITool("create_event_card", {
      name: "UserRegistered",
      fields: [{ name: "userId", type: "string" }],
    });

    const parsed = JSON.parse(res);
    expect(parsed.status).toBe("success");
    expect(parsed.type).toBe("eventCard");

    const elements = useCanvasStore.getState().elements;
    expect(elements.length).toBe(1);
    expect((elements[0].data as any).name).toBe("UserRegistered");
  });

  it("executes get_canvas_overview", async () => {
    await executeAITool("create_sticky_note", { text: "Note 1" });
    const res = await executeAITool("get_canvas_overview", {});
    const parsed = JSON.parse(res);

    expect(parsed.count).toBe(1);
    expect(parsed.elements[0].type).toBe("stickyNote");
    expect(Array.isArray(parsed.tagCatalog)).toBe(true);
    expect(Array.isArray(parsed.eventTypes)).toBe(true);
  });

  it("emits a nested JSON schema for state cards", () => {
    const tools = buildOpenAITools();
    const stateTool = tools.find((t) => t.function.name === "create_state_card");
    expect(stateTool).toBeTruthy();
    const props = stateTool.function.parameters.properties;
    expect(props.queryItems.type).toBe("array");
    expect(props.queryItems.items.properties.tags.items.properties.tag.type).toBe("string");
    expect(props.queryItems.items.properties.tags.items.properties.field.type).toBe("string");
  });

  it("rejects an AI state card that references an unknown tag, then accepts it", async () => {
    const failed = JSON.parse(
      await executeAITool("create_state_card", {
        name: "Course",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["CourseDefined"], tags: [{ tag: "course", field: "courseId" }] }],
      }),
    );
    expect(failed.status).toBe("error");
    expect(failed.issues.length).toBeGreaterThan(0);
    expect(useCanvasStore.getState().elements).toHaveLength(0);

    // Create the event that carries the tag, then retry.
    await executeAITool("create_event_card", {
      name: "CourseDefined",
      fields: [{ name: "courseId", type: "string", tag: "course" }],
    });

    const ok = JSON.parse(
      await executeAITool("create_state_card", {
        name: "Course",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["CourseDefined"], tags: [{ tag: "course", field: "courseId" }] }],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    expect(ok.status).toBe("success");
    expect(ok.type).toBe("stateCard");
  });
});
