import { describe, it, expect } from "vitest";
import {
  computeStormCardHeight,
  computeStormConstraintItemLines,
  computeStormConstraintItemHeight,
  computeModelNodeHeight,
  calculateResizedBounds,
  getCardMinDimensions,
  computeOptimalStormCardWidth,
  computeOptimalModelNodeWidth,
  computeOptimalCardWidth,
} from "./cardDimensions";
import type { CanvasObject, StormData, ModelData } from "@/types";

describe("cardDimensions", () => {
  it("expands storm card height as fields are added", () => {
    const data: StormData = {
      kind: "command",
      name: "CreateUser",
      action: "user:create:own",
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "email", fieldType: "string" },
      ],
    };

    // The authorization action is a header badge and adds no height, so the
    // base is measured from the header plus the two field rows plus the
    // always-present Command RESPONSE band (one section label).
    const h1 = computeStormCardHeight(data);
    expect(h1).toBe(36 + 6 + 2 * 26 + 22 + 10);

    const withMoreFields: StormData = {
      ...data,
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "email", fieldType: "string" },
        { id: "f3", name: "role", fieldType: "string" },
        { id: "f4", name: "phone", fieldType: "string" },
        { id: "f5", name: "status", fieldType: "string" },
      ],
    };

    const h4 = computeStormCardHeight(withMoreFields);
    expect(h4).toBe(h1 + 3 * 26);
  });

  it("calculates query card height with params and response sections", () => {
    const queryData: StormData = {
      kind: "query",
      name: "GetUser",
      action: "user:read:own",
      fields: [{ id: "p1", name: "id", fieldType: "uuid" }],
      responseFields: [{ id: "r1", name: "user", fieldType: "User" }],
    };

    const h = computeStormCardHeight(queryData);
    expect(h).toBeGreaterThan(120);
  });

  it("keeps the Query Response section even when it has no fields", () => {
    const paramsOnly: StormData = {
      kind: "query",
      name: "GetOrder",
      fields: [{ id: "p1", name: "id", fieldType: "uuid" }],
      responseFields: [],
    };
    const withResponse: StormData = {
      ...paramsOnly,
      responseFields: [{ id: "r1", name: "order", fieldType: "Order" }],
    };
    // The Response band is always present (section label); each response field
    // adds exactly one row.
    expect(computeStormCardHeight(withResponse)).toBe(
      computeStormCardHeight(paramsOnly) + 26,
    );
  });

  it("gives a Command a RESPONSE band without a PARAMS label", () => {
    const command: StormData = {
      kind: "command",
      name: "PlaceOrder",
      fields: [{ id: "p1", name: "orderId", fieldType: "uuid" }],
      responseFields: [],
    };
    // Command payload is unlabeled: no PARAMS section label is added, but the
    // RESPONSE band (one section label) is always present.
    expect(computeStormCardHeight(command)).toBe(36 + 6 + 26 + 22 + 10);

    const withResponse: StormData = {
      ...command,
      responseFields: [{ id: "r1", name: "orderId", fieldType: "uuid" }],
    };
    expect(computeStormCardHeight(withResponse)).toBe(
      computeStormCardHeight(command) + 26,
    );
  });

  it("grows a constraint card for fields, query items and constraint lines", () => {
    const base: StormData = {
      kind: "constraint",
      name: "OrderConstraints",
      // Two input params keep the base above the 80px minimum so each delta is exact.
      fields: [],
      inputFields: [
        { id: "cf1", name: "total", fieldType: "number" },
        { id: "cf2", name: "status", fieldType: "string" },
      ],
    };

    const hBase = computeStormCardHeight(base);

    // +1 input param row
    const withField: StormData = {
      ...base,
      inputFields: [
        ...(base.inputFields ?? []),
        { id: "cf3", name: "currency", fieldType: "string" },
      ],
    };
    expect(computeStormCardHeight(withField)).toBe(hBase + 26);

    // +1 Related Events (Query Items) row (section label + row)
    const withQuery: StormData = {
      ...base,
      queryItems: [{ id: "qi1", types: [], tagFieldIds: [] }],
    };
    expect(computeStormCardHeight(withQuery)).toBe(hBase + 22 + 26);

    // +1 free-text constraint row (section label + row)
    const withConstraint: StormData = {
      ...base,
      constraints: [{ id: "c1", text: "total > 0" }],
    };
    expect(computeStormCardHeight(withConstraint)).toBe(hBase + 22 + 26);
  });

  it("expands query item height vertically when multiple events are present", () => {
    const base: StormData = {
      kind: "state",
      name: "OrderState",
      fields: [],
      inputFields: [
        { id: "f1", name: "orderId", fieldType: "string", tag: "order" },
      ],
      queryItems: [
        {
          id: "qi1",
          types: ["OrderPlaced", "OrderCancelled", "OrderShipped"],
          tagFieldIds: ["f1"],
        },
      ],
    };

    // 3 events, 1 tag -> 3 lines -> 4 + 3 * 22 = 70px (instead of single row 26px)
    const expectedQueryHeight = 70;
    const h = computeStormCardHeight(base);
    // header (36+6) + params label (22) + 1 input param (26)
    // + query label (22) + query item (70) + bottom padding (10)
    expect(h).toBe(42 + 22 + 26 + 22 + expectedQueryHeight + 10);
  });

  it("calculates constraint lines and height based on text and card width", () => {
    const shortText = "total > 0";
    expect(computeStormConstraintItemLines(shortText, 200)).toBe(1);
    expect(computeStormConstraintItemHeight(shortText, 200)).toBe(26);

    const longText =
      "Total amount must be greater than zero and customer account must be in verified status before placing order";
    // At width 200, available wrapWidth is 180 (30 chars/line) -> ~106 chars takes 4 lines
    const linesNarrow = computeStormConstraintItemLines(longText, 200);
    expect(linesNarrow).toBeGreaterThan(1);
    const heightNarrow = computeStormConstraintItemHeight(longText, 200);
    expect(heightNarrow).toBe(linesNarrow * 14 + 12);

    // At wider card width (e.g. 800), lines count decreases
    const linesWide = computeStormConstraintItemLines(longText, 800);
    expect(linesWide).toBeLessThan(linesNarrow);
    expect(computeStormConstraintItemHeight(longText, 800)).toBeLessThan(heightNarrow);
  });

  it("expands constraint card height vertically when free text wraps based on card width", () => {
    const base: StormData = {
      kind: "constraint",
      name: "OrderConstraints",
      fields: [],
      constraints: [
        {
          id: "c1",
          text: "Total amount must be greater than zero and customer account must be in verified status before placing order",
        },
      ],
    };
    const hNarrow = computeStormCardHeight(base, 200);
    const hWide = computeStormCardHeight(base, 800);
    expect(hNarrow).toBeGreaterThan(hWide);
  });

  it("computes actor card height strictly from its permissions", () => {
    const emptyActor: StormData = {
      kind: "actor",
      name: "Guest",
      fields: [],
      permissions: [],
    };
    expect(computeStormCardHeight(emptyActor)).toBe(80);

    const withPerms: StormData = {
      kind: "actor",
      name: "Guest",
      fields: [],
      permissions: ["*:register:public", "profile:read:public"],
    };
    // header (36 + 6) + 2 * 26 = 94
    expect(computeStormCardHeight(withPerms)).toBe(94);
  });

  it("expands model node height as fields are added", () => {
    const model: ModelData = {
      kind: "object",
      name: "User",
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "name", fieldType: "string" },
      ],
    };

    const h2 = computeModelNodeHeight(model);
    const with4Fields: ModelData = {
      ...model,
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "name", fieldType: "string" },
        { id: "f3", name: "email", fieldType: "string" },
        { id: "f4", name: "role", fieldType: "string" },
      ],
    };

    const h4 = computeModelNodeHeight(with4Fields);
    expect(h4).toBe(h2 + 2 * 26);
  });

  describe("getCardMinDimensions", () => {
    it("returns computed min dimensions for storm card", () => {
      const obj: CanvasObject = {
        id: "s1",
        type: "storm",
        x: 0,
        y: 0,
        width: 260,
        height: 100,
        stormData: { kind: "command", name: "Cmd", fields: [] },
      };
      const min = getCardMinDimensions(obj);
      expect(min.minWidth).toBe(180);
      expect(min.minHeight).toBe(computeStormCardHeight(obj.stormData!));
    });

    it("returns default min dimensions for sticky notes and text boxes", () => {
      const sticky: CanvasObject = {
        id: "st1",
        type: "stickyNote",
        x: 0,
        y: 0,
        width: 180,
        height: 140,
      };
      expect(getCardMinDimensions(sticky)).toEqual({
        minWidth: 100,
        minHeight: 80,
      });

      const text: CanvasObject = {
        id: "tb1",
        type: "textBox",
        x: 0,
        y: 0,
        width: 200,
        height: 40,
      };
      expect(getCardMinDimensions(text)).toEqual({
        minWidth: 60,
        minHeight: 30,
      });
    });
  });

  describe("calculateResizedBounds", () => {
    const initialBounds = { x: 100, y: 100, width: 200, height: 100 };

    it("resizes east handle: increases width and snaps to grid", () => {
      const res = calculateResizedBounds({
        handle: "e",
        initialBounds,
        deltaX: 43,
        deltaY: 0,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      expect(res.x).toBe(100);
      expect(res.y).toBe(100);
      expect(res.width).toBe(240); // 200 + 43 = 243 -> snaps to 240
      expect(res.height).toBe(100);
    });

    it("resizes west handle: changes x and width while keeping right edge fixed", () => {
      const res = calculateResizedBounds({
        handle: "w",
        initialBounds,
        deltaX: -50,
        deltaY: 0,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      // Dragging left by 50px expands width by 50px and moves x by -50px
      expect(res.width).toBe(250);
      expect(res.x).toBe(50);
      expect(res.x + res.width).toBe(initialBounds.x + initialBounds.width);
    });

    it("clamps west handle at minWidth", () => {
      const res = calculateResizedBounds({
        handle: "w",
        initialBounds,
        deltaX: 100, // shrinks by 100 -> raw width 100, but min is 180
        deltaY: 0,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      expect(res.width).toBe(180);
      expect(res.x).toBe(120); // 100 + (200 - 180) = 120
      expect(res.x + res.width).toBe(initialBounds.x + initialBounds.width);
    });

    it("resizes south handle: expands height downward", () => {
      const res = calculateResizedBounds({
        handle: "s",
        initialBounds,
        deltaX: 0,
        deltaY: 60,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      expect(res.height).toBe(160);
      expect(res.y).toBe(100);
    });

    it("resizes north handle: expands height upward while keeping bottom edge fixed", () => {
      const res = calculateResizedBounds({
        handle: "n",
        initialBounds,
        deltaX: 0,
        deltaY: -40,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      expect(res.height).toBe(140);
      expect(res.y).toBe(60);
      expect(res.y + res.height).toBe(initialBounds.y + initialBounds.height);
    });

    it("resizes southeast corner: changes both width and height", () => {
      const res = calculateResizedBounds({
        handle: "se",
        initialBounds,
        deltaX: 30,
        deltaY: 50,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      expect(res.x).toBe(100);
      expect(res.y).toBe(100);
      expect(res.width).toBe(230);
      expect(res.height).toBe(150);
    });

    it("resizes northwest corner: changes both x, y, width and height", () => {
      const res = calculateResizedBounds({
        handle: "nw",
        initialBounds,
        deltaX: -30,
        deltaY: -20,
        minWidth: 180,
        minHeight: 80,
        gridSize: 10,
      });

      expect(res.width).toBe(230);
      expect(res.height).toBe(120);
      expect(res.x).toBe(70);
      expect(res.y).toBe(80);
      expect(res.x + res.width).toBe(initialBounds.x + initialBounds.width);
      expect(res.y + res.height).toBe(initialBounds.y + initialBounds.height);
    });
  });

  describe("computeOptimalCardWidth", () => {
    it("returns default minWidth for short titles and fields", () => {
      const data: StormData = {
        kind: "command",
        name: "CreateUser",
        fields: [{ id: "f1", name: "id", fieldType: "uuid" }],
      };
      const width = computeOptimalStormCardWidth(data, 220);
      expect(width).toBe(220);
    });

    it("expands width for long card title", () => {
      const data: StormData = {
        kind: "command",
        name: "ProcessCustomerMonthlyInvoicePaymentCommand",
        fields: [],
      };
      const width = computeOptimalStormCardWidth(data, 220);
      // 44 chars title needs ~380px+
      expect(width).toBeGreaterThanOrEqual(380);
      // Snapped to 10px
      expect(width % 10).toBe(0);
    });

    it("expands width for long field name and types", () => {
      const data: StormData = {
        kind: "event",
        name: "OrderPlaced",
        fields: [
          {
            id: "f1",
            name: "veryLongBillingAccountIdentificationNumber",
            fieldType: "CustomerBillingAccountReference",
            tag: "billing",
          },
        ],
      };
      const width = computeOptimalStormCardWidth(data, 220);
      expect(width).toBeGreaterThanOrEqual(450);
      expect(width % 10).toBe(0);
    });

    it("expands width for a long field tag so it is never truncated", () => {
      const data: StormData = {
        kind: "event",
        name: "OrderPlaced",
        fields: [
          {
            id: "f1",
            name: "orderId",
            fieldType: "uuid",
            tag: "customerBillingAccountReference",
          },
        ],
      };
      // The 31-char tag needs ~200px on its own, far past the old 70px cap.
      const width = computeOptimalStormCardWidth(data, 220);
      expect(width).toBeGreaterThanOrEqual(380);
      expect(width % 10).toBe(0);
    });

    it("calculates optimal width for data model nodes", () => {
      const model: ModelData = {
        kind: "object",
        name: "ExtremelyLongDetailedOrderAggregateRootEntity",
        fields: [
          {
            id: "f1",
            name: "customerPrimaryPaymentMethodIdentifier",
            fieldType: "PaymentMethod",
          },
        ],
      };
      const width = computeOptimalModelNodeWidth(model, 200);
      expect(width).toBeGreaterThanOrEqual(400);
      expect(width % 10).toBe(0);
    });

    it("expands width for a long model field type so it is never truncated", () => {
      const model: ModelData = {
        kind: "object",
        name: "Order",
        fields: [
          {
            id: "f1",
            name: "billingAccount",
            fieldType: "CustomerBillingAccountReferenceAggregate",
          },
        ],
      };
      // The 41-char type needs ~290px on its own, past the old 108px cap.
      const width = computeOptimalModelNodeWidth(model, 200);
      expect(width).toBeGreaterThanOrEqual(380);
      expect(width % 10).toBe(0);
    });

    it("resolves optimal width for CanvasObject", () => {
      const obj: CanvasObject = {
        id: "s1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "command",
          name: "ProcessCustomerMonthlyInvoicePaymentCommand",
          fields: [],
        },
      };
      expect(computeOptimalCardWidth(obj)).toBeGreaterThanOrEqual(380);
    });
  });

  describe("BDD scenario steps", () => {
    it("measures height from step name rows plus payload rows", () => {
      const empty: StormData = {
        kind: "bdd",
        name: "Given",
        phase: "given",
        fields: [],
      };
      // Header + the empty placeholder + bottom padding.
      expect(computeStormCardHeight(empty)).toBe(80);

      const withSteps: StormData = {
        ...empty,
        steps: [
          {
            id: "s1",
            ref: "event",
            name: "OrderPlaced",
            payload: [
              { id: "p1", key: "orderId", value: "42" },
              { id: "p2", key: "total", value: "100" },
            ],
          },
          { id: "s2", ref: "event", name: "PaymentTaken", payload: [] },
        ],
      };
      // 42 base + step1 (24 + 2*18) + gap 6 + step2 (24) + 10 bottom.
      expect(computeStormCardHeight(withSteps)).toBe(
        36 + 6 + (24 + 36) + 6 + 24 + 10,
      );
    });

    it("sizes width to the longest payload line", () => {
      const data: StormData = {
        kind: "bdd",
        name: "Given",
        phase: "given",
        fields: [],
        steps: [
          {
            id: "s1",
            ref: "event",
            name: "OrderPlaced",
            payload: [{ id: "p1", key: "customerReference", value: "ACME-42" }],
          },
        ],
      };
      const width = computeOptimalStormCardWidth(data, 220);
      expect(width).toBeGreaterThan(220);
      expect(width % 10).toBe(0);
    });
  });
});

