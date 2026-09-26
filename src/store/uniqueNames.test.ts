import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, useCanvasStore } from "./index";
import type { CanvasObject, StormKind } from "@/types";

function storm(
  id: string,
  name: string,
  kind: StormKind = "event",
): CanvasObject {
  return {
    id,
    type: "storm",
    x: 0,
    y: 0,
    width: 260,
    height: 150,
    stormData: { kind, name, fields: [] },
  };
}

function model(id: string, name: string): CanvasObject {
  return {
    id,
    type: "model",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    modelData: { kind: "object", name, fields: [] },
  };
}

function nameOf(id: string): string | undefined {
  const obj = useCanvasStore.getState().objects.find((o) => o.id === id);
  return obj?.type === "storm"
    ? obj.stormData?.name
    : obj?.type === "model"
      ? obj.modelData?.name
      : undefined;
}

describe("unique component names", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
    clearHistory();
  });

  it("gives two new Command cards distinct titles", () => {
    const store = useCanvasStore.getState();
    store.addObject(storm("a", "", "command"));
    store.addObject(storm("b", "", "command"));

    expect(nameOf("a")).toBe("Command");
    expect(nameOf("b")).toBe("Command 2");
  });

  it("suffixes a duplicate name added one at a time", () => {
    const store = useCanvasStore.getState();
    store.addObject(storm("a", "Create Order"));
    store.addObject(storm("b", "createOrder"));

    expect(nameOf("a")).toBe("Create Order");
    // The typed base is preserved; only the suffix is added.
    expect(nameOf("b")).toBe("createOrder 2");
  });

  it("suffixes duplicates within a single addObjects batch", () => {
    useCanvasStore
      .getState()
      .addObjects([storm("a", "Order Placed"), storm("b", "order placed")]);

    expect(nameOf("a")).toBe("Order Placed");
    expect(nameOf("b")).toBe("order placed 2");
  });

  it("seeds unique default titles for untitled cards", () => {
    useCanvasStore.getState().addObjects([storm("a", ""), storm("b", "")]);
    expect(nameOf("a")).toBe("Event");
    expect(nameOf("b")).toBe("Event 2");
  });

  it("deduplicates across storm cards and model nodes", () => {
    useCanvasStore.getState().addObject(model("m1", "Order"));
    useCanvasStore.getState().addObject(storm("s1", "order"));
    expect(nameOf("s1")).toBe("order 2");
  });

  it("suffixes a colliding name on rename", () => {
    useCanvasStore
      .getState()
      .addObjects([storm("a", "Order Placed"), storm("b", "Order Shipped")]);
    const target = useCanvasStore.getState().objects.find((o) => o.id === "b")!;
    useCanvasStore.getState().updateObject("b", {
      stormData: { ...target.stormData!, name: "Order Placed" },
    });

    expect(nameOf("b")).toBe("Order Placed 2");
  });

  it("keeps a unique title when the name is cleared", () => {
    useCanvasStore
      .getState()
      .addObjects([storm("a", "", "command"), storm("b", "", "command")]);
    const target = useCanvasStore.getState().objects.find((o) => o.id === "b")!;
    useCanvasStore.getState().updateObject("b", {
      stormData: { ...target.stormData!, name: "" },
    });

    // Clearing falls back to a unique default instead of duplicating "Command".
    expect(nameOf("a")).toBe("Command");
    expect(nameOf("b")).toBe("Command 2");
  });

  it("does not rename when only an unrelated property changes", () => {
    // A legacy board may already contain duplicates; editing geometry must not
    // silently rewrite names.
    useCanvasStore
      .getState()
      .resetBoard([storm("a", "Same Name"), storm("b", "Same Name")]);
    useCanvasStore.getState().updateObject("a", { x: 120 });

    expect(nameOf("a")).toBe("Same Name");
    expect(nameOf("b")).toBe("Same Name");
  });

  it("resolves intra-batch collisions in updateObjects", () => {
    useCanvasStore
      .getState()
      .addObjects([storm("a", "First"), storm("b", "Second")]);
    useCanvasStore.getState().updateObjects([
      {
        id: "a",
        patch: { stormData: { kind: "event", name: "Shared", fields: [] } },
      },
      {
        id: "b",
        patch: { stormData: { kind: "event", name: "Shared", fields: [] } },
      },
    ]);

    expect(nameOf("a")).toBe("Shared");
    expect(nameOf("b")).toBe("Shared 2");
  });
});
