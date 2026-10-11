import { describe, it, expect } from "vitest";
import { collectBoardTagCatalog, collectBoardTags, fieldTypeKey } from "@/utils/eventTags";
import { validateStateCardData, type StateCardData } from "./rules";
import type { CanvasElement } from "@/types";

function eventCard(id: string, name: string, fields: any[]): CanvasElement {
  return { id, type: "eventCard", x: 0, y: 0, width: 220, height: 100, data: { name, fields } };
}

const board: CanvasElement[] = [
  eventCard("evt-1", "UserRegistered", [
    { name: "userId", type: "string", isTag: true, tag: "user" },
  ]),
  eventCard("evt-2", "UserEmailChanged", [
    { name: "email", type: "string", isTag: true, tag: "user" },
  ]),
];

describe("eventTags", () => {
  it("keys field types including array-ness", () => {
    expect(fieldTypeKey({ type: "string" })).toBe("string");
    expect(fieldTypeKey({ type: "string", isArray: true })).toBe("string[]");
  });

  it("collects board tags with their types and source events", () => {
    const tags = collectBoardTags(board);
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toBe("user");
    expect(tags[0].types).toEqual(["string"]);
    expect(tags[0].fromEvents.sort()).toEqual(["UserEmailChanged", "UserRegistered"]);

    const catalog = collectBoardTagCatalog(board);
    expect(catalog.get("user")?.has("string")).toBe(true);
  });
});

describe("validateStateCardData", () => {
  const base: StateCardData = {
    name: "User",
    params: [{ name: "userId", type: "string" }],
    queryItems: [{ types: ["UserRegistered"], tags: [{ tag: "user", field: "userId" }] }],
    states: [{ name: "exists", type: "boolean" }],
  };

  it("accepts a valid tag reference", () => {
    const { issues } = validateStateCardData(base, { elements: board });
    expect(issues).toHaveLength(0);
  });

  it("flags a tag that no event carries", () => {
    const data: StateCardData = {
      ...base,
      queryItems: [{ types: [], tags: [{ tag: "ghost", field: "userId" }] }],
    };
    const { issues, data: normalized } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["tag_not_found"]);
    expect(normalized.queryItems?.[0].tags).toHaveLength(0);
  });

  it("flags a tag whose param field is missing", () => {
    const data: StateCardData = {
      ...base,
      queryItems: [{ types: [], tags: [{ tag: "user", field: "nope" }] }],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["field_not_found"]);
  });

  it("flags a param field whose type mismatches the tagged event field", () => {
    const data: StateCardData = {
      ...base,
      params: [{ name: "userId", type: "number" }],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["type_mismatch"]);
  });
});
