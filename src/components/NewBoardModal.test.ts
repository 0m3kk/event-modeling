import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore, clearHistory } from "@/store";
import {
  createBackup,
  getBackup,
  restoreBackup,
  saveAutoSave,
  loadAutoSave,
  setStorageForTesting,
} from "@/utils/fileIO";
import type { CanvasObject } from "@/types";

// In-memory mock storage for vitest environment
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("New Board and Backup Functionality", () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    setStorageForTesting(mockStorage);
    useCanvasStore.getState().resetBoard([], [], "Untitled");
    clearHistory();
  });

  it("backs up current board and creates a fresh empty board", () => {
    const card: CanvasObject = {
      id: "card-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      stormData: {
        kind: "event",
        name: "UserSignedUp",
        fields: [],
      },
    };

    useCanvasStore.getState().addObjects([card]);
    useCanvasStore.getState().setProjectName("My Active Project");

    const state = useCanvasStore.getState();
    expect(state.objects.length).toBe(1);
    expect(state.projectName).toBe("My Active Project");

    // Execute backup as handleNewBoard does
    createBackup({
      objects: state.objects,
      groups: state.groups,
      viewport: state.viewport,
      name: state.projectName,
    });

    // Reset board
    useCanvasStore.getState().resetBoard([], [], "Untitled");
    clearHistory();
    saveAutoSave({
      objects: [],
      groups: [],
      viewport: state.viewport,
      name: "Untitled",
    });

    // Check board is completely fresh
    const resetState = useCanvasStore.getState();
    expect(resetState.objects.length).toBe(0);
    expect(resetState.groups.length).toBe(0);
    expect(resetState.projectName).toBe("Untitled");

    // Check backup was created and can be restored
    const backup = getBackup();
    expect(backup).not.toBeNull();
    expect(backup?.name).toBe("My Active Project");
    expect(backup?.objects.length).toBe(1);
    expect(backup?.objects[0].id).toBe("card-1");

    // Restore backup
    const restored = restoreBackup({
      objects: resetState.objects,
      groups: resetState.groups,
      viewport: resetState.viewport,
      name: resetState.projectName,
    });

    useCanvasStore.getState().resetBoard(restored.objects, restored.groups, restored.name);
    const restoredState = useCanvasStore.getState();
    expect(restoredState.objects.length).toBe(1);
    expect(restoredState.projectName).toBe("My Active Project");
    expect(restoredState.objects[0].id).toBe("card-1");
  });

  it("updates autosave immediately to empty project on new board", () => {
    saveAutoSave({
      objects: [
        {
          id: "old-1",
          type: "textBox",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: "Previous work",
        },
      ],
      groups: [],
      name: "Old Project",
    });

    expect(loadAutoSave()?.name).toBe("Old Project");

    // Start new board
    useCanvasStore.getState().resetBoard([], [], "Untitled");
    saveAutoSave({
      objects: [],
      groups: [],
      name: "Untitled",
    });

    const currentAutoSave = loadAutoSave();
    expect(currentAutoSave?.name).toBe("Untitled");
    expect(currentAutoSave?.objects.length).toBe(0);
  });
});
