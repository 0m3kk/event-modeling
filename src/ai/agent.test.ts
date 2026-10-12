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
    expect(toolNames).toContain("create_view_card");
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
    // Identifiers are stored canonically in camelCase.
    expect((elements[0].data as any).name).toBe("userRegistered");
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

  it("omits cosmetic fields and descriptions from the canvas overview", async () => {
    await executeAITool("create_event_card", {
      name: "OrderPlaced",
      description: "Raised when an order is placed",
      fields: [{ name: "orderId", type: "string", tag: "order", description: "The order id" }],
    });
    const res = await executeAITool("get_canvas_overview", {});
    const parsed = JSON.parse(res);
    const event = parsed.elements.find((e: any) => e.name === "orderPlaced");

    expect(event).toBeTruthy();
    expect(event.id).toBeUndefined();
    expect(event.x).toBeUndefined();
    expect(event.data).toBeUndefined();
    expect(event.description).toBeUndefined();
    expect(res).not.toContain('"description"');
    expect(event.fields[0]).toEqual({ name: "orderId", type: "string", tag: "order" });
  });

  it("preserves existing field descriptions when an update omits them", async () => {
    await executeAITool("create_event_card", {
      name: "OrderPlaced",
      fields: [{ name: "orderId", type: "string", description: "The order id" }],
    });
    await executeAITool("update_event_card", {
      target: "OrderPlaced",
      name: "OrderPlaced",
      fields: [{ name: "orderId", type: "number" }],
    });
    const event = useCanvasStore
      .getState()
      .elements.find((e) => e.type === "eventCard")!;
    expect(event.data.fields[0]).toEqual({
      name: "orderId",
      type: "number",
      description: "The order id",
    });
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

  it("advertises field-level descriptions across card tools", () => {
    const tools = buildOpenAITools();
    const tool = (name: string) => tools.find((t) => t.function.name === name)!;

    // Object: object description + per-field description.
    const object = tool("create_object_card");
    expect(object.function.parameters.properties.description.type).toBe("string");
    expect(object.function.parameters.properties.fields.items.properties.description.type).toBe(
      "string",
    );

    // Event: per-field description.
    expect(
      tool("create_event_card").function.parameters.properties.fields.items.properties.description.type,
    ).toBe("string");

    // Command: inputs + responses + legacy fields.
    const command = tool("create_command_card").function.parameters.properties;
    expect(command.inputs.items.properties.description.type).toBe("string");
    expect(command.responses.items.properties.description.type).toBe("string");
    expect(command.fields.items.properties.description.type).toBe("string");

    // Query: params + responses.
    const query = tool("create_query_card").function.parameters.properties;
    expect(query.params.items.properties.description.type).toBe("string");
    expect(query.responses.items.properties.description.type).toBe("string");

    // State: params + states + query items.
    const state = tool("create_state_card").function.parameters.properties;
    expect(state.params.items.properties.description.type).toBe("string");
    expect(state.states.items.properties.description.type).toBe("string");
    expect(state.queryItems.items.properties.description.type).toBe("string");

    // View: params + states + query items.
    const view = tool("create_view_card").function.parameters.properties;
    expect(view.params.items.properties.description.type).toBe("string");
    expect(view.states.items.properties.description.type).toBe("string");
    expect(view.queryItems.items.properties.description.type).toBe("string");

    // Service: method params + returns.
    const service = tool("create_service_card").function.parameters.properties;
    expect(service.methods.items.properties.params.items.properties.description.type).toBe("string");
    expect(service.methods.items.properties.returns.items.properties.description.type).toBe(
      "string",
    );

    // Enum: value description.
    const enumTool = tool("create_enum_card");
    expect(enumTool.function.parameters.properties.values.items.properties.description.type).toBe(
      "string",
    );
  });

  it("rejects an AI state card that references an unknown tag, then accepts it", async () => {    const failed = JSON.parse(
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

  it("rejects a state param with no traceable source, then accepts it once declared", async () => {
    const failed = JSON.parse(
      await executeAITool("create_state_card", {
        name: "OrderState",
        params: [{ name: "ghostField", type: "string" }],
        queryItems: [],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    expect(failed.status).toBe("error");
    expect(failed.issues.map((i: any) => i.code)).toContain("param_source_unknown");
    expect(useCanvasStore.getState().elements).toHaveLength(0);

    // Declare the field on a Command, then retry: the param is now sourced.
    await executeAITool("create_command_card", {
      name: "PlaceOrder",
      inputs: [{ name: "ghostField", type: "string" }],
    });

    const ok = JSON.parse(
      await executeAITool("create_state_card", {
        name: "OrderState",
        params: [{ name: "ghostField", type: "string" }],
        queryItems: [],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    expect(ok.status).toBe("success");
    expect(ok.type).toBe("stateCard");
  });

  it("rejects a state field that echoes a param, then accepts it once removed", async () => {
    await executeAITool("create_event_card", {
      name: "OrderPlaced",
      fields: [{ name: "orderId", type: "string", tag: "order" }],
    });

    const echoed = JSON.parse(
      await executeAITool("create_state_card", {
        name: "OrderState",
        params: [{ name: "orderId", type: "string" }],
        queryItems: [{ types: ["OrderPlaced"], tags: [{ tag: "order", field: "orderId" }] }],
        states: [
          { name: "orderId", type: "string" },
          { name: "exists", type: "boolean" },
        ],
      }),
    );
    expect(echoed.status).toBe("error");
    expect(echoed.issues.map((i: any) => i.code)).toContain("state_echoes_param");
    expect(useCanvasStore.getState().elements.filter((e) => e.type === "stateCard")).toHaveLength(0);

    const ok = JSON.parse(
      await executeAITool("create_state_card", {
        name: "OrderState",
        params: [{ name: "orderId", type: "string" }],
        queryItems: [{ types: ["OrderPlaced"], tags: [{ tag: "order", field: "orderId" }] }],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    expect(ok.status).toBe("success");
  });

  it("creates a View card once its tag exists on the board", async () => {
    await executeAITool("create_event_card", {
      name: "CourseDefined",
      fields: [{ name: "courseId", type: "string", tag: "course" }],
    });

    const ok = JSON.parse(
      await executeAITool("create_view_card", {
        name: "CourseCatalog",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["CourseDefined"], tags: [{ tag: "course", field: "courseId" }] }],
        states: [{ name: "title", type: "string" }],
      }),
    );
    expect(ok.status).toBe("success");
    expect(ok.type).toBe("viewCard");

    const view = useCanvasStore.getState().elements.find((e) => e.type === "viewCard");
    expect(view?.data.name).toBe("courseCatalog");
  });

  it("preserves field descriptions on state and view cards", async () => {
    await executeAITool("create_event_card", {
      name: "CourseDefined",
      fields: [{ name: "courseId", type: "string", tag: "course" }],
    });

    const state = JSON.parse(
      await executeAITool("create_state_card", {
        name: "Course",
        description: "Course projection",
        params: [{ name: "courseId", type: "string", description: "The course id" }],
        queryItems: [{ types: ["CourseDefined"], description: "Matches course definitions" }],
        states: [{ name: "title", type: "string", description: "Course title" }],
      }),
    );
    expect(state.status).toBe("success");
    const stateEl = useCanvasStore.getState().elements.find((e) => e.type === "stateCard")!;
    expect(stateEl.data.params[0].description).toBe("The course id");
    expect(stateEl.data.states[0].description).toBe("Course title");
    expect(stateEl.data.queryItems[0].description).toBe("Matches course definitions");

    const view = JSON.parse(
      await executeAITool("create_view_card", {
        name: "CourseCatalog",
        params: [{ name: "courseId", type: "string", description: "The course id" }],
        queryItems: [{ types: ["CourseDefined"] }],
        states: [{ name: "title", type: "string", description: "Course title" }],
      }),
    );
    expect(view.status).toBe("success");
    const viewEl = useCanvasStore.getState().elements.find((e) => e.type === "viewCard")!;
    expect(viewEl.data.params[0].description).toBe("The course id");
    expect(viewEl.data.states[0].description).toBe("Course title");
  });

  it("rejects an AI event card with an unknown field type", async () => {
    const res = JSON.parse(
      await executeAITool("create_event_card", {
        name: "OrderPlaced",
        fields: [{ name: "amount", type: "Money" }],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.issues.map((i: any) => i.code)).toContain("type_unknown");
    expect(useCanvasStore.getState().elements).toHaveLength(0);
  });

  it("accepts a defined Object type once it exists on the board", async () => {
    await executeAITool("create_object_card", { name: "Money", fields: [] });
    const res = JSON.parse(
      await executeAITool("create_event_card", {
        name: "OrderPlaced",
        fields: [{ name: "amount", type: "Money" }],
      }),
    );
    expect(res.status).toBe("success");
  });

  it("rejects reusing a DCB tag with a different field type", async () => {
    await executeAITool("create_event_card", {
      name: "UserRegistered",
      fields: [{ name: "userId", type: "string", tag: "user" }],
    });

    const res = JSON.parse(
      await executeAITool("create_event_card", {
        name: "UserEmailChanged",
        fields: [{ name: "userId", type: "number", tag: "user" }],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.issues.map((i: any) => i.code)).toContain("tag_type_conflict");
    expect(useCanvasStore.getState().elements).toHaveLength(1);
  });

  it("rejects a state query item referencing a missing event type", async () => {
    const res = JSON.parse(
      await executeAITool("create_state_card", {
        name: "OrderState",
        params: [],
        queryItems: [{ types: ["GhostEvent"], tags: [] }],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.issues.map((i: any) => i.code)).toContain("event_type_not_found");
  });

  it("reports defined and primitive types in the canvas overview", async () => {
    await executeAITool("create_object_card", { name: "Address", fields: [] });
    const res = JSON.parse(await executeAITool("get_canvas_overview", {}));
    expect(res.definedTypes).toContain("address");
    expect(res.primitiveTypes).toContain("string");
  });

  it("generates an update tool per create tool plus a delete tool", () => {
    const tools = buildOpenAITools();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("update_event_card");
    expect(names).toContain("update_state_card");
    expect(names).toContain("update_view_card");
    expect(names).toContain("update_alias_card");
    expect(names).toContain("delete_element");

    const update = tools.find((t) => t.function.name === "update_event_card");
    expect(update.function.parameters.properties.target.type).toBe("string");
    expect(update.function.parameters.required).toContain("target");
  });

  it("updates an event card in place, preserving its id", async () => {
    const created = JSON.parse(
      await executeAITool("create_event_card", {
        name: "OrderPlaced",
        fields: [{ name: "orderId", type: "string" }],
      }),
    );
    const id = created.createdId;

    const res = JSON.parse(
      await executeAITool("update_event_card", {
        target: "OrderPlaced",
        name: "OrderSubmitted",
        fields: [
          { name: "orderId", type: "string" },
          { name: "amount", type: "number" },
        ],
      }),
    );
    expect(res.status).toBe("success");
    expect(res.updatedId).toBe(id);

    const elements = useCanvasStore.getState().elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toBe(id);
    expect(elements[0].data.name).toBe("orderSubmitted");
    expect(elements[0].data.fields).toHaveLength(2);
  });

  it("widens a state card when an AI update adds a long event type", async () => {
    await executeAITool("create_event_card", {
      name: "CourseDefined",
      fields: [{ name: "courseId", type: "string" }],
    });
    await executeAITool("create_event_card", {
      name: "abcdefghijklmnopqrstuvwxyz",
      fields: [],
    });

    const created = JSON.parse(
      await executeAITool("create_state_card", {
        name: "CourseState",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["CourseDefined"] }],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    const id = created.createdId;
    const before = useCanvasStore.getState().elements.find((e) => e.id === id)!;
    expect(before.width).toBe(233);

    const res = JSON.parse(
      await executeAITool("update_state_card", {
        target: "CourseState",
        name: "CourseState",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["abcdefghijklmnopqrstuvwxyz"] }],
        states: [{ name: "exists", type: "boolean" }],
      }),
    );
    expect(res.status).toBe("success");

    const after = useCanvasStore.getState().elements.find((e) => e.id === id)!;
    expect(after.width).toBe(392);
  });

  it("reports element_not_found when updating a missing card", async () => {
    const res = JSON.parse(
      await executeAITool("update_event_card", {
        target: "Ghost",
        name: "Ghost",
        fields: [],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.error).toBe("element_not_found");
  });

  it("rejects an update with an unknown type without changing the card", async () => {
    await executeAITool("create_event_card", {
      name: "OrderPlaced",
      fields: [{ name: "orderId", type: "string" }],
    });
    const res = JSON.parse(
      await executeAITool("update_event_card", {
        target: "OrderPlaced",
        name: "OrderPlaced",
        fields: [{ name: "orderId", type: "Ghost" }],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.issues.map((i: any) => i.code)).toContain("type_unknown");
    expect(useCanvasStore.getState().elements[0].data.fields[0].type).toBe("string");
  });

  it("excludes the element itself when re-checking tag types on update", async () => {
    await executeAITool("create_event_card", {
      name: "UserRegistered",
      fields: [{ name: "userId", type: "string", tag: "user" }],
    });
    // The only event defining "user": retagging its type is allowed.
    const ok = JSON.parse(
      await executeAITool("update_event_card", {
        target: "UserRegistered",
        name: "UserRegistered",
        fields: [{ name: "userId", type: "number", tag: "user" }],
      }),
    );
    expect(ok.status).toBe("success");
    expect(useCanvasStore.getState().elements[0].data.fields[0].type).toBe("number");
  });

  it("rejects an update that conflicts with another event's tag type", async () => {
    await executeAITool("create_event_card", {
      name: "UserRegistered",
      fields: [{ name: "userId", type: "string", tag: "user" }],
    });
    await executeAITool("create_event_card", {
      name: "UserEmailChanged",
      fields: [{ name: "userId", type: "string", tag: "user" }],
    });

    const res = JSON.parse(
      await executeAITool("update_event_card", {
        target: "UserEmailChanged",
        name: "UserEmailChanged",
        fields: [{ name: "userId", type: "number", tag: "user" }],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.issues.map((i: any) => i.code)).toContain("tag_type_conflict");
  });

  it("maps create params to data when updating an enum (values -> fields)", async () => {
    await executeAITool("create_enum_card", { name: "Currency", values: [{ name: "USD" }] });
    const res = JSON.parse(
      await executeAITool("update_enum_card", {
        target: "Currency",
        name: "Currency",
        values: [{ name: "USD" }, { name: "EUR" }],
      }),
    );
    expect(res.status).toBe("success");
    const el = useCanvasStore.getState().elements.find((e) => e.type === "enumCard");
    expect(el?.data.fields).toHaveLength(2);
  });

  it("updates an alias wrapped type (type -> aliasedType)", async () => {
    await executeAITool("create_alias_card", { name: "CustomerId", type: "uuid" });
    const res = JSON.parse(
      await executeAITool("update_alias_card", {
        target: "CustomerId",
        name: "CustomerId",
        type: "string",
      }),
    );
    expect(res.status).toBe("success");
    expect(useCanvasStore.getState().elements[0].data.aliasedType).toBe("string");
  });

  it("updates a sticky note via the generic update tool", async () => {
    await executeAITool("create_sticky_note", { text: "Note 1" });
    const res = JSON.parse(
      await executeAITool("update_sticky_note", { target: "Note 1", text: "Note 2" }),
    );
    expect(res.status).toBe("success");
    expect(useCanvasStore.getState().elements[0].data.text).toBe("Note 2");
  });

  it("deletes an element by name", async () => {
    await executeAITool("create_event_card", { name: "OrderPlaced", fields: [] });
    const res = JSON.parse(await executeAITool("delete_element", { target: "OrderPlaced" }));
    expect(res.status).toBe("success");
    expect(useCanvasStore.getState().elements).toHaveLength(0);
  });

  it("reports element_not_found when deleting a missing card", async () => {
    const res = JSON.parse(await executeAITool("delete_element", { target: "Ghost" }));
    expect(res.status).toBe("error");
    expect(res.error).toBe("element_not_found");
  });

  it("exposes create_slice and update_slice tools", () => {
    const names = buildOpenAITools().map((t) => t.function.name);
    expect(names).toContain("create_slice");
    expect(names).toContain("update_slice");
  });

  it("creates a slice with typed lanes via AI", async () => {
    const res = JSON.parse(
      await executeAITool("create_slice", {
        name: "PlaceOrderSlice",
        lanes: [{ type: "commandCard" }, { type: "eventCard" }, { type: "queryCard" }],
      }),
    );
    expect(res.status).toBe("success");
    expect(res.type).toBe("sliceCard");

    const slice = useCanvasStore.getState().elements.find((e) => e.type === "sliceCard");
    expect((slice?.data as any).lanes).toHaveLength(3);
    expect((slice?.data as any).lanes[0].childType).toBe("commandCard");
  });

  it("rejects an AI slice with a disallowed lane type or no lanes", async () => {
    const bad = JSON.parse(
      await executeAITool("create_slice", { name: "Bad", lanes: [{ type: "enumCard" }] }),
    );
    expect(bad.status).toBe("error");
    expect(bad.issues.map((i: any) => i.code)).toContain("lane_type_not_allowed");

    const empty = JSON.parse(await executeAITool("create_slice", { name: "Empty", lanes: [] }));
    expect(empty.status).toBe("error");
    expect(empty.issues.map((i: any) => i.code)).toContain("lanes_empty");

    expect(useCanvasStore.getState().elements).toHaveLength(0);
  });

  it("rejects an AI slice that repeats a lane type", async () => {
    const res = JSON.parse(
      await executeAITool("create_slice", {
        name: "Dup",
        lanes: [{ type: "commandCard" }, { type: "commandCard" }],
      }),
    );
    expect(res.status).toBe("error");
    expect(res.issues.map((i: any) => i.code)).toContain("duplicate_lane_type");
    expect(useCanvasStore.getState().elements).toHaveLength(0);
  });

  it("exposes slice/lane placement params on lane-eligible card tools only", () => {
    const tools = buildOpenAITools();
    const command = tools.find((t) => t.function.name === "create_command_card");
    expect(command.function.parameters.properties.slice.type).toBe("string");
    expect(command.function.parameters.properties.lane.type).toBe("string");

    const update = tools.find((t) => t.function.name === "update_event_card");
    expect(update.function.parameters.properties.slice.type).toBe("string");

    // Enum cards cannot live in a lane, so they must not advertise the params.
    const enumTool = tools.find((t) => t.function.name === "create_enum_card");
    expect(enumTool.function.parameters.properties.slice).toBeUndefined();
  });

  it("places a card into the lane matching its type when `slice` is passed", async () => {
    const sliceRes = JSON.parse(
      await executeAITool("create_slice", {
        name: "PlaceOrderSlice",
        lanes: [{ type: "commandCard" }, { type: "eventCard" }],
      }),
    );
    expect(sliceRes.status).toBe("success");

    const slice = useCanvasStore.getState().elements.find((e) => e.type === "sliceCard")!;
    const [commandLane, eventLane] = (slice.data as any).lanes;

    const cmdRes = JSON.parse(
      await executeAITool("create_command_card", {
        name: "PlaceOrder",
        slice: "PlaceOrderSlice",
      }),
    );
    expect(cmdRes.status).toBe("success");

    const evtRes = JSON.parse(
      await executeAITool("create_event_card", {
        name: "OrderPlaced",
        slice: "PlaceOrderSlice",
      }),
    );
    expect(evtRes.status).toBe("success");

    const elements = useCanvasStore.getState().elements;
    const command = elements.find((e) => e.type === "commandCard")!;
    const event = elements.find((e) => e.type === "eventCard")!;
    expect(command.sliceId).toBe(slice.id);
    expect(command.laneId).toBe(commandLane.id);
    expect(event.sliceId).toBe(slice.id);
    expect(event.laneId).toBe(eventLane.id);
  });

  it("selects an explicit lane by type or 1-based position", async () => {
    await executeAITool("create_slice", {
      name: "ReadSlice",
      lanes: [{ type: "queryCard" }, { type: "viewCard" }],
    });

    const byType = JSON.parse(
      await executeAITool("create_query_card", { name: "FindOrders", slice: "ReadSlice", lane: "queryCard" }),
    );
    expect(byType.status).toBe("success");

    const byIndex = JSON.parse(
      await executeAITool("create_view_card", { name: "OrderList", slice: "ReadSlice", lane: "2" }),
    );
    expect(byIndex.status).toBe("success");

    const overview = JSON.parse(await executeAITool("get_canvas_overview", {}));
    const sliceInfo = overview.slices.find((s: any) => s.name.toLowerCase() === "readslice");
    expect(sliceInfo.lanes[0].cards).toContain("findOrders");
    expect(sliceInfo.lanes[1].cards).toContain("orderList");
  });

  it("reports slice/lane placement failures without creating the card", async () => {
    const missing = JSON.parse(
      await executeAITool("create_event_card", { name: "Ghost", slice: "NoSlice" }),
    );
    expect(missing.status).toBe("error");
    expect(missing.error).toBe("slice_placement_failed");
    expect(missing.issues.map((i: any) => i.code)).toContain("slice_not_found");

    await executeAITool("create_slice", { name: "WriteSlice", lanes: [{ type: "eventCard" }] });
    const mismatch = JSON.parse(
      await executeAITool("create_command_card", { name: "PlaceOrder", slice: "WriteSlice" }),
    );
    expect(mismatch.status).toBe("error");
    expect(mismatch.issues.map((i: any) => i.code)).toContain("lane_not_found");

    expect(useCanvasStore.getState().elements.filter((e) => e.type === "commandCard")).toHaveLength(0);
  });

  it("spreads free-standing AI cards instead of stacking them", async () => {
    for (let i = 0; i < 5; i++) {
      await executeAITool("create_sticky_note", { text: `Note ${i}` });
    }

    const elements = useCanvasStore.getState().elements;
    expect(elements).toHaveLength(5);
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const b = elements[j];
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("moves an existing card into a lane via update, and detaches it again", async () => {    await executeAITool("create_slice", { name: "WriteSlice", lanes: [{ type: "eventCard" }] });
    const created = JSON.parse(
      await executeAITool("create_event_card", { name: "OrderPlaced", fields: [] }),
    );

    const moved = JSON.parse(
      await executeAITool("update_event_card", {
        target: "OrderPlaced",
        name: "OrderPlaced",
        fields: [],
        slice: "WriteSlice",
      }),
    );
    expect(moved.status).toBe("success");
    const slice = useCanvasStore.getState().elements.find((e) => e.type === "sliceCard")!;
    let event = useCanvasStore.getState().elements.find((e) => e.id === created.createdId)!;
    expect(event.sliceId).toBe(slice.id);

    const detached = JSON.parse(
      await executeAITool("update_event_card", {
        target: "OrderPlaced",
        name: "OrderPlaced",
        fields: [],
        slice: "",
      }),
    );
    expect(detached.status).toBe("success");
    event = useCanvasStore.getState().elements.find((e) => e.id === created.createdId)!;
    expect(event.sliceId).toBeUndefined();
    expect(event.laneId).toBeUndefined();
  });

  it("exposes create_domain_card without a nested domain param", () => {
    const tools = buildOpenAITools();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("create_domain_card");
    expect(names).toContain("update_domain_card");

    // A Domain cannot nest, so its own tool must not advertise `domain`.
    const domainTool = tools.find((t) => t.function.name === "create_domain_card")!;
    expect(domainTool.function.parameters.properties.domain).toBeUndefined();

    // Every other card tool can be placed in a domain.
    const eventTool = tools.find((t) => t.function.name === "create_event_card")!;
    expect(eventTool.function.parameters.properties.domain.type).toBe("string");
    const sliceTool = tools.find((t) => t.function.name === "create_slice")!;
    expect(sliceTool.function.parameters.properties.domain.type).toBe("string");
  });

  it("creates a domain and places a new card inside it", async () => {
    const domainRes = JSON.parse(
      await executeAITool("create_domain_card", { name: "Ordering" }),
    );
    expect(domainRes.status).toBe("success");
    expect(domainRes.type).toBe("domainCard");

    const evtRes = JSON.parse(
      await executeAITool("create_event_card", {
        name: "OrderPlaced",
        fields: [],
        domain: "Ordering",
      }),
    );
    expect(evtRes.status).toBe("success");

    const elements = useCanvasStore.getState().elements;
    const domain = elements.find((e) => e.type === "domainCard")!;
    const event = elements.find((e) => e.type === "eventCard")!;
    expect(event.domainId).toBe(domain.id);

    const overview = JSON.parse(await executeAITool("get_canvas_overview", {}));
    const info = overview.domains.find((d: any) => d.name.toLowerCase() === "ordering");
    expect(info.cards).toContain("orderPlaced");
  });

  it("places a slice (with its lanes) inside a domain, not the lane cards", async () => {
    await executeAITool("create_domain_card", { name: "Ordering" });
    const sliceRes = JSON.parse(
      await executeAITool("create_slice", {
        name: "PlaceOrderSlice",
        lanes: [{ type: "eventCard" }],
        domain: "Ordering",
      }),
    );
    expect(sliceRes.status).toBe("success");

    await executeAITool("create_event_card", {
      name: "OrderPlaced",
      fields: [],
      slice: "PlaceOrderSlice",
    });

    const elements = useCanvasStore.getState().elements;
    const domain = elements.find((e) => e.type === "domainCard")!;
    const slice = elements.find((e) => e.type === "sliceCard")!;
    const event = elements.find((e) => e.type === "eventCard")!;
    expect(slice.domainId).toBe(domain.id);
    // The lane card belongs to the slice, not directly to the domain.
    expect(event.domainId).toBeUndefined();
    expect(event.sliceId).toBe(slice.id);
  });

  it("reports domain_placement_failed when the domain does not exist", async () => {
    const res = JSON.parse(
      await executeAITool("create_event_card", { name: "Ghost", fields: [], domain: "Nope" }),
    );
    expect(res.status).toBe("error");
    expect(res.error).toBe("domain_placement_failed");
    expect(res.issues.map((i: any) => i.code)).toContain("domain_not_found");
    expect(useCanvasStore.getState().elements).toHaveLength(0);
  });

  it("moves an existing card into a domain via update, and detaches it again", async () => {
    await executeAITool("create_domain_card", { name: "Ordering" });
    const created = JSON.parse(
      await executeAITool("create_event_card", { name: "OrderPlaced", fields: [] }),
    );

    const moved = JSON.parse(
      await executeAITool("update_event_card", {
        target: "OrderPlaced",
        name: "OrderPlaced",
        fields: [],
        domain: "Ordering",
      }),
    );
    expect(moved.status).toBe("success");
    const domain = useCanvasStore.getState().elements.find((e) => e.type === "domainCard")!;
    let event = useCanvasStore.getState().elements.find((e) => e.id === created.createdId)!;
    expect(event.domainId).toBe(domain.id);

    const detached = JSON.parse(
      await executeAITool("update_event_card", {
        target: "OrderPlaced",
        name: "OrderPlaced",
        fields: [],
        domain: "",
      }),
    );
    expect(detached.status).toBe("success");
    event = useCanvasStore.getState().elements.find((e) => e.id === created.createdId)!;
    expect(event.domainId).toBeUndefined();
  });

  it("exposes create_group_card and group placement props", () => {
    const tools = buildOpenAITools();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("create_group_card");
    expect(names).toContain("update_group_card");

    // A Group cannot nest, so its own tool must not advertise `group`, but it
    // can still live in a Domain.
    const groupTool = tools.find((t) => t.function.name === "create_group_card")!;
    expect(groupTool.function.parameters.properties.group).toBeUndefined();
    expect(groupTool.function.parameters.properties.domain.type).toBe("string");

    // Definition/service/state cards can join a Group.
    const objectTool = tools.find((t) => t.function.name === "create_object_card")!;
    expect(objectTool.function.parameters.properties.group.type).toBe("string");
    const serviceTool = tools.find((t) => t.function.name === "create_service_card")!;
    expect(serviceTool.function.parameters.properties.group.type).toBe("string");
    const stateTool = tools.find((t) => t.function.name === "create_state_card")!;
    expect(stateTool.function.parameters.properties.group.type).toBe("string");

    // Behavior cards cannot.
    const eventTool = tools.find((t) => t.function.name === "create_event_card")!;
    expect(eventTool.function.parameters.properties.group).toBeUndefined();
  });

  it("creates a group and places an object inside it", async () => {
    await executeAITool("create_domain_card", { name: "Ordering" });
    const groupRes = JSON.parse(
      await executeAITool("create_group_card", { name: "MoneyTypes", domain: "Ordering" }),
    );
    expect(groupRes.status).toBe("success");
    expect(groupRes.type).toBe("groupCard");

    const objRes = JSON.parse(
      await executeAITool("create_object_card", {
        name: "Money",
        fields: [],
        group: "MoneyTypes",
      }),
    );
    expect(objRes.status).toBe("success");

    const elements = useCanvasStore.getState().elements;
    const domain = elements.find((e) => e.type === "domainCard")!;
    const group = elements.find((e) => e.type === "groupCard")!;
    const object = elements.find((e) => e.type === "objectCard")!;
    expect(group.domainId).toBe(domain.id);
    expect(object.groupId).toBe(group.id);
    // The object sits in the group, not directly in the domain.
    expect(object.domainId).toBeUndefined();

    const overview = JSON.parse(await executeAITool("get_canvas_overview", {}));
    const info = overview.groups.find((g: any) => g.name.toLowerCase() === "moneytypes");
    expect(info.cards).toContain("money");
  });

  it("places a state card inside a group", async () => {
    await executeAITool("create_group_card", { name: "States" });
    const res = JSON.parse(
      await executeAITool("create_state_card", { name: "OrderState", group: "States" }),
    );
    expect(res.status).toBe("success");

    const elements = useCanvasStore.getState().elements;
    const group = elements.find((e) => e.type === "groupCard")!;
    const state = elements.find((e) => e.type === "stateCard")!;
    expect(state.groupId).toBe(group.id);
  });

  it("reports group_placement_failed for a missing group or an ineligible card", async () => {
    const missing = JSON.parse(
      await executeAITool("create_object_card", { name: "Ghost", fields: [], group: "Nope" }),
    );
    expect(missing.status).toBe("error");
    expect(missing.error).toBe("group_placement_failed");
    expect(missing.issues.map((i: any) => i.code)).toContain("group_not_found");
    expect(useCanvasStore.getState().elements).toHaveLength(0);

    await executeAITool("create_group_card", { name: "Types" });
    const ineligible = JSON.parse(
      await executeAITool("create_event_card", { name: "OrderPlaced", fields: [], group: "Types" }),
    );
    expect(ineligible.status).toBe("error");
    expect(ineligible.error).toBe("group_placement_failed");
    expect(ineligible.issues.map((i: any) => i.code)).toContain("group_ineligible_card");
  });

  it("moves an existing card into a group via update, and detaches it again", async () => {
    await executeAITool("create_group_card", { name: "Types" });
    const created = JSON.parse(
      await executeAITool("create_object_card", { name: "Money", fields: [] }),
    );

    const moved = JSON.parse(
      await executeAITool("update_object_card", {
        target: "Money",
        name: "Money",
        fields: [],
        group: "Types",
      }),
    );
    expect(moved.status).toBe("success");
    const group = useCanvasStore.getState().elements.find((e) => e.type === "groupCard")!;
    let object = useCanvasStore.getState().elements.find((e) => e.id === created.createdId)!;
    expect(object.groupId).toBe(group.id);

    const detached = JSON.parse(
      await executeAITool("update_object_card", {
        target: "Money",
        name: "Money",
        fields: [],
        group: "",
      }),
    );
    expect(detached.status).toBe("success");
    object = useCanvasStore.getState().elements.find((e) => e.id === created.createdId)!;
    expect(object.groupId).toBeUndefined();
  });
});
