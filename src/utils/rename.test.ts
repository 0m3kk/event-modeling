import { describe, it, expect, beforeEach } from "vitest";
import {
  applyRenameMappings,
  collectRenameMappings,
  propagateRenames,
} from "./rename";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

function el(type: string, id: string, data: any): CanvasElement {
  return { id, type, x: 0, y: 0, width: 220, height: 88, data };
}

describe("collectRenameMappings", () => {
  it("maps an Object rename to a type reference", () => {
    const previous = el("objectCard", "o1", { name: "customerAddress" });
    const mappings = collectRenameMappings(previous, { name: "billingAddress" });
    expect(mappings).toEqual([
      { kind: "type", from: "customerAddress", to: "billingAddress" },
    ]);
  });

  it("maps an Enum and Alias rename to a type reference too", () => {
    expect(
      collectRenameMappings(el("enumCard", "e1", { name: "orderStatus" }), {
        name: "orderState",
      }),
    ).toEqual([{ kind: "type", from: "orderStatus", to: "orderState" }]);

    expect(
      collectRenameMappings(el("aliasCard", "a1", { name: "money" }), {
        name: "amount",
      }),
    ).toEqual([{ kind: "type", from: "money", to: "amount" }]);
  });

  it("maps an Event rename to an event-type reference", () => {
    const mappings = collectRenameMappings(
      el("eventCard", "ev1", { name: "courseDefined" }),
      { name: "courseCreated" },
    );
    expect(mappings).toEqual([
      { kind: "event", from: "courseDefined", to: "courseCreated" },
    ]);
  });

  it("maps a State rename to a constraint state reference", () => {
    const mappings = collectRenameMappings(
      el("stateCard", "s1", { name: "courseSubscription" }),
      { name: "subscription" },
    );
    expect(mappings).toEqual([
      { kind: "state", from: "courseSubscription", to: "subscription" },
    ]);
  });

  it("maps an Event field tag rename to a tag reference", () => {
    const previous = el("eventCard", "ev1", {
      name: "courseDefined",
      fields: [{ name: "courseId", type: "string", tag: "course" }],
    });
    const mappings = collectRenameMappings(previous, {
      name: "courseDefined",
      fields: [{ name: "courseId", type: "string", tag: "courseId" }],
    });
    expect(mappings).toEqual([{ kind: "tag", from: "course", to: "courseId" }]);
  });

  it("maps a State param rename to a scoped field reference", () => {
    const previous = el("stateCard", "s1", {
      name: "courseSubscription",
      params: [{ name: "courseId", type: "string" }],
    });
    const mappings = collectRenameMappings(previous, {
      name: "courseSubscription",
      params: [{ name: "id", type: "string" }],
    });
    expect(mappings).toEqual([
      { kind: "field", from: "courseId", to: "id", scopeId: "s1" },
    ]);
  });

  it("returns nothing when the name is unchanged", () => {
    const previous = el("objectCard", "o1", { name: "address" });
    expect(collectRenameMappings(previous, { name: "address", fields: [] })).toEqual(
      [],
    );
  });
});

describe("applyRenameMappings", () => {
  it("rewrites field types across every card shape", () => {
    const elements: CanvasElement[] = [
      el("objectCard", "o1", {
        name: "shippingAddress",
        fields: [{ name: "country", type: "address" }],
      }),
      el("eventCard", "ev1", {
        name: "orderPlaced",
        fields: [{ name: "shipTo", type: "address" }],
      }),
      el("commandCard", "c1", {
        name: "placeOrder",
        inputs: [{ name: "shipTo", type: "address" }],
        responses: [{ name: "id", type: "address" }],
      }),
      el("queryCard", "q1", {
        name: "getOrder",
        params: [{ name: "shipTo", type: "address" }],
        responses: [{ name: "shipTo", type: "address" }],
      }),
      el("stateCard", "s1", {
        name: "orderState",
        params: [{ name: "shipTo", type: "address" }],
        states: [{ name: "shipTo", type: "address" }],
      }),
      el("viewCard", "v1", {
        name: "orderView",
        params: [{ name: "shipTo", type: "address" }],
        states: [{ name: "shipTo", type: "address" }],
      }),
      el("serviceCard", "sv1", {
        name: "placeOrder",
        params: [{ name: "shipTo", type: "address" }],
        returns: [{ name: "shipTo", type: "address" }],
      }),
      el("aliasCard", "a1", { name: "destination", aliasedType: "address" }),
    ];

    const updated = applyRenameMappings(elements, [
      { kind: "type", from: "address", to: "shippingAddress" },
    ]);

    expect(updated[0].data.fields[0].type).toBe("shippingAddress");
    expect(updated[1].data.fields[0].type).toBe("shippingAddress");
    expect(updated[2].data.inputs[0].type).toBe("shippingAddress");
    expect(updated[2].data.responses[0].type).toBe("shippingAddress");
    expect(updated[3].data.params[0].type).toBe("shippingAddress");
    expect(updated[3].data.responses[0].type).toBe("shippingAddress");
    expect(updated[4].data.params[0].type).toBe("shippingAddress");
    expect(updated[4].data.states[0].type).toBe("shippingAddress");
    expect(updated[5].data.params[0].type).toBe("shippingAddress");
    expect(updated[5].data.states[0].type).toBe("shippingAddress");
    expect(updated[6].data.params[0].type).toBe("shippingAddress");
    expect(updated[6].data.returns[0].type).toBe("shippingAddress");
    expect(updated[7].data.aliasedType).toBe("shippingAddress");
  });

  it("matches type references case- and separator-insensitively", () => {
    const elements = [
      el("eventCard", "ev1", {
        name: "orderPlaced",
        fields: [{ name: "shipTo", type: "Customer Address" }],
      }),
    ];
    const updated = applyRenameMappings(elements, [
      { kind: "type", from: "customerAddress", to: "billingAddress" },
    ]);
    expect(updated[0].data.fields[0].type).toBe("billingAddress");
  });

  it("preserves a stray array marker on a type reference", () => {
    const elements = [
      el("objectCard", "o1", {
        name: "customer",
        fields: [{ name: "others", type: "customer[]" }],
      }),
    ];
    const updated = applyRenameMappings(elements, [
      { kind: "type", from: "customer", to: "person" },
    ]);
    expect(updated[0].data.fields[0].type).toBe("person[]");
  });

  it("rewrites query item event types", () => {
    const elements: CanvasElement[] = [
      el("stateCard", "s1", {
        name: "state",
        queryItems: [{ types: ["courseDefined"], tags: [] }],
      }),
      el("viewCard", "v1", {
        name: "view",
        queryItems: [{ types: ["OtherEvent", "courseDefined"], tags: [] }],
      }),
    ];
    const updated = applyRenameMappings(elements, [
      { kind: "event", from: "courseDefined", to: "courseCreated" },
    ]);
    expect(updated[0].data.queryItems[0].types).toEqual(["courseCreated"]);
    expect(updated[1].data.queryItems[0].types).toEqual([
      "OtherEvent",
      "courseCreated",
    ]);
  });

  it("rewrites query item tag references", () => {
    const elements: CanvasElement[] = [
      el("stateCard", "s1", {
        name: "state",
        queryItems: [
          { types: [], tags: [{ tag: "course", field: "courseId" }] },
        ],
      }),
    ];
    const updated = applyRenameMappings(elements, [
      { kind: "tag", from: "course", to: "courseEntity" },
    ]);
    expect(updated[0].data.queryItems[0].tags[0].tag).toBe("courseEntity");
    expect(updated[0].data.queryItems[0].tags[0].field).toBe("courseId");
  });

  it("rewrites a constraint's state references", () => {
    const elements: CanvasElement[] = [
      el("constraintCard", "c1", {
        name: "invariant",
        states: [{ name: "courseSubscription" }],
        rules: [],
      }),
      // A State card's own `states` are fields, not references — leave them.
      el("stateCard", "s1", {
        name: "courseSubscription",
        states: [{ name: "courseSubscription", type: "string" }],
      }),
    ];
    const updated = applyRenameMappings(elements, [
      { kind: "state", from: "courseSubscription", to: "subscription" },
    ]);
    expect(updated[0].data.states[0].name).toBe("subscription");
    expect(updated[1].data.states[0].name).toBe("courseSubscription");
  });

  it("keeps a scoped field rename on its own card only", () => {
    const elements: CanvasElement[] = [
      el("stateCard", "s1", {
        name: "stateA",
        params: [{ name: "id", type: "string" }],
        queryItems: [{ types: [], tags: [{ tag: "course", field: "courseId" }] }],
      }),
      el("stateCard", "s2", {
        name: "stateB",
        queryItems: [{ types: [], tags: [{ tag: "course", field: "courseId" }] }],
      }),
    ];
    const updated = applyRenameMappings(elements, [
      { kind: "field", from: "courseId", to: "id", scopeId: "s1" },
    ]);
    expect(updated[0].data.queryItems[0].tags[0].field).toBe("id");
    expect(updated[1].data.queryItems[0].tags[0].field).toBe("courseId");
  });

  it("returns the original array when nothing matches", () => {
    const elements = [
      el("eventCard", "ev1", { name: "orderPlaced", fields: [] }),
    ];
    expect(
      applyRenameMappings(elements, [
        { kind: "type", from: "unused", to: "other" },
      ]),
    ).toBe(elements);
  });
});

describe("propagateRenames", () => {
  it("derives and applies mappings in one step", () => {
    const object = el("objectCard", "o1", { name: "address", fields: [] });
    const event = el("eventCard", "ev1", {
      name: "orderPlaced",
      fields: [{ name: "shipTo", type: "address" }],
    });
    const updated = propagateRenames([object, event], object, {
      ...object.data,
      name: "shippingAddress",
    });
    expect(updated[1].data.fields[0].type).toBe("shippingAddress");
  });
});

describe("store rename propagation", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      elements: [],
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      projectName: "Test Board",
    });
  });

  it("cascades an Object rename to referencing field types", () => {
    const object = el("objectCard", "o1", { name: "address", fields: [] });
    const event = el("eventCard", "ev1", {
      name: "orderPlaced",
      fields: [{ name: "shipTo", type: "address" }],
    });
    useCanvasStore.setState({ elements: [object, event] });

    useCanvasStore.getState().updateElement("o1", {
      data: { ...object.data, name: "Shipping Address" },
    });

    const elements = useCanvasStore.getState().elements;
    const updatedObject = elements.find((e) => e.id === "o1")!;
    const updatedEvent = elements.find((e) => e.id === "ev1")!;
    expect(updatedObject.data.name).toBe("shippingAddress");
    expect(updatedEvent.data.fields[0].type).toBe("shippingAddress");
  });

  it("cascades an Event rename to query item types", () => {
    const event = el("eventCard", "ev1", { name: "courseDefined", fields: [] });
    const state = el("stateCard", "s1", {
      name: "courseSubscription",
      queryItems: [{ types: ["courseDefined"], tags: [] }],
    });
    useCanvasStore.setState({ elements: [event, state] });

    useCanvasStore.getState().updateElement("ev1", {
      data: { ...event.data, name: "courseCreated" },
    });

    const updatedState = useCanvasStore
      .getState()
      .elements.find((e) => e.id === "s1")!;
    expect(updatedState.data.queryItems[0].types).toEqual(["courseCreated"]);
  });

  it("is undoable as a single step", () => {
    const object = el("objectCard", "o1", { name: "address", fields: [] });
    const event = el("eventCard", "ev1", {
      name: "orderPlaced",
      fields: [{ name: "shipTo", type: "address" }],
    });
    useCanvasStore.setState({ elements: [object, event] });

    useCanvasStore.getState().updateElement("o1", {
      data: { ...object.data, name: "shippingAddress" },
    });
    useCanvasStore.getState().undo();

    const elements = useCanvasStore.getState().elements;
    expect(elements.find((e) => e.id === "o1")!.data.name).toBe("address");
    expect(elements.find((e) => e.id === "ev1")!.data.fields[0].type).toBe(
      "address",
    );
  });
});
