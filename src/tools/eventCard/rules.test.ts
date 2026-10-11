import { describe, it, expect } from "vitest";
import { validateEventCardData } from "./rules";
import type { EventCardData } from "./index";
import type { CanvasElement } from "@/types";

function eventCard(id: string, name: string, fields: any[]): CanvasElement {
  return { id, type: "eventCard", x: 0, y: 0, width: 220, height: 100, data: { name, fields } };
}

const board: CanvasElement[] = [
  eventCard("evt-1", "UserRegistered", [
    { name: "userId", type: "string", isTag: true, tag: "user" },
  ]),
  eventCard("evt-2", "AddressDefined", [
    { name: "address", type: "Address" },
  ]),
];

const objectCard: CanvasElement = {
  id: "obj-1",
  type: "objectCard",
  x: 0,
  y: 0,
  width: 220,
  height: 100,
  data: { name: "Address", fields: [] },
};

describe("validateEventCardData", () => {
  it("accepts primitive and defined field types", () => {
    const data: EventCardData = {
      name: "UserRegistered",
      fields: [
        { name: "id", type: "uuid" },
        { name: "address", type: "Address" },
      ],
    };
    const { issues } = validateEventCardData(data, { elements: [...board, objectCard] });
    expect(issues).toHaveLength(0);
  });

  it("flags a type that is neither primitive nor defined", () => {
    const data: EventCardData = {
      name: "UserRegistered",
      fields: [{ name: "id", type: "Ghost" }],
    };
    const { issues } = validateEventCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["type_unknown"]);
    expect(issues[0].path).toBe("fields[0].type");
  });

  it("flags a missing type", () => {
    const data: EventCardData = {
      name: "UserRegistered",
      fields: [{ name: "id", type: "" }],
    };
    const { issues } = validateEventCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["type_missing"]);
  });

  it("allows reusing an existing tag with the same type", () => {
    const data: EventCardData = {
      name: "UserEmailChanged",
      fields: [{ name: "userId", type: "string", tag: "user" }],
    };
    const { issues } = validateEventCardData(data, { elements: board });
    expect(issues).toHaveLength(0);
  });

  it("rejects reusing an existing tag with a different type", () => {
    const data: EventCardData = {
      name: "UserEmailChanged",
      fields: [{ name: "userId", type: "number", tag: "user" }],
    };
    const { issues } = validateEventCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["tag_type_conflict"]);
    expect(issues[0].path).toBe("fields[0].tag");
  });

  it("rejects the same tag used with two different types in one card", () => {
    const data: EventCardData = {
      name: "Confusing",
      fields: [
        { name: "a", type: "string", tag: "shared" },
        { name: "b", type: "number", tag: "shared" },
      ],
    };
    const { issues } = validateEventCardData(data, { elements: [] });
    expect(issues.map((i) => i.code)).toEqual(["tag_type_conflict"]);
  });

  it("treats string and string[] as different types for a tag", () => {
    const data: EventCardData = {
      name: "UserTagged",
      fields: [{ name: "userId", type: "string", isArray: true, tag: "user" }],
    };
    const { issues } = validateEventCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["tag_type_conflict"]);
  });
});
