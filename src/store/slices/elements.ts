/** Element slice: board elements, their CRUD, container layout and persistence. */
import type { StateCreator } from "zustand";
import type { CanvasElement } from "@/types";
import { ensureUniqueElement, resolveUniqueDataOnUpdate } from "@/utils/naming";
import {
  createReferenceCopy as makeReferenceCopy,
  createMethodReferenceCopy,
  syncReferenceUpdates,
  syncBatchReferenceUpdates,
  syncServiceMethodCopies,
  syncBatchServiceMethodCopies,
  detachOrphanedMethodCopies,
  pruneDanglingReferences,
} from "@/utils/reference";
import { applyRenameMappings, collectRenameMappings } from "@/utils/rename";
import { cloneElementForPaste, PASTE_OFFSET_STEP } from "@/utils/clipboard";
import { planDomainArrange } from "@/tools/domainCard/arrange";
import { planGroupArrange } from "@/tools/groupCard/arrange";
import { setStoredDriveFile } from "@/utils/googleDrive";
import { patchTouchesModeling } from "@/utils/modelDiff";
import { changeRecorder } from "../recorder";
import {
  MAX_HISTORY,
  applyContainerLayout,
  dropUnchangedPatches,
  fitElementsToContent,
  normalizeDataIdentifiers,
  normalizeElementData,
  repairElementData,
  snapshotState,
} from "../helpers";
import type { CanvasStoreState } from "../types";

/**
 * How far the next paste is nudged so repeated pastes cascade instead of
 * stacking exactly. Module-scoped because it is transient UI bookkeeping and
 * should not live in the persisted project state.
 */
let pasteOffset = 0;

export type ElementSlice = Pick<
  CanvasStoreState,
  | "elements"
  | "clipboard"
  | "addElement"
  | "addElements"
  | "createReferenceCopy"
  | "createMethodCopy"
  | "copySelection"
  | "pasteClipboard"
  | "updateElement"
  | "updateElements"
  | "arrangeDomain"
  | "arrangeGroup"
  | "deleteElements"
  | "clearBoard"
  | "loadProject"
>;

export const createElementSlice: StateCreator<CanvasStoreState, [], [], ElementSlice> = (
  set,
  get,
) => ({
  elements: [],
  clipboard: [],

  addElement: (element) => {
    const current = get().elements;
    const uniqueElement = ensureUniqueElement(normalizeElementData(element, current), current);
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: applyContainerLayout(fitElementsToContent([...state.elements, uniqueElement]), current),
      selectedIds: [uniqueElement.id],
      selectedField: null,
      inlineEdit: null,
    }));
    changeRecorder.recordDiff(current, get().elements, "Add card");
  },

  addElements: (elements) => {
    const current = get().elements;
    const processed: CanvasElement[] = [];
    let running = [...current];
    for (const el of elements) {
      const uniqueEl = ensureUniqueElement(normalizeElementData(el, running), running);
      processed.push(uniqueEl);
      running.push(uniqueEl);
    }
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: applyContainerLayout(
        fitElementsToContent([...state.elements, ...processed]),
        current,
      ),
      selectedIds: processed.map((e) => e.id),
      selectedField: null,
      inlineEdit: null,
    }));
    changeRecorder.recordDiff(current, get().elements, `Add ${processed.length} cards`);
  },

  createReferenceCopy: (id) => {
    const current = get().elements;
    const source = current.find((el) => el.id === id);
    if (!source) return null;

    const { sourcePatch, copy } = makeReferenceCopy(source);
    const updatedCurrent = current.map((el) =>
      el.id === sourcePatch.id
        ? {
            ...el,
            referenceId: sourcePatch.referenceId,
            isOriginal: sourcePatch.isOriginal,
          }
        : el,
    );

    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...updatedCurrent, copy],
      selectedIds: [copy.id],
      selectedField: null,
      inlineEdit: null,
    }));
    changeRecorder.recordDiff(current, get().elements, "Create reference copy");
    return copy;
  },

  createMethodCopy: (sourceId, methodId) => {
    const current = get().elements;
    const source = current.find((el) => el.id === sourceId);
    if (!source || source.type !== "serviceCard") return null;

    // When the picked element is itself an execution copy, link the new copy to
    // the real source service so every execution shares one live link.
    const existingRef = source.data?.methodRef as
      | { serviceId: string; methodId: string }
      | undefined;
    const rootId = existingRef?.serviceId ?? sourceId;
    const rootMethodId = existingRef?.methodId ?? methodId;
    const root = current.find((el) => el.id === rootId) ?? source;

    const method = (root.data?.methods ?? []).find((m: { id: string }) => m.id === rootMethodId);
    if (!method) return null;

    const copy = createMethodReferenceCopy(root, method);
    copy.x = source.x + 30;
    copy.y = source.y + 30;

    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [...state.elements, copy],
      selectedIds: [copy.id],
      selectedField: null,
      inlineEdit: null,
    }));
    changeRecorder.recordDiff(current, get().elements, "Create method execution");
    return copy;
  },

  copySelection: () => {
    const { elements, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const picked = elements.filter((el) => idSet.has(el.id));
    if (picked.length === 0) return;
    // Reset the cascade so the first paste lands a fixed step from the source.
    pasteOffset = 0;
    set({
      clipboard: picked.map((el) => JSON.parse(JSON.stringify(el)) as CanvasElement),
    });
  },

  pasteClipboard: () => {
    const clipboard = get().clipboard;
    if (clipboard.length === 0) return;
    pasteOffset += PASTE_OFFSET_STEP;
    const copies = clipboard.map((el) => cloneElementForPaste(el, pasteOffset));
    get().addElements(copies);
  },

  updateElement: (id, patch) => {
    const current = get().elements;
    const target = current.find((el) => el.id === id);
    if (!target) return;

    const finalPatch = patch.data
      ? {
          ...patch,
          data: resolveUniqueDataOnUpdate(
            target,
            normalizeDataIdentifiers(target.type, patch.data),
            current,
          ),
        }
      : patch;

    const withReferences = syncReferenceUpdates(current, id, finalPatch);
    const withMethodCopies = syncServiceMethodCopies(withReferences, id, finalPatch);
    // Propagate any rename (Object/Enum/Alias, Event, State, DCB tag, param)
    // to the elements that reference it by name.
    const renamed = finalPatch.data
      ? applyRenameMappings(withMethodCopies, collectRenameMappings(target, finalPatch.data))
      : withMethodCopies;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      // Only re-fit when content changed; pure geometry moves (drag, resize)
      // keep the width/height the user set.
      elements: applyContainerLayout(
        finalPatch.data ? fitElementsToContent(renamed) : renamed,
        current,
      ),
    }));
    if (patchTouchesModeling(patch)) {
      changeRecorder.recordDiff(current, get().elements, "Update card");
    }
  },

  updateElements: (patches) => {
    const current = get().elements;
    const finalPatches = patches.map((patch) => {
      const target = current.find((el) => el.id === patch.id);
      if (!target || !patch.data) return patch;
      return {
        ...patch,
        data: resolveUniqueDataOnUpdate(
          target,
          normalizeDataIdentifiers(target.type, patch.data),
          current,
        ),
      };
    });

    const withReferences = syncBatchReferenceUpdates(current, finalPatches);
    const withMethodCopies = syncBatchServiceMethodCopies(withReferences, finalPatches);
    // Propagate every rename in the batch to the elements that reference it.
    const renameMappings = finalPatches.flatMap((patch) => {
      const target = patch.data ? current.find((el) => el.id === patch.id) : undefined;
      return target && patch.data ? collectRenameMappings(target, patch.data) : [];
    });
    const updatedElements = applyRenameMappings(withMethodCopies, renameMappings);
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      // Only re-fit when a patch changed content; pure geometry moves keep the
      // width/height the user set.
      elements: applyContainerLayout(
        finalPatches.some((p) => p.data) ? fitElementsToContent(updatedElements) : updatedElements,
        current,
      ),
    }));
    if (finalPatches.some(patchTouchesModeling)) {
      changeRecorder.recordDiff(current, get().elements, "Update cards");
    }
  },

  arrangeDomain: (domainId) => {
    const current = get().elements;
    const patches = planDomainArrange(current, domainId);
    if (!patches) return;

    // Keep only patches that actually change something, so pressing "Arrange"
    // twice does not stack identical undo entries.
    const effective = dropUnchangedPatches(current, patches);
    if (effective.length > 0) {
      get().updateElements(effective);
    }
  },

  arrangeGroup: (groupId) => {
    const current = get().elements;
    const patches = planGroupArrange(current, groupId);
    if (!patches) return;

    const effective = dropUnchangedPatches(current, patches);
    if (effective.length > 0) {
      get().updateElements(effective);
    }
  },

  deleteElements: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const current = get().elements;
    const remaining = current.filter((el) => !idSet.has(el.id));
    const cleaned = detachOrphanedMethodCopies(pruneDanglingReferences(remaining));

    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: applyContainerLayout(cleaned, current),
      selectedIds: state.selectedIds.filter((id) => !idSet.has(id)),
      selectedField:
        state.selectedField && idSet.has(state.selectedField.elementId)
          ? null
          : state.selectedField,
      inlineEdit:
        state.inlineEdit && idSet.has(state.inlineEdit.elementId) ? null : state.inlineEdit,
    }));
    changeRecorder.recordDiff(
      current,
      get().elements,
      ids.length === 1 ? "Delete card" : `Delete ${ids.length} cards`,
    );
  },

  clearBoard: () => {
    const current = get().elements;
    setStoredDriveFile(null);
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY), snapshotState(current)],
      redoStack: [],
      elements: [],
      selectedIds: [],
      clipboard: [],
      googleDriveFileId: null,
      googleDriveFileName: null,
    }));
    changeRecorder.recordBoardCleared();
  },

  loadProject: (project) => {
    // Existing board data is preserved as-is (no identifier rewriting); only
    // each tool's own reference repair runs.
    const normalized = project.elements.map((el) => repairElementData(el, project.elements));
    changeRecorder.setLog(project.log);
    set({
      projectName: project.name,
      projectId: project.projectId,
      projectCreatedAt: project.createdAt,
      elements: applyContainerLayout(normalized),
      selectedIds: [],
      clipboard: [],
      viewport: {
        x: project.viewport.x,
        y: project.viewport.y,
        zoom: project.viewport.zoom,
        screenWidth: get().viewport.screenWidth,
        screenHeight: get().viewport.screenHeight,
      },
      undoStack: [],
      redoStack: [],
    });
  },
});
