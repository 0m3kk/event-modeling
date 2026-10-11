import {
  type ProjectFileV2,
  ProjectFileV2Schema,
  type CanvasElement,
  type Viewport,
} from "@/types";

export const AUTOSAVE_STORAGE_KEY = "event_modeling_autosave_v2";

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
    throw new Error(`Invalid project format: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }
  return result.data;
}

/**
 * Save project to local file system using File System Access API or dynamic download link.
 */
export async function saveProjectToFile(
  projectData: { name: string; elements: CanvasElement[]; viewport: Viewport },
): Promise<void> {
  const json = serializeProject(projectData);
  const fileName = `${projectData.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "board"}.eventmodel.json`;

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Event Modeling Project",
            accept: { "application/json": [".json", ".eventmodel.json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === "AbortError") return; // User cancelled
      // Fallback to blob download
    }
  }

  // Fallback: browser download link
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open project from local file using File System Access API or hidden input.
 */
export async function openProjectFromFile(): Promise<ProjectFileV2 | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Event Modeling Project",
            accept: { "application/json": [".json", ".eventmodel.json"] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const content = await file.text();
      return parseProjectFile(content);
    } catch (err: any) {
      if (err.name === "AbortError") return null;
      // Fallback
    }
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve(parseProjectFile(text));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

// Auto-save helpers
export function saveToAutoSave(projectData: {
  name: string;
  elements: CanvasElement[];
  viewport: Viewport;
}) {
  try {
    const json = serializeProject(projectData);
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, json);
  } catch {
    // Ignore quota errors
  }
}

export function loadFromAutoSave(): ProjectFileV2 | null {
  try {
    const json = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!json) return null;
    return parseProjectFile(json);
  } catch {
    return null;
  }
}
