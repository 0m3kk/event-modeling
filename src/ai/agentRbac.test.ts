import { describe, it, expect, beforeEach } from "vitest";
import { buildOpenAITools, executeAITool } from "./agent";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

function command(id: string, name: string, action: string): CanvasElement {
  return { id, type: "commandCard", x: 0, y: 0, width: 220, height: 182, data: { name, action } };
}
function actor(id: string, name: string, permissions: Array<{ action: string }>): CanvasElement {
  return { id, type: "actorCard", x: 0, y: 0, width: 260, height: 110, data: { name, permissions } };
}

describe("AI integration for RBAC", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("exposes create_actor_card and its generated update tool", () => {
    const names = buildOpenAITools().map((t) => t.function.name);
    expect(names).toContain("create_actor_card");
    expect(names).toContain("update_actor_card");
  });

  it("exposes the group placement option on create_actor_card", () => {
    const tool = buildOpenAITools().find((t) => t.function.name === "create_actor_card")!;
    expect(tool.function.parameters.properties.group).toBeDefined();
  });

  it("places a new Actor in an existing group", async () => {
    useCanvasStore.getState().addElement(command("c1", "PlaceOrder", "sales:placeOrder"));
    await executeAITool("create_group_card", { name: "Actors" });

    const result = JSON.parse(
      await executeAITool("create_actor_card", {
        name: "Customer",
        permissions: [{ action: "sales:placeOrder" }],
        group: "Actors",
      }),
    );
    expect(result.status).toBe("success");

    const elements = useCanvasStore.getState().elements;
    const group = elements.find((e) => e.type === "groupCard")!;
    const actorElement = elements.find((e) => e.type === "actorCard")!;
    expect(actorElement.groupId).toBe(group.id);
  });

  it("includes actions and actors in the canvas overview", async () => {
    useCanvasStore.getState().addElement(command("c1", "PlaceOrder", "sales:placeOrder"));
    useCanvasStore.getState().addElement(actor("a1", "Customer", [{ action: "sales:placeOrder" }]));

    const overview = JSON.parse(await executeAITool("get_canvas_overview", {}));
    expect(overview.actions).toEqual([
      { action: "sales:placeOrder", type: "commandCard", card: "placeOrder" },
    ]);
    expect(overview.actors).toEqual([
      { name: "customer", permissions: ["sales:placeOrder"] },
    ]);
  });

  it("rejects an Actor with a match-all permission", async () => {
    const result = JSON.parse(
      await executeAITool("create_actor_card", {
        name: "Root",
        permissions: [{ action: "*" }],
      }),
    );
    expect(result.status).toBe("error");
    expect(result.issues.map((i: any) => i.code)).toContain("wildcard_all_forbidden");
  });

  it("creates a valid Actor referencing an existing action", async () => {
    useCanvasStore.getState().addElement(command("c1", "PlaceOrder", "sales:placeOrder"));

    const result = JSON.parse(
      await executeAITool("create_actor_card", {
        name: "Customer",
        permissions: [{ action: "sales:placeOrder" }],
      }),
    );
    expect(result.status).toBe("success");
    expect(result.type).toBe("actorCard");
  });
});
