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
      params: [{ name: "userId", type: "float" }],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["type_mismatch"]);
  });

  it("flags a query event type that is not on the board", () => {
    const data: StateCardData = {
      ...base,
      queryItems: [{ types: ["GhostEvent"], tags: [] }],
    };
    const { issues, data: normalized } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["event_type_not_found"]);
    expect(normalized.queryItems?.[0].types).toHaveLength(0);
  });

  it("accepts an event type that exists on the board", () => {
    const data: StateCardData = {
      ...base,
      queryItems: [{ types: ["UserRegistered"], tags: [] }],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues).toHaveLength(0);
  });

  it("flags a param/state type that is neither primitive nor defined", () => {
    const data: StateCardData = {
      name: "User",
      params: [{ name: "userId", type: "Ghost" }],
      states: [{ name: "exists", type: "" }],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["type_unknown", "type_missing"]);
  });

  it("accepts a defined Object type on a param", () => {
    const withObject = [
      ...board,
      {
        id: "obj-1",
        type: "objectCard",
        x: 0,
        y: 0,
        width: 220,
        height: 100,
        data: { name: "Address", fields: [] },
      } as CanvasElement,
    ];
    const data: StateCardData = {
      name: "User",
      params: [{ name: "address", type: "Address" }],
      states: [{ name: "exists", type: "boolean" }],
    };
    const { issues } = validateStateCardData(data, { elements: withObject });
    expect(issues).toHaveLength(0);
  });

  it("flags a param that has no traceable source", () => {
    const data: StateCardData = {
      name: "User",
      params: [{ name: "ghostField", type: "string" }],
      queryItems: [],
      states: [{ name: "exists", type: "boolean" }],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["param_source_unknown"]);
  });

  it("accepts a param whose name matches a Command input", () => {
    const withCommand = [
      ...board,
      {
        id: "cmd-1",
        type: "commandCard",
        x: 0,
        y: 0,
        width: 220,
        height: 100,
        data: { name: "RegisterUser", inputs: [{ name: "referralCode", type: "string" }] },
      } as CanvasElement,
    ];
    const data: StateCardData = {
      name: "User",
      params: [{ name: "referralCode", type: "string" }],
      states: [{ name: "exists", type: "boolean" }],
    };
    const { issues } = validateStateCardData(data, { elements: withCommand });
    expect(issues).toHaveLength(0);
  });

  it("accepts an Enum-typed param and a system-value param", () => {
    const withEnum = [
      ...board,
      {
        id: "enum-1",
        type: "enumCard",
        x: 0,
        y: 0,
        width: 220,
        height: 100,
        data: { name: "Currency", fields: [{ name: "USD" }, { name: "EUR" }] },
      } as CanvasElement,
    ];
    const data: StateCardData = {
      name: "User",
      params: [
        { name: "currency", type: "Currency" },
        { name: "timeNow", type: "string" },
      ],
      states: [{ name: "exists", type: "boolean" }],
    };
    const { issues } = validateStateCardData(data, { elements: withEnum });
    expect(issues).toHaveLength(0);
  });

  it("flags a state field that merely echoes a param of the same name", () => {
    const data: StateCardData = {
      name: "User",
      params: [{ name: "userId", type: "string" }],
      queryItems: [],
      states: [
        { name: "userId", type: "string" },
        { name: "exists", type: "boolean" },
      ],
    };
    const { issues } = validateStateCardData(data, { elements: board });
    expect(issues.map((i) => i.code)).toEqual(["state_echoes_param"]);
  });
});
