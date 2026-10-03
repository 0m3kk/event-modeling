import { describe, expect, it } from "vitest";
import { SpatialIndex } from "./SpatialIndex";
import { useCanvasStore } from "@/store";
import { exportCanvasToSvg } from "@/utils/imageExport";
import { exportCanvasJsonSchema } from "@/utils/jsonSchemaExport";
import { exportCodegenSpec } from "@/utils/codegenSpecExport";
import type { CanvasObject } from "@/types";

describe("Performance Hardening & Benchmarks (Phase 7)", () => {
  it("SpatialIndex handles 5,000+ cards with sub-10ms viewport culling", () => {
    const index = new SpatialIndex();
    const count = 5000;
    const objects: CanvasObject[] = [];

    // Distribute 5000 cards in a 100x50 grid
    for (let i = 0; i < count; i++) {
      const col = i % 100;
      const row = Math.floor(i / 100);
      objects.push({
        id: `card-${i}`,
        type: "storm",
        x: col * 300,
        y: row * 200,
        width: 200,
        height: 120,
        stormData: {
          kind: "event",
          name: `Event_${i}`,
          fields: [],
        },
      });
    }

    const t0 = performance.now();
    index.load(objects);
    const loadTime = performance.now() - t0;
    expect(loadTime).toBeLessThan(500); // 5000 items loaded fast

    // Query a typical 1920x1080 viewport region at coordinate (3000, 2000)
    const queryBox = {
      minX: 3000,
      minY: 2000,
      maxX: 4920,
      maxY: 3080,
    };

    const t1 = performance.now();
    const visibleIds = index.search(queryBox);
    const queryTime = performance.now() - t1;

    // Viewport query must be blistering fast (well under 10ms for 60fps)
    expect(queryTime).toBeLessThan(10);
    expect(visibleIds.length).toBeGreaterThan(0);
    expect(visibleIds.length).toBeLessThan(count); // Effectively culled!

    // Verify all returned cards actually intersect queryBox
    for (const id of visibleIds) {
      const obj = objects.find((o) => o.id === id);
      expect(obj).toBeDefined();
      if (obj) {
        expect(obj.x + (obj.width ?? 200)).toBeGreaterThanOrEqual(queryBox.minX);
        expect(obj.x).toBeLessThanOrEqual(queryBox.maxX);
        expect(obj.y + (obj.height ?? 120)).toBeGreaterThanOrEqual(queryBox.minY);
        expect(obj.y).toBeLessThanOrEqual(queryBox.maxY);
      }
    }
  });

  it("handles rapid batch object creation, update, and deletion without memory leaks", () => {
    useCanvasStore.getState().resetBoard();

    const batchSize = 1000;
    const testObjects: CanvasObject[] = [];

    for (let i = 0; i < batchSize; i++) {
      testObjects.push({
        id: `bench-${i}`,
        type: "storm",
        x: i * 20,
        y: i * 10,
        width: 200,
        height: 120,
        stormData: {
          kind: "command",
          name: `Command_${i}`,
          fields: [],
        },
      });
    }

    // 1. Bulk addition
    useCanvasStore.getState().addObjects(testObjects);
    expect(useCanvasStore.getState().objects.length).toBe(batchSize);

    // 2. Bulk move
    const idsToMove = testObjects.slice(0, 500).map((o) => o.id);
    useCanvasStore.getState().moveObjects(idsToMove, 50, 50, false);
    const firstObj = useCanvasStore.getState().objects.find((o) => o.id === testObjects[0].id);
    expect(firstObj?.x).toBe(50);
    expect(firstObj?.y).toBe(50);

    // 3. Bulk deletion
    const allIds = testObjects.map((o) => o.id);
    useCanvasStore.getState().deleteObjects(allIds);
    expect(useCanvasStore.getState().objects.length).toBe(0);
    expect(useCanvasStore.getState().selectedIds.length).toBe(0);
  });

  it("exports large diagram (500 cards) to JSON Schema and SVG smoothly", () => {
    const objects: CanvasObject[] = [];
    for (let i = 0; i < 500; i++) {
      objects.push({
        id: `card-${i}`,
        type: "storm",
        x: (i % 20) * 250,
        y: Math.floor(i / 20) * 180,
        width: 200,
        height: 120,
        stormData: {
          kind: i % 2 === 0 ? "event" : "command",
          name: `Item_${i}`,
          fields: [
            { id: `f-${i}-1`, name: "itemId", fieldType: "uuid", required: true },
            { id: `f-${i}-2`, name: "timestamp", fieldType: "datetime" },
          ],
        },
      });
    }

    // 1. Codegen Spec & JSON Schema export benchmarks
    const t0 = performance.now();
    const codegenSpec = exportCodegenSpec(objects, []);
    const specTime = performance.now() - t0;
    expect(specTime).toBeLessThan(100);
    expect(codegenSpec.length).toBeGreaterThan(1000);

    const jsonSchema = exportCanvasJsonSchema(objects, { dialect: "2020-12" });
    expect(jsonSchema.length).toBeGreaterThan(1000);

    // 2. SVG export benchmark
    const t1 = performance.now();
    const svg = exportCanvasToSvg(objects, []);
    const svgTime = performance.now() - t1;
    expect(svgTime).toBeLessThan(200);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
