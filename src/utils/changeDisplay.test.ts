import { describe, expect, it } from "vitest";
import type { ModelElement } from "@/types";
import type { MembershipTarget } from "./changeHistory";
import { describeFieldChange, type ChangeDisplayContext } from "./changeDisplay";

const translations: Record<string, string> = {
  "changes.yes": "Yes",
  "changes.no": "No",
  "changes.labels.type": "Type",
  "changes.labels.name": "Name",
  "changes.labels.description": "Description",
  "changes.labels.cardData": "Card data",
  "changes.labels.eventTypes": "Event types",
  "changes.labels.none": "None",
  "changes.labels.emptyLane": "Empty lane",
  "changes.labels.unknown": "Unknown",
  "changes.sections.field": "Field",
  "changes.sections.rule": "Rule",
  "changes.sections.query": "Query",
  "changes.sections.state": "State",
  "changes.membership.group": "In group",
  "changes.membership.slice": "In slice",
  "changes.membership.lane": "In lane",
  "changes.membership.domain": "In domain",
};

function context(targets: Record<string, MembershipTarget> = {}): ChangeDisplayContext {
  return {
    t: (key) => translations[key] ?? key,
    typeLabel: (type) => ({ commandCard: "Command", eventCard: "Event" })[type] ?? type,
    targets,
  };
}

function model(data: Record<string, unknown> = {}): ModelElement {
  return { id: "a", type: "eventCard", data };
}

describe("describeFieldChange", () => {
  it("names the field row instead of showing a JSON pointer", () => {
    const before = model({ fields: [{ name: "id", type: "string" }] });
    const after = model({ fields: [{ name: "id", type: "number" }] });

    const change = describeFieldChange(
      { path: "/data/fields/0/type", before: "string", after: "number" },
      before,
      after,
      context(),
    );

    expect(change).toEqual({
      kind: "changed",
      label: 'Field "id" · Type',
      before: "string",
      after: "number",
    });
  });

  it("uses the new name for a rename", () => {
    const before = model({ fields: [{ name: "email", type: "string" }] });
    const after = model({ fields: [{ name: "emailAddress", type: "string" }] });

    const change = describeFieldChange(
      { path: "/data/fields/0/name", before: "email", after: "emailAddress" },
      before,
      after,
      context(),
    );

    expect(change.label).toBe('Field "emailAddress" · Name');
    expect(change.before).toBe("email");
    expect(change.after).toBe("emailAddress");
  });

  it("summarises a whole added row by its type", () => {
    const before = model({ fields: [] });
    const after = model({ fields: [{ name: "total", type: "number", isRequired: true }] });

    const change = describeFieldChange(
      {
        path: "/data/fields/0",
        before: undefined,
        after: { name: "total", type: "number", isRequired: true },
      },
      before,
      after,
      context(),
    );

    expect(change.kind).toBe("added");
    expect(change.label).toBe('Field "total"');
    expect(change.after).toBe("number *");
  });

  it("does not repeat an item name as its detail", () => {
    const change = describeFieldChange(
      { path: "/data/states/0", before: undefined, after: { name: "Active" } },
      model(),
      model({ states: [{ name: "Active" }] }),
      context(),
    );

    expect(change.label).toBe('State "Active"');
    expect(change.after).toBe("");
  });

  it("resolves membership ids to container names", () => {
    const before = model();
    const after = model();
    const change = describeFieldChange(
      { path: "/groupId", before: undefined, after: "g1" },
      before,
      after,
      context({ g1: { kind: "group", name: "Billing" } }),
    );

    expect(change).toEqual({ kind: "added", label: "In group", before: "", after: "Billing" });
  });

  it("labels a lane by the card type it holds", () => {
    const change = describeFieldChange(
      { path: "/laneId", before: "lane-1", after: "lane-2" },
      model(),
      model(),
      context({
        "lane-1": { kind: "lane", childType: "eventCard", sliceName: "Flow", index: 0 },
        "lane-2": { kind: "lane", childType: "commandCard", sliceName: "Flow", index: 1 },
      }),
    );

    expect(change).toEqual({ kind: "changed", label: "In lane", before: "Event", after: "Command" });
  });

  it("never falls back to a raw id for an unknown target", () => {
    const change = describeFieldChange(
      { path: "/sliceId", before: undefined, after: "slice-abc123" },
      model(),
      model(),
      context(),
    );

    expect(change.after).toBe("Unknown");
    expect(change.after).not.toContain("abc123");
  });

  it("summarises whole-list replacements without ids", () => {
    const change = describeFieldChange(
      {
        path: "/data/rules",
        before: ["one", "two"],
        after: ["one"],
      },
      model(),
      model(),
      context(),
    );

    expect(change.label).toBe("Rule");
    expect(change.before).toBe("one, two");
    expect(change.after).toBe("one");
  });

  it("formats booleans and query items readably", () => {
    const query = describeFieldChange(
      {
        path: "/data/queryItems/0/types/1",
        before: "OrderPlaced",
        after: "OrderShipped",
      },
      model({ queryItems: [{ types: ["OrderPlaced", "OrderShipped"], tags: [] }] }),
      model({ queryItems: [{ types: ["OrderPlaced", "OrderShipped"], tags: [] }] }),
      context(),
    );
    expect(query.label).toBe('Query "OrderPlaced | OrderShipped" · Event types');

    const flag = describeFieldChange(
      { path: "/data/fields/0/isRequired", before: false, after: true },
      model({ fields: [{ name: "id", type: "string", isRequired: true }] }),
      model({ fields: [{ name: "id", type: "string", isRequired: true }] }),
      context(),
    );
    expect(flag.before).toBe("No");
    expect(flag.after).toBe("Yes");
  });
});
