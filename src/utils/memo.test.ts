import { describe, it, expect, vi } from "vitest";
import { memoizeArray } from "./memo";

describe("memoizeArray", () => {
  it("computes once per array identity and reuses the result", () => {
    const compute = vi.fn((input: number[]) => input.length);
    const memo = memoizeArray(compute);

    const a = [1, 2, 3];
    expect(memo(a)).toBe(3);
    expect(memo(a)).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);

    // A new array (the store is immutable) invalidates the cache.
    const b = [1, 2, 3, 4];
    expect(memo(b)).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("returns the cached object by reference", () => {
    const memo = memoizeArray((input: string[]) => ({ items: [...input] }));
    const arr = ["x"];
    expect(memo(arr)).toBe(memo(arr));
    expect(memo(arr)).not.toBe(memo(["x"]));
  });
});
