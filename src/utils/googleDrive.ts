export interface GoogleDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
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

export function getStoredGoogleClientId(): string {
  if (typeof window === "undefined") return "";
  const fromEnv = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || "";
  if (fromEnv) return fromEnv;
  return localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "";
}

export function setStoredGoogleClientId(clientId: string) {
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
}

declare global {
  interface Window {
    google?: any;
  }
}

let activeToken: string | null = null;
let activeUser: GoogleUserProfile | null = null;

export function getActiveGoogleAuth(): GoogleDriveAuthState {
  return { accessToken: activeToken, user: activeUser };
}

export function signOutGoogle() {
  activeToken = null;
  activeUser = null;
}

/**
 * Trigger web Google Identity Services OAuth popup
 */
export async function signInWithGoogle(clientId: string): Promise<GoogleDriveAuthState> {
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

          activeToken = resp.access_token;
          try {
            activeUser = await fetchGoogleUserProfile(resp.access_token);
            resolve({ accessToken: activeToken, user: activeUser });
          } catch {
            resolve({ accessToken: activeToken, user: null });
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || "Google sign-in popup failed or was closed"));
        },
      });

      client.requestAccessToken({ prompt: "consent" });
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

export async function listDriveFiles(accessToken: string): Promise<GoogleDriveFile[]> {
  const q = "trashed = false and mimeType = 'application/json'";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to list Google Drive files (${res.status})`);
  const data = await res.json();
  return data.files || [];
}

export async function saveToGoogleDrive(
  accessToken: string,
  fileName: string,
  fileContent: string,
  existingFileId?: string | null,
): Promise<{ id: string; name: string }> {
  const boundary = "boundary_event_modeling_gdrive";
  const metadata = {
    name: fileName.endsWith(".json") ? fileName : `${fileName}.eventmodel.json`,
    mimeType: "application/json",
  };

  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${fileContent}\r\n` +
    `--${boundary}--`;

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
    body: multipartBody,
  });

  if (!res.ok) throw new Error(`Failed to save to Google Drive (${res.status})`);
  return res.json();
}

export async function downloadFromGoogleDrive(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to download from Google Drive (${res.status})`);
  return res.text();
}
