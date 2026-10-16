/**
 * Tiny IndexedDB wrapper for the local autosave.
 *
 * IndexedDB is used instead of localStorage so a growing change log is not
 * capped at ~5 MB. The stored value is the same v3 project object that gets
 * written to a file (structured-cloned, so no manual serialization).
 */
const DB_NAME = "event_modeling";
const DB_VERSION = 1;
const STORE_NAME = "autosave";
const AUTOSAVE_KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = fn(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Writes the autosave payload, ignoring failures (best-effort persistence). */
export async function writeAutosave(value: unknown): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.put(value, AUTOSAVE_KEY));
  } catch {
    // Ignore quota / availability errors.
  }
}

/** Reads the autosave payload, or `null` when there is none. */
export async function readAutosave<T = unknown>(): Promise<T | null> {
  try {
    const value = await withStore<T | undefined>("readonly", (store) =>
      store.get(AUTOSAVE_KEY) as IDBRequest<T | undefined>,
    );
    return value ?? null;
  } catch {
    return null;
  }
}

/** Removes the autosave payload. */
export async function clearAutosave(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(AUTOSAVE_KEY));
  } catch {
    // Ignore failures.
  }
}
