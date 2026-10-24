import { describe, expect, it } from "vitest";
import type { ChangeSet, ModelElement } from "@/types";
import { buildChangeHistory, isNoiseChange } from "./changeHistory";

function model(id: string, data: Record<string, unknown> = {}, extra: Partial<ModelElement> = {}): ModelElement {
  return { id, type: "eventCard", data, ...extra };
}

function changeSet(events: ChangeSet["events"], seq = 1): ChangeSet {
  return { id: `cs-${seq}`, seq, at: "", actor: "ai", events };
}

describe("buildChangeHistory", () => {
  it("folds edits made in the same change set into the creation", () => {
    const history = buildChangeHistory([
      changeSet([
        { t: "created", el: model("a", { name: "Draft" }) },
        { t: "patched", id: "a", ops: [{ op: "replace", path: "/data/name", value: "Final" }] },
      ]),
    ]);

    expect(history).toHaveLength(1);
    expect(history[0].items).toEqual([
      {
        kind: "created",
        id: "a",
        type: "eventCard",
        model: model("a", { name: "Final" }),
      },
    ]);
  });

  it("collapses repeated edits into one net change", () => {
    const history = buildChangeHistory(
      [
        changeSet([
          { t: "patched", id: "a", ops: [{ op: "replace", path: "/data/name", value: "B" }] },
          { t: "patched", id: "a", ops: [{ op: "replace", path: "/data/name", value: "C" }] },
        ]),
      ],
      [model("a", { name: "A" })],
    );

    const items = history[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("updated");
    if (items[0].kind === "updated") {
      expect(items[0].fields).toEqual([{ path: "/data/name", before: "A", after: "C" }]);
    }
  });

  it("drops internal link bookkeeping and empty change sets", () => {
    const history = buildChangeHistory(
      [
        changeSet([
          {
            t: "patched",
            id: "a",
            ops: [
              { op: "add", path: "/referenceId", value: "ref-1" },
              { op: "add", path: "/isOriginal", value: true },
            ],
          },
        ]),
      ],
      [model("a", { name: "A" })],
    );

    expect(history).toEqual([]);
    expect(isNoiseChange("/referenceId")).toBe(true);
    expect(isNoiseChange("/isOriginal")).toBe(true);
    expect(isNoiseChange("/data/lanes/2/id")).toBe(true);
    expect(isNoiseChange("/data/name")).toBe(false);
  });

  it("cancels a creation that is deleted within the same change set", () => {
    const history = buildChangeHistory([
      changeSet([
        { t: "created", el: model("a", { name: "Temp" }) },
        { t: "deleted", id: "a" },
      ]),
    ]);

    expect(history).toEqual([]);
  });

  it("reports updates before a deletion as a single deletion", () => {
    const history = buildChangeHistory(
      [
        changeSet([
          { t: "patched", id: "a", ops: [{ op: "replace", path: "/data/name", value: "B" }] },
          { t: "deleted", id: "a" },
        ]),
      ],
      [model("a", { name: "A" })],
    );

    expect(history[0].items.map((item) => item.kind)).toEqual(["deleted"]);
  });

  it("expands an added list item into its own change row", () => {
    const beforeFields = [
      { name: "id", type: "string" },
      { name: "total", type: "number" },
    ];
    const afterFields = [...beforeFields, { name: "note", type: "string" }];

    const history = buildChangeHistory(
      [
        changeSet([
          { t: "patched", id: "a", ops: [{ op: "replace", path: "/data/fields", value: afterFields }] },
        ]),
      ],
      [model("a", { name: "Order", fields: beforeFields })],
    );

    const item = history[0].items[0];
    expect(item.kind).toBe("updated");
    if (item.kind === "updated") {
      expect(item.fields).toEqual([
        { path: "/data/fields/2", before: undefined, after: { name: "note", type: "string" } },
      ]);
    }
  });

  it("keeps the whole-list row when an existing item also changed", () => {
    const beforeFields = [{ name: "id", type: "string" }];
    const afterFields = [
      { name: "id", type: "number" },
      { name: "note", type: "string" },
    ];

    const history = buildChangeHistory(
      [
        changeSet([
          { t: "patched", id: "a", ops: [{ op: "replace", path: "/data/fields", value: afterFields }] },
        ]),
      ],
      [model("a", { name: "Order", fields: beforeFields })],
    );

    const item = history[0].items[0];
    if (item.kind === "updated") {
      expect(item.fields).toHaveLength(1);
      expect(item.fields[0].path).toBe("/data/fields");
    }
  });

  it("resolves membership ids to human-recognisable targets", () => {
    const group = model("g1", { name: "Billing" }, { type: "groupCard" });
    const domain = model("d1", { name: "Sales" }, { type: "domainCard" });
    const slice = model(
      "s1",
      { name: "Place Order", lanes: [{ id: "lane-1", childType: "commandCard" }] },
      { type: "sliceCard" },
    );
    const card = model("c1", { name: "PlaceOrder" });

    const history = buildChangeHistory(
      [
        changeSet([
          {
            t: "patched",
            id: "c1",
            ops: [
              { op: "add", path: "/groupId", value: "g1" },
              { op: "add", path: "/domainId", value: "d1" },
              { op: "add", path: "/sliceId", value: "s1" },
              { op: "add", path: "/laneId", value: "lane-1" },
            ],
          },
        ]),
      ],
      [group, domain, slice, card],
    );

    expect(history[0].targets).toEqual({
      g1: { kind: "group", name: "Billing" },
      d1: { kind: "domain", name: "Sales" },
      s1: { kind: "slice", name: "Place Order" },
      "lane-1": { kind: "lane", childType: "commandCard", sliceName: "Place Order", index: 0 },
    });
  });
});
