/**
 * History batch registry for storm-app
 * Allows AI turns or multi-step operations to be grouped into a single undo step.
 */

export interface HistoryBatchHandle {
  hold(): void;
  release(): void;
}

let handle: HistoryBatchHandle | null = null;

export function registerHistoryBatch(next: HistoryBatchHandle | null): void {
  handle = next;
}

export function beginHistoryBatch(): void {
  handle?.hold();
}

export function endHistoryBatch(): void {
  handle?.release();
}
