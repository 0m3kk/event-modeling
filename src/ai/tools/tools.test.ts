import { describe, expect, it } from "vitest";
import type { AIPlanStep, CanvasObject, GroupInfo } from "@/types";
import type { CanvasStore } from "@/store/types";
import { executeToolCall } from "./index";
import type { AIToolContext } from "./types";
import { buildReferenceCopy, generateReferenceId } from "@/utils/reference";
import { createLineObject } from "@/utils/lineGeometry";

interface FakeStore {
  store: CanvasStore;
  objects: CanvasObject[];
  groups: GroupInfo[];
}

function createFakeStore(): FakeStore {
  const objects: CanvasObject[] = [];
  const groups: GroupInfo[] = [];
  const store = {
    objects,
    groups,
    selectedIds: [] as string[],
    viewport: { x: 0, y: 0, zoom: 1, screenWidth: 1000, screenHeight: 800 },
    isLocked: false,
    alignmentGuides: [],
    inlineEdit: null,
    typeSelect: null,
    stormSelectedField: null,
    fieldClipboard: null,
    stormActionHover: null,
    isSearchOpen: false,
    descHover: null,
    actionHover: null,
    validationTarget: null,
    validationHover: null,
    addObject: (obj: CanvasObject) => {
      objects.push(obj);
    },
    addObjects: (objs: CanvasObject[]) => {
      objects.push(...objs);
    },
    updateObject: (id: string, updates: Partial<CanvasObject>) => {
      const index = objects.findIndex((o) => o.id === id);
      if (index >= 0) {
        objects[index] = { ...objects[index], ...updates } as CanvasObject;
      }
    },
    deleteObjects: (ids: string[]) => {
      for (let i = objects.length - 1; i >= 0; i--) {
        if (ids.includes(objects[i]!.id)) objects.splice(i, 1);
      }
    },
    setSelectedIds: (ids: string[]) => {
      store.selectedIds = ids;
    },
    createReferenceCopy: (ids: string[]) => {
      const idSet = new Set(ids);
      const copyable = (obj: CanvasObject) => idSet.has(obj.id);

      const withRefs = objects.map((obj) =>
        copyable(obj) && !obj.referenceId
          ? { ...obj, referenceId: generateReferenceId() }
          : obj,
      );
      objects.length = 0;
      objects.push(...withRefs);

      const clones = objects
        .filter(copyable)
        .map((obj) => buildReferenceCopy(obj));
      objects.push(...clones);
      store.selectedIds = clones.map((c) => c.id);
    },
    setViewport: (vp: Partial<CanvasStore["viewport"]>) => {
      store.viewport = { ...store.viewport, ...vp };
    },
    groupObjects: (ids?: string[], name?: string) => {
      const targetIds = ids ?? store.selectedIds;
      const wanted = new Set(targetIds);
      const members = objects.filter((o) => wanted.has(o.id));
      if (members.length < 2) return;
      const groupId = `group-${groups.length + 1}`;
      groups.push({
        id: groupId,
        name: name ?? `Section ${groups.length + 1}`,
      });
      for (let i = 0; i < objects.length; i++) {
        if (wanted.has(objects[i]!.id)) {
          objects[i] = { ...objects[i]!, groupId };
        }
      }
      return groupId;
    },
    addToGroup: (groupId: string, ids: string[]) => {
      const wanted = new Set(ids);
      for (let i = 0; i < objects.length; i++) {
        if (wanted.has(objects[i]!.id)) {
          objects[i] = { ...objects[i]!, groupId };
        }
      }
    },
    deleteGroup: (groupId: string) => {
      const idx = groups.findIndex((g) => g.id === groupId);
      if (idx >= 0) groups.splice(idx, 1);
      for (let i = 0; i < objects.length; i++) {
        if (objects[i]!.groupId === groupId) {
          objects[i] = { ...objects[i]!, groupId: undefined };
        }
      }
    },
  } as unknown as CanvasStore;

  return { store, objects, groups };
}

function createContext(fake: FakeStore): {
  ctx: AIToolContext;
  getPlan: () => AIPlanStep[];
} {
  let plan: AIPlanStep[] = [];
  const ctx: AIToolContext = {
    getState: () => fake.store,
    getPlan: () => plan,
    setPlan: (next) => {
      plan = next;
    },
  };
  return { ctx, getPlan: () => plan };
}

describe("AI Read Tools", () => {
  it("get_canvas_overview returns correct structure", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: { kind: "event", name: "Order Placed", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      { id: "1", name: "get_canvas_overview", arguments: "{}" },
      ctx,
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.objectCount).toBe(1);
    expect(data.objectCountsByType.storm).toBe(1);
  });

  it("list_objects and search_objects find objects by text and type", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      {
        id: "s1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: { kind: "event", name: "Order Placed", fields: [] },
      },
      {
        id: "s2",
        type: "storm",
        x: 200,
        y: 0,
        width: 200,
        height: 100,
        stormData: { kind: "command", name: "Pay Order", fields: [] },
      },
      {
        id: "t1",
        type: "stickyNote",
        x: 0,
        y: 200,
        width: 100,
        height: 100,
        text: "Important note",
      },
    );
    const { ctx } = createContext(fake);

    const listRes = await executeToolCall(
      { id: "1", name: "list_objects", arguments: JSON.stringify({ type: "storm" }) },
      ctx,
    );
    const listData = JSON.parse(listRes.content);
    expect(listData.total).toBe(2);

    const searchRes = await executeToolCall(
      { id: "2", name: "search_objects", arguments: JSON.stringify({ query: "Order" }) },
      ctx,
    );
    const searchData = JSON.parse(searchRes.content);
    expect(searchData.total).toBe(2);
  });

  it("get_object retrieves full object payload", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "card-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: { kind: "event", name: "User Signed Up", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      { id: "1", name: "get_object", arguments: JSON.stringify({ id: "card-1" }) },
      ctx,
    );
    const data = JSON.parse(res.content);
    expect(data.found).toBe(true);
    expect(data.object.stormData.name).toBe("User Signed Up");
  });
});

describe("AI Storm Tools", () => {
  it("create_storm_cards builds cards and arranges them into lanes", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            { kind: "actor", name: "Customer" },
            {
              kind: "command",
              name: "Place Order",
              fields: [
                { name: "orderId", fieldType: "string" },
                { name: "amount", fieldType: "number" },
              ],
            },
            {
              kind: "event",
              name: "Order Placed",
              fields: [{ name: "orderId", fieldType: "string", tag: "Order" }],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.count).toBe(3);
    expect(fake.objects).toHaveLength(3);

    // Verify Actor -> Command -> Event ordering left to right
    const actor = fake.objects.find((o) => o.stormData?.kind === "actor")!;
    const cmd = fake.objects.find((o) => o.stormData?.kind === "command")!;
    const evt = fake.objects.find((o) => o.stormData?.kind === "event")!;

    expect(actor.x).toBeLessThan(cmd.x);
    expect(cmd.x).toBeLessThan(evt.x);
  });

  it("rejects unknown event references in State query items", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "state",
              name: "Order Summary",
              queryItems: [{ types: ["NonExistentEvent"] }],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBe(true);
    expect(res.content).toContain("invalid event-storming references");
    expect(fake.objects).toHaveLength(0);
  });

  it("builds State input params, output fields and resolved query-item tags", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          arrange: false,
          cards: [
            {
              kind: "event",
              name: "Order Placed",
              fields: [{ name: "Order ID", fieldType: "uuid", tag: "order" }],
            },
            {
              kind: "state",
              name: "Order Summary",
              inputFields: [
                { name: "Order ID", fieldType: "uuid", tag: "order" },
              ],
              outputFields: [{ name: "Total", fieldType: "number" }],
              queryItems: [
                { types: ["Order Placed"], tagFields: ["Order ID"] },
              ],
            },
          ],
        }),
      },
      ctx,
    );
    expect(res.isError).toBeFalsy();

    const state = fake.objects.find((o) => o.stormData?.kind === "state")!;
    expect(state.stormData?.fields).toEqual([]);
    expect(state.stormData?.inputFields?.[0].name).toBe("Order ID");
    expect(state.stormData?.inputFields?.[0].tag).toBe("Order");
    expect(state.stormData?.outputFields?.[0].name).toBe("Total");
    const item = state.stormData?.queryItems?.[0];
    expect(item?.tagFieldIds).toEqual([state.stormData!.inputFields![0].id]);
  });

  it("rejects a tag on a State output field", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "state",
              name: "Order Summary",
              outputFields: [
                { name: "Total", fieldType: "number", tag: "order" },
              ],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBe(true);
    expect(res.content).toContain("output field");
  });

  it("applies field validation to Command fields and Query params only", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          arrange: false,
          cards: [
            {
              kind: "command",
              name: "Place Order",
              action: "order:create:own",
              fields: [
                {
                  name: "email",
                  fieldType: "string",
                  validation: { format: "email", maxLength: 255 },
                },
                {
                  name: "quantity",
                  fieldType: "number",
                  validation: { min: 1, max: 10 },
                },
              ],
            },
            {
              kind: "query",
              name: "Get Order",
              action: "order:read:own",
              fields: [
                {
                  name: "status",
                  fieldType: "string",
                  validation: { allowedValues: ["draft", "placed"] },
                },
              ],
              responseFields: [
                {
                  name: "total",
                  fieldType: "number",
                  validation: { min: 0 },
                },
              ],
            },
            {
              kind: "event",
              name: "Order Placed",
              fields: [
                {
                  name: "Order ID",
                  fieldType: "uuid",
                  tag: "order",
                  validation: { minLength: 1 },
                },
              ],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();

    const command = fake.objects.find((o) => o.stormData?.kind === "command")!;
    expect(command.stormData?.fields[0].validation).toEqual({
      format: "email",
      maxLength: 255,
    });
    expect(command.stormData?.fields[1].validation).toEqual({ min: 1, max: 10 });

    const query = fake.objects.find((o) => o.stormData?.kind === "query")!;
    expect(query.stormData?.fields[0].validation).toEqual({
      allowedValues: ["draft", "placed"],
    });
    // Query response fields are output, never validated.
    expect(query.stormData?.responseFields?.[0].validation).toBeUndefined();

    // Event fields never carry validation.
    const event = fake.objects.find((o) => o.stormData?.kind === "event")!;
    expect(event.stormData?.fields[0].validation).toBeUndefined();
  });

  it("rejects actor card whose permissions do not match any action on canvas", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "cmd-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      stormData: {
        kind: "command",
        name: "Place Order",
        action: "order:create:own",
        fields: [],
      },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "actor",
              name: "Customer",
              permissions: ["unrelated:fake:perm"],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content);
    expect(parsed.error).toContain("invalid event-storming references");
    expect(parsed.error).toContain('permission "unrelated:fake:perm" does not match any action on the canvas');
  });

  it("accepts actor card whose permissions match an existing action", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "cmd-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      stormData: {
        kind: "command",
        name: "Place Order",
        action: "order:create:own",
        fields: [],
      },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "actor",
              name: "Customer",
              permissions: ["order:*"],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.count).toBe(1);
    const actorObj = fake.objects.find((o) => o.stormData?.kind === "actor");
    expect(actorObj).toBeDefined();
    expect(actorObj?.stormData?.permissions).toEqual(["order:*"]);
  });

  it("update_storm_card updates fields and recalculates height", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "evt-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      stormData: { kind: "event", name: "Old Name", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "update_storm_card",
        arguments: JSON.stringify({
          id: "evt-1",
          name: "Payment Completed",
          fields: [
            { name: "txId", fieldType: "string" },
            { name: "amount", fieldType: "number" },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const updated = fake.objects[0]!;
    expect(updated.stormData?.name).toBe("Payment Completed");
    expect(updated.stormData?.fields).toHaveLength(2);
    expect(updated.height).toBeGreaterThan(80);
  });
});

describe("AI Model & Write Tools", () => {
  it("create_model_nodes creates data model objects", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_model_nodes",
        arguments: JSON.stringify({
          nodes: [
            {
              kind: "object",
              name: "Customer Profile",
              fields: [
                { name: "id", fieldType: "uuid", required: true },
                { name: "email", fieldType: "string", required: true },
              ],
            },
            {
              kind: "enum",
              name: "OrderStatus",
              values: [{ value: "PENDING" }, { value: "SHIPPED" }],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(fake.objects).toHaveLength(2);
    expect(fake.objects[0]!.type).toBe("model");
    expect(fake.objects[0]!.modelData?.name).toBe("Customer Profile");
    expect(fake.objects[1]!.modelData?.kind).toBe("enum");
  });

  it("create_model_nodes applies validation by model kind", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_model_nodes",
        arguments: JSON.stringify({
          nodes: [
            {
              kind: "object",
              name: "Customer",
              fields: [
                {
                  name: "email",
                  fieldType: "string",
                  validation: { format: "email" },
                },
              ],
            },
            {
              kind: "array",
              name: "Tags",
              itemType: "string",
              validation: { maxItems: 5, format: "email" },
            },
            {
              kind: "wrap",
              name: "Nickname",
              innerType: "string",
              validation: { maxLength: 20 },
            },
            {
              kind: "enum",
              name: "Status",
              values: [{ value: "Open" }],
              validation: { maxItems: 2 },
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const byName = (name: string) =>
      fake.objects.find((o) => o.modelData?.name === name)!;

    expect(byName("Customer").modelData?.fields?.[0].validation).toEqual({
      format: "email",
    });
    // Array keeps only the item-count limits; the string format is dropped.
    expect(byName("Tags").modelData?.validation).toEqual({ maxItems: 5 });
    expect(byName("Nickname").modelData?.validation).toEqual({ maxLength: 20 });
    // Enum never validates.
    expect(byName("Status").modelData?.validation).toBeUndefined();
  });

  it("connect_objects creates orthogonal elbow connector between cards", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "c1", type: "storm", x: 0, y: 0, width: 200, height: 100 },
      { id: "c2", type: "storm", x: 300, y: 0, width: 200, height: 100 },
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "connect_objects",
        arguments: JSON.stringify({
          connections: [{ sourceId: "c1", targetId: "c2", sourceAnchor: "right", targetAnchor: "left" }],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(fake.objects).toHaveLength(3);
    const conn = fake.objects[2]!;
    expect(conn.type).toBe("connector");
    expect(conn.connectorData?.start).toEqual({ objectId: "c1", anchor: "right" });
    expect(conn.connectorData?.end).toEqual({ objectId: "c2", anchor: "left" });
    expect(conn.connectorData?.arrowEnd).toBe(true);
  });

  it("create_objects creates a freeform line", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_objects",
        arguments: JSON.stringify({
          objects: [
            { type: "line", x1: 0, y1: 50, x2: 300, y2: 50, lineStyle: "dashed" },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(fake.objects).toHaveLength(1);
    const line = fake.objects[0]!;
    expect(line.type).toBe("line");
    expect(line.width).toBe(300);
    expect(line.height).toBe(0);
    expect(line.lineData?.start).toEqual({ x: 0, y: 0 });
    expect(line.lineData?.end).toEqual({ x: 300, y: 0 });
    expect(line.lineData?.lineStyle).toBe("dashed");
  });

  it("separate_layers draws a separator line in each layer gap", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "cmd", type: "storm", x: 100, y: 0, width: 200, height: 100 },
      { id: "con", type: "storm", x: 100, y: 200, width: 200, height: 100 },
      { id: "evt", type: "storm", x: 100, y: 400, width: 200, height: 100 },
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "separate_layers",
        arguments: JSON.stringify({
          layers: [["cmd"], ["con"], ["evt"]],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.count).toBe(2);

    const lines = fake.objects.filter((o) => o.type === "line");
    expect(lines).toHaveLength(2);
    // First separator sits in the gap between Command (ends y=100) and
    // Constraint (starts y=200), spanning both cards plus 40px padding.
    expect(lines[0]!.x).toBe(60);
    expect(lines[0]!.y).toBe(150);
    expect(lines[0]!.width).toBe(280);
    // No style requested and no lines on the canvas yet, so the separators use
    // the solid default instead of a forced dash.
    expect(lines[0]!.lineData?.lineStyle).toBe("solid");
  });

  it("separate_layers orders layers by real geometry, not argument order", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "cmd", type: "storm", x: 100, y: 0, width: 200, height: 100 },
      { id: "evt", type: "storm", x: 100, y: 400, width: 200, height: 100 },
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "separate_layers",
        // Deliberately reversed: Event listed before Command.
        arguments: JSON.stringify({ layers: [["evt"], ["cmd"]] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const lines = fake.objects.filter((o) => o.type === "line");
    expect(lines).toHaveLength(1);
    // Still placed in the gap (100..400), not inside either card.
    expect(lines[0]!.y).toBe(250);
  });

  it("separate_layers pins the line below the upper layer when layers overlap", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "cmd", type: "storm", x: 100, y: 0, width: 200, height: 100 },
      // Constraint starts before Command ends -> vertical overlap.
      { id: "con", type: "storm", x: 100, y: 80, width: 200, height: 120 },
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "separate_layers",
        arguments: JSON.stringify({ layers: [["cmd"], ["con"]] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.overlapping).toBe(true);
    const lines = fake.objects.filter((o) => o.type === "line");
    expect(lines).toHaveLength(1);
    // Command ends at y=100; the line is pinned just below it, not buried
    // inside the card.
    expect(lines[0]!.y).toBe(106);
  });

  it("separate_layers inherits the line style already on the canvas", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "cmd", type: "storm", x: 100, y: 0, width: 200, height: 100 },
      { id: "evt", type: "storm", x: 100, y: 400, width: 200, height: 100 },
      createLineObject(
        "l-existing",
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { lineStyle: "dotted" },
      ),
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "separate_layers",
        arguments: JSON.stringify({ layers: [["cmd"], ["evt"]] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const created = JSON.parse(res.content).created as string[];
    const separator = fake.objects.find((o) => o.id === created[0]);
    expect(separator?.lineData?.lineStyle).toBe("dotted");
  });

  it("separate_layers lets an explicit line style override the canvas default", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "cmd", type: "storm", x: 100, y: 0, width: 200, height: 100 },
      { id: "evt", type: "storm", x: 100, y: 400, width: 200, height: 100 },
      createLineObject(
        "l-existing",
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { lineStyle: "dotted" },
      ),
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "separate_layers",
        arguments: JSON.stringify({
          layers: [["cmd"], ["evt"]],
          lineStyle: "dashed",
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const created = JSON.parse(res.content).created as string[];
    const separator = fake.objects.find((o) => o.id === created[0]);
    expect(separator?.lineData?.lineStyle).toBe("dashed");
  });

  it("separate_layers joins the slice's section so its frame encloses the lines", async () => {
    const fake = createFakeStore();
    fake.groups.push({ id: "slice", name: "Write Slice" });
    fake.objects.push(
      {
        id: "cmd",
        type: "storm",
        x: 100,
        y: 0,
        width: 200,
        height: 100,
        groupId: "slice",
      },
      {
        id: "evt",
        type: "storm",
        x: 100,
        y: 400,
        width: 200,
        height: 100,
        groupId: "slice",
      },
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "separate_layers",
        arguments: JSON.stringify({ layers: [["cmd"], ["evt"]] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.groupId).toBe("slice");
    const lines = fake.objects.filter((o) => o.type === "line");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.groupId).toBe("slice");
  });

  it("group_objects and ungroup_objects manage sections", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "o1", type: "storm", x: 0, y: 0, width: 200, height: 100 },
      { id: "o2", type: "storm", x: 100, y: 0, width: 200, height: 100 },
    );
    const { ctx } = createContext(fake);

    const groupRes = await executeToolCall(
      {
        id: "1",
        name: "group_objects",
        arguments: JSON.stringify({ ids: ["o1", "o2"], name: "Billing Domain" }),
      },
      ctx,
    );
    expect(groupRes.isError).toBeFalsy();
    const groupData = JSON.parse(groupRes.content);
    expect(groupData.grouped).toBe(true);
    expect(fake.groups).toHaveLength(1);
    expect(fake.groups[0]!.name).toBe("Billing Domain");

    const ungroupRes = await executeToolCall(
      {
        id: "2",
        name: "ungroup_objects",
        arguments: JSON.stringify({ groupIds: [fake.groups[0]!.id] }),
      },
      ctx,
    );
    expect(ungroupRes.isError).toBeFalsy();
    expect(fake.groups).toHaveLength(0);
    expect(fake.objects[0]!.groupId).toBeUndefined();
  });

  it("update_plan updates working plan steps", async () => {
    const fake = createFakeStore();
    const { ctx, getPlan } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "update_plan",
        arguments: JSON.stringify({
          steps: [
            { text: "Discover events", status: "done" },
            { text: "Model state card", status: "in_progress" },
            { text: "Connect commands", status: "pending" },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const plan = getPlan();
    expect(plan).toHaveLength(3);
    expect(plan[0]!.status).toBe("done");
    expect(plan[1]!.status).toBe("in_progress");
  });

  it("create_storm_cards assigns groupId to created cards and places near group", async () => {
    const fake = createFakeStore();
    fake.groups.push({
      id: "group-orders",
      name: "Orders",
      customBounds: { x: 500, y: 500, width: 300, height: 200 },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "event",
              name: "Order Placed",
              groupId: "Orders",
            },
          ],
        }),
      },
      ctx,
    );
    expect(res.isError).toBeFalsy();
    const created = fake.objects.find((o) => o.stormData?.name === "Order Placed");
    expect(created).toBeDefined();
    expect(created?.groupId).toBe("group-orders");
  });

  it("group_objects can add single object to an existing group by groupId or name", async () => {
    const fake = createFakeStore();
    fake.groups.push({
      id: "group-1",
      name: "Billing",
    });
    fake.objects.push({
      id: "o1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "group_objects",
        arguments: JSON.stringify({
          ids: ["o1"],
          groupId: "Billing",
        }),
      },
      ctx,
    );
    expect(res.isError).toBeFalsy();
    expect(fake.objects[0]!.groupId).toBe("group-1");
  });
});
