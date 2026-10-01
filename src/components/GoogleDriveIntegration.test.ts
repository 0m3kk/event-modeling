import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useCanvasStore, clearHistory } from "@/store";
import {
  setGoogleDriveEnvForTesting,
  storeGoogleAuthConfig,
  uploadStormToDrive,
  downloadStormFromDrive,
} from "@/utils/googleDrive";
import { serializeStormFile, parseAndValidateStormFile, createBackup, setStorageForTesting } from "@/utils/fileIO";
import type { CanvasObject } from "@/types";

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

describe("Google Drive Save and Open Integration", () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    setStorageForTesting(mockStorage);
    setGoogleDriveEnvForTesting(null);
    useCanvasStore.getState().resetBoard([], [], "Untitled", null);
    clearHistory();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setGoogleDriveEnvForTesting(null);
    setStorageForTesting(null);
  });

  it("saves a new project to Google Drive and sets googleDriveFileId in store", async () => {
    storeGoogleAuthConfig({
      clientId: "client-id-test",
      accessToken: "ya29.valid-token",
      tokenExpiry: Date.now() + 3600 * 1000,
      userEmail: "test@example.com",
    });

    const card: CanvasObject = {
      id: "event-1",
      type: "storm",
      x: 50,
      y: 80,
      width: 180,
      height: 100,
      stormData: {
        kind: "event",
        name: "OrderPlaced",
        fields: [],
      },
    };

    useCanvasStore.getState().addObjects([card]);
    useCanvasStore.getState().setProjectName("E-Commerce Flow");

    expect(useCanvasStore.getState().googleDriveFileId).toBeNull();

    // Mock Google Drive upload API response
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "gdrive-id-999",
        name: "E-Commerce Flow.storm",
        webViewLink: "https://drive.google.com/file/d/gdrive-id-999/view",
      }),
    } as Response);

    const { objects, groups, viewport, projectName } = useCanvasStore.getState();
    const content = serializeStormFile({ objects, groups, viewport, name: projectName });

    const result = await uploadStormToDrive({
      projectName,
      content,
      accessToken: "ya29.valid-token",
      fileId: null,
    });

    useCanvasStore.getState().setGoogleDriveFileId(result.id);

    expect(result.id).toBe("gdrive-id-999");
    expect(useCanvasStore.getState().googleDriveFileId).toBe("gdrive-id-999");
  });

  it("updates existing Google Drive file when googleDriveFileId is present", async () => {
    useCanvasStore.getState().setGoogleDriveFileId("gdrive-id-999");
    useCanvasStore.getState().setProjectName("Updated Flow");

    const patchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "gdrive-id-999",
        name: "Updated Flow.storm",
      }),
    } as Response);

    const { objects, groups, viewport, projectName, googleDriveFileId } = useCanvasStore.getState();
    const content = serializeStormFile({ objects, groups, viewport, name: projectName });

    await uploadStormToDrive({
      projectName,
      content,
      accessToken: "token",
      fileId: googleDriveFileId,
    });

    const [calledUrl, options] = patchSpy.mock.calls[0];
    expect(String(calledUrl)).toContain("/files/gdrive-id-999?uploadType=multipart");
    expect(options?.method).toBe("PATCH");
  });

  it("downloads from Google Drive and restores board with new file ID", async () => {
    const remoteStormProject = {
      version: 1,
      name: "Remote Architecture",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      objects: [
        {
          id: "cmd-1",
          type: "storm",
          x: 200,
          y: 200,
          width: 180,
          height: 100,
          stormData: {
            kind: "command",
            name: "CreateUser",
            fields: [],
          },
        },
      ],
      groups: [],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(remoteStormProject),
    } as Response);

    const downloadedText = await downloadStormFromDrive("remote-file-id", "token");
    const parsed = parseAndValidateStormFile(downloadedText);

    // Create backup of current before reset
    const cur = useCanvasStore.getState();
    createBackup({ objects: cur.objects, groups: cur.groups, viewport: cur.viewport, name: cur.projectName });

    useCanvasStore.getState().resetBoard(parsed.objects, parsed.groups, parsed.name, "remote-file-id");

    const state = useCanvasStore.getState();
    expect(state.projectName).toBe("Remote Architecture");
    expect(state.googleDriveFileId).toBe("remote-file-id");
    expect(state.objects.length).toBe(1);
    expect(state.objects[0].id).toBe("cmd-1");
  });
});
