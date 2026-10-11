import { describe, it, expect } from "vitest";
import {
  createReferenceCopy,
  syncReferenceUpdates,
  syncBatchReferenceUpdates,
  pruneDanglingReferences,
} from "./reference";
import type { CanvasElement } from "@/types";

describe("Reference utility", () => {
  const source: CanvasElement = {
    id: "source-1",
    type: "eventCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    data: {
      name: "OrderPlaced",
      fields: [{ name: "orderId", type: "string" }],
      color: "#f97316",
    },
  };

  it("creates a reference copy with shared referenceId and offset coordinates", () => {
    const { sourcePatch, copy } = createReferenceCopy(source);

    expect(sourcePatch.id).toBe("source-1");
    expect(sourcePatch.referenceId).toMatch(/^ref-/);
    expect(copy.referenceId).toBe(sourcePatch.referenceId);
    expect(copy.id).not.toBe(source.id);
    expect(copy.x).toBe(130);
    expect(copy.y).toBe(130);
    expect(copy.width).toBe(source.width);
    expect(copy.height).toBe(source.height);
    expect(copy.data).toEqual(source.data);
  });

  it("reuses existing referenceId if source already has one", () => {
    const existingRef: CanvasElement = {
      ...source,
      referenceId: "ref-custom-123",
    };

    const { sourcePatch, copy } = createReferenceCopy(existingRef);
    expect(sourcePatch.referenceId).toBe("ref-custom-123");
    expect(copy.referenceId).toBe("ref-custom-123");
  });

  it("syncs data and dimension updates to all elements with matching referenceId", () => {
    const el1: CanvasElement = { ...source, id: "el-1", referenceId: "ref-100" };
    const el2: CanvasElement = {
      ...source,
      id: "el-2",
      referenceId: "ref-100",
      x: 400,
      y: 400,
    };
    const el3: CanvasElement = { ...source, id: "el-3", referenceId: "ref-200" };

    const elements = [el1, el2, el3];

    // Update el-1 with new fields and new height
    const updated = syncReferenceUpdates(elements, "el-1", {
      height: 116,
      data: {
        ...el1.data,
        name: "OrderApproved",
        fields: [
          { name: "orderId", type: "string" },
          { name: "approvedAt", type: "datetime" },
        ],
      },
    });

    // el-1 is updated
    expect(updated[0].height).toBe(116);
    expect(updated[0].data.name).toBe("OrderApproved");
    expect(updated[0].x).toBe(100);

    // el-2 shares ref-100, so it also gets the updated data & height, but preserves x/y!
    expect(updated[1].height).toBe(116);
    expect(updated[1].data.name).toBe("OrderApproved");
    expect(updated[1].x).toBe(400);
    expect(updated[1].y).toBe(400);

    // el-3 has a different referenceId and remains untouched
    expect(updated[2].height).toBe(88);
    expect(updated[2].data.name).toBe("OrderPlaced");
  });

  it("syncs batch updates across references", () => {
    const el1: CanvasElement = { ...source, id: "el-1", referenceId: "ref-1" };
    const el2: CanvasElement = { ...source, id: "el-2", referenceId: "ref-1", x: 300 };

    const elements = [el1, el2];
    const updated = syncBatchReferenceUpdates(elements, [
      { id: "el-1", data: { ...el1.data, color: "#10b981" } },
    ]);

    expect(updated[0].data.color).toBe("#10b981");
    expect(updated[1].data.color).toBe("#10b981");
  });

  it("prunes dangling references when only 1 element remains with that referenceId", () => {
    const el1: CanvasElement = { ...source, id: "el-1", referenceId: "ref-1" };
    const el2: CanvasElement = { ...source, id: "el-2", referenceId: "ref-2" };
    const el3: CanvasElement = { ...source, id: "el-3", referenceId: "ref-2" };

    // el-1 is lone (count 1), el-2 and el-3 share ref-2 (count 2)
    const cleaned = pruneDanglingReferences([el1, el2, el3]);

    expect(cleaned[0].referenceId).toBeUndefined();
    expect(cleaned[1].referenceId).toBe("ref-2");
    expect(cleaned[2].referenceId).toBe("ref-2");
  });
});
