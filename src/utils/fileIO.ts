import type { CanvasObject, GroupInfo, Viewport } from "@/types";

export const STORM_FILE_VERSION = 1;
export const AUTOSAVE_STORAGE_KEY = "storm_app_autosave_v1";
export const BACKUP_STORAGE_KEY = "storm_app_backup_v1";

export interface StormProjectFile {
  version: 1;
  name?: string;
  createdAt: string;
  updatedAt: string;
  objects: CanvasObject[];
  groups: GroupInfo[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export class StormFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StormFileError";
  }
}

let customStorage: Storage | null = null;

export function setStorageForTesting(storage: Storage | null): void {
  customStorage = storage;
}

function safeLocalStorage(): Storage | null {
  if (customStorage) return customStorage;
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined" &&
      typeof window.localStorage.getItem === "function"
    ) {
      return window.localStorage;
    }
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function"
    ) {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

export function serializeStormFile(data: {
  objects: CanvasObject[];
  groups: GroupInfo[];
  viewport?: Viewport;
  name?: string;
}): string {
  const file: StormProjectFile = {
    version: STORM_FILE_VERSION,
    name: data.name || "Untitled Project",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objects: data.objects,
    groups: data.groups,
    viewport: data.viewport
      ? {
          x: data.viewport.x,
          y: data.viewport.y,
          zoom: data.viewport.zoom,
        }
      : undefined,
  };
  return JSON.stringify(file, null, 2);
}

export function parseAndValidateStormFile(json: string): StormProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StormFileError("Invalid JSON file");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new StormFileError("File content is not an object");
  }

  const record = parsed as Record<string, unknown>;

  if (record.version !== STORM_FILE_VERSION && record.version !== undefined) {
    // If version is provided, ensure it is supported
    if (typeof record.version !== "number") {
      throw new StormFileError("Invalid file version format");
    }
  }

  if (!Array.isArray(record.objects)) {
    throw new StormFileError("Missing 'objects' array in project file");
  }

  // Validate objects have minimal valid fields
  for (const obj of record.objects) {
    if (!obj || typeof obj !== "object") {
      throw new StormFileError("Corrupt object entry in file");
    }
    const o = obj as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.type !== "string") {
      throw new StormFileError("Object missing required id or type");
    }
    if (typeof o.x !== "number" || typeof o.y !== "number") {
      throw new StormFileError(`Object '${o.id}' has invalid coordinates`);
    }
  }

  const groups = Array.isArray(record.groups)
    ? (record.groups as GroupInfo[])
    : [];

  return {
    version: STORM_FILE_VERSION,
    name: typeof record.name === "string" ? record.name : "Imported Project",
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : new Date().toISOString(),
    objects: record.objects as CanvasObject[],
    groups,
    viewport:
      record.viewport && typeof record.viewport === "object"
        ? (record.viewport as { x: number; y: number; zoom: number })
        : undefined,
  };
}

export function downloadStormFile(
  file: StormProjectFile,
  filename?: string,
): void {
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const baseName = (filename || file.name || "project")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_");
  a.href = url;
  a.download = `${baseName}.storm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readStormFile(file: File): Promise<StormProjectFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const project = parseAndValidateStormFile(text);
        resolve(project);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new StormFileError("Failed to read file"));
    reader.readAsText(file);
  });
}

// ============================================================================
// Local-First Auto-save
// ============================================================================

export function saveAutoSave(data: {
  objects: CanvasObject[];
  groups: GroupInfo[];
  viewport?: Viewport;
  name?: string;
}): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    const serialized = serializeStormFile(data);
    storage.setItem(AUTOSAVE_STORAGE_KEY, serialized);
    return true;
  } catch (err) {
    console.error("Auto-save to localStorage failed:", err);
    return false;
  }
}

export function loadAutoSave(): StormProjectFile | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const item = storage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!item) return null;
    return parseAndValidateStormFile(item);
  } catch (err) {
    console.warn("Failed to load auto-saved project from localStorage:", err);
    return null;
  }
}

export function clearAutoSave(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(AUTOSAVE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ============================================================================
// Auto-backup before file replace / restore
// ============================================================================

export function createBackup(data: {
  objects: CanvasObject[];
  groups: GroupInfo[];
  viewport?: Viewport;
  name?: string;
}): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    const serialized = serializeStormFile(data);
    storage.setItem(BACKUP_STORAGE_KEY, serialized);
    return true;
  } catch (err) {
    console.error("Failed to create backup in localStorage:", err);
    return false;
  }
}

export function getBackup(): StormProjectFile | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const item = storage.getItem(BACKUP_STORAGE_KEY);
    if (!item) return null;
    return parseAndValidateStormFile(item);
  } catch {
    return null;
  }
}

export function hasBackup(): boolean {
  return getBackup() !== null;
}

export function restoreBackup(currentData: {
  objects: CanvasObject[];
  groups: GroupInfo[];
  viewport?: Viewport;
  name?: string;
}): StormProjectFile {
  const backup = getBackup();
  if (!backup) {
    throw new StormFileError("No backup found to restore");
  }

  // Swap current data into backup slot so the restore can be undone / reversed
  createBackup(currentData);

  return backup;
}
