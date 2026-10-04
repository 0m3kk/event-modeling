import { describe, expect, it } from "vitest";
import type { AIPlanStep, CanvasObject, GroupInfo } from "@/types";
import type { CanvasStore } from "@/store/types";
import { executeToolCall } from "./index";
import type { AIToolContext } from "./types";
import { buildReferenceCopy, generateReferenceId } from "@/utils/reference";
import { createLineObject } from "@/utils/lineGeometry";
import { computeStormCardHeight } from "@/utils/cardDimensions";

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
    aiHighlightIds: [] as string[],
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
    setAIHighlight: (ids: string[]) => {
      store.aiHighlightIds = ids;
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
      if (members.length === 0) return;
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
                { name: "Order ID", fieldType: "string" },
                { name: "Amount", fieldType: "number" },
              ],
            },
            {
              kind: "event",
              name: "Order Placed",
              fields: [{ name: "Order ID", fieldType: "string", tag: "Order" }],
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

  it("arrange_storm_slice re-centers every layer on the widest layer", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const created = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          arrange: false,
          cards: [
            { kind: "command", name: "Place Order", x: 120, y: 0 },
            { kind: "constraint", name: "Check Stock", x: 0, y: 160 },
            { kind: "constraint", name: "Check Funds", x: 600, y: 160 },
            { kind: "event", name: "Order Placed", x: 120, y: 340 },
          ],
        }),
      },
      ctx,
    );
    expect(created.isError).toBeFalsy();
    const ids = (JSON.parse(created.content).created as { id: string }[]).map(
      (c) => c.id,
    );
    const [cmdId, cst1Id, cst2Id, evtId] = ids;

    const res = await executeToolCall(
      {
        id: "2",
        name: "arrange_storm_slice",
        arguments: JSON.stringify({ cardIds: ids }),
      },
      ctx,
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content).arranged).toBe(4);

    const cmd = fake.objects.find((o) => o.id === cmdId)!;
    const cst1 = fake.objects.find((o) => o.id === cst1Id)!;
    const cst2 = fake.objects.find((o) => o.id === cst2Id)!;
    const evt = fake.objects.find((o) => o.id === evtId)!;

    const cmdCenter = cmd.x + (cmd.width ?? 0) / 2;
    const midCenter = (cst1.x + (cst2.x + (cst2.width ?? 0))) / 2;
    const evtCenter = evt.x + (evt.width ?? 0) / 2;
    expect(Math.round(cmdCenter)).toBe(Math.round(midCenter));
    expect(Math.round(evtCenter)).toBe(Math.round(midCenter));
    expect(cmd.y).toBeLessThan(cst1.y);
    expect(cst1.y).toBeLessThan(evt.y);
  });

  it("arrange_storm_slice ignores unknown ids", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "arrange_storm_slice",
        arguments: JSON.stringify({ cardIds: ["nope"] }),
      },
      ctx,
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content).arranged).toBe(0);
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
                  name: "Email",
                  fieldType: "string",
                  validation: { format: "email", maxLength: 255 },
                },
                {
                  name: "Quantity",
                  fieldType: "number",
                  validation: { min: 1, max: 10 },
                },
              ],
              responseFields: [
                {
                  name: "Order ID",
                  fieldType: "uuid",
                  validation: { minLength: 1 },
                },
              ],
            },
            {
              kind: "query",
              name: "Get Order",
              action: "order:read:own",
              fields: [
                {
                  name: "Status",
                  fieldType: "string",
                  validation: { allowedValues: ["draft", "placed"] },
                },
              ],
              responseFields: [
                {
                  name: "Total",
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
    // Command response fields are stored but never carry input validation.
    expect(command.stormData?.responseFields).toHaveLength(1);
    expect(
      command.stormData?.responseFields?.[0].validation,
    ).toBeUndefined();

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
            { name: "Transaction ID", fieldType: "string" },
            { name: "Amount", fieldType: "number" },
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

  it("update_storm_card preserves a width the user resized", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "evt-lock",
      type: "storm",
      x: 0,
      y: 0,
      width: 420,
      height: 80,
      widthLocked: true,
      stormData: { kind: "event", name: "Old Name", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "update_storm_card",
        arguments: JSON.stringify({
          id: "evt-lock",
          name: "Payment Completed",
          fields: [
            { name: "Transaction ID", fieldType: "string" },
            { name: "Amount", fieldType: "number" },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const updated = fake.objects[0]!;
    expect(updated.width).toBe(420);
    expect(updated.height).toBeGreaterThan(80);
  });

  it("update_objects keeps a width the user resized", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "note-lock",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 300,
      height: 140,
      widthLocked: true,
      text: "Note",
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "update_objects",
        arguments: JSON.stringify({
          updates: [
            { id: "note-lock", patch: { width: 100, text: "Updated" } },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const updated = fake.objects[0]!;
    expect(updated.width).toBe(300);
    expect(updated.text).toBe("Updated");
  });

  it("update_objects still applies width when the card is not locked", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "note-free",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 300,
      height: 140,
      text: "Note",
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "update_objects",
        arguments: JSON.stringify({
          updates: [{ id: "note-free", patch: { width: 100 } }],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(fake.objects[0]!.width).toBe(100);
  });

  it("canonicalizes primitive field types when writing cards", async () => {
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
              fields: [
                { name: "Order ID", fieldType: "uuid", tag: "order" },
                { name: "Amount", fieldType: "number" },
                { name: "Placed At", fieldType: "date-time" },
              ],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const event = fake.objects.find(
      (o) => o.stormData?.name === "Order Placed",
    )!;
    expect(event.stormData?.fields.map((f) => f.fieldType)).toEqual([
      "UUID",
      "Number",
      "DateTime",
    ]);
  });

  it("rejects a field type that is neither a primitive nor a Model", async () => {
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
              name: "Bad Event",
              fields: [{ name: "Total", fieldType: "money" }],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content);
    expect(parsed.error).toContain("invalid field types");
    expect(parsed.error).toContain('"money"');
    expect(fake.objects).toHaveLength(0);
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

  it("resolves model references within the same batch and canonicalizes primitives", async () => {
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
              name: "Order Line",
              fields: [{ name: "SKU", fieldType: "string" }],
            },
            {
              kind: "object",
              name: "Cart",
              fields: [{ name: "Lines", fieldType: "order line[]" }],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const cart = fake.objects.find((o) => o.modelData?.name === "Cart")!;
    expect(cart.modelData?.fields?.[0].fieldType).toBe("Order Line[]");
    const line = fake.objects.find((o) => o.modelData?.name === "Order Line")!;
    expect(line.modelData?.fields?.[0].fieldType).toBe("String");
  });

  it("rejects an invalid model node field/item type", async () => {
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
              name: "Broken",
              fields: [{ name: "Total", fieldType: "money" }],
            },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content).error).toContain('"money"');
    expect(fake.objects).toHaveLength(0);
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

  it("highlight_objects rings objects without changing the selection", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      {
        id: "e1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: { kind: "event", name: "Order Placed", fields: [] },
      },
      {
        id: "e2",
        type: "storm",
        x: 300,
        y: 0,
        width: 200,
        height: 100,
        stormData: { kind: "event", name: "Order Shipped", fields: [] },
      },
    );
    fake.store.setSelectedIds(["e2"]);
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "highlight_objects",
        arguments: JSON.stringify({ ids: ["e1", "missing"] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.highlighted).toEqual(["e1"]);
    expect(data.count).toBe(1);
    expect(fake.store.aiHighlightIds).toEqual(["e1"]);
    // Pointing at objects must never touch the live selection.
    expect(fake.store.selectedIds).toEqual(["e2"]);
  });

  it("resize_objects snaps, clamps and pins the width, and reflows a storm card height", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "e1",
      type: "storm",
      x: 0,
      y: 0,
      width: 220,
      height: 120,
      stormData: { kind: "event", name: "Order Placed", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "resize_objects",
        arguments: JSON.stringify({ resizes: [{ id: "e1", width: 306 }] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content).resizedCount).toBe(1);
    const card = fake.objects[0]!;
    // 306 snaps to the 10px grid; the new width is pinned so later content
    // refits keep it.
    expect(card.width).toBe(310);
    expect(card.widthLocked).toBe(true);
    expect(card.height).toBe(
      computeStormCardHeight(card.stormData!, card.width),
    );
  });

  it("resize_objects clamps to the card minimum", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "e1",
      type: "storm",
      x: 0,
      y: 0,
      width: 220,
      height: 120,
      stormData: { kind: "event", name: "Order Placed", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "resize_objects",
        arguments: JSON.stringify({ resizes: [{ id: "e1", width: 100 }] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(fake.objects[0]!.width).toBe(180);
  });

  it("resize_objects overrides a width the user resized by hand", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "e1",
      type: "storm",
      x: 0,
      y: 0,
      width: 500,
      height: 80,
      widthLocked: true,
      stormData: { kind: "event", name: "Order Placed", fields: [] },
    });
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "resize_objects",
        arguments: JSON.stringify({ resizes: [{ id: "e1", width: 300 }] }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    expect(fake.objects[0]!.width).toBe(300);
    expect(fake.objects[0]!.widthLocked).toBe(true);
  });

  it("resize_objects skips connectors/lines and reports unknown ids", async () => {
    const fake = createFakeStore();
    fake.objects.push(
      { id: "c1", type: "connector", x: 0, y: 0, width: 0, height: 0 },
      { id: "l1", type: "line", x: 0, y: 0, width: 10, height: 0 },
    );
    const { ctx } = createContext(fake);

    const res = await executeToolCall(
      {
        id: "1",
        name: "resize_objects",
        arguments: JSON.stringify({
          resizes: [
            { id: "c1", width: 100 },
            { id: "l1", height: 50 },
            { id: "nope", width: 100 },
          ],
        }),
      },
      ctx,
    );

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content);
    expect(data.resizedCount).toBe(0);
    expect(data.notFound).toEqual(["nope"]);
    expect(data.skipped).toHaveLength(2);
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

  it("group_objects creates a section from a single object", async () => {
    const fake = createFakeStore();
    fake.objects.push({
      id: "o1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    const { ctx } = createContext(fake);

    const groupRes = await executeToolCall(
      {
        id: "1",
        name: "group_objects",
        arguments: JSON.stringify({ ids: ["o1"], name: "Solo Section" }),
      },
      ctx,
    );
    expect(groupRes.isError).toBeFalsy();
    const groupData = JSON.parse(groupRes.content);
    expect(groupData.grouped).toBe(true);
    expect(fake.groups).toHaveLength(1);
    expect(fake.groups[0]!.name).toBe("Solo Section");
    expect(fake.objects[0]!.groupId).toBe(fake.groups[0]!.id);
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

  it("create_storm_cards and update_storm_card support structured codegen constraint rules", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    // 1. Create constraint card with structured rules
    const createRes = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "constraint",
              name: "User Must Exist",
              inputFields: [{ name: "User ID", fieldType: "UUID" }],
              outputFields: [{ name: "Is Deleted", fieldType: "Boolean" }],
              constraints: [
                // Plain string rule
                "Legacy string rule",
                // Structured codegen rule
                {
                  code: "USER_NOT_FOUND",
                  description: "User account must exist in the event stream",
                  assert: '"Fields"."Is Deleted" == false',
                  message: "User account not found.",
                  status: 404,
                  severity: "error",
                },
              ],
            },
          ],
        }),
      },
      ctx,
    );

    expect(createRes.isError).toBeFalsy();
    const createdCard = fake.objects.find(
      (o) => o.stormData?.name === "User Must Exist",
    );
    expect(createdCard).toBeDefined();
    expect(createdCard?.stormData?.constraints).toHaveLength(2);
    expect(createdCard?.stormData?.constraints?.[0]?.text).toBe("Legacy string rule");
    expect(createdCard?.stormData?.constraints?.[1]?.code).toBe("USER_NOT_FOUND");
    expect(createdCard?.stormData?.constraints?.[1]?.assert).toBe('"Fields"."Is Deleted" == false');
    expect(createdCard?.stormData?.constraints?.[1]?.status).toBe(404);

    // 2. Update card with additional structured rule
    const updateRes = await executeToolCall(
      {
        id: "2",
        name: "update_storm_card",
        arguments: JSON.stringify({
          id: createdCard!.id,
          constraints: [
            {
              code: "USER_DELETED",
              assert: '!"Fields"."Is Deleted"',
              message: "Account is deleted.",
              status: 410,
            },
          ],
        }),
      },
      ctx,
    );

    expect(updateRes.isError).toBeFalsy();
    const updatedCard = fake.objects.find((o) => o.id === createdCard!.id);
    const updatedConstraints = updatedCard?.stormData?.constraints;
    expect(updatedConstraints).toHaveLength(1);
    expect(updatedConstraints?.[0]?.code).toBe("USER_DELETED");
    expect(updatedConstraints?.[0]?.assert).toBe('!"Fields"."Is Deleted"');
    expect(updatedConstraints?.[0]?.status).toBe(410);
  });

  it("supports explicit field mapping and projection set dictionaries in create_storm_cards and update_storm_card", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    // 1. Create Event with explicit mapping and State with queryItem set using Title Case
    const createRes = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "event",
              name: "Item Added To Cart",
              fields: [
                {
                  name: "Cart ID",
                  fieldType: "UUID",
                  tag: "Cart",
                  mapping: '"Command"."Cart ID"',
                },
                {
                  name: "Item ID",
                  fieldType: "UUID",
                  mapping: '"Command"."Item ID"',
                },
                {
                  name: "Added At",
                  fieldType: "DateTime",
                  mapping: "now()",
                },
              ],
            },
            {
              kind: "state",
              name: "Cart Summary",
              inputFields: [
                { name: "Cart ID", fieldType: "UUID", tag: "Cart" },
              ],
              outputFields: [
                { name: "Total Items", fieldType: "Number" },
              ],
              queryItems: [
                {
                  types: ["Item Added To Cart"],
                  tagFields: ["Cart ID"],
                  set: {
                    "Total Items": "count + 1",
                  },
                },
              ],
            },
          ],
        }),
      },
      ctx,
    );

    expect(createRes.isError).toBeFalsy();
    const eventCard = fake.objects.find(
      (o) => o.stormData?.name === "Item Added To Cart",
    );
    expect(eventCard).toBeDefined();
    expect(eventCard?.stormData?.fields[0].mapping).toBe('"Command"."Cart ID"');
    expect(eventCard?.stormData?.fields[1].mapping).toBe('"Command"."Item ID"');
    expect(eventCard?.stormData?.fields[2].mapping).toBe("now()");

    const stateCard = fake.objects.find(
      (o) => o.stormData?.name === "Cart Summary",
    );
    expect(stateCard).toBeDefined();
    expect(stateCard?.stormData?.queryItems?.[0].set).toEqual({
      "Total Items": "count + 1",
    });

    // 2. Update Event card to change mapping
    const updateRes = await executeToolCall(
      {
        id: "2",
        name: "update_storm_card",
        arguments: JSON.stringify({
          id: eventCard!.id,
          fields: [
            {
              name: "Cart ID",
              fieldType: "UUID",
              tag: "Cart",
              mapping: "uuid()",
            },
          ],
        }),
      },
      ctx,
    );

    expect(updateRes.isError).toBeFalsy();
    const updatedEvent = fake.objects.find((o) => o.id === eventCard!.id);
    expect(updatedEvent?.stormData?.fields[0].mapping).toBe("uuid()");
  });

  it("strictly rejects camelCase card names, field names, mappings, and queryItems set keys with immediate error feedback", async () => {
    const fake = createFakeStore();
    const { ctx } = createContext(fake);

    // 1. Reject camelCase card name
    const resBadCardName = await executeToolCall(
      {
        id: "1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "command",
              name: "registerUser",
              fields: [{ name: "Email", fieldType: "Email" }],
              action: "user:create:*",
            },
          ],
        }),
      },
      ctx,
    );
    expect(resBadCardName.isError).toBe(true);
    expect(resBadCardName.content).toContain('registerUser');
    expect(resBadCardName.content).toContain('is in camelCase');

    // 2. Reject camelCase field name
    const resBadField = await executeToolCall(
      {
        id: "2",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "command",
              name: "Register User",
              fields: [{ name: "userEmail", fieldType: "Email" }],
              action: "user:create:*",
            },
          ],
        }),
      },
      ctx,
    );
    expect(resBadField.isError).toBe(true);
    expect(resBadField.content).toContain('userEmail');
    expect(resBadField.content).toContain('is in camelCase');

    // 3. Reject lowercase/camelCase mapping (e.g. command.email)
    const resBadMapping = await executeToolCall(
      {
        id: "3",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "command",
              name: "Register User",
              fields: [{ name: "Email", fieldType: "Email" }],
              action: "user:create:*",
            },
            {
              kind: "event",
              name: "User Registered",
              fields: [
                {
                  name: "Email",
                  fieldType: "Email",
                  tag: "User",
                  mapping: "command.email",
                },
              ],
            },
          ],
        }),
      },
      ctx,
    );
    expect(resBadMapping.isError).toBe(true);
    expect(resBadMapping.content).toContain('command.email');
    expect(resBadMapping.content).toContain('uses lowercase/camelCase prefix');

    // 4. Reject camelCase set key and expression
    const resBadSet = await executeToolCall(
      {
        id: "4",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            {
              kind: "event",
              name: "User Registered",
              fields: [
                {
                  name: "Email",
                  fieldType: "Email",
                  tag: "User",
                  mapping: "uuid()",
                },
              ],
            },
            {
              kind: "state",
              name: "User Directory",
              inputFields: [
                { name: "Email", fieldType: "Email", tag: "User" },
              ],
              outputFields: [
                { name: "Registered Email", fieldType: "Email" },
              ],
              queryItems: [
                {
                  types: ["User Registered"],
                  tagFields: ["Email"],
                  set: {
                    registeredEmail: "userRegistered.email",
                  },
                },
              ],
            },
          ],
        }),
      },
      ctx,
    );
    expect(resBadSet.isError).toBe(true);
    expect(resBadSet.content).toContain('registeredEmail');
    expect(resBadSet.content).toContain('is in camelCase');
    expect(resBadSet.content).toContain('userRegistered.email');
    expect(resBadSet.content).toContain('uses camelCase prefix');
  });
});
