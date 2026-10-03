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
export const GOOGLE_OAUTH_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_SCOPES = `${GOOGLE_DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`;

const GOOGLE_LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000;

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

function pickGoogleClientId(env: Record<string, string> | undefined | null): string {
  const webClientId = (env && env.VITE_GOOGLE_CLIENT_ID) || "";
  if (webClientId) return webClientId.trim();
  // The desktop (Tauri) build uses a separate "Desktop app" OAuth client
  // because loopback redirects are only allowed for that client type.
  if (isTauriEnvironment()) {
    return ((env && env.VITE_GOOGLE_DESKTOP_CLIENT_ID) || "").trim();
  }
  return "";
}

export function getGoogleDriveEnv(): { clientId: string; accessToken: string } {
  if (customEnv !== null) {
    return {
      clientId: pickGoogleClientId(customEnv),
      accessToken: (customEnv.VITE_GOOGLE_ACCESS_TOKEN || "").trim(),
    };
  }
  const env =
    typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env;

  return {
    clientId: pickGoogleClientId(env || undefined),
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

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafeToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

export function getGoogleDesktopOAuthEnv(): { clientId: string; clientSecret: string } {
  const env =
    customEnv ??
    (typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string> }).env
      : undefined);
  return {
    clientId: ((env && env.VITE_GOOGLE_DESKTOP_CLIENT_ID) || "").trim(),
    clientSecret: ((env && env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET) || "").trim(),
  };
}

/**
 * Desktop (Tauri) sign-in.
 *
 * Tauri's webview blocks `window.open`, so the Google Identity Services popup
 * flow can never work there ("Failed to open popup window"). Instead we open
 * Google's consent page in the system browser and capture the redirect on a
 * temporary loopback server (`http://127.0.0.1:<port>`), using the
 * authorization code + PKCE flow that Google recommends for desktop apps.
 */
export async function requestGoogleDriveAccessTokenViaLoopback(
  fallbackClientId: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const desktopEnv = getGoogleDesktopOAuthEnv();
  const clientId = (desktopEnv.clientId || fallbackClientId).trim();
  if (!clientId) {
    throw new GoogleDriveError("Google Client ID is missing");
  }

  const [{ start, cancel, onUrl, onInvalidUrl }, { openUrl }] = await Promise.all([
    import("@fabianlars/tauri-plugin-oauth"),
    import("@tauri-apps/plugin-opener"),
  ]);

  const port = await start();
  const redirectUri = `http://127.0.0.1:${port}`;
  const codeVerifier = randomUrlSafeToken(32);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = randomUrlSafeToken(16);

  const authUrl = new URL(GOOGLE_OAUTH_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "consent");

  let unlistenUrl: (() => void) | undefined;
  let unlistenInvalid: (() => void) | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const authorizationCode = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new GoogleDriveError(String(error)));
      };

      const handleCallback = (callbackUrl: string) => {
        if (settled) return;
        try {
          const url = new URL(callbackUrl);
          const oauthError = url.searchParams.get("error");
          if (oauthError) {
            fail(new GoogleDriveError(`Google OAuth error: ${oauthError}`));
            return;
          }
          if (url.searchParams.get("state") !== state) {
            fail(
              new GoogleDriveError(
                "Google OAuth state mismatch (possible CSRF). Please try again.",
              ),
            );
            return;
          }
          const code = url.searchParams.get("code");
          if (!code) {
            fail(new GoogleDriveError("No authorization code returned by Google"));
            return;
          }
          settled = true;
          resolve(code);
        } catch (error) {
          fail(error);
        }
      };

      onUrl(handleCallback)
        .then((unlisten) => {
          unlistenUrl = unlisten;
        })
        .catch(fail);
      onInvalidUrl((message) => fail(new GoogleDriveError(message)))
        .then((unlisten) => {
          unlistenInvalid = unlisten;
        })
        .catch(fail);

      timeoutId = setTimeout(
        () => fail(new GoogleDriveError("Google sign-in timed out. Please try again.")),
        GOOGLE_LOOPBACK_TIMEOUT_MS,
      );

      openUrl(authUrl.toString()).catch(fail);
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    if (desktopEnv.clientSecret) {
      body.set("client_secret", desktopEnv.clientSecret);
    }

    const res = await driveHttpFetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      let errorCode = "";
      let errorDetail = "";
      try {
        const errJson = (await res.json()) as {
          error?: string;
          error_description?: string;
        };
        errorCode = errJson.error || "";
        errorDetail = errJson.error_description || errJson.error || "";
      } catch {
        // ignore
      }
      const needsDesktopClient =
        res.status === 400 &&
        (errorCode === "redirect_uri_mismatch" ||
          errorCode === "invalid_request" ||
          /redirect_uri/i.test(errorDetail));
      throw new GoogleDriveError(
        needsDesktopClient
          ? 'Google OAuth chưa hỗ trợ loopback cho client hiện tại. Hãy tạo một OAuth client loại "Desktop app" trong Google Cloud Console rồi đặt client ID vào VITE_GOOGLE_DESKTOP_CLIENT_ID (tùy chọn: VITE_GOOGLE_DESKTOP_CLIENT_SECRET).'
          : errorDetail
            ? `Google OAuth token error: ${errorDetail}`
            : `Failed to exchange Google authorization code (${res.status})`,
        res.status,
      );
    }

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!data.access_token) {
      throw new GoogleDriveError("No access token returned by Google");
    }
    if (data.scope && !data.scope.includes("drive")) {
      throw new GoogleDriveError(
        "Bạn chưa tích chọn ô cho phép truy cập Google Drive trên màn hình của Google. Vui lòng bấm Đăng nhập lại và nhớ tích chọn vào ô cấp quyền.",
      );
    }
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 3599,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    unlistenUrl?.();
    unlistenInvalid?.();
    try {
      await cancel(port);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function requestGoogleDriveAccessToken(
  clientId: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  if (!clientId.trim()) {
    throw new GoogleDriveError("Google Client ID is missing");
  }

  // Tauri's webview cannot open the GIS popup, so use the loopback flow there.
  // The browser build keeps using the GIS token client popup.
  if (isTauriEnvironment()) {
    return requestGoogleDriveAccessTokenViaLoopback(clientId);
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
