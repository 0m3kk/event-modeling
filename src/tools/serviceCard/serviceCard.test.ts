import { describe, it, expect, beforeEach } from "vitest";
import { serviceCardTool, type ServiceCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { navigateSubSelect } from "@/utils/subSelection";

describe("serviceCardTool (methods with params & returns)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  // Layout with two methods:
  //  32 header
  //  method0: 24 header + 16 label + 2*26 params + 16 label + 1*26 returns = 134 -> ends 166
  //  method1: 24 header + 16 label + 1*26 (empty) + 16 label + 1*26 (empty) = 108 -> ends 274
  const card: CanvasElement<ServiceCardData> = {
    id: "svc-1",
    type: "serviceCard",
    x: 100,
    y: 100,
    width: 240,
    height: 274,
    data: {
      name: "OrderService",
      methods: [
        {
          id: "m1",
          name: "placeOrder",
          params: [
            { name: "orderId", type: "string" },
            { name: "total", type: "number" },
          ],
          returns: [{ name: "trackingCode", type: "string" }],
        },
        {
          id: "m2",
          name: "cancelOrder",
          params: [],
          returns: [],
        },
      ],
    },
  };

  it("has correct metadata and default styling", () => {
    expect(serviceCardTool.type).toBe("serviceCard");
    expect(serviceCardTool.name).toBe("Service");
    expect(serviceCardTool.color).toBe("#0ea5e9");
    expect(serviceCardTool.category).toBe("modeling");
  });

  it("computes height from every method's params and returns", () => {
    const size = serviceCardTool.computeSize!(card.data);
    expect(size.width).toBe(240);
    expect(size.height).toBe(274);
  });

  it("sub-selects method headers and param/return rows", () => {
    // Method 0 header (32..56)
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 40 })).toEqual({
      elementId: "svc-1",
      sectionId: "method",
      sectionIndex: 0,
      fieldIndex: -1,
    });

    // Params group label (56..72) -> no row
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 60 })).toBeNull();

    // Param rows (72..124)
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 80 })).toEqual({
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 0,
    });
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 100 })).toEqual({
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 1,
    });

    // Returns label (124..140) -> no row
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 130 })).toBeNull();

    // Return row (140..166)
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 150 })).toEqual({
      elementId: "svc-1",
      sectionId: "returns",
      sectionIndex: 1,
      fieldIndex: 0,
    });

    // Method 1 header (166..190)
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 180 })).toEqual({
      elementId: "svc-1",
      sectionId: "method",
      sectionIndex: 1,
      fieldIndex: -1,
    });

    // Empty groups render a hint row but are NOT selectable.
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 210 })).toBeNull();
    expect(serviceCardTool.onSubSelect!(card, { x: 50, y: 260 })).toBeNull();
  });

  it("exposes one params/returns section per method", () => {
    const sections = serviceCardTool.getSubSelectSections!(card);
    expect(sections).toEqual([
      { id: "params", name: "params", count: 2 },
      { id: "returns", name: "returns", count: 1 },
      { id: "params", name: "params", count: 0 },
      { id: "returns", name: "returns", count: 0 },
    ]);
  });

  it("navigates through methods, params and returns with arrows", () => {
    // Method header -> first param
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "method", sectionIndex: 0, fieldIndex: -1 },
        "down",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 0 });

    // Last param -> first return
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 1 },
        "down",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 });

    // Last return -> next method header (method 1 has no rows)
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 },
        "down",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "method", sectionIndex: 1, fieldIndex: -1 });

    // Method header up -> previous method's last return
    expect(
      navigateSubSelect(
        card,
        { elementId: "svc-1", sectionId: "method", sectionIndex: 1, fieldIndex: -1 },
        "up",
        serviceCardTool,
      ),
    ).toEqual({ elementId: "svc-1", sectionId: "returns", sectionIndex: 1, fieldIndex: 0 });
  });

  it("renames the service, a method and a row via inline edit", () => {
    useCanvasStore.getState().addElement(card);

    // Card header
    const serviceTarget = serviceCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(serviceTarget?.initialValue).toBe("OrderService");
    serviceTarget?.onCommit("CheckoutService");
    expect(useCanvasStore.getState().elements[0].data.name).toBe("CheckoutService");

    // Method header
    const methodTarget = serviceCardTool.getInlineEditTarget!(card, { x: 40, y: 40 });
    expect(methodTarget?.initialValue).toBe("placeOrder");
    methodTarget?.onCommit("submitOrder");
    expect(useCanvasStore.getState().elements[0].data.methods[0].name).toBe("submitOrder");
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "svc-1",
      sectionId: "method",
      sectionIndex: 0,
      fieldIndex: -1,
    });

    // Param row
    const rowTarget = serviceCardTool.getInlineEditTarget!(card, { x: 30, y: 80 });
    expect(rowTarget?.initialValue).toBe("orderId");
    rowTarget?.onCommit("cartId");
    expect(useCanvasStore.getState().elements[0].data.methods[0].params[0].name).toBe("cartId");
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 0,
    });
  });

  it("deletes param/return rows and whole methods", () => {
    // Delete first param of method 0 (band 0)
    const paramPatch = serviceCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(paramPatch?.data?.methods?.[0].params).toHaveLength(1);
    expect(paramPatch?.data?.methods?.[0].params[0].name).toBe("total");
    // 32 + (24+16+1*26+16+26) + 108 = 248
    expect(paramPatch?.height).toBe(248);

    // Delete the return of method 0 (band 1)
    const returnPatch = serviceCardTool.onDeleteSubSelect!(card, 0, 1);
    expect(returnPatch?.data?.methods?.[0].returns).toHaveLength(0);

    // A method header (fieldIndex < 0) deletes the whole method (sectionIndex = method index).
    const methodPatch = serviceCardTool.onDeleteSubSelect!(card, -1, 1);
    expect(methodPatch?.data?.methods).toHaveLength(1);
    expect(methodPatch?.data?.methods?.[0].id).toBe("m1");
    // 32 + method0 block (134) = 166
    expect(methodPatch?.height).toBe(166);
  });

  it("updates field type / array / required on nested rows", () => {
    const typePatch = serviceCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "svc-1", sectionId: "params", sectionIndex: 0, fieldIndex: 0 },
      "uuid",
    );
    expect(typePatch?.data?.methods?.[0].params[0].type).toBe("uuid");

    const arrayPatch = serviceCardTool.onToggleSubSelectArray!(card, {
      elementId: "svc-1",
      sectionId: "params",
      sectionIndex: 0,
      fieldIndex: 0,
    });
    expect(arrayPatch?.data?.methods?.[0].params[0].isArray).toBe(true);

    const requiredPatch = serviceCardTool.onToggleSubSelectRequired!(card, {
      elementId: "svc-1",
      sectionId: "returns",
      sectionIndex: 1,
      fieldIndex: 0,
    });
    expect(requiredPatch?.data?.methods?.[0].returns[0].isRequired).toBe(true);
  });

  it("resolves selected item for the options bar", () => {
    expect(
      serviceCardTool.getSelectedFieldItem!(card, {
        elementId: "svc-1",
        sectionId: "method",
        sectionIndex: 0,
        fieldIndex: -1,
      }),
    ).toBeNull();

    expect(
      serviceCardTool.getSelectedFieldItem!(card, {
        elementId: "svc-1",
        sectionId: "params",
        sectionIndex: 0,
        fieldIndex: 0,
      }),
    ).toEqual({ name: "orderId", type: "string" });
  });

  it("creates a Service card through the AI operation", () => {
    const element = serviceCardTool.ai!.onCreate(
      {
        name: "PaymentService",
        methods: [
          { name: "charge", params: [{ name: "amount", type: "number" }], returns: [] },
        ],
      },
      { x: 500, y: 500 },
    );

    expect(element.type).toBe("serviceCard");
    expect(element.data.name).toBe("PaymentService");
    expect(element.data.methods).toHaveLength(1);
    expect(element.data.methods[0].name).toBe("charge");
    expect(element.data.methods[0].id).toBeTruthy();
    expect(element.width).toBe(240);
  });
});
