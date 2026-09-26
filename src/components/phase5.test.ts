import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore, clearHistory } from "@/store";
import type { CanvasObject } from "@/types";
import {
  suggestActionForCard,
  getAuthorizedActors,
  getAllDefinedActions,
} from "@/utils/stormAuth";

describe("Phase 5 - Floating Options Bars, Alignment & Domain Utilities", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
    clearHistory();
  });

  describe("Multi-Select Alignment & Distribution Bar Actions", () => {
    it("aligns selected objects left, center, right, top, middle, bottom", () => {
      const c1: CanvasObject = {
        id: "c1",
        type: "storm",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        stormData: { kind: "command", name: "C1", fields: [] },
      };
      const c2: CanvasObject = {
        id: "c2",
        type: "storm",
        x: 400,
        y: 200,
        width: 200,
        height: 100,
        stormData: { kind: "event", name: "C2", fields: [] },
      };

      useCanvasStore.getState().addObjects([c1, c2]);
      useCanvasStore.getState().setSelectedIds(["c1", "c2"]);

      // Align Left: minX is 100 -> both at x=100
      useCanvasStore.getState().alignObjects("left");
      let objs = useCanvasStore.getState().objects;
      expect(objs.find((o) => o.id === "c1")?.x).toBe(100);
      expect(objs.find((o) => o.id === "c2")?.x).toBe(100);

      // Align Bottom: maxY is 300 -> bottom of each at 300 -> y = 200
      useCanvasStore.getState().alignObjects("bottom");
      objs = useCanvasStore.getState().objects;
      expect(objs.find((o) => o.id === "c1")?.y).toBe(200);
      expect(objs.find((o) => o.id === "c2")?.y).toBe(200);
    });

    it("distributes objects horizontally and vertically", () => {
      const c1: CanvasObject = {
        id: "c1",
        type: "storm",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };
      const c2: CanvasObject = {
        id: "c2",
        type: "storm",
        x: 100,
        y: 0,
        width: 100,
        height: 100,
      };
      const c3: CanvasObject = {
        id: "c3",
        type: "storm",
        x: 400,
        y: 0,
        width: 100,
        height: 100,
      };

      useCanvasStore.getState().addObjects([c1, c2, c3]);
      useCanvasStore.getState().setSelectedIds(["c1", "c2", "c3"]);

      useCanvasStore.getState().distributeObjects("horizontal");
      const objs = useCanvasStore.getState().objects;

      // Total span = 500, total card width = 300, remaining space = 200 -> gap = 100
      // c1: 0, c2: 200, c3: 400
      expect(objs.find((o) => o.id === "c1")?.x).toBe(0);
      expect(objs.find((o) => o.id === "c2")?.x).toBe(200);
      expect(objs.find((o) => o.id === "c3")?.x).toBe(400);
    });

    it("arranges storm cards into deterministic lanes", () => {
      const actor: CanvasObject = {
        id: "act",
        type: "storm",
        x: 900,
        y: 500,
        width: 200,
        height: 100,
        stormData: { kind: "actor", name: "User", fields: [] },
      };
      const cmd: CanvasObject = {
        id: "cmd",
        type: "storm",
        x: 50,
        y: 10,
        width: 200,
        height: 100,
        stormData: { kind: "command", name: "PlaceOrder", fields: [] },
      };
      const evt: CanvasObject = {
        id: "evt",
        type: "storm",
        x: 300,
        y: 400,
        width: 200,
        height: 100,
        stormData: { kind: "event", name: "OrderPlaced", fields: [] },
      };
      const stateCard: CanvasObject = {
        id: "st",
        type: "storm",
        x: 10,
        y: 800,
        width: 200,
        height: 100,
        stormData: { kind: "state", name: "OrderState", fields: [] },
      };

      useCanvasStore.getState().addObjects([actor, cmd, evt, stateCard]);
      useCanvasStore.getState().arrangeLanes();

      const objs = useCanvasStore.getState().objects;
      const a = objs.find((o) => o.id === "act")!;
      const c = objs.find((o) => o.id === "cmd")!;
      const e = objs.find((o) => o.id === "evt")!;
      const s = objs.find((o) => o.id === "st")!;

      // Lane ordering: Actor -> Command -> Event -> State
      expect(a.x).toBeLessThan(c.x);
      expect(c.x).toBeLessThan(e.x);
      expect(e.x).toBeLessThan(s.x);
    });
  });

  describe("RBAC Authorization & Hover Inspection", () => {
    it("suggests actions from card name and kind", () => {
      expect(suggestActionForCard("command", "CreatePayment")).toBe(
        "payment:create:own",
      );
      expect(suggestActionForCard("query", "GetOrderDetails")).toBe(
        "order-details:read:own",
      );
    });

    it("matches authorized actors on canvas", () => {
      const admin: CanvasObject = {
        id: "act-admin",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "actor",
          name: "Admin",
          permissions: ["order:*", "user:read:all"],
          fields: [],
        },
      };

      const customer: CanvasObject = {
        id: "act-cust",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "actor",
          name: "Customer",
          permissions: ["order:create:own"],
          fields: [],
        },
      };

      const canvasObjects = [admin, customer];

      // order:create:own matches both Admin (via order:*) and Customer (exact)
      const matchingForCreate = getAuthorizedActors(
        canvasObjects,
        "order:create:own",
      );
      expect(matchingForCreate.map((a) => a.id)).toEqual([
        "act-admin",
        "act-cust",
      ]);

      // order:delete:own matches only Admin
      const matchingForDelete = getAuthorizedActors(
        canvasObjects,
        "order:delete:own",
      );
      expect(matchingForDelete.map((a) => a.id)).toEqual(["act-admin"]);

      // Unrelated action matches nobody
      const matchingForInvoice = getAuthorizedActors(
        canvasObjects,
        "invoice:create:own",
      );
      expect(matchingForInvoice).toHaveLength(0);
    });

    it("collects all defined actions from canvas", () => {
      const cmd: CanvasObject = {
        id: "c1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "command",
          name: "Cmd",
          action: "order:create:own",
          fields: [],
        },
      };
      const query: CanvasObject = {
        id: "q1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "query",
          name: "Query",
          action: "order:read:own",
          fields: [],
        },
      };

      const actions = getAllDefinedActions([cmd, query]);
      expect(actions).toEqual(["order:create:own", "order:read:own"]);
    });

    it("sets stormActionHover in store for visual inspection", () => {
      useCanvasStore.getState().setStormActionHover("order:create:own");
      expect(useCanvasStore.getState().stormActionHover).toBe(
        "order:create:own",
      );

      useCanvasStore.getState().setStormActionHover(null);
      expect(useCanvasStore.getState().stormActionHover).toBeNull();
    });

    it("tracks the action hover tooltip target in store", () => {
      useCanvasStore.getState().setActionHover({
        objectId: "cmd-1",
        action: "order:create:own",
        iconBounds: { x: 10, y: 11, width: 16, height: 16 },
      });
      expect(useCanvasStore.getState().actionHover?.action).toBe(
        "order:create:own",
      );

      useCanvasStore.getState().setActionHover(null);
      expect(useCanvasStore.getState().actionHover).toBeNull();
    });
  });

  describe("Row-Level Manipulations & Field Clipboard", () => {
    it("supports adding and deleting fields on storm cards", () => {
      const card: CanvasObject = {
        id: "s1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "command",
          name: "Test",
          fields: [],
        },
      };
      useCanvasStore.getState().addObject(card);

      const fieldId = useCanvasStore.getState().addStormField("s1");
      expect(fieldId).toBeDefined();
      expect(
        useCanvasStore.getState().objects[0].stormData?.fields,
      ).toHaveLength(1);

      // Delete by row id
      useCanvasStore.getState().deleteSelectedRow("s1", fieldId!);
      expect(
        useCanvasStore.getState().objects[0].stormData?.fields,
      ).toHaveLength(0);
    });

    it("supports adding query items and constraints", () => {
      const stateCard: CanvasObject = {
        id: "state-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "state",
          name: "OrderState",
          fields: [],
        },
      };
      useCanvasStore.getState().addObject(stateCard);

      const qId = useCanvasStore.getState().addStormQueryItem("state-1");
      expect(qId).toBeDefined();
      expect(
        useCanvasStore.getState().objects[0].stormData?.queryItems,
      ).toHaveLength(1);

      const constraintCard: CanvasObject = {
        id: "const-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "constraint",
          name: "OrderRules",
          fields: [],
        },
      };
      useCanvasStore.getState().addObject(constraintCard);

      const cId = useCanvasStore.getState().addStormConstraint("const-1");
      expect(cId).toBeDefined();
      const updated = useCanvasStore
        .getState()
        .objects.find((o) => o.id === "const-1");
      expect(updated?.stormData?.constraints).toHaveLength(1);
    });

    it("adds Query params and response fields into their separate sections", () => {
      const queryCard: CanvasObject = {
        id: "qry-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "query",
          name: "GetOrder",
          action: "order:read:scope",
          fields: [],
          responseFields: [],
        },
      };
      useCanvasStore.getState().addObject(queryCard);

      useCanvasStore.getState().addStormField("qry-1", "params");
      const r1 = useCanvasStore.getState().addStormField("qry-1", "response");
      const r2 = useCanvasStore.getState().addStormField("qry-1", "response");

      const updated = useCanvasStore
        .getState()
        .objects.find((o) => o.id === "qry-1");
      expect(updated?.stormData?.fields).toHaveLength(1);
      expect(updated?.stormData?.responseFields).toHaveLength(2);
      expect(updated?.stormData?.responseFields?.map((f) => f.id)).toEqual([
        r1,
        r2,
      ]);
    });

    it("supports adding model fields and enum values", () => {
      const objModel: CanvasObject = {
        id: "m-obj",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "object",
          name: "User",
          fields: [],
        },
      };
      useCanvasStore.getState().addObject(objModel);
      const fId = useCanvasStore.getState().addModelField("m-obj");
      expect(fId).toBeDefined();
      expect(
        useCanvasStore.getState().objects[0].modelData?.fields,
      ).toHaveLength(1);

      const enumModel: CanvasObject = {
        id: "m-enum",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "enum",
          name: "Role",
          values: [],
        },
      };
      useCanvasStore.getState().addObject(enumModel);
      const vId = useCanvasStore.getState().addModelEnumValue("m-enum");
      expect(vId).toBeDefined();
      const updated = useCanvasStore
        .getState()
        .objects.find((o) => o.id === "m-enum");
      expect(updated?.modelData?.values).toHaveLength(1);
    });
  });

  describe("Canvas Search State", () => {
    it("toggles search modal open/close in store", () => {
      expect(useCanvasStore.getState().isSearchOpen).toBe(false);

      useCanvasStore.getState().setSearchOpen(true);
      expect(useCanvasStore.getState().isSearchOpen).toBe(true);

      useCanvasStore.getState().setSearchOpen(false);
      expect(useCanvasStore.getState().isSearchOpen).toBe(false);
    });
  });
});
