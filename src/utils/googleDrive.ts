import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { sanitizeFilename } from "./fileIO";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface GoogleDriveFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface GoogleAuthConfig {
  clientId: string;
  accessToken: string | null;
  tokenExpiry: number | null; // epoch ms
  userEmail: string | null;
  userName?: string | null;
  userPicture?: string | null;
  isEnvClientId?: boolean;
  isEnvAccessToken?: boolean;
}

export interface GoogleDriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
}

export class GoogleDriveError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GoogleDriveError";
    this.status = status;
  }
}

// ============================================================================
// Constants & Endpoints
// ============================================================================

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
export const GOOGLE_DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";

const DEFAULT_AUTH_CONFIG: GoogleAuthConfig = {
  clientId: "",
  accessToken: null,
  tokenExpiry: null,
  userEmail: null,
  userName: null,
  userPicture: null,
  isEnvClientId: false,
  isEnvAccessToken: false,
};

let customEnv: Record<string, string> | null = null;
let inMemorySessionAuth: GoogleAuthConfig | null = null;

export function setGoogleDriveEnvForTesting(env: Record<string, string> | null): void {
  customEnv = env;
}

export function setSessionGoogleAuth(config: GoogleAuthConfig | null): void {
  inMemorySessionAuth = config;
}

export function getGoogleDriveEnv(): { clientId: string; accessToken: string } {
  if (customEnv !== null) {
    return {
      clientId: (customEnv.VITE_GOOGLE_CLIENT_ID || "").trim(),
      accessToken: (customEnv.VITE_GOOGLE_ACCESS_TOKEN || "").trim(),
    };
  }
  const env =
    typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env;

  return {
    clientId: ((env && env.VITE_GOOGLE_CLIENT_ID) || "").trim(),
    accessToken: ((env && env.VITE_GOOGLE_ACCESS_TOKEN) || "").trim(),
  };
}

export function getGoogleAuthConfig(): GoogleAuthConfig {
  const env = getGoogleDriveEnv();
  const isEnvClientId = Boolean(env.clientId);
  const isEnvAccessToken = Boolean(env.accessToken);

  if (isEnvAccessToken) {
    return {
      clientId: env.clientId,
      accessToken: env.accessToken,
      tokenExpiry: null,
      userEmail: "Configured in .env",
      userName: "Env Token",
      userPicture: null,
      isEnvClientId,
      isEnvAccessToken: true,
    };
  }

  if (inMemorySessionAuth && inMemorySessionAuth.accessToken) {
    return {
      ...inMemorySessionAuth,
      clientId: env.clientId || inMemorySessionAuth.clientId,
      isEnvClientId,
      isEnvAccessToken: false,
    };
  }

  return {
    ...DEFAULT_AUTH_CONFIG,
    clientId: env.clientId,
    isEnvClientId,
    isEnvAccessToken: false,
  };
}

// Alias for backwards compatibility
export const getStoredGoogleAuthConfig = getGoogleAuthConfig;

export function storeGoogleAuthConfig(config: GoogleAuthConfig): void {
  setSessionGoogleAuth(config);
}

export function clearGoogleAuth(): void {
  inMemorySessionAuth = null;
}

export function isGoogleAuthenticated(config?: GoogleAuthConfig): boolean {
  const auth = config || getGoogleAuthConfig();
  if (!auth.accessToken) return false;
  // If tokenExpiry is set, check if within 60 seconds of expiry
  if (auth.tokenExpiry !== null && auth.tokenExpiry < Date.now() + 60_000) {
    return false;
  }
  return true;
}

// ============================================================================
// Transport Helper
// ============================================================================

export function isTauriEnvironment(): boolean {
  const g =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : typeof globalThis !== "undefined"
        ? (globalThis as unknown as Record<string, unknown>)
        : undefined;
  if (!g) return false;
  return Boolean(
    isTauri() ||
    Boolean(g.__TAURI_INTERNALS__) ||
    Boolean(g.__TAURI__),
  );
}

export async function driveHttpFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauriEnvironment()) {
    try {
      return await tauriFetch(url, init);
    } catch {
      // Fallback to standard fetch if tauri plugin fetch fails
      return fetch(url, init);
    }
  }
  return fetch(url, init);
}

// ============================================================================
// Google User Profile
// ============================================================================

export async function fetchGoogleUserProfile(accessToken: string): Promise<{
  email: string;
  name?: string;
  picture?: string;
}> {
  const res = await driveHttpFetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new GoogleDriveError(
      `Failed to fetch user profile (${res.status})`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    email: string;
    name?: string;
    picture?: string;
  };

  return {
    email: data.email || "",
    name: data.name,
    picture: data.picture,
  };
}

// ============================================================================
// Multipart Payload Builder
// ============================================================================

export const MULTIPART_BOUNDARY = "boundary_event_modeling_storm_gdrive";

export function buildMultipartPayload(
  metadata: Record<string, unknown>,
  fileContent: string,
): { body: string; contentType: string } {
  const metadataJson = JSON.stringify(metadata);
  const body =
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataJson}\r\n` +
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${fileContent}\r\n` +
    `--${MULTIPART_BOUNDARY}--`;

  return {
    body,
    contentType: `multipart/related; boundary=${MULTIPART_BOUNDARY}`,
  };
}

// ============================================================================
// Google Drive Operations
// ============================================================================

export interface UploadStormOptions {
  projectName: string;
  content: string;
  accessToken: string;
  fileId?: string | null;
}

/**
 * Uploads or updates a .storm file to Google Drive using multipart upload.
 */
export async function uploadStormToDrive({
  projectName,
  content,
  accessToken,
  fileId,
}: UploadStormOptions): Promise<GoogleDriveUploadResult> {
  const safeName = sanitizeFilename(projectName);
  const fileName = safeName.toLowerCase().endsWith(".storm")
    ? safeName
    : `${safeName}.storm`;

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: "application/json",
    description: "Event Modeling Project File",
    appProperties: {
      app: "event-modeling",
      type: "storm-project",
    },
  };

  const { body, contentType } = buildMultipartPayload(metadata, content);

  const isUpdate = Boolean(fileId);
  const url = isUpdate
    ? `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}/${fileId}?uploadType=multipart&fields=id,name,webViewLink,modifiedTime,size`
    : `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,name,webViewLink,modifiedTime,size`;

  const res = await driveHttpFetch(url, {
    method: isUpdate ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body,
  });

    if (!res.ok) {
      let errorDetail = "";
      try {
        const errJson = (await res.json()) as { error?: { message?: string } };
        errorDetail = errJson.error?.message || "";
      } catch {
        // ignore
      }
      const isScopeError =
        res.status === 403 &&
        (errorDetail.toLowerCase().includes("insufficient") ||
          errorDetail.toLowerCase().includes("scope"));
      const message = isScopeError
        ? "Lỗi quyền hạn (Insufficient Scopes): Token chưa được cấp quyền Google Drive. Bạn cần đăng xuất, bấm Đăng nhập lại và nhớ TÍCH CHỌN vào ô cho phép truy cập Google Drive trên màn hình đăng nhập của Google."
        : errorDetail
          ? `Google Drive upload error: ${errorDetail}`
          : `Failed to upload to Google Drive (${res.status})`;
      throw new GoogleDriveError(message, res.status);
    }

  const result = (await res.json()) as GoogleDriveUploadResult;
  return result;
}

/**
 * Lists .storm project files saved in Google Drive.
 */
export async function listStormFilesFromDrive(
  accessToken: string,
): Promise<GoogleDriveFileMeta[]> {
  const query = "trashed = false and (name contains '.storm' or appProperties has { key='app' and value='event-modeling' })";
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,webViewLink,modifiedTime,size,iconLink)",
    orderBy: "modifiedTime desc",
    pageSize: "50",
  });

  const url = `${GOOGLE_DRIVE_FILES_ENDPOINT}?${params.toString()}`;

  const res = await driveHttpFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new GoogleDriveError(
      `Failed to list files from Google Drive (${res.status})`,
      res.status,
    );
  }

  const data = (await res.json()) as { files?: GoogleDriveFileMeta[] };
  return data.files || [];
}

/**
 * Downloads a project file content from Google Drive by its fileId.
 */
export async function downloadStormFromDrive(
  fileId: string,
  accessToken: string,
): Promise<string> {
  const url = `${GOOGLE_DRIVE_FILES_ENDPOINT}/${fileId}?alt=media`;

  const res = await driveHttpFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new GoogleDriveError(
      `Failed to download file from Google Drive (${res.status})`,
      res.status,
    );
  }

  return await res.text();
}

/**
 * Deletes a file from Google Drive by its fileId.
 */
export async function deleteStormFromDrive(
  fileId: string,
  accessToken: string,
): Promise<void> {
  const url = `${GOOGLE_DRIVE_FILES_ENDPOINT}/${fileId}`;

  const res = await driveHttpFetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new GoogleDriveError(
      `Failed to delete file from Google Drive (${res.status})`,
      res.status,
    );
  }
}

// ============================================================================
// Google OAuth Token Client (Google Identity Services)
// ============================================================================

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              scope?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (error: unknown) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let gisScriptLoadingPromise: Promise<void> | null = null;

export function loadGoogleIdentityServicesScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisScriptLoadingPromise) {
    return gisScriptLoadingPromise;
  }

  gisScriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("google-gsi-client");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", (e) => reject(e));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptLoadingPromise = null;
      reject(new GoogleDriveError("Failed to load Google Identity Services SDK"));
    };
    document.head.appendChild(script);
  });

  return gisScriptLoadingPromise;
}

export async function requestGoogleDriveAccessToken(
  clientId: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  if (!clientId.trim()) {
    throw new GoogleDriveError("Google Client ID is missing");
  }

  await loadGoogleIdentityServicesScript();

  if (!window.google?.accounts?.oauth2) {
    throw new GoogleDriveError("Google Identity Services is not available");
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: `${GOOGLE_DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`,
        callback: (resp) => {
          if (resp.error) {
            reject(
              new GoogleDriveError(
                resp.error_description || `Google OAuth error: ${resp.error}`,
              ),
            );
            return;
          }
          if (!resp.access_token) {
            reject(new GoogleDriveError("No access token returned by Google"));
            return;
          }
          if (resp.scope && !resp.scope.includes("drive")) {
            reject(
              new GoogleDriveError(
                "Bạn chưa tích chọn ô cho phép truy cập Google Drive trên màn hình của Google. Vui lòng bấm Đăng nhập lại và nhớ tích chọn vào ô cấp quyền.",
              ),
            );
            return;
          }
          resolve({
            accessToken: resp.access_token,
            expiresIn: resp.expires_in ?? 3599,
          });
        },
        error_callback: (err) => {
          reject(
            new GoogleDriveError(
              err instanceof Error ? err.message : "Google OAuth dialog closed or failed",
            ),
          );
        },
      });

      client.requestAccessToken({ prompt: "consent" });
    } catch (err) {
      reject(err);
    }
  });
}
