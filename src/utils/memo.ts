/**
 * Caches a pure computation derived from an array for as long as that array is
 * alive.
 *
 * The canvas store is immutable — every change produces a *new* `elements`
 * array — so the array reference is a perfect cache key: an untouched board
 * reuses the previous result, and a changed board invalidates it automatically.
 * This turns "rescan the whole board once per card" into "rescan once per board
 * version".
 *
 * The cached result is shared between callers, so it must be treated as
 * read-only. A `WeakMap` keeps the cache from pinning old board versions in
 * memory.
 */
export function memoizeArray<T extends object, R>(compute: (input: T) => R): (input: T) => R {
  const cache = new WeakMap<T, R>();
  return (input: T): R => {
    const cached = cache.get(input);
    if (cached !== undefined) return cached;
    const result = compute(input);
    cache.set(input, result);
    return result;
  };
}
