export interface GoogleDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

/**
 * Error thrown when a Google Drive API request fails.
 * Carries the HTTP status plus the raw reason/message returned by Google
 * so the UI can show *why* the request was rejected (disabled API,
 * missing scope, insufficient file permission, quota, ...) instead of a
 * bare status code.
 */
export class GoogleDriveApiError extends Error {
  status: number;
  reason: string;

  constructor(status: number, message: string, reason = "") {
    super(message);
    this.name = "GoogleDriveApiError";
    this.status = status;
    this.reason = reason;
  }
}

async function toGoogleDriveError(res: Response, fallback: string): Promise<GoogleDriveApiError> {
  let detail = "";
  let reason = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || "";
    reason = body?.error?.errors?.[0]?.reason || body?.error?.status || "";
  } catch {
    // Response had no JSON body; keep the fallback message.
  }
  const suffix = detail ? `: ${detail}` : "";
  return new GoogleDriveApiError(res.status, `${fallback} (${res.status})${suffix}`, reason);
}

export interface GoogleUserProfile {
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleDriveAuthState {
  accessToken: string | null;
  user: GoogleUserProfile | null;
}

const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
const CLIENT_ID_STORAGE_KEY = "event_modeling_gdrive_client_id";
const DRIVE_FILE_STORAGE_KEY = "event_modeling_gdrive_last_file";
const DRIVE_FOLDER_STORAGE_KEY = "event_modeling_gdrive_folder_path";
const AUTH_STORAGE_KEY = "event_modeling_gdrive_auth";

/**
 * Cached Google OAuth session. Google Identity Services only issues
 * short-lived access tokens (no refresh token in the browser flow), so we keep
 * the token plus its expiry and reuse it until it lapses. This is what lets a
 * returning visitor skip the sign-in prompt while the token is still valid.
 */
interface StoredDriveAuth {
  accessToken: string;
  expiresAt: number;
  user: GoogleUserProfile | null;
}

function readStoredAuth(): StoredDriveAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.accessToken === "string" && parsed.accessToken) {
      return {
        accessToken: parsed.accessToken,
        expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0,
        user: parsed.user ?? null,
      };
    }
  } catch {
    // Ignore malformed or inaccessible storage.
  }
  return null;
}

function writeStoredAuth(auth: StoredDriveAuth | null) {
  if (typeof window === "undefined") return;
  try {
    if (!auth) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // Persistence is best-effort; ignore quota/security errors.
  }
}

export function getStoredGoogleClientId(): string {
  if (typeof window === "undefined") return "";
  const fromEnv = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || "";
  if (fromEnv) return fromEnv;
  return localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "";
}

export function setStoredGoogleClientId(clientId: string) {
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
}

/**
 * Reference to the Google Drive file the current board is linked to. Kept in
 * localStorage so that "Save to Drive" keeps overwriting the same file after a
 * page reload instead of silently creating a duplicate.
 */
export interface DriveFileRef {
  id: string;
  name: string;
}

export function getStoredDriveFile(): DriveFileRef | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRIVE_FILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && parsed.id) {
      return {
        id: parsed.id,
        name: typeof parsed.name === "string" ? parsed.name : "",
      };
    }
  } catch {
    // Ignore malformed or inaccessible storage.
  }
  return null;
}

export function setStoredDriveFile(ref: DriveFileRef | null) {
  if (typeof window === "undefined") return;
  try {
    if (!ref) {
      localStorage.removeItem(DRIVE_FILE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DRIVE_FILE_STORAGE_KEY, JSON.stringify(ref));
  } catch {
    // Persistence is best-effort; ignore quota/security errors.
  }
}

declare global {
  interface Window {
    google?: any;
  }
}

let activeToken: string | null = null;
let activeUser: GoogleUserProfile | null = null;
let activeExpiresAt = 0;
let authRestored = false;

/**
 * Lazily pull the cached session from localStorage the first time auth state is
 * read, dropping it if the token has already expired.
 */
function restoreStoredAuth() {
  if (authRestored) return;
  authRestored = true;
  const stored = readStoredAuth();
  if (!stored) return;
  if (stored.expiresAt > Date.now()) {
    activeToken = stored.accessToken;
    activeExpiresAt = stored.expiresAt;
    activeUser = stored.user;
  } else {
    writeStoredAuth(null);
  }
}

export function getActiveGoogleAuth(): GoogleDriveAuthState {
  restoreStoredAuth();
  if (activeToken && activeExpiresAt <= Date.now()) {
    activeToken = null;
    activeUser = null;
    activeExpiresAt = 0;
    writeStoredAuth(null);
  }
  return { accessToken: activeToken, user: activeUser };
}

export function signOutGoogle() {
  const token = activeToken;
  activeToken = null;
  activeUser = null;
  activeExpiresAt = 0;
  writeStoredAuth(null);
  // Best-effort: revoke the token so it can't be reused.
  if (token) {
    try {
      window.google?.accounts?.oauth2?.revoke?.(token, () => {});
    } catch {
      // Ignore revoke failures; local sign-out already succeeded.
    }
  }
}

/**
 * Trigger web Google Identity Services OAuth popup.
 *
 * With `silent: true` no UI is shown: GIS returns a fresh token if the browser
 * still has a Google session and consent was granted before. Used to restore a
 * session automatically when the cached token has expired.
 */
export async function signInWithGoogle(
  clientId: string,
  options: { silent?: boolean } = {},
): Promise<GoogleDriveAuthState> {
  if (!clientId.trim()) {
    throw new Error("Google Client ID is missing");
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services script is not loaded yet. Please try again.");
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: GOOGLE_DRIVE_SCOPE,
        callback: async (resp: any) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          if (!resp.access_token) {
            reject(new Error("No access token returned from Google"));
            return;
          }

          const expiresIn = typeof resp.expires_in === "number" ? resp.expires_in : 3600;
          activeToken = resp.access_token;
          activeExpiresAt = Date.now() + expiresIn * 1000;

          try {
            activeUser = await fetchGoogleUserProfile(resp.access_token);
          } catch {
            activeUser = null;
          }

          writeStoredAuth({
            accessToken: resp.access_token,
            expiresAt: activeExpiresAt,
            user: activeUser,
          });
          resolve({ accessToken: activeToken, user: activeUser });
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || "Google sign-in popup failed or was closed"));
        },
      });

      client.requestAccessToken({ prompt: options.silent ? "" : "consent" });
    } catch (err) {
      reject(err);
    }
  });
}

export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google profile");
  const data = await res.json();
  return {
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
}

/**
 * Folder the user chose to save new boards into. The array is the full path
 * from My Drive down to the selected folder (empty means My Drive root), which
 * lets the picker reopen exactly where the user left off.
 */
export type DriveFolderPath = GoogleDriveFolder[];

export function getStoredDriveFolderPath(): DriveFolderPath {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRIVE_FOLDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is GoogleDriveFolder =>
          entry && typeof entry.id === "string" && typeof entry.name === "string",
      );
    }
  } catch {
    // Ignore malformed or inaccessible storage.
  }
  return [];
}

export function setStoredDriveFolderPath(path: DriveFolderPath) {
  if (typeof window === "undefined") return;
  try {
    if (!path.length) {
      localStorage.removeItem(DRIVE_FOLDER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DRIVE_FOLDER_STORAGE_KEY, JSON.stringify(path));
  } catch {
    // Persistence is best-effort; ignore quota/security errors.
  }
}

/**
 * Remove the trailing file extension purely for display, so the Drive list
 * shows "My Board" instead of "My Board.eventmodel".
 */
export function stripFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const match = trimmed.match(/^(.*)\.[^.]+$/);
  return match && match[1] ? match[1] : trimmed;
}

export async function listDriveFiles(accessToken: string): Promise<GoogleDriveFile[]> {
  const q =
    "trashed = false and (mimeType = 'application/json' or mimeType = 'application/octet-stream')";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw await toGoogleDriveError(res, "Failed to list Google Drive files");
  const data = await res.json();
  return data.files || [];
}

/**
 * Lists the folders directly under `parentId` (null means My Drive root).
 *
 * The app only requests the `drive.file` scope, so this returns the folders the
 * app itself can see — which is exactly the set it is allowed to save into.
 */
export async function listDriveFolders(
  accessToken: string,
  parentId: string | null,
): Promise<GoogleDriveFolder[]> {
  const parent = parentId ? `'${parentId}'` : "'root'";
  const q = `${parent} in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw await toGoogleDriveError(res, "Failed to list Google Drive folders");
  const data = await res.json();
  return data.files || [];
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId: string | null,
): Promise<GoogleDriveFolder> {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
  );

  if (!res.ok) throw await toGoogleDriveError(res, "Failed to create Google Drive folder");
  return res.json();
}

async function uploadDriveFile(
  accessToken: string,
  fileName: string,
  fileBytes: Uint8Array,
  existingFileId: string | null,
  folderId?: string | null,
): Promise<{ id: string; name: string }> {
  const boundary = "boundary_event_modeling_gdrive";
  const name = fileName.endsWith(".eventmodel") ? fileName : `${fileName}.eventmodel`;
  const metadata = {
    name,
    mimeType: "application/octet-stream",
    // Only set the parent on creation: an update keeps the file where it is.
    ...(!existingFileId && folderId ? { parents: [folderId] } : {}),
  };

  const body = new Blob([
    `--${boundary}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    `${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\n`,
    `Content-Type: application/octet-stream\r\n\r\n`,
    fileBytes as BlobPart,
    `\r\n--${boundary}--`,
  ]);

  const isUpdate = Boolean(existingFileId);
  const url = isUpdate
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: isUpdate ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) throw await toGoogleDriveError(res, "Failed to save to Google Drive");
  return res.json();
}

export async function saveToGoogleDrive(
  accessToken: string,
  fileName: string,
  fileBytes: Uint8Array,
  existingFileId?: string | null,
  folderId?: string | null,
): Promise<{ id: string; name: string }> {
  if (existingFileId) {
    try {
      return await uploadDriveFile(accessToken, fileName, fileBytes, existingFileId);
    } catch (err) {
      // The stored id may point to a file that was deleted, moved to the
      // trash, or created by a different client/session. Under the
      // `drive.file` scope that yields 403/404, so fall back to creating a
      // fresh file instead of failing the save.
      if (err instanceof GoogleDriveApiError && (err.status === 403 || err.status === 404)) {
        return await uploadDriveFile(accessToken, fileName, fileBytes, null, folderId);
      }
      throw err;
    }
  }
  return await uploadDriveFile(accessToken, fileName, fileBytes, null, folderId);
}

export async function downloadFromGoogleDrive(
  accessToken: string,
  fileId: string,
): Promise<Uint8Array> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw await toGoogleDriveError(res, "Failed to download from Google Drive");
  return new Uint8Array(await res.arrayBuffer());
}
