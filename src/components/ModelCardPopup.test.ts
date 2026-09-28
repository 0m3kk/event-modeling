import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "@/store";
import { findModelByName } from "@/utils/modelResolution";
import type { CanvasObject } from "@/types";

describe("ModelCardPopup logic and drill-down chain", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
  });

  const addressModel: CanvasObject = {
    id: "m-addr",
    type: "model",
    x: 400,
    y: 100,
    width: 240,
    height: 120,
    modelData: {
      kind: "object",
      name: "Address",
      fields: [
        { id: "f-street", name: "street", fieldType: "string" },
        { id: "f-geo", name: "geo", fieldType: "GeoLocation" },
      ],
    },
  };

  const geoModel: CanvasObject = {
    id: "m-geo",
    type: "model",
    x: 700,
    y: 100,
    width: 240,
    height: 100,
    modelData: {
      kind: "object",
      name: "GeoLocation",
      fields: [
        { id: "f-lat", name: "latitude", fieldType: "number" },
        { id: "f-lng", name: "longitude", fieldType: "number" },
      ],
    },
  };

  const customerModel: CanvasObject = {
    id: "m-cust",
    type: "model",
    x: 100,
    y: 100,
    width: 240,
    height: 120,
    modelData: {
      kind: "object",
      name: "Customer",
      fields: [
        { id: "f-name", name: "fullName", fieldType: "string" },
        { id: "f-addr", name: "shippingAddress", fieldType: "Address" },
      ],
    },
  };

  it("resolves nested models and maintains cascading popup levels", () => {
    useCanvasStore
      .getState()
      .addObjects([customerModel, addressModel, geoModel]);

    const objects = useCanvasStore.getState().objects;

    // 1. Click 'shippingAddress' on Customer (canvas level -> popup Level 0)
    const targetAddress = findModelByName(objects, "Address");
    expect(targetAddress?.id).toBe("m-addr");

    useCanvasStore.getState().openModelPopup({
      modelId: targetAddress!.id,
      sourceObjectId: customerModel.id,
      sourceFieldId: "f-addr",
      sourceFieldName: "shippingAddress",
      sourceFieldType: "Address",
      anchorRect: { x: 340, y: 140, width: 0, height: 26 },
      level: 0,
    });

    let chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(1);
    expect(chain[0].modelId).toBe("m-addr");
    expect(chain[0].level).toBe(0);

    // 2. In Address popup, click 'geo: GeoLocation' -> popup Level 1
    const targetGeo = findModelByName(objects, "GeoLocation");
    expect(targetGeo?.id).toBe("m-geo");

    useCanvasStore.getState().openModelPopup({
      modelId: targetGeo!.id,
      sourceObjectId: addressModel.id,
      sourceFieldId: "f-geo",
      sourceFieldName: "geo",
      sourceFieldType: "GeoLocation",
      anchorRect: { x: 590, y: 170, width: 0, height: 26 },
      level: 1,
    });

    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(2);
    expect(chain[0].modelId).toBe("m-addr");
    expect(chain[1].modelId).toBe("m-geo");
    expect(chain[1].level).toBe(1);

    // 3. Close Level 1 popup -> Level 0 remains
    useCanvasStore.getState().closeModelPopup(1);
    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(1);
    expect(chain[0].modelId).toBe("m-addr");

    // 4. Clear all popups
    useCanvasStore.getState().clearModelPopups();
    expect(useCanvasStore.getState().modelPopupChain).toHaveLength(0);
  });

  it("smoothly replaces level 0 popup when switching directly between model fields", () => {
    useCanvasStore
      .getState()
      .addObjects([customerModel, addressModel, geoModel]);

    // Open first model popup (Address)
    useCanvasStore.getState().openModelPopup({
      modelId: "m-addr",
      sourceObjectId: customerModel.id,
      sourceFieldId: "f-addr",
      sourceFieldName: "shippingAddress",
      sourceFieldType: "Address",
      level: 0,
    });

    let chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(1);
    expect(chain[0].modelId).toBe("m-addr");

    // Click another model field directly (GeoLocation)
    useCanvasStore.getState().openModelPopup({
      modelId: "m-geo",
      sourceObjectId: addressModel.id,
      sourceFieldId: "f-geo",
      sourceFieldName: "geo",
      sourceFieldType: "GeoLocation",
      level: 0,
    });

    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(1);
    expect(chain[0].modelId).toBe("m-geo");
    expect(chain[0].sourceFieldId).toBe("f-geo");
  });
});
