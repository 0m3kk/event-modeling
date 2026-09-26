import { create } from "zustand";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import { DEFAULT_VIEWPORT, GRID_SIZE } from "@/constants/canvas";
import { stormHasFieldTypes } from "@/constants/storm";
import { moveModelRowInObject, moveStormRowInObject } from "@/utils/rowReorder";
import { buildFieldClipboard, canPasteFields } from "@/utils/fieldClipboard";
import { alignObjects, distributeObjects } from "@/utils/align";
import { componentNameOf, ensureUniqueComponentName } from "@/utils/naming";
import { arrangeStormLanes, type StormLaneCard } from "@/utils/stormLayout";
import {
  computeStormCardHeight,
  computeModelNodeHeight,
} from "@/utils/cardDimensions";
import {
  buildReferenceCopy,
  generateReferenceId,
  pruneDanglingReferences,
  syncReferenceSet,
  touchesSyncedReferenceField,
} from "@/utils/reference";
import type { CanvasObject } from "@/types";
import type { CanvasStore, CanvasStoreState } from "./types";
import { createDebouncedHandleSet } from "./historyDebounce";
import { registerHistoryBatch, beginHistoryBatch, endHistoryBatch } from "./historyBatch";
import { bumpCanvasRevision } from "@/ai/tools/canvasRevision";
import {
  appendConversationMessage,
  createAssistantMessage,
  createEmptyConversation,
  createUserMessage,
  deriveConversationTitle,
  getStoredAISettings,
  isAbortError,
  runAgent,
  storeAISettings,
} from "@/ai";

export const initialCanvasState: CanvasStoreState = {
  objects: [],
  groups: [],
  selectedIds: [],
  tool: "select",
  viewport: DEFAULT_VIEWPORT,
  isLocked: false,
  alignmentGuides: [],
  inlineEdit: null,
  typeSelect: null,
  stormSelectedField: null,
  fieldClipboard: null,
  stormActionHover: null,
  isSearchOpen: false,
  descHover: null,
  actionHover: null,

  // AI Assistant State
  aiSettings: getStoredAISettings(),
  aiConversation: createEmptyConversation(),
  aiRunning: false,
  aiError: null,
  aiUsageCount: 0,
};

let activeRun: AbortController | null = null;
let pendingHistoryCommit: { flush(): void; cancel(): void } | null = null;

/**
 * Propagate an edited object's synced fields to the rest of its reference set
 * (see utils/reference.ts). Returns the same array when there is nothing to do,
 * so callers can keep the no-op state path cheap.
 */
function syncReferenceAfterChange(
  objects: CanvasObject[],
  changedId: string,
): CanvasObject[] {
  return syncReferenceSet(objects, changedId) ?? objects;
}

export const useCanvasStore = create<CanvasStore>()(
  temporal(
    (set, get) => ({
      ...initialCanvasState,

      setTool: (tool) => set({ tool }),

      setSelectedIds: (selectedIds) => {
        const state = get();
        if (state.isLocked) return;
        // Do not update if identical
        if (
          state.selectedIds.length === selectedIds.length &&
          state.selectedIds.every((id, idx) => id === selectedIds[idx])
        ) {
          return;
        }
        set({ selectedIds });
      },

      selectObject: (id, multi = false) => {
        const { selectedIds, isLocked } = get();
        if (isLocked) return;
        if (multi) {
          if (selectedIds.includes(id)) {
            set({ selectedIds: selectedIds.filter((item) => item !== id) });
          } else {
            set({ selectedIds: [...selectedIds, id] });
          }
        } else {
          set({ selectedIds: [id] });
        }
      },

      deselectObject: (id) => {
        set((state) => ({
          selectedIds: state.selectedIds.filter((item) => item !== id),
        }));
      },

      clearSelection: () => {
        const { selectedIds, stormSelectedField } = get();
        if (selectedIds.length > 0 || stormSelectedField) {
          // A storm field selection only makes sense while its card is
          // selected, so clear both together.
          set({ selectedIds: [], stormSelectedField: null });
        }
      },

      selectAll: () => {
        const { objects, isLocked } = get();
        if (isLocked) return;
        const selectableIds = objects.filter((o) => !o.locked).map((o) => o.id);
        set({ selectedIds: selectableIds });
      },

      addObject: (object) => {
        set((state) => {
          const next = ensureUniqueComponentName(object, state.objects);
          return {
            objects: [...state.objects, next],
            selectedIds: [next.id],
          };
        });
      },

      addObjects: (newObjects) => {
        if (newObjects.length === 0) return;
        set((state) => {
          const existing = [...state.objects];
          const added = newObjects.map((obj) => {
            // Dedupe within the batch too: each accepted name joins `existing`
            // before the next object is checked.
            const next = ensureUniqueComponentName(obj, existing);
            existing.push(next);
            return next;
          });
          return {
            objects: [...state.objects, ...added],
            selectedIds: added.map((o) => o.id),
          };
        });
      },

      updateObject: (id, patch) => {
        set((state) => {
          let found = false;
          const patched = state.objects.map((obj) => {
            if (obj.id !== id) return obj;
            found = true;
            const updated = { ...obj, ...patch };
            if (
              updated.type === "storm" &&
              updated.stormData &&
              patch.stormData &&
              !patch.height
            ) {
              updated.height = computeStormCardHeight(updated.stormData);
            } else if (
              updated.type === "model" &&
              updated.modelData &&
              patch.modelData &&
              !patch.height
            ) {
              updated.height = computeModelNodeHeight(updated.modelData);
            }
            // Only chase uniqueness when the title itself changed, so editing
            // an unrelated property never renames a card.
            return componentNameOf(updated) !== componentNameOf(obj)
              ? ensureUniqueComponentName(updated, state.objects)
              : updated;
          });
          if (!found) return {};
          // Propagate synced fields (content/style/size) to linked reference
          // copies inside the same set() so undo reverts the whole thing.
          return { objects: syncReferenceAfterChange(patched, id) };
        });
      },

      updateObjects: (updates) => {
        if (updates.length === 0) return;
        // Geometry-only batches (drag, align, distribute) never carry a title,
        // so keep the original O(n) map path for them.
        const touchesNames = updates.some(
          (u) =>
            u.patch.stormData !== undefined || u.patch.modelData !== undefined,
        );
        const syncIds = updates
          .filter((u) => touchesSyncedReferenceField(u.patch))
          .map((u) => u.id);
        if (!touchesNames) {
          const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
          set((state) => {
            const mapped = state.objects.map((obj) => {
              const patch = patchMap.get(obj.id);
              return patch ? { ...obj, ...patch } : obj;
            });
            let objects = mapped;
            for (const id of syncIds) {
              objects = syncReferenceSet(objects, id) ?? objects;
            }
            return { objects };
          });
          return;
        }

        // Apply sequentially so two objects renamed in the same batch cannot
        // end up sharing a name.
        set((state) => {
          let objects = state.objects;
          for (const { id, patch } of updates) {
            const index = objects.findIndex((o) => o.id === id);
            if (index === -1) continue;
            const current = objects[index];
            const updated = { ...current, ...patch };
            const next =
              componentNameOf(updated) !== componentNameOf(current)
                ? ensureUniqueComponentName(updated, objects)
                : updated;
            if (next !== current) {
              objects = objects.map((o, i) => (i === index ? next : o));
            }
          }
          for (const id of syncIds) {
            objects = syncReferenceSet(objects, id) ?? objects;
          }
          return objects === state.objects ? {} : { objects };
        });
      },

      createReferenceCopy: (ids) =>
        set((state) => {
          if (ids.length === 0) return {};
          const idSet = new Set(ids);

          // Connectors carry per-instance geometry (endpoints, bends), so they
          // cannot meaningfully share content — reference copies are for the
          // content cards (storm, model, sticky note, text box).
          const copyable = (obj: CanvasObject) =>
            idSet.has(obj.id) && obj.type !== "connector";

          // First pass: make sure every source carries a referenceId. The copy
          // joins the source's set — if the source has never been referenced, it
          // gets a fresh set id so the pair stays linked going forward.
          const objects = state.objects.map((obj) =>
            copyable(obj) && !obj.referenceId
              ? { ...obj, referenceId: generateReferenceId() }
              : obj,
          );

          // Second pass: build the copies from the updated sources
          const clones: CanvasObject[] = [];
          const cloneIds: string[] = [];
          objects.forEach((obj) => {
            if (!copyable(obj)) return;
            const clone = buildReferenceCopy(obj);
            clones.push(clone);
            cloneIds.push(clone.id);
          });

          if (clones.length === 0) return {};

          return {
            objects: [...objects, ...clones],
            selectedIds: cloneIds,
          };
        }),

      deleteObjects: (ids) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        // Also check if any group ID is in ids (e.g. __group:gid or gid)
        const groupIdsToDelete = new Set(
          ids
            .map((id) =>
              id.startsWith("__group:") ? id.replace("__group:", "") : id,
            )
            .filter((id) => get().groups.some((g) => g.id === id)),
        );

        set((state) => ({
          groups:
            groupIdsToDelete.size > 0
              ? state.groups.filter((g) => !groupIdsToDelete.has(g.id))
              : state.groups,
          // A lone survivor of a reference set is no longer linked — drop its
          // referenceId so the badge disappears with the last sibling.
          objects: pruneDanglingReferences(
            state.objects
              .filter((obj) => {
                if (idSet.has(obj.id)) return false;
                // Also delete connectors attached to deleted objects
                if (obj.type === "connector" && obj.connectorData) {
                  if (
                    idSet.has(obj.connectorData.start.objectId) ||
                    idSet.has(obj.connectorData.end.objectId)
                  ) {
                    return false;
                  }
                }
                return true;
              })
              .map((obj) =>
                obj.groupId && groupIdsToDelete.has(obj.groupId)
                  ? { ...obj, groupId: undefined }
                  : obj,
              ),
          ),
          selectedIds: state.selectedIds.filter(
            (id) =>
              !idSet.has(id) &&
              !groupIdsToDelete.has(
                id.startsWith("__group:") ? id.replace("__group:", "") : id,
              ),
          ),
        }));
      },

      moveObjects: (ids, dx, dy, snapToGrid = false) => {
        if (ids.length === 0 || (!snapToGrid && dx === 0 && dy === 0)) return;
        const idSet = new Set(ids);
        set((state) => ({
          objects: state.objects.map((obj) => {
            if (!idSet.has(obj.id) || obj.locked) return obj;
            let nextX = obj.x + dx;
            let nextY = obj.y + dy;
            if (snapToGrid) {
              nextX = Math.round(nextX / GRID_SIZE) * GRID_SIZE;
              nextY = Math.round(nextY / GRID_SIZE) * GRID_SIZE;
            }
            return {
              ...obj,
              x: nextX,
              y: nextY,
            };
          }),
        }));
      },

      setViewport: (viewportPatch) => {
        set((state) => ({
          viewport: { ...state.viewport, ...viewportPatch },
        }));
      },

      setGroups: (groups) => set({ groups }),

      addGroup: (group) => {
        set((state) => ({
          groups: [...state.groups, group],
        }));
      },

      updateGroup: (id, patch) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, ...patch } : g,
          ),
        }));
      },

      deleteGroup: (id) => {
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
          objects: state.objects.map((obj) =>
            obj.groupId === id ? { ...obj, groupId: undefined } : obj,
          ),
        }));
      },

      selectGroup: (groupId) => {
        const { isLocked } = get();
        if (isLocked) return;
        set({ selectedIds: [`__group:${groupId}`], stormSelectedField: null });
      },

      groupObjects: (objectIds, name) => {
        const state = get();
        if (state.isLocked) return;
        const targetIds =
          objectIds && objectIds.length > 0
            ? objectIds
            : state.selectedIds.filter((id) => !id.startsWith("__group:"));

        const targetObjects = state.objects.filter(
          (o) => targetIds.includes(o.id) && o.type !== "connector",
        );
        if (targetObjects.length === 0) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const obj of targetObjects) {
          minX = Math.min(minX, obj.x);
          minY = Math.min(minY, obj.y);
          maxX = Math.max(maxX, obj.x + obj.width);
          maxY = Math.max(maxY, obj.y + obj.height);
        }

        const padding = 24;
        const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const newGroup: import("@/types").GroupInfo = {
          id: groupId,
          name: name || "Group",
          stroke: "#6366f1",
          fill: "#eef2ff",
          strokeWidth: 2,
          lineStyle: "dashed",
          tagColor: "#6366f1",
          customBounds: {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
          },
        };

        const targetIdSet = new Set(targetObjects.map((o) => o.id));
        set({
          groups: [...state.groups, newGroup],
          objects: state.objects.map((obj) =>
            targetIdSet.has(obj.id) ? { ...obj, groupId } : obj,
          ),
          selectedIds: [`__group:${groupId}`],
        });

        return groupId;
      },

      ungroupObjects: (targetIds) => {
        const state = get();
        if (state.isLocked) return;
        const ids =
          targetIds && targetIds.length > 0 ? targetIds : state.selectedIds;
        if (ids.length === 0) return;

        const groupIdsToDissolve = new Set<string>();
        const objectIdsToDetach = new Set<string>();

        for (const id of ids) {
          if (id.startsWith("__group:")) {
            groupIdsToDissolve.add(id.replace("__group:", ""));
          } else {
            const g = state.groups.find((group) => group.id === id);
            if (g) {
              groupIdsToDissolve.add(g.id);
            } else {
              objectIdsToDetach.add(id);
            }
          }
        }

        const nextObjects = state.objects.map((obj) => {
          if (
            (obj.groupId && groupIdsToDissolve.has(obj.groupId)) ||
            objectIdsToDetach.has(obj.id)
          ) {
            return { ...obj, groupId: undefined };
          }
          return obj;
        });

        const remainingGroups = state.groups.filter((g) => {
          if (groupIdsToDissolve.has(g.id)) return false;
          return nextObjects.some((o) => o.groupId === g.id);
        });

        const liberatedIds = state.objects
          .filter(
            (o) =>
              (o.groupId && groupIdsToDissolve.has(o.groupId)) ||
              objectIdsToDetach.has(o.id),
          )
          .map((o) => o.id);

        set({
          groups: remainingGroups,
          objects: nextObjects,
          selectedIds: liberatedIds.length > 0 ? liberatedIds : [],
        });
      },

      moveGroupObjects: (groupId, dx, dy, snapToGrid = false) => {
        if (dx === 0 && dy === 0) return;
        const state = get();
        const group = state.groups.find((g) => g.id === groupId);
        if (!group || group.locked) return;

        const allGroupIds = new Set<string>([groupId]);
        let added = true;
        while (added) {
          added = false;
          for (const g of state.groups) {
            if (
              g.parentId &&
              allGroupIds.has(g.parentId) &&
              !allGroupIds.has(g.id)
            ) {
              allGroupIds.add(g.id);
              added = true;
            }
          }
        }

        let effectiveDx = dx;
        let effectiveDy = dy;
        if (snapToGrid && group.customBounds) {
          const targetX =
            Math.round((group.customBounds.x + dx) / GRID_SIZE) * GRID_SIZE;
          const targetY =
            Math.round((group.customBounds.y + dy) / GRID_SIZE) * GRID_SIZE;
          effectiveDx = targetX - group.customBounds.x;
          effectiveDy = targetY - group.customBounds.y;
        }

        const nextObjects = state.objects.map((obj) => {
          if (obj.groupId && allGroupIds.has(obj.groupId) && !obj.locked) {
            return {
              ...obj,
              x: obj.x + effectiveDx,
              y: obj.y + effectiveDy,
            };
          }
          return obj;
        });

        const nextGroups = state.groups.map((g) => {
          if (allGroupIds.has(g.id) && g.customBounds) {
            return {
              ...g,
              customBounds: {
                ...g.customBounds,
                x: g.customBounds.x + effectiveDx,
                y: g.customBounds.y + effectiveDy,
              },
            };
          }
          return g;
        });

        set({
          objects: nextObjects,
          groups: nextGroups,
        });
      },

      setLocked: (locked) => {
        set({
          isLocked: locked,
          selectedIds: locked ? [] : get().selectedIds,
          tool: locked ? "hand" : "select",
        });
      },

      setAlignmentGuides: (alignmentGuides) => set({ alignmentGuides }),

      clearAlignmentGuides: () => {
        if (get().alignmentGuides.length > 0) {
          set({ alignmentGuides: [] });
        }
      },

      setStormSelectedField: (stormSelectedField) =>
        set({ stormSelectedField }),

      setStormActionHover: (stormActionHover) => set({ stormActionHover }),

      moveRow: (objectId, rowId, direction) => {
        const state = get();
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj || obj.locked) return;
        const updated =
          obj.type === "model"
            ? moveModelRowInObject(obj, rowId, direction)
            : obj.type === "storm"
              ? moveStormRowInObject(obj, rowId, direction)
              : null;
        if (!updated) return;
        set({
          objects: syncReferenceAfterChange(
            state.objects.map((o) => (o.id === obj.id ? updated : o)),
            obj.id,
          ),
        });
      },

      deleteSelectedRow: (objectId, rowId) => {
        const state = get();
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj || obj.locked) return;

        if (obj.type === "model" && obj.modelData) {
          const nextData = { ...obj.modelData };
          if (obj.modelData.kind === "object") {
            nextData.fields = (obj.modelData.fields ?? []).filter(
              (f) => f.id !== rowId,
            );
          } else if (obj.modelData.kind === "enum") {
            nextData.values = (obj.modelData.values ?? []).filter(
              (v) => v.id !== rowId,
            );
          }
          const newHeight = computeModelNodeHeight(nextData);
          set({
            objects: syncReferenceAfterChange(
              state.objects.map((o) =>
                o.id === objectId
                  ? { ...o, height: newHeight, modelData: nextData }
                  : o,
              ),
              objectId,
            ),
            stormSelectedField:
              state.stormSelectedField?.fieldId === rowId
                ? null
                : state.stormSelectedField,
          });
        } else if (obj.type === "storm" && obj.stormData) {
          const data = obj.stormData;
          const nextFields = data.fields.filter((f) => f.id !== rowId);
          const nextResponseFields = (data.responseFields ?? []).filter(
            (f) => f.id !== rowId,
          );
          const nextQueryItems = (data.queryItems ?? [])
            .filter((q) => q.id !== rowId)
            .map((q) => ({
              ...q,
              tagFieldIds: q.tagFieldIds.filter((id) => id !== rowId),
            }));
          const nextConstraints = (data.constraints ?? []).filter(
            (c) => c.id !== rowId,
          );

          const nextData = {
            ...data,
            fields: nextFields,
            responseFields: nextResponseFields,
            queryItems: nextQueryItems,
            constraints: nextConstraints,
          };

          const newHeight = computeStormCardHeight(nextData);
          set({
            objects: syncReferenceAfterChange(
              state.objects.map((o) =>
                o.id === objectId
                  ? { ...o, height: newHeight, stormData: nextData }
                  : o,
              ),
              objectId,
            ),
            stormSelectedField:
              state.stormSelectedField?.fieldId === rowId
                ? null
                : state.stormSelectedField,
          });
        }
      },

      deleteSelectedStormField: () => {
        const { stormSelectedField } = get();
        if (stormSelectedField?.fieldId) {
          get().deleteSelectedRow(
            stormSelectedField.objectId,
            stormSelectedField.fieldId,
          );
        }
      },

      copySelectedFields: () => {
        const { stormSelectedField, objects } = get();
        if (!stormSelectedField?.fieldId) return;
        const obj = objects.find((o) => o.id === stormSelectedField.objectId);
        if (!obj || obj.locked) return;
        const fieldClipboard = buildFieldClipboard(obj, [
          stormSelectedField.fieldId,
        ]);
        if (fieldClipboard) {
          set({ fieldClipboard });
        }
      },

      pasteFields: (objectId) => {
        const { fieldClipboard, objects, stormSelectedField } = get();
        if (!fieldClipboard || fieldClipboard.entries.length === 0) return;
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || !canPasteFields(obj, fieldClipboard)) return;

        const anchorId =
          stormSelectedField?.objectId === objectId
            ? stormSelectedField.fieldId
            : undefined;

        const insertAt = (list: unknown[]) => {
          if (!anchorId) return list.length;
          const idx = list.findIndex(
            (row) => (row as { id: string }).id === anchorId,
          );
          return idx >= 0 ? idx + 1 : list.length;
        };

        if (obj.type === "model" && obj.modelData?.kind === "enum") {
          const values = obj.modelData.values ?? [];
          const newValues = fieldClipboard.entries.map((e) => ({
            id: nanoid(),
            name: e.name,
            value: e.name,
            description: e.description,
          }));
          const at = insertAt(values);
          const nextValues = [
            ...values.slice(0, at),
            ...newValues,
            ...values.slice(at),
          ];
          const nextData = { ...obj.modelData, values: nextValues };
          const newHeight = computeModelNodeHeight(nextData);
          set({
            objects: syncReferenceAfterChange(
              objects.map((o) =>
                o.id === obj.id
                  ? { ...o, height: newHeight, modelData: nextData }
                  : o,
              ),
              obj.id,
            ),
            selectedIds: [obj.id],
            stormSelectedField: { objectId: obj.id, fieldId: newValues[0]!.id },
          });
          return;
        }

        if (obj.type === "model" && obj.modelData?.kind === "object") {
          const fields = obj.modelData.fields ?? [];
          const newFields = fieldClipboard.entries.map((e) => ({
            id: nanoid(),
            name: e.name,
            fieldType: e.fieldType || "string",
            required: e.required,
            description: e.description,
          }));
          const at = insertAt(fields);
          const nextFields = [
            ...fields.slice(0, at),
            ...newFields,
            ...fields.slice(at),
          ];
          const nextData = { ...obj.modelData, fields: nextFields };
          const newHeight = computeModelNodeHeight(nextData);
          set({
            objects: syncReferenceAfterChange(
              objects.map((o) =>
                o.id === obj.id
                  ? { ...o, height: newHeight, modelData: nextData }
                  : o,
              ),
              obj.id,
            ),
            selectedIds: [obj.id],
            stormSelectedField: { objectId: obj.id, fieldId: newFields[0]!.id },
          });
          return;
        }

        if (obj.type === "storm" && obj.stormData) {
          const data = obj.stormData;
          const newFields = fieldClipboard.entries.map((e) => ({
            id: nanoid(),
            name: e.name,
            fieldType: e.fieldType || "string",
            required: e.required,
            description: e.description,
            ...(e.tag ? { tag: e.tag } : {}),
          }));
          const at = insertAt(data.fields);
          const nextFields = [
            ...data.fields.slice(0, at),
            ...newFields,
            ...data.fields.slice(at),
          ];
          const nextData = { ...data, fields: nextFields };
          const newHeight = computeStormCardHeight(nextData);
          set({
            objects: syncReferenceAfterChange(
              objects.map((o) =>
                o.id === obj.id
                  ? { ...o, height: newHeight, stormData: nextData }
                  : o,
              ),
              obj.id,
            ),
            selectedIds: [obj.id],
            stormSelectedField: { objectId: obj.id, fieldId: newFields[0]!.id },
          });
        }
      },

      addStormField: (objectId, section = "params") => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked)
          return;
        const newFieldId = nanoid();
        const newField = {
          id: newFieldId,
          name: "",
          fieldType: stormHasFieldTypes(obj.stormData.kind) ? "string" : "",
          required: false,
        };

        if (section === "response" && obj.stormData.kind === "query") {
          const nextResponse = [
            ...(obj.stormData.responseFields ?? []),
            newField,
          ];
          const nextData = { ...obj.stormData, responseFields: nextResponse };
          const newHeight = computeStormCardHeight(nextData);
          set({
            objects: syncReferenceAfterChange(
              objects.map((o) =>
                o.id === obj.id
                  ? { ...o, height: newHeight, stormData: nextData }
                  : o,
              ),
              obj.id,
            ),
            selectedIds: [obj.id],
            stormSelectedField: { objectId: obj.id, fieldId: newFieldId },
          });
          return newFieldId;
        }

        const nextFields = [...obj.stormData.fields, newField];
        const nextData = { ...obj.stormData, fields: nextFields };
        const newHeight = computeStormCardHeight(nextData);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, stormData: nextData }
                : o,
            ),
            obj.id,
          ),
          selectedIds: [obj.id],
          stormSelectedField: { objectId: obj.id, fieldId: newFieldId },
        });
        return newFieldId;
      },

      addStormQueryItem: (objectId) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked)
          return;
        if (
          obj.stormData.kind !== "state" &&
          obj.stormData.kind !== "constraint"
        )
          return;
        const newId = nanoid();
        const newItem = { id: newId, types: [], tagFieldIds: [] };
        const nextQueryItems = [...(obj.stormData.queryItems ?? []), newItem];
        const nextData = { ...obj.stormData, queryItems: nextQueryItems };
        const newHeight = computeStormCardHeight(nextData);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, stormData: nextData }
                : o,
            ),
            obj.id,
          ),
          selectedIds: [obj.id],
          stormSelectedField: { objectId: obj.id, fieldId: newId },
        });
        return newId;
      },

      addStormConstraint: (objectId) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked)
          return;
        if (obj.stormData.kind !== "constraint") return;
        const newId = nanoid();
        const newConstraint = {
          id: newId,
          text: "",
        };
        const nextConstraints = [
          ...(obj.stormData.constraints ?? []),
          newConstraint,
        ];
        const nextData = { ...obj.stormData, constraints: nextConstraints };
        const newHeight = computeStormCardHeight(nextData);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, stormData: nextData }
                : o,
            ),
            obj.id,
          ),
          selectedIds: [obj.id],
          stormSelectedField: { objectId: obj.id, fieldId: newId },
        });
        return newId;
      },

      addModelField: (objectId) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "model" || !obj.modelData || obj.locked)
          return;
        if (obj.modelData.kind !== "object") return;
        const newId = nanoid();
        const newField = {
          id: newId,
          name: "",
          fieldType: "string",
        };
        const nextFields = [...(obj.modelData.fields ?? []), newField];
        const nextData = { ...obj.modelData, fields: nextFields };
        const newHeight = computeModelNodeHeight(nextData);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, modelData: nextData }
                : o,
            ),
            obj.id,
          ),
          selectedIds: [obj.id],
          stormSelectedField: { objectId: obj.id, fieldId: newId },
        });
        return newId;
      },

      addModelEnumValue: (objectId) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "model" || !obj.modelData || obj.locked)
          return;
        if (obj.modelData.kind !== "enum") return;
        const newId = nanoid();
        const newValue = {
          id: newId,
          name: "",
          value: "",
        };
        const nextValues = [...(obj.modelData.values ?? []), newValue];
        const nextData = { ...obj.modelData, values: nextValues };
        const newHeight = computeModelNodeHeight(nextData);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, modelData: nextData }
                : o,
            ),
            obj.id,
          ),
          selectedIds: [obj.id],
          stormSelectedField: { objectId: obj.id, fieldId: newId },
        });
        return newId;
      },

      alignObjects: (direction) => {
        const { objects, selectedIds, isLocked } = get();
        if (isLocked) return;
        const targets = objects.filter((o) => selectedIds.includes(o.id));
        if (targets.length < 2) return;
        const updates = alignObjects(targets, direction);
        if (updates.length > 0) {
          get().updateObjects(
            updates.map((u) => ({ id: u.id, patch: u.changes })),
          );
        }
      },

      distributeObjects: (direction) => {
        const { objects, selectedIds, isLocked } = get();
        if (isLocked) return;
        const targets = objects.filter((o) => selectedIds.includes(o.id));
        if (targets.length < 3) return;
        const updates = distributeObjects(targets, direction);
        if (updates.length > 0) {
          get().updateObjects(
            updates.map((u) => ({ id: u.id, patch: u.changes })),
          );
        }
      },

      arrangeLanes: () => {
        const { objects, isLocked } = get();
        if (isLocked) return;
        const stormCards: StormLaneCard[] = objects
          .filter((o) => o.type === "storm" && o.stormData)
          .map((o) => ({
            id: o.id,
            kind: o.stormData!.kind,
            width: o.width,
            height: o.height,
          }));
        if (stormCards.length === 0) return;

        const positions = arrangeStormLanes(stormCards, {
          laneGap: 80,
          rowGap: 40,
          origin: { x: 100, y: 100 },
        });

        const posMap = new Map(
          positions.map((p) => [p.id, { x: p.x, y: p.y }]),
        );
        const updates = objects
          .filter((o) => posMap.has(o.id))
          .map((o) => {
            const pos = posMap.get(o.id)!;
            return { id: o.id, patch: { x: pos.x, y: pos.y } };
          });

        get().updateObjects(updates);
      },

      setInlineEdit: (inlineEdit) =>
        set({ inlineEdit, ...(inlineEdit ? { typeSelect: null } : {}) }),

      setTypeSelect: (typeSelect) =>
        set({ typeSelect, ...(typeSelect ? { inlineEdit: null } : {}) }),

      setDescHover: (descHover) => set({ descHover }),

      setActionHover: (actionHover) => set({ actionHover }),

      setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),

      resetBoard: (objects = [], groups = []) => {
        set((state) => ({
          objects,
          groups,
          selectedIds: [],
          alignmentGuides: [],
          inlineEdit: null,
          typeSelect: null,
          stormSelectedField: null,
          stormActionHover: null,
          isSearchOpen: false,
          descHover: null,
          actionHover: null,
          viewport: {
            ...DEFAULT_VIEWPORT,
            // Keep the live canvas size — the engine owns it and only resyncs
            // on the next pan/zoom.
            screenWidth: state.viewport.screenWidth,
            screenHeight: state.viewport.screenHeight,
          },
        }));
      },

      setAISettings: (settings) => {
        const current = get().aiSettings;
        const merged = { ...current, ...settings };
        storeAISettings(merged);
        set({ aiSettings: merged });
      },

      sendAIMessage: async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const { aiSettings, aiConversation, aiRunning } = get();
        if (aiRunning) return;

        const isFirst = aiConversation.messages.length === 0;
        const withUser = appendConversationMessage(
          isFirst
            ? { ...aiConversation, title: deriveConversationTitle(trimmed) }
            : aiConversation,
          createUserMessage(trimmed),
        );

        set({ aiConversation: withUser, aiRunning: true, aiError: null });

        const controller = new AbortController();
        activeRun = controller;
        beginHistoryBatch();

        const conversationId = withUser.id;
        const isCurrent = () => get().aiConversation.id === conversationId;
        const patchConversation = (
          updater: (c: typeof withUser) => typeof withUser,
        ) =>
          set((state) =>
            state.aiConversation.id === conversationId
              ? { aiConversation: updater(state.aiConversation) }
              : {},
          );

        try {
          await runAgent(withUser, aiSettings, {
            getState: get,
            signal: controller.signal,
            callbacks: {
              onMessage: (msg) =>
                patchConversation((c) => appendConversationMessage(c, msg)),
              onPlan: (plan) => patchConversation((c) => ({ ...c, plan })),
              onSummary: (summary, summarizedUpTo) =>
                patchConversation((c) => ({ ...c, summary, summarizedUpTo })),
            },
          });
          set((state) => ({
            aiRunning: false,
            aiUsageCount: state.aiUsageCount + 1,
          }));
        } catch (error) {
          if (isAbortError(error)) {
            set({ aiRunning: false });
            if (isCurrent()) {
              patchConversation((c) =>
                appendConversationMessage(
                  c,
                  createAssistantMessage("Stopped.", { status: "stopped" }),
                ),
              );
            }
          } else {
            set({
              aiRunning: false,
              ...(isCurrent()
                ? {
                    aiError:
                      error instanceof Error
                        ? error.message
                        : "AI request failed.",
                  }
                : {}),
            });
          }
        } finally {
          endHistoryBatch();
          if (activeRun === controller) activeRun = null;
        }
      },

      stopAI: () => {
        activeRun?.abort();
      },

      newAIConversation: () => {
        activeRun?.abort();
        set({
          aiConversation: createEmptyConversation(),
          aiError: null,
          aiRunning: false,
        });
      },

      clearAIError: () => set({ aiError: null }),
    }),
    {
      partialize: (state) => ({
        objects: state.objects,
        groups: state.groups,
      }),
      limit: 500,
      handleSet: (handleSet) => {
        const debounced = createDebouncedHandleSet(handleSet);
        pendingHistoryCommit = debounced;
        registerHistoryBatch(debounced);
        return debounced;
      },
      equality: (pastState, currentState) => {
        if (
          pastState.objects === currentState.objects &&
          pastState.groups === currentState.groups
        ) {
          return true;
        }

        // Compare groups
        if (pastState.groups.length !== currentState.groups.length)
          return false;
        for (let i = 0; i < pastState.groups.length; i++) {
          const g1 = pastState.groups[i];
          const g2 = currentState.groups[i];
          if (
            g1.id !== g2.id ||
            g1.name !== g2.name ||
            g1.fill !== g2.fill ||
            g1.stroke !== g2.stroke ||
            g1.strokeWidth !== g2.strokeWidth ||
            g1.lineStyle !== g2.lineStyle ||
            g1.parentId !== g2.parentId ||
            g1.tagColor !== g2.tagColor ||
            g1.locked !== g2.locked ||
            g1.customBounds?.x !== g2.customBounds?.x ||
            g1.customBounds?.y !== g2.customBounds?.y ||
            g1.customBounds?.width !== g2.customBounds?.width ||
            g1.customBounds?.height !== g2.customBounds?.height
          ) {
            return false;
          }
        }

        // Compare objects
        if (pastState.objects.length !== currentState.objects.length)
          return false;
        for (let i = 0; i < pastState.objects.length; i++) {
          const o1 = pastState.objects[i];
          const o2 = currentState.objects[i];
          if (
            o1.id !== o2.id ||
            o1.x !== o2.x ||
            o1.y !== o2.y ||
            o1.width !== o2.width ||
            o1.height !== o2.height ||
            o1.locked !== o2.locked ||
            o1.groupId !== o2.groupId ||
            o1.text !== o2.text ||
            o1.fill !== o2.fill ||
            o1.stroke !== o2.stroke ||
            o1.stormData !== o2.stormData ||
            o1.modelData !== o2.modelData ||
            o1.connectorData !== o2.connectorData
          ) {
            return false;
          }
        }

        return true;
      },
    },
  ),
);

// Bump canvas revision whenever objects or groups change
useCanvasStore.subscribe((state, prevState) => {
  if (state.objects !== prevState.objects || state.groups !== prevState.groups) {
    bumpCanvasRevision();
  }
});

// Undo/Redo helper functions
export const undo = () => {
  pendingHistoryCommit?.flush();
  useCanvasStore.temporal.getState().undo();
};

export const redo = () => {
  pendingHistoryCommit?.flush();
  useCanvasStore.temporal.getState().redo();
};

export const clearHistory = () => {
  pendingHistoryCommit?.cancel();
  useCanvasStore.temporal.getState().clear();
};
export const canUndo = () =>
  useCanvasStore.temporal.getState().pastStates.length > 0;
export const canRedo = () =>
  useCanvasStore.temporal.getState().futureStates.length > 0;

export * from "./types";
export * from "./historyBatch";
