/** Writing the specification to disk (File System Access API with a blob fallback). */

/** Filesystem-safe slug derived from a board name. */
export function specFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "board"}.spec.yaml`;
}

/**
 * Saves a pre-serialized specification to a `.spec.yaml` file, using the File
 * System Access API when available and falling back to a download link.
 * Exposed separately so a preview modal can save exactly what it shows.
 */
export async function downloadSpecification(yaml: string, name: string): Promise<void> {
  const fileName = specFileName(name);

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Event Modeling Specification (YAML)",
            accept: { "text/yaml": [".yaml", ".yml"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(yaml);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === "AbortError") return; // User cancelled
      // Fall through to the blob download.
    }
  }

  const blob = new Blob([yaml], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
