/**
 * History (undo/redo) recording debounce for storm-app
 *
 * Coalesces rapid bursts of changes (e.g. dragging an object across 60 mousemove frames)
 * into a single undoable step by preserving the first state before the gesture began.
 */

export const HISTORY_DEBOUNCE_MS = 400;

export interface DebouncedHandleSet<TArgs extends unknown[]> {
  (...args: TArgs): void;
  flush(): void;
  cancel(): void;
  hold(): void;
  release(): void;
}

export function createDebouncedHandleSet<TArgs extends unknown[]>(
  commit: (...args: TArgs) => void,
  waitMs: number = HISTORY_DEBOUNCE_MS,
): DebouncedHandleSet<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TArgs | null = null;
  let holdCount = 0;

  const commitPending = () => {
    const args = pending;
    pending = null;
    timer = null;
    if (args) commit(...args);
  };

  const debounced = ((...args: TArgs) => {
    if (pending === null) pending = args;
    if (holdCount > 0) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(commitPending, waitMs);
  }) as DebouncedHandleSet<TArgs>;

  debounced.flush = () => {
    if (timer !== null) clearTimeout(timer);
    commitPending();
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  debounced.hold = () => {
    holdCount += 1;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  debounced.release = () => {
    if (holdCount === 0) return;
    holdCount -= 1;
    if (holdCount === 0) commitPending();
  };

  return debounced;
}
