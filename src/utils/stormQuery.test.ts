import { describe, it, expect } from "vitest";
import type {
  StormData,
  StormQueryItem,
  StormField,
  CanvasObject,
} from "@/types";
import {
  fullTagOf,
  getStormQueryItemTags,
  matchesStormQueryItem,
  matchesStormQueryTag,
  collectStateTagOptions,
  collectEventTagNamesForType,
  collectMatchingEventIds,
  renameStormEventReferences,
} from "./stormQuery";

function eventField(name: string, fieldType: string, tag?: string): StormField {
  return {
    id: `ef-${name}-${fieldType}`,
    name,
    fieldType,
    ...(tag ? { tag } : {}),
  };
}

function eventCard(
  name: string,
  fields: { name: string; fieldType: string; tag?: string }[],
): StormData {
  return {
    kind: "event",
    name,
    fields: fields.map((f) => eventField(f.name, f.fieldType, f.tag)),
  };
}

const stateData: StormData = {
  kind: "state",
  name: "OrderState",
  fields: [
    { id: "sf-id", name: "id", fieldType: "uuid", tag: "order" },
    { id: "sf-email", name: "email", fieldType: "email", tag: "email" },
    { id: "sf-total", name: "total", fieldType: "number" },
  ],
};

function stateObject(queryItems: StormQueryItem[]): CanvasObject {
  return {
    id: "state1",
    type: "storm",
    x: 0,
    y: 0,
    width: 260,
    height: 200,
    stormData: { ...stateData, queryItems },
  };
}

describe("fullTagOf", () => {
  it("composes {tag}:{fieldName} from the field", () => {
    expect(
      fullTagOf({ id: "f", name: "id", fieldType: "uuid", tag: "order" }),
    ).toBe("order:id");
  });
});

describe("getStormQueryItemTags", () => {
  it("resolves referenced state fields into (tag, type) slots", () => {
    const item: StormQueryItem = {
      id: "q1",
      types: [],
      tagFieldIds: ["sf-id", "sf-total"],
    };
    expect(getStormQueryItemTags(item, stateData)).toEqual([
      {
        tag: "order",
        fieldType: "uuid",
        fieldName: "id",
        fieldId: "sf-id",
      },
    ]);
  });

  it("skips references to deleted fields (unlinked)", () => {
    const item: StormQueryItem = {
      id: "q1",
      types: [],
      tagFieldIds: ["gone"],
    };
    expect(getStormQueryItemTags(item, stateData)).toEqual([]);
  });
});

describe("matchesStormQueryTag", () => {
  const slot = {
    tag: "order",
    fieldType: "uuid",
    fieldName: "id",
    fieldId: "sf-id",
  };

  it("matches by tag + fieldType, ignoring the event field's name", () => {
    const event = eventCard("OrderCreated", [
      { name: "orderId", fieldType: "uuid", tag: "order" },
    ]);
    expect(matchesStormQueryTag(event, slot)).toBe(true);
  });

  it("requires the same tag name", () => {
    const event = eventCard("OrderCreated", [
      { name: "orderId", fieldType: "uuid", tag: "customer" },
    ]);
    expect(matchesStormQueryTag(event, slot)).toBe(false);
  });

  it("requires the same fieldType (name alone is not enough)", () => {
    const event = eventCard("OrderCreated", [
      { name: "id", fieldType: "string", tag: "order" },
    ]);
    expect(matchesStormQueryTag(event, slot)).toBe(false);
  });
});

describe("matchesStormQueryItem", () => {
  const orderEvent = eventCard("OrderCreated", [
    { name: "orderId", fieldType: "uuid", tag: "order" },
  ]);

  it("matches all types and tags when both are empty", () => {
    expect(
      matchesStormQueryItem(
        orderEvent,
        { id: "q", types: [], tagFieldIds: [] },
        stateData,
      ),
    ).toBe(true);
  });

  it("matches by event name against the item's types (OR)", () => {
    const item: StormQueryItem = {
      id: "q",
      types: ["OrderCreated", "OrderPaid"],
      tagFieldIds: [],
    };
    expect(matchesStormQueryItem(orderEvent, item, stateData)).toBe(true);
    expect(
      matchesStormQueryItem(eventCard("OrderArchived", []), item, stateData),
    ).toBe(false);
  });

  it("ANDs the tag slots (every referenced field's filter must hold)", () => {
    const item: StormQueryItem = {
      id: "q",
      types: [],
      tagFieldIds: ["sf-id", "sf-email"],
    };
    const withBoth = eventCard("OrderCreated", [
      { name: "orderId", fieldType: "uuid", tag: "order" },
      { name: "email", fieldType: "email", tag: "email" },
    ]);
    const missingEmail = eventCard("OrderCreated", [
      { name: "orderId", fieldType: "uuid", tag: "order" },
    ]);
    expect(matchesStormQueryItem(withBoth, item, stateData)).toBe(true);
    expect(matchesStormQueryItem(missingEmail, item, stateData)).toBe(false);
  });

  it("keeps types and tags as independent filters", () => {
    const item: StormQueryItem = {
      id: "q",
      types: ["OrderCreated"],
      tagFieldIds: ["sf-id"],
    };
    const otherTypeButTagged = eventCard("OrderPaid", [
      { name: "ref", fieldType: "uuid", tag: "order" },
    ]);
    expect(matchesStormQueryItem(orderEvent, item, stateData)).toBe(true);
    expect(matchesStormQueryItem(otherTypeButTagged, item, stateData)).toBe(
      false,
    );
  });

  it("ignores unlinked tag slots", () => {
    const item: StormQueryItem = {
      id: "q",
      types: [],
      tagFieldIds: ["sf-total"],
    };
    expect(
      matchesStormQueryItem(eventCard("Anything", []), item, stateData),
    ).toBe(true);
  });
});

describe("collectStateTagOptions", () => {
  it("lists tagged fields as full tags, deduped by (tag, fieldType)", () => {
    const data: StormData = {
      kind: "state",
      name: "S",
      fields: [
        { id: "f1", name: "id", fieldType: "uuid", tag: "order" },
        { id: "f2", name: "refId", fieldType: "uuid", tag: "order" },
        { id: "f3", name: "email", fieldType: "email", tag: "email" },
        { id: "f4", name: "note", fieldType: "string" },
      ],
    };
    expect(collectStateTagOptions(data)).toEqual([
      {
        fieldId: "f1",
        tag: "order",
        fieldName: "id",
        fullTag: "order:id",
        dedupeKey: "order:uuid",
      },
      {
        fieldId: "f3",
        tag: "email",
        fieldName: "email",
        fullTag: "email:email",
        dedupeKey: "email:email",
      },
    ]);
  });
});

describe("collectMatchingEventIds", () => {
  function eventObject(name: string, data: StormData): CanvasObject {
    return {
      id: `evt-${name}`,
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 200,
      stormData: data,
    };
  }

  const created = eventCard("OrderCreated", [
    { name: "orderId", fieldType: "uuid", tag: "order" },
  ]);
  const paid = eventCard("OrderPaid", [
    { name: "paidBy", fieldType: "uuid", tag: "order" },
  ]);
  const archived = eventCard("OrderArchived", [
    { name: "email", fieldType: "email", tag: "email" },
  ]);

  it("returns event cards matching ANY query item (OR semantics)", () => {
    const events = [
      eventObject("created", created),
      eventObject("paid", paid),
      eventObject("archived", archived),
    ];
    const state = stateObject([
      { id: "q1", types: ["OrderCreated"], tagFieldIds: [] },
      { id: "q2", types: [], tagFieldIds: ["sf-email"] },
    ]);
    expect(collectMatchingEventIds(events, state)).toEqual([
      "evt-created",
      "evt-archived",
    ]);
  });

  it("matches by type, not field name", () => {
    const events = [eventObject("paid", paid)];
    const state = stateObject([
      { id: "q1", types: [], tagFieldIds: ["sf-id"] },
    ]);
    expect(collectMatchingEventIds(events, state)).toEqual(["evt-paid"]);
  });

  it("returns [] for non-state cards", () => {
    const events = [eventObject("created", created)];
    const eventObj: CanvasObject = events[0]!;
    expect(collectMatchingEventIds(events, eventObj)).toEqual([]);
  });
});

describe("collectEventTagNamesForType", () => {
  function eventObject(name: string, data: StormData): CanvasObject {
    return {
      id: `evt-${name}`,
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 200,
      stormData: data,
    };
  }

  const events = [
    eventObject(
      "created",
      eventCard("OrderCreated", [
        { name: "orderId", fieldType: "uuid", tag: "order" },
        { name: "email", fieldType: "email", tag: "email" },
        { name: "note", fieldType: "string" },
      ]),
    ),
    eventObject(
      "paid",
      eventCard("OrderPaid", [
        { name: "paidBy", fieldType: "uuid", tag: "order" },
        { name: "ref", fieldType: "uuid", tag: "customer" },
      ]),
    ),
  ];

  it("lists tag names from event fields of the same type, deduped + sorted", () => {
    expect(collectEventTagNamesForType(events, "uuid")).toEqual([
      "customer",
      "order",
    ]);
    expect(collectEventTagNamesForType(events, "email")).toEqual(["email"]);
    expect(collectEventTagNamesForType(events, "string")).toEqual([]);
  });
});

describe("renameStormEventReferences", () => {
  it("rewrites the old event name inside every query item's types", () => {
    const state = stateObject([
      { id: "q1", types: ["OrderCreated", "OrderPaid"], tagFieldIds: [] },
      { id: "q2", types: [], tagFieldIds: [] },
    ]);
    const renamed = renameStormEventReferences(
      [state],
      "OrderCreated",
      "OrderPlaced",
    );
    const items =
      renamed[0]?.type === "storm" ? renamed[0].stormData?.queryItems : [];
    expect(items?.[0]?.types).toEqual(["OrderPlaced", "OrderPaid"]);
    expect(items?.[1]?.types).toEqual([]);
  });

  it("returns original array when nothing referenced old name", () => {
    const state = stateObject([
      { id: "q1", types: ["Other"], tagFieldIds: [] },
    ]);
    const objects = [state];
    expect(renameStormEventReferences(objects, "OrderCreated", "X")).toBe(
      objects,
    );
  });
});
