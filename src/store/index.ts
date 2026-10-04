import { create } from "zustand";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import { DEFAULT_VIEWPORT, GRID_SIZE } from "@/constants/canvas";
import {
  DEFAULT_FIELD_TYPE,
  normalizeFieldType,
  normalizeObjectFieldTypes,
} from "@/constants/fieldType";
import {
  bddDefaultRefForPhase,
  stormHasFieldTypes,
  stormHasInputFields,
  stormHasResponseFields,
  stormHasValidation,
} from "@/constants/storm";
import { moveModelRowInObject, moveStormRowInObject } from "@/utils/rowReorder";
import { buildFieldClipboard, canPasteFields } from "@/utils/fieldClipboard";
import {
  buildObjectClipboard,
  buildPastedObjects,
} from "@/utils/objectClipboard";
import { alignObjects, distributeObjects } from "@/utils/align";
import { componentNameOf, ensureUniqueComponentName } from "@/utils/naming";
import { arrangeStormLanes, type StormLaneCard } from "@/utils/stormLayout";
import {
  findAdoptableLines,
  getObjectUnionBounds,
  groupHasContent,
  recomputeGroupBoundsForObjects,
  recomputeGroupBoundsForGroupIds,
  refitGroupSeparators,
  reparentChildrenOfRemovedGroups,
} from "@/utils/groupBounds";
import {
  findFreeSpot,
  getGroupObstacleRects,
  snapMembersNearGroup,
  type Rect,
} from "@/utils/placement";
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
import type { CanvasObject, GroupInfo } from "@/types";
import type { BddStep } from "@/types";
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
  MAX_AGENT_ITERATIONS,
  runAgent,
  storeAISettings,
} from "@/ai";

/** True when a patch changes an object's placement, size, or group. */
function patchTouchesGeometry(patch: Partial<CanvasObject>): boolean {
  return (
    patch.x !== undefined ||
    patch.y !== undefined ||
    patch.width !== undefined ||
    patch.height !== undefined ||
    patch.groupId !== undefined
  );
}

/**
 * Re-fit the separator lines of every affected group whose geometry changed.
 *
 * A group is refitted only when one of `changedIds` is a card inside it, so
 * dragging a separator by hand (or creating separator lines) is never fought.
 */
function applySeparatorRefit(
  objects: CanvasObject[],
  groups: GroupInfo[],
  affectedGroupIds: Iterable<string>,
  changedIds: Iterable<string>,
): CanvasObject[] {
  const groupIds = [...affectedGroupIds];
  if (groupIds.length === 0) return objects;

  const changed = new Set(changedIds);
  if (changed.size === 0) return objects;

  let next = objects;
  for (const groupId of groupIds) {
    const hasChangedCard = next.some(
      (o) =>
        changed.has(o.id) &&
        o.groupId === groupId &&
        o.type !== "connector" &&
        o.type !== "line",
    );
    if (!hasChangedCard) continue;
    next = refitGroupSeparators(next, groups, groupId);
  }
  return next;
}

export const initialCanvasState: CanvasStoreState = {
  projectName: "Untitled",
  googleDriveFileId: null,
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
  validationTarget: null,
  bddStepPopup: null,
  queryItemPopup: null,
  validationHover: null,
  mappingTarget: null,
  mappingHover: null,
  fieldClipboard: null,
  objectClipboard: null,
  stormActionHover: null,
  aiHighlightIds: [],
  isSearchOpen: false,
  descHover: null,
  actionHover: null,
  modelPopupChain: [],
  isDragging: false,

  // AI Assistant State
  aiSettings: getStoredAISettings(),
  aiConversation: createEmptyConversation(),
  aiRunning: false,
  aiError: null,
  aiUsageCount: 0,
  aiStepUsed: 0,
  aiStepLimit: MAX_AGENT_ITERATIONS,
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
          // Selecting a different card drops any step/query popover from the old one.
          set({ selectedIds: [id], bddStepPopup: null, queryItemPopup: null });
        }
      },

      deselectObject: (id) => {
        set((state) => ({
          selectedIds: state.selectedIds.filter((item) => item !== id),
        }));
      },

      clearSelection: () => {
        const {
          selectedIds,
          stormSelectedField,
          modelPopupChain,
          bddStepPopup,
          queryItemPopup,
        } = get();
        if (
          selectedIds.length > 0 ||
          stormSelectedField ||
          modelPopupChain.length > 0 ||
          bddStepPopup ||
          queryItemPopup
        ) {
          // A storm field selection only makes sense while its card is
          // selected, so clear both together. Also clear active model popups.
          set({
            selectedIds: [],
            stormSelectedField: null,
            modelPopupChain: [],
            bddStepPopup: null,
            queryItemPopup: null,
          });
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
          let next = ensureUniqueComponentName(object, state.objects);
          if (next.groupId) {
            const snap = snapMembersNearGroup(
              state.objects,
              state.groups,
              next.groupId,
              [next],
            ).get(next.id);
            if (snap) next = { ...next, x: snap.x, y: snap.y };
          }
          let objects = [...state.objects, next];
          if (next.groupId) {
            objects = applySeparatorRefit(
              objects,
              state.groups,
              [next.groupId],
              [next.id],
            );
          }
          const groups = next.groupId
            ? recomputeGroupBoundsForGroupIds(objects, state.groups, [
                next.groupId,
              ])
            : state.groups;
          return {
            objects,
            groups,
            selectedIds: [next.id],
          };
        });
      },

      addObjects: (newObjects) => {
        if (newObjects.length === 0) return;
        set((state) => {
          const existing = [...state.objects];
          const added: CanvasObject[] = [];
          for (const obj of newObjects) {
            // Dedupe within the batch too: each accepted name joins `existing`
            // before the next object is checked.
            let next = ensureUniqueComponentName(obj, existing);
            if (next.groupId) {
              // Pull a member added far away back next to its group's cluster.
              const snap = snapMembersNearGroup(
                [...state.objects, ...added],
                state.groups,
                next.groupId,
                [next],
              ).get(next.id);
              if (snap) next = { ...next, x: snap.x, y: snap.y };
            }
            added.push(next);
            existing.push(next);
          }
          const affectedGroupIds = new Set<string>();
          for (const obj of added) {
            if (obj.groupId) affectedGroupIds.add(obj.groupId);
          }
          let objects = [...state.objects, ...added];
          if (affectedGroupIds.size > 0) {
            objects = applySeparatorRefit(
              objects,
              state.groups,
              affectedGroupIds,
              added.map((o) => o.id),
            );
          }
          const groups =
            affectedGroupIds.size > 0
              ? recomputeGroupBoundsForGroupIds(
                  objects,
                  state.groups,
                  affectedGroupIds,
                )
              : state.groups;
          return {
            objects,
            groups,
            selectedIds: added.map((o) => o.id),
          };
        });
      },

      updateObject: (id, patch) => {
        const patchTouchesGeom = patchTouchesGeometry(patch);
        set((state) => {
          let found = false;
          let oldGroupId: string | undefined;
          let dimsChanged = false;
          const patched = state.objects.map((obj) => {
            if (obj.id !== id) return obj;
            found = true;
            oldGroupId = obj.groupId;
            const updated = { ...obj, ...patch };
            if (
              updated.type === "storm" &&
              updated.stormData &&
              (patch.stormData || patch.width !== undefined) &&
              !patch.height
            ) {
              updated.height = computeStormCardHeight(
                updated.stormData,
                updated.width,
              );
            } else if (
              updated.type === "model" &&
              updated.modelData &&
              patch.modelData &&
              !patch.height
            ) {
              updated.height = computeModelNodeHeight(updated.modelData);
            }
            if (updated.height !== obj.height || updated.width !== obj.width) {
              dimsChanged = true;
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
          const objects = syncReferenceAfterChange(patched, id);
          const touchesGeometry = patchTouchesGeom || dimsChanged;
          if (!touchesGeometry) return { objects };
          const updatedObj = objects.find((o) => o.id === id);
          const affectedGroupIds = new Set<string>();
          if (oldGroupId) affectedGroupIds.add(oldGroupId);
          if (updatedObj?.groupId) affectedGroupIds.add(updatedObj.groupId);
          const refitted = applySeparatorRefit(
            objects,
            state.groups,
            affectedGroupIds,
            [id],
          );
          return {
            objects: refitted,
            groups:
              affectedGroupIds.size > 0
                ? recomputeGroupBoundsForGroupIds(
                    refitted,
                    state.groups,
                    affectedGroupIds,
                  )
                : state.groups,
          };
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
        const geometryIds = updates
          .filter((u) => patchTouchesGeometry(u.patch))
          .map((u) => u.id);
        if (!touchesNames) {
          const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
          set((state) => {
            const affectedGroupIds = new Set<string>();
            const mapped = state.objects.map((obj) => {
              const patch = patchMap.get(obj.id);
              if (!patch) return obj;
              if (obj.groupId) affectedGroupIds.add(obj.groupId);
              if (patch.groupId) affectedGroupIds.add(patch.groupId);
              return { ...obj, ...patch };
            });
            let objects = mapped;
            for (const id of syncIds) {
              objects = syncReferenceSet(objects, id) ?? objects;
            }
            for (const gid of geometryIds) {
              const o = objects.find((x) => x.id === gid);
              if (o?.groupId) affectedGroupIds.add(o.groupId);
            }
            if (affectedGroupIds.size === 0) return { objects };
            // Keep group boundaries enclosing their members while dragging.
            const refitted = applySeparatorRefit(
              objects,
              state.groups,
              affectedGroupIds,
              geometryIds,
            );
            return {
              objects: refitted,
              groups: recomputeGroupBoundsForGroupIds(
                refitted,
                state.groups,
                affectedGroupIds,
              ),
            };
          });
          return;
        }

        // Apply sequentially so two objects renamed in the same batch cannot
        // end up sharing a name.
        set((state) => {
          let objects = state.objects;
          const affectedGroupIds = new Set<string>();
          for (const { id, patch } of updates) {
            const index = objects.findIndex((o) => o.id === id);
            if (index === -1) continue;
            const current = objects[index];
            if (current.groupId) affectedGroupIds.add(current.groupId);
            if (patch.groupId) affectedGroupIds.add(patch.groupId);
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
          if (objects === state.objects) return {};
          for (const gid of geometryIds) {
            const o = objects.find((x) => x.id === gid);
            if (o?.groupId) affectedGroupIds.add(o.groupId);
          }
          if (affectedGroupIds.size === 0) return { objects };
          const refitted = applySeparatorRefit(
            objects,
            state.groups,
            affectedGroupIds,
            geometryIds,
          );
          return {
            objects: refitted,
            groups: recomputeGroupBoundsForGroupIds(
              refitted,
              state.groups,
              affectedGroupIds,
            ),
          };
        });
      },

      createReferenceCopy: (ids) =>
        set((state) => {
          if (ids.length === 0) return {};
          const idSet = new Set(ids);

          // Connectors and lines carry per-instance geometry (endpoints,
          // bends), so they cannot meaningfully share content — reference
          // copies are for the content cards (storm, model, sticky, text).
          const copyable = (obj: CanvasObject) =>
            idSet.has(obj.id) &&
            obj.type !== "connector" &&
            obj.type !== "line";

          // First pass: make sure every source carries a referenceId. The copy
          // joins the source's set — if the source has never been referenced, it
          // gets a fresh set id so the pair stays linked going forward.
          const objects = state.objects.map((obj) =>
            copyable(obj) && !obj.referenceId
              ? { ...obj, referenceId: generateReferenceId() }
              : obj,
          );

          // Second pass: build the copies and drop each one into genuinely
          // free space. A fixed offset would land the copy on top of the source
          // (and, for a flow reusing it, on top of an existing Section frame).
          const groupObstacles = getGroupObstacleRects(state.groups);
          const placedRects: Rect[] = [];
          const clones: CanvasObject[] = [];
          const cloneIds: string[] = [];
          for (const obj of objects) {
            if (!copyable(obj)) continue;
            const clone = buildReferenceCopy(obj);
            const spot = findFreeSpot(
              objects,
              { width: clone.width ?? 0, height: clone.height ?? 0 },
              { x: clone.x, y: clone.y },
              { obstacles: [...groupObstacles, ...placedRects] },
            );
            clone.x = spot.x;
            clone.y = spot.y;
            placedRects.push({
              x: spot.x,
              y: spot.y,
              width: clone.width ?? 0,
              height: clone.height ?? 0,
            });
            clones.push(clone);
            cloneIds.push(clone.id);
          }

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

        set((state) => {
          const affectedGroupIds = new Set<string>();
          for (const obj of state.objects) {
            if (idSet.has(obj.id) && obj.groupId) {
              affectedGroupIds.add(obj.groupId);
            }
          }

          // Groups in the delete selection are dissolved: their member objects
          // detach, their child groups re-parent to the nearest surviving
          // ancestor, and connectors pointing at them are dropped.
          const reparentedGroups = reparentChildrenOfRemovedGroups(
            state.groups,
            groupIdsToDelete,
          );

          const nextObjects = pruneDanglingReferences(
            state.objects
              .filter((obj) => {
                if (idSet.has(obj.id)) return false;
                // Also delete connectors attached to deleted objects or groups.
                if (obj.type === "connector" && obj.connectorData) {
                  const { start, end } = obj.connectorData;
                  if (
                    idSet.has(start.objectId) ||
                    idSet.has(end.objectId) ||
                    groupIdsToDelete.has(start.objectId) ||
                    groupIdsToDelete.has(end.objectId)
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
          );

          // Retain groups that still have members or child groups.
          const groupsForContent = reparentedGroups.filter(
            (g) => !groupIdsToDelete.has(g.id),
          );
          const survivingGroups = groupsForContent.filter((g) =>
            groupHasContent(g.id, nextObjects, groupsForContent),
          );

          // A re-parented child changes its new parent's bounds.
          for (const g of state.groups) {
            if (g.parentId && groupIdsToDelete.has(g.parentId)) {
              const reparented = reparentedGroups.find((r) => r.id === g.id);
              if (reparented?.parentId) {
                affectedGroupIds.add(reparented.parentId);
              }
            }
          }

          const nextGroups = recomputeGroupBoundsForGroupIds(
            nextObjects,
            survivingGroups,
            affectedGroupIds,
          );

          return {
            groups: nextGroups,
            objects: nextObjects,
            selectedIds: state.selectedIds.filter(
              (id) =>
                !idSet.has(id) &&
                !groupIdsToDelete.has(
                  id.startsWith("__group:") ? id.replace("__group:", "") : id,
                ),
            ),
          };
        });
      },

      moveObjects: (ids, dx, dy, snapToGrid = false) => {
        if (ids.length === 0 || (!snapToGrid && dx === 0 && dy === 0)) return;
        const idSet = new Set(ids);
        set((state) => {
          const objects = state.objects.map((obj) => {
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
          });
          const affectedGroupIds = new Set<string>();
          for (const obj of objects) {
            if (idSet.has(obj.id) && obj.groupId) {
              affectedGroupIds.add(obj.groupId);
            }
          }
          const refitted = applySeparatorRefit(
            objects,
            state.groups,
            affectedGroupIds,
            idSet,
          );
          return {
            objects: refitted,
            // Keep group boundaries enclosing their members as they move.
            groups: recomputeGroupBoundsForObjects(
              refitted,
              state.groups,
              idSet,
            ),
          };
        });
      },

      setViewport: (viewportPatch) => {
        set((state) => {
          const current = state.viewport;
          const next = { ...current, ...viewportPatch };
          // Pan/zoom publishes land here once per frame; skip the store write
          // (and every React subscriber it would wake) when nothing moved.
          if (
            next.x === current.x &&
            next.y === current.y &&
            next.zoom === current.zoom &&
            next.screenWidth === current.screenWidth &&
            next.screenHeight === current.screenHeight
          ) {
            return {};
          }
          return { viewport: next };
        });
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
        set((state) => {
          const target = state.groups.find((g) => g.id === id);
          const groupIdsToDissolve = new Set<string>([id]);

          // Child groups rise to the nearest surviving ancestor instead of
          // being orphaned by their parent's removal.
          const reparentedGroups = reparentChildrenOfRemovedGroups(
            state.groups,
            groupIdsToDissolve,
          );

          const nextObjects = state.objects
            .filter((obj) => {
              if (obj.type === "connector" && obj.connectorData) {
                const { start, end } = obj.connectorData;
                if (start.objectId === id || end.objectId === id) {
                  return false;
                }
              }
              return true;
            })
            .map((obj) =>
              obj.groupId === id ? { ...obj, groupId: undefined } : obj,
            );

          const groupsForContent = reparentedGroups.filter(
            (g) => g.id !== id,
          );
          const remainingGroups = groupsForContent.filter((g) =>
            groupHasContent(g.id, nextObjects, groupsForContent),
          );

          const affectedGroupIds = new Set<string>();
          if (target?.parentId) affectedGroupIds.add(target.parentId);
          for (const g of state.groups) {
            if (g.parentId === id) {
              const reparented = reparentedGroups.find((r) => r.id === g.id);
              if (reparented?.parentId) {
                affectedGroupIds.add(reparented.parentId);
              }
            }
          }

          const nextGroups = recomputeGroupBoundsForGroupIds(
            nextObjects,
            remainingGroups,
            affectedGroupIds,
          );

          return {
            groups: nextGroups,
            objects: nextObjects,
          };
        });
      },

      selectGroup: (groupId, multi = false) => {
        const { selectedIds, isLocked } = get();
        if (isLocked) return;
        const gid = `__group:${groupId}`;
        if (multi) {
          if (selectedIds.includes(gid)) {
            set({ selectedIds: selectedIds.filter((item) => item !== gid) });
          } else {
            set({
              selectedIds: [...selectedIds, gid],
              stormSelectedField: null,
            });
          }
        } else {
          set({ selectedIds: [gid], stormSelectedField: null });
        }
      },

      addToGroup: (groupId, objectIds) => {
        const state = get();
        if (state.isLocked) return;
        const group = state.groups.find((g) => g.id === groupId);
        if (!group || group.locked || objectIds.length === 0) return;

        const targetIdSet = new Set(objectIds);
        const validObjects = state.objects.filter(
          (o) => targetIdSet.has(o.id) && o.type !== "connector",
        );
        if (validObjects.length === 0) return;

        // A member joining from far away is pulled back next to the group's
        // cluster so the frame stays compact instead of spanning the canvas.
        const snaps = snapMembersNearGroup(
          state.objects,
          state.groups,
          groupId,
          validObjects,
        );
        const placed = (obj: CanvasObject): CanvasObject => {
          const snap = snaps.get(obj.id);
          return snap ? { ...obj, x: snap.x, y: snap.y } : obj;
        };

        // Separator lines already drawn across this section join it, so the
        // frame grows to enclose them instead of leaving them stranded outside.
        const existingMembers = state.objects.filter(
          (o) => o.groupId === groupId && o.type !== "connector",
        );
        const region = getObjectUnionBounds([
          ...existingMembers,
          ...validObjects.map(placed),
        ]);
        if (region) {
          for (const line of findAdoptableLines(state.objects, region)) {
            targetIdSet.add(line.id);
          }
        }

        let nextObjects = state.objects.map((obj) =>
          targetIdSet.has(obj.id) && obj.type !== "connector"
            ? { ...placed(obj), groupId }
            : obj,
        );

        // Recompute the destination group AND every group these objects are
        // leaving, so a vacated boundary shrinks the moment a member moves.
        const affectedGroupIds = new Set<string>([groupId]);
        for (const obj of validObjects) {
          if (obj.groupId && obj.groupId !== groupId) {
            affectedGroupIds.add(obj.groupId);
          }
        }

        nextObjects = applySeparatorRefit(
          nextObjects,
          state.groups,
          affectedGroupIds,
          validObjects.map((o) => o.id),
        );

        // Source groups left without any member or child dissolve, matching
        // removeFromGroup's behaviour.
        const survivingGroups = state.groups.filter((g) => {
          if (!affectedGroupIds.has(g.id)) return true;
          const hasMembers = nextObjects.some((o) => o.groupId === g.id);
          const hasChildren = state.groups.some((c) => c.parentId === g.id);
          return hasMembers || hasChildren;
        });

        const nextGroups = recomputeGroupBoundsForGroupIds(
          nextObjects,
          survivingGroups,
          affectedGroupIds,
        );

        set({
          groups: nextGroups,
          objects: nextObjects,
        });
      },

      removeFromGroup: (objectIds) => {
        const state = get();
        if (state.isLocked || objectIds.length === 0) return;

        const targetIdSet = new Set(objectIds);
        const affectedGroupIds = new Set<string>();

        for (const obj of state.objects) {
          if (targetIdSet.has(obj.id) && obj.groupId) {
            affectedGroupIds.add(obj.groupId);
          }
        }
        if (affectedGroupIds.size === 0) return;

        const nextObjects = state.objects.map((obj) =>
          targetIdSet.has(obj.id) ? { ...obj, groupId: undefined } : obj,
        );

        const remainingGroups = state.groups.filter((g) => {
          if (!affectedGroupIds.has(g.id)) return true;
          const hasMembers = nextObjects.some((o) => o.groupId === g.id);
          const hasChildren = state.groups.some(
            (child) => child.parentId === g.id,
          );
          return hasMembers || hasChildren;
        });

        const nextGroups = recomputeGroupBoundsForGroupIds(
          nextObjects,
          remainingGroups,
          affectedGroupIds,
        );

        set({
          groups: nextGroups,
          objects: nextObjects,
        });
      },

      groupObjects: (objectIds, name) => {
        const state = get();
        if (state.isLocked) return;

        const rawIds =
          objectIds && objectIds.length > 0 ? objectIds : state.selectedIds;

        // 1. Identify any explicitly selected groups (__group:...)
        const explicitGroupIds = new Set<string>();
        // 2. Identify candidate object IDs
        const candidateObjectIds: string[] = [];

        for (const id of rawIds) {
          if (id.startsWith("__group:")) {
            const gid = id.replace("__group:", "");
            if (state.groups.some((g) => g.id === gid)) {
              explicitGroupIds.add(gid);
            }
          } else {
            const obj = state.objects.find((o) => o.id === id);
            if (obj && obj.type !== "connector") {
              candidateObjectIds.push(obj.id);
            }
          }
        }

        // Nesting (cards): grouping only members of one existing group creates
        // a child group inside it, so an existing Section can hold sub-Sections.
        // A mixed selection (assigned + unassigned cards) still merges into the
        // group as before.
        if (explicitGroupIds.size === 0 && candidateObjectIds.length > 0) {
          const memberGroupIds = new Set<string>();
          const allInsideOneGroup = candidateObjectIds.every((id) => {
            const obj = state.objects.find((o) => o.id === id);
            if (!obj?.groupId) return false;
            if (!state.groups.some((g) => g.id === obj.groupId)) return false;
            memberGroupIds.add(obj.groupId);
            return true;
          });
          const nameMatchesExisting = name
            ? state.groups.some(
                (g) => g.name.toLowerCase() === name.trim().toLowerCase(),
              )
            : false;

          if (
            allInsideOneGroup &&
            memberGroupIds.size === 1 &&
            !nameMatchesExisting
          ) {
            const parentId = Array.from(memberGroupIds)[0];
            const childId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const childGroup: import("@/types").GroupInfo = {
              id: childId,
              name: name || "Group",
              parentId,
              stroke: "#6366f1",
              fill: "#eef2ff",
              strokeWidth: 2,
              lineStyle: "dashed",
              tagColor: "#6366f1",
            };

            const memberIdSet = new Set(candidateObjectIds);
            const nextObjects = state.objects.map((obj) =>
              memberIdSet.has(obj.id) ? { ...obj, groupId: childId } : obj,
            );

            const nextGroups = recomputeGroupBoundsForGroupIds(
              nextObjects,
              [...state.groups, childGroup],
              new Set([childId, parentId]),
            );

            set({
              groups: nextGroups,
              objects: nextObjects,
              selectedIds: [`__group:${childId}`],
            });

            return childId;
          }
        }

        // Nesting: selecting two or more groups wraps them in a new parent
        // group (group-in-group). Any selected cards that are not already
        // inside one of those groups join the parent as direct members.
        if (explicitGroupIds.size >= 2) {
          const childGroupIds = Array.from(explicitGroupIds);
          const childGroupIdSet = new Set(childGroupIds);
          const parentMemberIds = candidateObjectIds.filter((id) => {
            const obj = state.objects.find((o) => o.id === id);
            return !obj?.groupId || !childGroupIdSet.has(obj.groupId);
          });
          const memberIdSet = new Set(parentMemberIds);

          const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const parentGroup: import("@/types").GroupInfo = {
            id: groupId,
            name: name || "Group",
            stroke: "#6366f1",
            fill: "#eef2ff",
            strokeWidth: 2,
            lineStyle: "dashed",
            tagColor: "#6366f1",
          };

          const nextObjects = state.objects.map((obj) =>
            memberIdSet.has(obj.id) ? { ...obj, groupId } : obj,
          );

          const affectedGroupIds = new Set<string>([
            groupId,
            ...childGroupIds,
          ]);
          for (const id of parentMemberIds) {
            const obj = state.objects.find((o) => o.id === id);
            if (obj?.groupId) affectedGroupIds.add(obj.groupId);
          }
          // A child leaving an existing parent must let that parent shrink.
          for (const id of childGroupIds) {
            const child = state.groups.find((g) => g.id === id);
            if (child?.parentId) affectedGroupIds.add(child.parentId);
          }

          const reparented = state.groups.map((g) =>
            childGroupIdSet.has(g.id) ? { ...g, parentId: groupId } : g,
          );
          const groupsWithParent = [...reparented, parentGroup];
          // Keep the new parent plus any group that still holds content, so
          // source groups emptied by the move dissolve.
          const survivingGroups = groupsWithParent.filter(
            (g) =>
              g.id === groupId ||
              groupHasContent(g.id, nextObjects, groupsWithParent),
          );

          const nextGroups = recomputeGroupBoundsForGroupIds(
            nextObjects,
            survivingGroups,
            affectedGroupIds,
          );

          set({
            groups: nextGroups,
            objects: nextObjects,
            selectedIds: [`__group:${groupId}`],
          });

          return groupId;
        }

        // Check if there is an existing target group to add to
        let targetGroupId: string | undefined;

        if (explicitGroupIds.size === 1) {
          // Explicit group selected along with cards
          targetGroupId = Array.from(explicitGroupIds)[0];
        } else if (explicitGroupIds.size === 0 && candidateObjectIds.length > 0) {
          // Check if exactly one existing group is represented among the candidate objects
          const memberGroupIds = new Set<string>();
          for (const id of candidateObjectIds) {
            const obj = state.objects.find((o) => o.id === id);
            if (obj?.groupId && state.groups.some((g) => g.id === obj.groupId)) {
              memberGroupIds.add(obj.groupId);
            }
          }
          if (memberGroupIds.size === 1) {
            targetGroupId = Array.from(memberGroupIds)[0];
          }
        }

        // Also check if `name` matches an existing group
        if (!targetGroupId && name) {
          const matchedByName = state.groups.find(
            (g) => g.name.toLowerCase() === name.trim().toLowerCase(),
          );
          if (matchedByName) {
            targetGroupId = matchedByName.id;
          }
        }

        const targetGroup = targetGroupId
          ? state.groups.find((g) => g.id === targetGroupId)
          : undefined;

        // If a target group is found and not overridden by an explicit new group name
        if (
          targetGroupId &&
          (!name ||
            (targetGroup &&
              targetGroup.name.toLowerCase() === name.trim().toLowerCase()))
        ) {
          const unassignedIds = candidateObjectIds.filter(
            (id) =>
              state.objects.find((o) => o.id === id)?.groupId !== targetGroupId,
          );
          if (unassignedIds.length > 0) {
            get().addToGroup(targetGroupId, unassignedIds);
          }
          set({ selectedIds: [`__group:${targetGroupId}`] });
          return targetGroupId;
        }

        // Otherwise create a new group from candidate objects
        const baseTargetObjects = state.objects.filter(
          (o) => candidateObjectIds.includes(o.id) && o.type !== "connector",
        );
        if (baseTargetObjects.length === 0) return;

        // Separator lines already drawn across this slice join the new
        // section, so its frame encloses them and they move with it.
        const targetIdSet = new Set(baseTargetObjects.map((o) => o.id));
        const adoptRegion = getObjectUnionBounds(baseTargetObjects);
        if (adoptRegion) {
          for (const line of findAdoptableLines(state.objects, adoptRegion)) {
            targetIdSet.add(line.id);
          }
        }
        const targetObjects = state.objects.filter((o) => targetIdSet.has(o.id));

        const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const nextObjects = state.objects.map((obj) =>
          targetIdSet.has(obj.id) ? { ...obj, groupId } : obj,
        );

        // Any group these objects belonged to before must also shrink, since
        // they are moving into the freshly created group.
        const affectedGroupIds = new Set<string>([groupId]);
        for (const obj of targetObjects) {
          if (obj.groupId && obj.groupId !== groupId) {
            affectedGroupIds.add(obj.groupId);
          }
        }

        const newGroupBase: import("@/types").GroupInfo = {
          id: groupId,
          name: name || "Group",
          stroke: "#6366f1",
          fill: "#eef2ff",
          strokeWidth: 2,
          lineStyle: "dashed",
          tagColor: "#6366f1",
        };

        // Source groups left empty dissolve, so no stale boundary lingers.
        const survivingGroups = [...state.groups, newGroupBase].filter((g) => {
          if (!affectedGroupIds.has(g.id)) return true;
          const hasMembers = nextObjects.some((o) => o.groupId === g.id);
          const hasChildren = state.groups.some((c) => c.parentId === g.id);
          return hasMembers || hasChildren;
        });

        const updatedGroups = recomputeGroupBoundsForGroupIds(
          nextObjects,
          survivingGroups,
          affectedGroupIds,
        );

        set({
          groups: updatedGroups,
          objects: nextObjects,
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

        // Child groups rise to the nearest surviving ancestor instead of being
        // orphaned when their parent is dissolved.
        const reparentedGroups = reparentChildrenOfRemovedGroups(
          state.groups,
          groupIdsToDissolve,
        );

        const nextObjects = state.objects
          .filter((obj) => {
            // Drop connectors whose endpoint group is being dissolved.
            if (obj.type === "connector" && obj.connectorData) {
              const { start, end } = obj.connectorData;
              if (
                groupIdsToDissolve.has(start.objectId) ||
                groupIdsToDissolve.has(end.objectId)
              ) {
                return false;
              }
            }
            return true;
          })
          .map((obj) => {
            if (
              (obj.groupId && groupIdsToDissolve.has(obj.groupId)) ||
              objectIdsToDetach.has(obj.id)
            ) {
              return { ...obj, groupId: undefined };
            }
            return obj;
          });

        // A group that lost its last member (or only child) dissolves too.
        const groupsForContent = reparentedGroups.filter(
          (g) => !groupIdsToDissolve.has(g.id),
        );
        const remainingGroups = groupsForContent.filter((g) =>
          groupHasContent(g.id, nextObjects, groupsForContent),
        );

        // Groups that lost members (without being dissolved) must shrink, and
        // dissolving a child group must also collapse its surviving ancestor.
        const affectedGroupIds = new Set<string>();
        for (const obj of state.objects) {
          if (objectIdsToDetach.has(obj.id) && obj.groupId) {
            affectedGroupIds.add(obj.groupId);
          }
        }
        for (const id of groupIdsToDissolve) {
          let parentId = state.groups.find((g) => g.id === id)?.parentId;
          const seen = new Set<string>();
          while (
            parentId &&
            groupIdsToDissolve.has(parentId) &&
            !seen.has(parentId)
          ) {
            seen.add(parentId);
            parentId = state.groups.find((g) => g.id === parentId)?.parentId;
          }
          if (parentId) affectedGroupIds.add(parentId);
        }

        const recomputedGroups = recomputeGroupBoundsForGroupIds(
          nextObjects,
          remainingGroups,
          affectedGroupIds,
        );

        const liberatedIds = state.objects
          .filter(
            (o) =>
              (o.groupId && groupIdsToDissolve.has(o.groupId)) ||
              objectIdsToDetach.has(o.id),
          )
          .map((o) => o.id);

        set({
          groups: recomputedGroups,
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
          tool: "select",
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

      setValidationTarget: (validationTarget) => set({ validationTarget }),

      setBddStepPopup: (bddStepPopup) => set({ bddStepPopup }),

      setQueryItemPopup: (queryItemPopup) => set({ queryItemPopup }),

      setValidationHover: (validationHover) => set({ validationHover }),

      setMappingTarget: (mappingTarget) => set({ mappingTarget }),

      setMappingHover: (mappingHover) => set({ mappingHover }),

      setStormActionHover: (stormActionHover) => set({ stormActionHover }),

      setAIHighlight: (ids) => {
        const state = get();
        if (
          state.aiHighlightIds.length === ids.length &&
          state.aiHighlightIds.every((id, idx) => id === ids[idx])
        ) {
          return;
        }
        set({ aiHighlightIds: ids });
      },

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
          const nextInputFields = (data.inputFields ?? []).filter(
            (f) => f.id !== rowId,
          );
          const nextOutputFields = (data.outputFields ?? []).filter(
            (f) => f.id !== rowId,
          );
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
          const nextSteps = (data.steps ?? []).filter((s) => s.id !== rowId);

          const nextData = {
            ...data,
            fields: nextFields,
            inputFields: nextInputFields,
            outputFields: nextOutputFields,
            responseFields: nextResponseFields,
            queryItems: nextQueryItems,
            constraints: nextConstraints,
            steps: nextSteps,
          };

          const newHeight = computeStormCardHeight(nextData, obj.width);
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
          // Last copy wins: a field snapshot supersedes any object snapshot.
          set({ fieldClipboard, objectClipboard: null });
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
            fieldType: normalizeFieldType(e.fieldType) || DEFAULT_FIELD_TYPE,
            required: e.required,
            description: e.description,
            ...(e.validation ? { validation: e.validation } : {}),
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
          // State/Constraint split fields into INPUT params and OUTPUT fields;
          // paste into whichever band holds the anchor row (default OUTPUT).
          let targetList: "fields" | "inputFields" | "outputFields" = "fields";
          if (stormHasInputFields(data.kind)) {
            targetList =
              anchorId &&
              (data.inputFields ?? []).some((f) => f.id === anchorId)
                ? "inputFields"
                : "outputFields";
          }
          // Validation only belongs on a Command payload / Query param, so it
          // survives a paste into those lists and is dropped everywhere else.
          const keepsValidation =
            stormHasValidation(data.kind) && targetList === "fields";
          const newFields = fieldClipboard.entries.map((e) => ({
            id: nanoid(),
            name: e.name,
            fieldType: normalizeFieldType(e.fieldType) || DEFAULT_FIELD_TYPE,
            required: e.required,
            description: e.description,
            ...(e.tag ? { tag: e.tag } : {}),
            ...(keepsValidation && e.validation
              ? { validation: e.validation }
              : {}),
          }));
          const list = data[targetList] ?? [];
          const at = insertAt(list);
          const nextList = [
            ...list.slice(0, at),
            ...newFields,
            ...list.slice(at),
          ];
          const nextData = { ...data, [targetList]: nextList };
          const newHeight = computeStormCardHeight(nextData, obj.width);
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

      copySelectedObjects: () => {
        const { selectedIds, objects, groups, isLocked } = get();
        if (isLocked) return;
        const objectClipboard = buildObjectClipboard(
          selectedIds,
          objects,
          groups,
        );
        if (!objectClipboard) return;
        // Last copy wins: an object snapshot supersedes any field rows.
        set({ objectClipboard, fieldClipboard: null });
      },

      pasteObjects: () => {
        const { objectClipboard, isLocked } = get();
        if (isLocked || !objectClipboard) return;
        const pasted = buildPastedObjects(objectClipboard);
        if (!pasted) return;
        set((state) => {
          // Dedupe pasted titles against the board (and within the batch), so a
          // copied "CreateOrder" lands as "CreateOrder 2".
          const existing = [...state.objects];
          const added = pasted.objects.map((obj) => {
            const next = ensureUniqueComponentName(obj, existing);
            existing.push(next);
            return next;
          });
          const objects = [...state.objects, ...added];
          const groups = recomputeGroupBoundsForGroupIds(
            objects,
            [...state.groups, ...pasted.groups],
            new Set(pasted.groups.map((g) => g.id)),
          );
          return {
            objects,
            groups,
            selectedIds: added.map((o) => o.id),
            stormSelectedField: null,
            objectClipboard: {
              ...objectClipboard,
              pasteIndex: objectClipboard.pasteIndex + 1,
            },
          };
        });
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
          fieldType: stormHasFieldTypes(obj.stormData.kind)
            ? DEFAULT_FIELD_TYPE
            : "",
          required: false,
        };

        const data = obj.stormData;
        let nextData = data;
        if (stormHasInputFields(data.kind)) {
          // State/Constraint split INPUT params from OUTPUT fields: the
          // "response" section is the projected output band.
          nextData =
            section === "response"
              ? {
                  ...data,
                  outputFields: [...(data.outputFields ?? []), newField],
                }
              : {
                  ...data,
                  inputFields: [...(data.inputFields ?? []), newField],
                };
        } else if (stormHasResponseFields(data.kind) && section === "response") {
          nextData = {
            ...data,
            responseFields: [...(data.responseFields ?? []), newField],
          };
        } else {
          nextData = { ...data, fields: [...data.fields, newField] };
        }

        const newHeight = computeStormCardHeight(nextData, obj.width);
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
        const newHeight = computeStormCardHeight(nextData, obj.width);
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
        const newHeight = computeStormCardHeight(nextData, obj.width);
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

      updateStormConstraint: (objectId, constraintId, patch) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked)
          return;
        if (obj.stormData.kind !== "constraint") return;

        const nextConstraints = (obj.stormData.constraints ?? []).map((c) =>
          c.id === constraintId ? { ...c, ...patch } : c,
        );
        const nextData = { ...obj.stormData, constraints: nextConstraints };
        const newHeight = computeStormCardHeight(nextData, obj.width);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, stormData: nextData }
                : o,
            ),
            obj.id,
          ),
        });
      },

      updateStormFieldMapping: (objectId, fieldId, mapping, section) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked) return;

        const updateList = (list?: typeof obj.stormData.fields) =>
          (list ?? []).map((f) =>
            f.id === fieldId ? { ...f, mapping: mapping?.trim() ? mapping.trim() : undefined } : f,
          );

        let nextData = obj.stormData;
        if (section === "response" && nextData.responseFields) {
          nextData = { ...nextData, responseFields: updateList(nextData.responseFields) };
        } else if (section === "response" && nextData.outputFields) {
          nextData = { ...nextData, outputFields: updateList(nextData.outputFields) };
        } else if (section === "params" && nextData.inputFields) {
          nextData = { ...nextData, inputFields: updateList(nextData.inputFields) };
        } else if (nextData.fields.some((f) => f.id === fieldId)) {
          nextData = { ...nextData, fields: updateList(nextData.fields) };
        } else if (nextData.inputFields?.some((f) => f.id === fieldId)) {
          nextData = { ...nextData, inputFields: updateList(nextData.inputFields) };
        } else if (nextData.responseFields?.some((f) => f.id === fieldId)) {
          nextData = { ...nextData, responseFields: updateList(nextData.responseFields) };
        } else if (nextData.outputFields?.some((f) => f.id === fieldId)) {
          nextData = { ...nextData, outputFields: updateList(nextData.outputFields) };
        }

        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id ? { ...o, stormData: nextData } : o,
            ),
            obj.id,
          ),
        });
      },

      updateStormQueryItemSet: (objectId, queryItemId, setRecord) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked) return;
        if (obj.stormData.kind !== "state" && obj.stormData.kind !== "constraint") return;

        const nextQueryItems = (obj.stormData.queryItems ?? []).map((q) =>
          q.id === queryItemId ? { ...q, set: setRecord && Object.keys(setRecord).length > 0 ? setRecord : undefined } : q,
        );
        const nextData = { ...obj.stormData, queryItems: nextQueryItems };

        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id ? { ...o, stormData: nextData } : o,
            ),
            obj.id,
          ),
        });
      },

      addBddStep: (objectId, ref) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked)
          return;
        if (obj.stormData.kind !== "bdd") return;

        const newId = nanoid();
        const newStep: BddStep = {
          id: newId,
          ref: ref ?? bddDefaultRefForPhase(obj.stormData.phase),
          name: "",
          payload: [],
        };
        const nextData = {
          ...obj.stormData,
          steps: [...(obj.stormData.steps ?? []), newStep],
        };
        const newHeight = computeStormCardHeight(nextData, obj.width);
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

      updateBddStep: (objectId, stepId, patch) => {
        const { objects } = get();
        const obj = objects.find((o) => o.id === objectId);
        if (!obj || obj.type !== "storm" || !obj.stormData || obj.locked) return;
        if (obj.stormData.kind !== "bdd") return;

        const steps = obj.stormData.steps ?? [];
        if (!steps.some((s) => s.id === stepId)) return;
        const nextSteps = steps.map((s) =>
          s.id === stepId ? { ...s, ...patch } : s,
        );
        const nextData = { ...obj.stormData, steps: nextSteps };
        const newHeight = computeStormCardHeight(nextData, obj.width);
        set({
          objects: syncReferenceAfterChange(
            objects.map((o) =>
              o.id === obj.id
                ? { ...o, height: newHeight, stormData: nextData }
                : o,
            ),
            obj.id,
          ),
        });
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
          fieldType: DEFAULT_FIELD_TYPE,
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

      openModelPopup: (entry) => {
        const id = `popup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const fullEntry = { ...entry, id };
        set((state) => {
          if (entry.level === 0) {
            return { modelPopupChain: [fullEntry] };
          }
          const prevChain = state.modelPopupChain.slice(0, entry.level);
          return { modelPopupChain: [...prevChain, fullEntry] };
        });
      },

      closeModelPopup: (level) => {
        set((state) => {
          if (level === undefined || level === 0) {
            return { modelPopupChain: [] };
          }
          return { modelPopupChain: state.modelPopupChain.slice(0, level) };
        });
      },

      clearModelPopups: () => set({ modelPopupChain: [] }),

      setIsDragging: (isDragging) => {
        if (get().isDragging !== isDragging) {
          set({ isDragging });
        }
      },

      setProjectName: (projectName) => set({ projectName }),
      setGoogleDriveFileId: (googleDriveFileId) => set({ googleDriveFileId }),

      resetBoard: (
        objects = [],
        groups = [],
        projectName = "Untitled",
        googleDriveFileId = null,
      ) => {
        set((state) => ({
          projectName,
          googleDriveFileId,
          // Canonicalize primitive field types on load so legacy boards
          // ("uuid", "datetime") surface as "UUID", "DateTime" everywhere.
          objects: objects.map(normalizeObjectFieldTypes),
          groups,
          selectedIds: [],
          alignmentGuides: [],
          inlineEdit: null,
          typeSelect: null,
          stormSelectedField: null,
          validationTarget: null,
          bddStepPopup: null,
          queryItemPopup: null,
          validationHover: null,
          stormActionHover: null,
          aiHighlightIds: [],
          isSearchOpen: false,
          descHover: null,
          actionHover: null,
          modelPopupChain: [],
          isDragging: false,
          tool: "select",
          mappingTarget: null,
          mappingHover: null,
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

        set({
          aiConversation: withUser,
          aiRunning: true,
          aiError: null,
          aiStepUsed: 0,
          aiStepLimit: MAX_AGENT_ITERATIONS,
          aiHighlightIds: [],
        });

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
              onStep: (used, limit) => set({ aiStepUsed: used, aiStepLimit: limit }),
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
          aiStepUsed: 0,
          aiStepLimit: MAX_AGENT_ITERATIONS,
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
          if (g1 === g2) continue;
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
          if (o1 === o2) continue;
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
            o1.connectorData !== o2.connectorData ||
            o1.lineData !== o2.lineData
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
