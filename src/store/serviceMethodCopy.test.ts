import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "./index";
import type { CanvasElement } from "@/types";
import type { ServiceCardData } from "@/tools/serviceCard";

describe("Store method-execution copies (Service methods)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const makeService = (): CanvasElement<ServiceCardData> => ({
    id: "svc-1",
    type: "serviceCard",
    x: 100,
    y: 100,
    width: 240,
    height: 248,
    data: {
      name: "OrderService",
      methods: [
        {
          id: "m1",
          name: "placeOrder",
          params: [{ name: "orderId", type: "string" }],
          returns: [],
        },
        {
          id: "m2",
          name: "cancelOrder",
          params: [],
          returns: [],
        },
      ],
      color: "#0ea5e9",
    },
  });

  const source = () => useCanvasStore.getState().elements.find((e) => e.id === "svc-1")!;
  const copyOf = (id: string) =>
    useCanvasStore.getState().elements.find((e) => e.id === id)!;

  it("creates a copy that renders a single method and links via methodRef", () => {
    useCanvasStore.getState().addElement(makeService());

    const copy = useCanvasStore.getState().createMethodCopy("svc-1", "m1")!;
    expect(copy).not.toBeNull();
    expect(copy.type).toBe("serviceCard");
    expect(copy.data.methodRef).toEqual({ serviceId: "svc-1", methodId: "m1" });
    expect(copy.data.methods).toHaveLength(1);
    expect(copy.data.methods[0].name).toBe("placeOrder");
    expect(copy.data.methods[0].id).toBe("m1");
    // Offset from the source, like a reference copy.
    expect(copy.x).toBe(130);
    expect(copy.y).toBe(130);

    // The source keeps all its methods and is NOT put into a reference group.
    expect(source().referenceId).toBeUndefined();
    expect(source().data.methods).toHaveLength(2);

    // The copy is selected after creation.
    expect(useCanvasStore.getState().selectedIds).toEqual([copy.id]);
  });

  it("keeps the copy in sync when the linked method changes", () => {
    useCanvasStore.getState().addElement(makeService());
    const copy = useCanvasStore.getState().createMethodCopy("svc-1", "m1")!;
    expect(copy.height).toBe(32 + (24 + 16 + 26 + 16 + 26)); // 140

    // Add a param and a return to the linked method on the source.
    const data = source().data as ServiceCardData;
    const nextMethods = data.methods.map((m) =>
      m.id === "m1"
        ? {
            ...m,
            params: [...m.params, { name: "total", type: "float" }],
            returns: [{ name: "trackingCode", type: "string" }],
          }
        : m,
    );
    useCanvasStore.getState().updateElement("svc-1", {
      data: { ...data, methods: nextMethods },
    });

    const updatedCopy = copyOf(copy.id);
    expect(updatedCopy.data.methods[0].params).toHaveLength(2);
    expect(updatedCopy.data.methods[0].returns).toHaveLength(1);
    // 32 + (24 + 16 + 2*26 + 16 + 1*26) = 166
    expect(updatedCopy.height).toBe(166);
  });

  it("syncs the service name and color to the copy", () => {
    useCanvasStore.getState().addElement(makeService());
    const copy = useCanvasStore.getState().createMethodCopy("svc-1", "m1")!;

    const data = source().data as ServiceCardData;
    useCanvasStore.getState().updateElement("svc-1", {
      data: { ...data, name: "CheckoutService", color: "#111827" },
    });

    const updatedCopy = copyOf(copy.id);
    expect(updatedCopy.data.name).toBe("checkoutService");
    expect(updatedCopy.data.color).toBe("#111827");
  });

  it("detaches the copy when its method is removed from the source", () => {
    useCanvasStore.getState().addElement(makeService());
    const copy = useCanvasStore.getState().createMethodCopy("svc-1", "m1")!;

    const data = source().data as ServiceCardData;
    useCanvasStore.getState().updateElement("svc-1", {
      data: { ...data, methods: data.methods.filter((m) => m.id !== "m1") },
    });

    const updatedCopy = copyOf(copy.id);
    expect(updatedCopy.data.methodRef).toBeUndefined();
    // Snapshot is kept so the element is not silently emptied.
    expect(updatedCopy.data.methods[0].name).toBe("placeOrder");
  });

  it("detaches the copy when the source service is deleted", () => {
    useCanvasStore.getState().addElement(makeService());
    const copy = useCanvasStore.getState().createMethodCopy("svc-1", "m1")!;

    useCanvasStore.getState().deleteElements(["svc-1"]);

    const updatedCopy = copyOf(copy.id);
    expect(updatedCopy.data.methodRef).toBeUndefined();
    expect(updatedCopy.data.methods).toHaveLength(1);
  });

  it("syncs through batch updates", () => {
    useCanvasStore.getState().addElement(makeService());
    const copy = useCanvasStore.getState().createMethodCopy("svc-1", "m1")!;

    const data = source().data as ServiceCardData;
    const nextMethods = data.methods.map((m) =>
      m.id === "m1" ? { ...m, params: [...m.params, { name: "total", type: "float" }] } : m,
    );
    useCanvasStore.getState().updateElements([
      { id: "svc-1", data: { ...data, methods: nextMethods } },
    ]);

    expect(copyOf(copy.id).data.methods[0].params).toHaveLength(2);
  });

  it("supports undo and redo for method copies", () => {
    useCanvasStore.getState().addElement(makeService());
    useCanvasStore.getState().createMethodCopy("svc-1", "m1");
    expect(useCanvasStore.getState().elements).toHaveLength(2);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements).toHaveLength(1);

    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().elements).toHaveLength(2);
  });
});
