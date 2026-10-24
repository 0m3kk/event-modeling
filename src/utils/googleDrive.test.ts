import { describe, it, expect } from "vitest";
import { stripFileExtension } from "./googleDrive";

describe("stripFileExtension", () => {
  it("removes the .eventmodel extension", () => {
    expect(stripFileExtension("My Board.eventmodel")).toBe("My Board");
  });

  it("keeps earlier dots in the name", () => {
    expect(stripFileExtension("v1.2.board.eventmodel")).toBe("v1.2.board");
  });

  it("leaves names without an extension untouched", () => {
    expect(stripFileExtension("My Board")).toBe("My Board");
  });

  it("ignores an empty name or a leading dot", () => {
    expect(stripFileExtension("")).toBe("");
    expect(stripFileExtension(".eventmodel")).toBe(".eventmodel");
  });
});
