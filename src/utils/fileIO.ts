import type { CanvasElement, ChangeSet, ProjectFileV2, ProjectFileV3, Viewport } from "@/types";
import { ProjectFileV2Schema } from "@/types";
import {
  buildProjectV3,
  parseProjectBytes,
  projectToLoaded,
  projectV2ToLoaded,
  serializeProjectV3,
  type LoadedProject,
} from "./projectFile";
import { readAutosave, writeAutosave, clearAutosave } from "./persist/idb";

/** Legacy localStorage key from the v2 full-JSON autosave. */
export const LEGACY_AUTOSAVE_STORAGE_KEY = "event_modeling_autosave_v2";

const FILE_EXTENSION = ".eventmodel";
const FILE_MIME = "application/octet-stream";

// --- v2 JSON helpers (kept for backward compatibility + tests) -------------

export function serializeProject(data: {
  name: string;
  elements: CanvasElement[];
  viewport: Viewport;
}): string {
  const project: ProjectFileV2 = {
    version: 2,
    id: `project-${Date.now().toString(36)}`,
    name: data.name || "Untitled Board",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: {
      x: data.viewport.x,
      y: data.viewport.y,
      zoom: data.viewport.zoom,
    },
    elements: data.elements,
    groups: [],
  };
  return JSON.stringify(project, null, 2);
}

export function parseProjectFile(json: string): ProjectFileV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON file");
  }

  const result = ProjectFileV2Schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid project format: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return result.data;
}

// --- v3 file save / open ---------------------------------------------------

export interface ProjectSaveInput {
  name: string;
  elements: CanvasElement[];
  viewport: Viewport;
  log: ChangeSet[];
  id?: string;
  createdAt?: string;
}

function projectFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "board";
  return `${slug}${FILE_EXTENSION}`;
}

/**
 * Saves the project as a CBOR `.eventmodel` file using the File System Access
 * API when available, or a dynamic download link otherwise.
 */
export async function saveProjectToFile(input: ProjectSaveInput): Promise<void> {
  const bytes = serializeProjectV3({ ...input, withCheckpoint: true });
  const fileName = projectFileName(input.name);

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Event Modeling Project",
            accept: { [FILE_MIME]: [FILE_EXTENSION] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === "AbortError") return; // User cancelled
      // Fallback to blob download
    }
  }

  const blob = new Blob([bytes as BlobPart], { type: FILE_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Opens a project file (v3 CBOR or legacy v2 JSON) from disk. */
export async function openProjectFromFile(): Promise<LoadedProject | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Event Modeling Project",
            accept: { [FILE_MIME]: [FILE_EXTENSION], "application/json": [".json"] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      return parseProjectBytes(new Uint8Array(buffer));
    } catch (err: any) {
      if (err.name === "AbortError") return null;
      // Fallback
    }
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${FILE_EXTENSION},.json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        resolve(parseProjectBytes(new Uint8Array(buffer)));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

// --- Autosave (IndexedDB) --------------------------------------------------

/** Builds the autosave project object (no checkpoint; replay rebuilds state). */
export function buildAutosaveProject(input: ProjectSaveInput): ProjectFileV3 {
  return buildProjectV3({ ...input, snapshot: null });
}

export async function saveToAutoSave(project: ProjectFileV3): Promise<void> {
  await writeAutosave(project);
}

export async function loadFromAutoSave(): Promise<LoadedProject | null> {
  const project = await readAutosave<ProjectFileV3>();
  if (!project || project.format !== "eventmodel" || project.version !== 3) return null;
  return projectToLoaded(project);
}

/** Whether an autosave payload exists in IndexedDB. */
export async function hasAutoSave(): Promise<boolean> {
  return (await readAutosave()) != null;
}

/**
 * One-time migration of the legacy localStorage autosave into a loaded project.
 * Removes the old key once read so it is not migrated twice.
 */
export function loadLegacyAutoSave(): LoadedProject | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const json = window.localStorage.getItem(LEGACY_AUTOSAVE_STORAGE_KEY);
    if (!json) return null;
    const project = parseProjectFile(json);
    window.localStorage.removeItem(LEGACY_AUTOSAVE_STORAGE_KEY);
    return projectV2ToLoaded(project);
  } catch {
    return null;
  }
}

export { clearAutosave };
