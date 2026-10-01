import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  setGoogleDriveEnvForTesting,
  getStoredGoogleAuthConfig,
  storeGoogleAuthConfig,
  clearGoogleAuth,
  isGoogleAuthenticated,
  buildMultipartPayload,
  uploadStormToDrive,
  listStormFilesFromDrive,
  downloadStormFromDrive,
  deleteStormFromDrive,
  fetchGoogleUserProfile,
  GoogleDriveError,
  MULTIPART_BOUNDARY,
} from "./googleDrive";

describe("googleDrive utility", () => {
  beforeEach(() => {
    setGoogleDriveEnvForTesting({});
    clearGoogleAuth();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setGoogleDriveEnvForTesting(null);
    clearGoogleAuth();
  });

  describe("auth configuration storage", () => {
    it("returns default config when storage is empty", () => {
      const config = getStoredGoogleAuthConfig();
      expect(config.clientId).toBe("");
      expect(config.accessToken).toBeNull();
      expect(config.userEmail).toBeNull();
      expect(isGoogleAuthenticated(config)).toBe(false);
    });

    it("reads client ID and access token from environment variables", () => {
      setGoogleDriveEnvForTesting({
        VITE_GOOGLE_CLIENT_ID: "env-client.apps.googleusercontent.com",
        VITE_GOOGLE_ACCESS_TOKEN: "ya29.env-access-token",
      });

      const loaded = getStoredGoogleAuthConfig();
      expect(loaded.clientId).toBe("env-client.apps.googleusercontent.com");
      expect(loaded.accessToken).toBe("ya29.env-access-token");
      expect(loaded.isEnvClientId).toBe(true);
      expect(loaded.isEnvAccessToken).toBe(true);
      expect(isGoogleAuthenticated(loaded)).toBe(true);
    });

    it("persists and reads back auth config", () => {
      const auth = {
        clientId: "client-123.apps.googleusercontent.com",
        accessToken: "ya29.sample-token",
        tokenExpiry: Date.now() + 3600 * 1000,
        userEmail: "developer@example.com",
        userName: "Developer",
        userPicture: "https://example.com/avatar.png",
      };
      storeGoogleAuthConfig(auth);

      const loaded = getStoredGoogleAuthConfig();
      expect(loaded).toEqual({
        ...auth,
        isEnvClientId: false,
        isEnvAccessToken: false,
      });
      expect(isGoogleAuthenticated(loaded)).toBe(true);
    });

    it("marks authentication expired when tokenExpiry is in the past or within 60s", () => {
      const expiredAuth = {
        clientId: "client-123",
        accessToken: "ya29.expired",
        tokenExpiry: Date.now() + 30 * 1000, // less than 60s grace period
        userEmail: "test@example.com",
      };
      expect(isGoogleAuthenticated(expiredAuth)).toBe(false);
    });

    it("clears active session while preserving env clientId upon clearGoogleAuth", () => {
      setGoogleDriveEnvForTesting({
        VITE_GOOGLE_CLIENT_ID: "client-123",
      });

      storeGoogleAuthConfig({
        clientId: "client-123",
        accessToken: "token-abc",
        tokenExpiry: Date.now() + 100000,
        userEmail: "test@example.com",
        userName: "Test User",
      });

      clearGoogleAuth();
      const updated = getStoredGoogleAuthConfig();
      expect(updated.clientId).toBe("client-123");
      expect(updated.accessToken).toBeNull();
      expect(updated.userEmail).toBeNull();
      expect(isGoogleAuthenticated(updated)).toBe(false);
    });
  });

  describe("buildMultipartPayload", () => {
    it("constructs valid multipart/related body with boundary", () => {
      const meta = { name: "my-diagram.storm", mimeType: "application/json" };
      const content = JSON.stringify({ version: 1, objects: [] });

      const { body, contentType } = buildMultipartPayload(meta, content);

      expect(contentType).toContain(MULTIPART_BOUNDARY);
      expect(body).toContain(`--${MULTIPART_BOUNDARY}`);
      expect(body).toContain('"name":"my-diagram.storm"');
      expect(body).toContain(content);
      expect(body.endsWith(`--${MULTIPART_BOUNDARY}--`)).toBe(true);
    });
  });

  describe("uploadStormToDrive", () => {
    it("performs POST upload when fileId is not supplied", async () => {
      const fakeResult = {
        id: "drive-file-123",
        name: "Shopping.storm",
        webViewLink: "https://drive.google.com/file/d/drive-file-123/view",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fakeResult,
      } as Response);

      const result = await uploadStormToDrive({
        projectName: "Shopping",
        content: '{"version": 1}',
        accessToken: "sample-token",
      });

      expect(result.id).toBe("drive-file-123");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [calledUrl, options] = fetchSpy.mock.calls[0];
      expect(String(calledUrl)).toContain("upload/drive/v3/files?uploadType=multipart");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty("Authorization", "Bearer sample-token");
    });

    it("performs PATCH upload when fileId is supplied", async () => {
      const fakeResult = {
        id: "existing-file-456",
        name: "OrderProcess.storm",
        webViewLink: "https://drive.google.com/file/d/existing-file-456/view",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fakeResult,
      } as Response);

      const result = await uploadStormToDrive({
        projectName: "OrderProcess",
        content: '{"version": 1, "objects": []}',
        accessToken: "sample-token",
        fileId: "existing-file-456",
      });

      expect(result.id).toBe("existing-file-456");
      const [calledUrl, options] = fetchSpy.mock.calls[0];
      expect(String(calledUrl)).toContain("/files/existing-file-456?uploadType=multipart");
      expect(options?.method).toBe("PATCH");
    });

    it("throws GoogleDriveError on HTTP failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid credentials" } }),
      } as Response);

      await expect(
        uploadStormToDrive({
          projectName: "Shopping",
          content: "{}",
          accessToken: "invalid-token",
        }),
      ).rejects.toThrowError(GoogleDriveError);
    });
  });

  describe("listStormFilesFromDrive", () => {
    it("returns list of files from drive response", async () => {
      const fakeFiles = [
        {
          id: "f-1",
          name: "ProjectA.storm",
          modifiedTime: "2026-10-01T12:00:00Z",
          webViewLink: "https://drive.google.com/view/f-1",
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ files: fakeFiles }),
      } as Response);

      const files = await listStormFilesFromDrive("test-token");
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("ProjectA.storm");
    });

    it("throws GoogleDriveError when response is not ok", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

      await expect(listStormFilesFromDrive("bad-token")).rejects.toThrow(
        GoogleDriveError,
      );
    });
  });

  describe("downloadStormFromDrive", () => {
    it("fetches raw file content", async () => {
      const sampleContent = '{"version": 1, "objects": [{"id": "1"}]}';
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => sampleContent,
      } as Response);

      const content = await downloadStormFromDrive("file-123", "test-token");
      expect(content).toBe(sampleContent);
    });
  });

  describe("deleteStormFromDrive", () => {
    it("deletes file successfully", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await expect(
        deleteStormFromDrive("file-to-delete", "token"),
      ).resolves.not.toThrow();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/files/file-to-delete"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("fetchGoogleUserProfile", () => {
    it("retrieves user profile info", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/pic.jpg",
        }),
      } as Response);

      const profile = await fetchGoogleUserProfile("valid-token");
      expect(profile.email).toBe("user@example.com");
      expect(profile.name).toBe("Test User");
    });
  });
});
