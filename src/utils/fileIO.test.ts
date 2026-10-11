import { describe, it, expect } from "vitest";
import { serializeProject, parseProjectFile } from "./fileIO";
import type { CanvasElement, Viewport } from "@/types";

describe("fileIO", () => {
  it("serializes and parses project file v2", () => {
    const elements: CanvasElement[] = [
      {
        id: "evt-1",
        type: "eventCard",
        x: 10,
        y: 20,
        width: 220,
        height: 120,
        data: { name: "UserSignedUp", fields: [{ name: "email", type: "string" }] },
      },
    ];
    const viewport: Viewport = {
      x: 100,
      y: 200,
      zoom: 1.5,
      screenWidth: 1280,
      screenHeight: 800,
    };

    const json = serializeProject({
      name: "My Domain",
      elements,
      viewport,
    });

    const parsed = parseProjectFile(json);
    expect(parsed.version).toBe(2);
    expect(parsed.name).toBe("My Domain");
    expect(parsed.elements.length).toBe(1);
    expect(parsed.elements[0].id).toBe("evt-1");
    expect((parsed.elements[0].data as any).name).toBe("UserSignedUp");
    expect(parsed.viewport.zoom).toBe(1.5);
  });

  it("throws error on invalid JSON", () => {
    expect(() => parseProjectFile("not json")).toThrow("Invalid JSON");
  });

  it("throws error on wrong version or corrupt shape", () => {
    const badJson = JSON.stringify({ version: 1 });
    expect(() => parseProjectFile(badJson)).toThrow("Invalid project format");
  });
});
