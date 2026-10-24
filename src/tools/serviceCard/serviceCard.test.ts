import { describe, it, expect, beforeEach } from "vitest";
import "@/tools";
import { serviceCardTool, type ServiceCardData } from "./index";
import { computeServiceCardSize } from "./layout";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { navigateSubSelect } from "@/utils/subSelection";

describe("serviceCardTool (one method with params & returns)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  // Layout for one method:
  //  32 header
  //  16 PARAMS label
  //  2 * 26 params rows  -> ends 100
  //  16 RETURNS label    -> ends 116
  //  1 * 26 return row   -> ends 142
  const card: CanvasElement<ServiceCardData> = {
    id: "svc-1",
    type: "serviceCard",
    x: 100,
    y: 100,
    width: 240,
    height: 142,
    data: {
      name: "placeOrder",
      params: [
        { name: "orderId", type: "string" },
        { name: "total", type: "float" },
      ],
      returns: [{ name: "trackingCode", type: "string" }],
    },
  };

  it("has correct metadata and default styling", () => {
    expect(serviceCardTool.type).toBe("serviceCard");
    expect(serviceCardTool.name).toBe("Service");
    expect(serviceCardTool.color).toBe("#0ea5e9");
    expect(serviceCardTool.category).toBe("modeling");
  });

  it("computes height from the method's params and returns", () => {
    const size = serviceCardTool.computeSize!(card.data);
    expect(size.width).toBe(240);
    expect(size.height).toBe(142);
  });

  it("sub-selects param and return rows, not the header or group labels", () => {
    // Header (0..32) is the card title, not a row.
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Params group label (32..48) -> no row
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 40 })).toBeNull();

    // Param rows (48..100)
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 50 })).toEqual({
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 0,
    });
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 80 })).toEqual({
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 1,
    });

    // Returns label (100..116) -> no row
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 105 })).toBeNull();

    // Return row (116..142)
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 120 })).toEqual({
      elementId: "svc-1",
      sectionId: "returns",
      sectionIndex: 1,
      fieldIndex: 0,
    });
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 150 })).toBeNull();
  });

  it("exposes one params and one returns section", () => {
    const sections = serviceCardTool.getSubSelectSections!(card);
    expect(sections).toEqual([
      { id: "params", name: "params", count: 2 },
      { id: "returns", name: "returns", count: 1 },
    ]);
  });

  it("navigates through params and returns with arrows", () => {
    // First param -> second param
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 0 },
        "down",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 1 });

    // Last param -> first return
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 1 },
        "down",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 });

    // Last return -> stays on last return
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 },
        "down",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 });

    // First return up -> last param
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 },
        "up",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 1 });
  });

  it("renames the method and a row via inline edit", () => {
    useCanvasStore.getState().addElement(card);

    // Card header → method name
    const serviceTarget = serviceCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(serviceTarget?.initialValue).toBe("Place Order");
    serviceTarget?.onCommit("submitOrder");
    expect(useCanvasStore.getState().elements[0].data.name).toBe("submitOrder");

    // Param row
    const rowTarget = serviceCardTool.getInlineEditTarget!(card, { x: 30, y: 50 });
    expect(rowTarget?.initialValue).toBe("Order ID");
    rowTarget?.onCommit("cartId");
    expect(useCanvasStore.getState().elements[0].data.params[0].name).toBe("cartId");
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 0,
    });
  });

  it("deletes param/return rows", () => {
    // Delete first param (sectionIndex 0)
    const paramPatch = serviceCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(paramPatch?.data?.params).toHaveLength(1);
    expect(paramPatch?.data?.params[0].name).toBe("total");
    // 32 + 16 + 1*26 + 16 + 26 = 116
    expect(paramPatch?.height).toBe(116);

    // Delete the return (sectionIndex 1)
    const returnPatch = serviceCardTool.onDeleteSubSelect!(card, 0, 1);
    expect(returnPatch?.data?.returns).toHaveLength(0);

    // A non-row selection cannot be deleted.
    expect(serviceCardTool.onDeleteSubSelect!(card, -1, 0)).toBeNull();
  });

  it("updates field type / array / required on rows", () => {
    const typePatch = serviceCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 0 },
      "boolean",
    );
    expect(typePatch?.data?.params[0].type).toBe("boolean");

    const arrayPatch = serviceCardTool.onToggleSubSelectArray!(card, {
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 0,
    });
    expect(arrayPatch?.data?.params[0].isArray).toBe(true);

    const requiredPatch = serviceCardTool.onToggleSubSelectRequired!(card, {
      elementId: "svc-1",
      sectionId: "returns",
      sectionIndex: 1,
      fieldIndex: 0,
    });
    expect(requiredPatch?.data?.returns[0].isRequired).toBe(true);
  });

  it("resolves selected item for the options bar", () => {
    expect(
      serviceCardTool.getSelectedFieldItem!(card, {
        elementId: "svc-1",
        sectionId: "params",
        sectionIndex: 0,
        fieldIndex: 0,
      }),
    ).toEqual({ name: "orderId", type: "string" });
  });

  it("collapses the legacy multi-method shape to its first method", () => {
    const normalized = serviceCardTool.normalizeData!(
      {
        name: "OrderService",
        methods: [
          { id: "m1", name: "placeOrder", params: [{ name: "id", type: "string" }], returns: [] },
          { id: "m2", name: "cancelOrder", params: [], returns: [] },
        ],
      } as unknown as ServiceCardData,
      { elements: [] },
    );

    expect(normalized.name).toBe("placeOrder");
    expect(normalized.params).toEqual([{ name: "id", type: "string" }]);
    expect("methods" in normalized).toBe(false);
  });

  it("creates a Service card through the AI operation", () => {
    const element = serviceCardTool.ai!.onCreate(
      {
        name: "chargeCard",
        params: [{ name: "amount", type: "float" }],
        returns: [{ name: "receiptId", type: "string" }],
      },
      { x: 500, y: 500 },
    );

    expect(element.type).toBe("serviceCard");
    expect(element.data.name).toBe("chargeCard");
    expect(element.data.params).toHaveLength(1);
    expect(element.data.returns).toHaveLength(1);
    expect(element.width).toBe(240);
  });

  it("carries an interface name through the AI operation", () => {
    const element = serviceCardTool.ai!.onCreate(
      {
        name: "chargeCard",
        serviceName: "paymentService",
        params: [],
        returns: [],
      },
      { x: 500, y: 500 },
    );

    expect(element.data.serviceName).toBe("paymentService");
  });
});

describe("serviceCardTool content width auto-grow", () => {
  it("keeps the default width for short content", () => {
    expect(
      computeServiceCardSize({
        name: "placeOrder",
        params: [{ name: "id", type: "string" }],
        returns: [],
      }).width,
    ).toBe(240);
  });

  it("widens the header so the interface name never clips", () => {
    const unnamed = computeServiceCardSize({
      name: "placeOrder",
      params: [],
      returns: [],
    });
    const named = computeServiceCardSize({
      name: "placeOrder",
      serviceName: "orderService",
      params: [],
      returns: [],
    });
    expect(named.width).toBeGreaterThan(unnamed.width);
  });

  it("widens to fit a long param field type", () => {
    const data: ServiceCardData = {
      name: "placeOrder",
      params: [{ name: "p", type: "a".repeat(40) }],
      returns: [],
    };
    // 12 + "P"(7.2) + 30 gap + type(40 chars * 11 * 0.6 = 264) + 12 -> 326
    expect(computeServiceCardSize(data).width).toBe(326);
  });

  it("widens to fit a long method name", () => {
    const data: ServiceCardData = {
      name: "placeOrderEverySingleTime",
      params: [],
      returns: [],
    };
    expect(computeServiceCardSize(data).width).toBeGreaterThan(240);
  });

  it("never shrinks below a requested width", () => {
    const data: ServiceCardData = {
      name: "placeOrder",
      params: [{ name: "p", type: "a".repeat(40) }],
      returns: [],
    };
    expect(computeServiceCardSize(data, 900).width).toBe(900);
  });
});

describe("serviceCardTool store auto-fit", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("widens the card when a param type grows", () => {
    useCanvasStore.getState().addElement({
      id: "svc-1",
      type: "serviceCard",
      x: 0,
      y: 0,
      width: 240,
      height: 116,
      data: {
        name: "placeOrder",
        params: [{ name: "p", type: "string" }],
        returns: [],
      },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(240);

    useCanvasStore.getState().updateElement("svc-1", {
      data: {
        name: "placeOrder",
        params: [{ name: "p", type: "a".repeat(40) }],
        returns: [],
      },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(326);
  });

  it("allows two Service cards to share a name", () => {
    const make = (id: string) => ({
      id,
      type: "serviceCard" as const,
      x: 0,
      y: 0,
      width: 240,
      height: 116,
      data: { name: "charge", params: [], returns: [] },
    });

    useCanvasStore.getState().addElement(make("svc-1"));
    useCanvasStore.getState().addElement(make("svc-2"));

    const names = useCanvasStore.getState().elements.map((el) => el.data.name);
    expect(names).toEqual(["charge", "charge"]);
  });
});
