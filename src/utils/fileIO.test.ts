import { describe, expect, it, beforeEach } from "vitest";
import {
  serializeStormFile,
  parseAndValidateStormFile,
  saveAutoSave,
  loadAutoSave,
  clearAutoSave,
  createBackup,
  getBackup,
  hasBackup,
  restoreBackup,
  setStorageForTesting,
  StormFileError,
} from "./fileIO";
import type { CanvasObject, GroupInfo } from "@/types";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe("fileIO", () => {
  let memoryStorage: MemoryStorage;

  const sampleObjects: CanvasObject[] = [
    {
      id: "s1",
      type: "storm",
      x: 100,
      y: 150,
      width: 200,
      height: 120,
      stormData: {
        kind: "event",
        name: "OrderPaid",
        fields: [{ id: "f1", name: "orderId", fieldType: "uuid" }],
      },
    },
    {
      id: "m1",
      type: "model",
      x: 400,
      y: 150,
      width: 220,
      height: 140,
      modelData: {
        kind: "object",
        name: "Payment",
        fields: [{ id: "mf1", name: "amount", fieldType: "number" }],
      },
    },
  ];

  const sampleGroups: GroupInfo[] = [
    {
      id: "g1",
      name: "Checkout Subdomain",
      fill: "rgba(239, 246, 255, 0.5)",
      stroke: "#93c5fd",
      strokeWidth: 2,
      lineStyle: "solid",
      tagColor: "#3b82f6",
    },
  ];

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    setStorageForTesting(memoryStorage);
  });

  it("serializes and deserializes a project file cleanly", () => {
    const serialized = serializeStormFile({
      objects: sampleObjects,
      groups: sampleGroups,
      name: "E-Commerce",
      viewport: { x: 50, y: -20, zoom: 1.2, screenWidth: 800, screenHeight: 600 },
    });

    const parsed = parseAndValidateStormFile(serialized);
    expect(parsed.version).toBe(1);
    expect(parsed.name).toBe("E-Commerce");
    expect(parsed.objects).toHaveLength(2);
    expect(parsed.objects[0].id).toBe("s1");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].id).toBe("g1");
    expect(parsed.viewport?.zoom).toBe(1.2);
  });

  it("throws StormFileError on invalid JSON", () => {
    expect(() => parseAndValidateStormFile("not json {")).toThrow(
      StormFileError,
    );
  });

  it("throws StormFileError on missing objects array", () => {
    const invalid = JSON.stringify({ version: 1, name: "Test" });
    expect(() => parseAndValidateStormFile(invalid)).toThrow(
      /Missing 'objects' array/,
    );
  });

  it("throws StormFileError on corrupt object items", () => {
    const invalid = JSON.stringify({
      version: 1,
      objects: [{ id: "1", type: "storm", x: "invalid", y: 100 }],
    });
    expect(() => parseAndValidateStormFile(invalid)).toThrow(
      /has invalid coordinates/,
    );
  });

  it("handles auto-save and loading from localStorage", () => {
    expect(loadAutoSave()).toBeNull();

    const saved = saveAutoSave({
      objects: sampleObjects,
      groups: sampleGroups,
      name: "AutoSaved",
    });
    expect(saved).toBe(true);

    const loaded = loadAutoSave();
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("AutoSaved");
    expect(loaded?.objects).toHaveLength(2);

    clearAutoSave();
    expect(loadAutoSave()).toBeNull();
  });

  it("handles backup creation, detection, and swap on restore", () => {
    expect(hasBackup()).toBe(false);

    createBackup({
      objects: sampleObjects,
      groups: sampleGroups,
      name: "Original State",
    });

    expect(hasBackup()).toBe(true);
    expect(getBackup()?.name).toBe("Original State");

    const newObjects: CanvasObject[] = [
      {
        id: "sticky-1",
        type: "stickyNote",
        x: 0,
        y: 0,
        width: 150,
        height: 100,
        text: "New Board",
      },
    ];

    // Restoring swaps current data into the backup slot
    const restored = restoreBackup({
      objects: newObjects,
      groups: [],
      name: "Second State",
    });

    expect(restored.name).toBe("Original State");
    expect(restored.objects).toHaveLength(2);

    // Backup now holds "Second State"
    const currentBackup = getBackup();
    expect(currentBackup?.name).toBe("Second State");
    expect(currentBackup?.objects).toHaveLength(1);
  });
});
