/**
 * Monotonic counter of canvas content changes.
 */
let revision = 0;

export function bumpCanvasRevision(): void {
  revision += 1;
}

export function getCanvasRevision(): number {
  return revision;
}

export function resetCanvasRevision(): void {
  revision = 0;
}
