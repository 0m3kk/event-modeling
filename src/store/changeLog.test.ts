import { describe, it, expect, beforeEach } from "vitest";
import "@/tools";
import { useCanvasStore } from "./index";
import { changeRecorder } from "./recorder";
import { serializeProjectV3, parseProjectBytes } from "@/utils/projectFile";
import { buildChangeHistory } from "@/utils/changeHistory";
import type { CanvasElement } from "@/types";

function card(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: "eventCard",
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    data: { name: `Evt${id}`, fields: [{ name: "id", type: "string" }] },
    ...overrides,
  };
}

describe("change log integration", () => {
  beforeEach(() => {
    changeRecorder.reset();
    useCanvasStore.setState({
      elements: [],
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      projectName: "Test Board",
    });
  });

  it("records modeling edits and rebuilds the board from the log", () => {
    const store = useCanvasStore.getState();
    store.addElement(card("a"));
    store.updateElement("a", {
      data: { name: "Renamed", fields: [{ name: "id", type: "string" }] },
      x: 999, // geometry: goes to the UI sidecar, not the log
    });
    store.addElement(card("b"));
    changeRecorder.flush();

    const log = changeRecorder.getLog();
    expect(log.length).toBeGreaterThan(0);

    const before = useCanvasStore.getState().elements;
    const viewport = useCanvasStore.getState().viewport;
    const bytes = serializeProjectV3({
      name: "Board",
      elements: before,
      viewport,
      log,
      id: "p1",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const loaded = parseProjectBytes(bytes);
    useCanvasStore.setState({ elements: [] });
    useCanvasStore.getState().loadProject(loaded);

    const after = useCanvasStore.getState().elements;
    const simplify = (els: CanvasElement[]) =>
      els
        .map((el) => ({ id: el.id, data: el.data, x: el.x, y: el.y }))
        .sort((l, r) => l.id.localeCompare(r.id));
    expect(simplify(after)).toEqual(simplify(before));
    // Geometry survived via the sidecar.
    expect(after.find((el) => el.id === "a")?.x).toBe(999);
  });

  it("derives field-level before/after for the change history", () => {
    const store = useCanvasStore.getState();
    store.addElement(card("a"));
    // Commit the creation first, so the edit is a separate change set.
    changeRecorder.flush();
    store.updateElement("a", {
      data: { name: "Evta", fields: [{ name: "id", type: "number" }] },
    });
    changeRecorder.flush();

    const history = buildChangeHistory(changeRecorder.getLog());
    const update = history
      .flatMap((entry) => entry.items)
      .find((item) => item.kind === "updated");
    expect(update).toBeTruthy();
    if (update && update.kind === "updated") {
      const typeField = update.fields.find((f) => f.path === "/data/fields/0/type");
      expect(typeField).toEqual({
        path: "/data/fields/0/type",
        before: "string",
        after: "number",
      });
    }
  });
});
