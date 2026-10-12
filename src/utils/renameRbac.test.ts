import { describe, it, expect } from "vitest";
import type { CanvasElement } from "@/types";
import { propagateRenames } from "./rename";
import type { ActorCardData } from "@/tools/actorCard/rules";

function command(id: string, name: string, action: string): CanvasElement {
  return { id, type: "commandCard", x: 0, y: 0, width: 220, height: 182, data: { name, action } };
}
function actor(id: string, data: ActorCardData): CanvasElement {
  return { id, type: "actorCard", x: 0, y: 0, width: 260, height: 110, data };
}

describe("rename propagation for RBAC", () => {
  it("rewrites an exact actor permission when a Command action changes, but not wildcards", () => {
    const cmd = command("c1", "PlaceOrder", "sales:placeOrder");
    const customer = actor("a1", {
      name: "Customer",
      permissions: [{ action: "sales:placeOrder" }, { action: "sales:*" }],
    });

    const nextData = { ...cmd.data, action: "sales:createOrder" };
    const result = propagateRenames([cmd, customer], cmd, nextData);

    const updatedActor = result.find((el) => el.id === "a1");
    const perms = (updatedActor!.data as ActorCardData).permissions!;
    expect(perms[0].action).toBe("sales:createOrder");
    expect(perms[1].action).toBe("sales:*");
  });
});
