import { useState, useRef, useMemo } from "react";
import { useCanvasStore } from "@/store";
import type { BddPhase } from "@/types";
import {
  STORM_PHASE_COLORS,
  STORM_PHASE_LABELS,
  STORM_PHASE_TITLES,
  stormHasAction,
  stormHasPhase,
  stormHasQueryItems,
  stormHasTags,
} from "@/constants/storm";
import { ActionPopover } from "./ActionPopover";
import { DescriptionPopover } from "./DescriptionPopover";
import { PermissionsPopover } from "./PermissionsPopover";
import { TagPopover } from "./TagPopover";
import { QueryItemPopover } from "./QueryItemPopover";
import { RemoveFromGroupButton } from "./RemoveFromGroupButton";
import { findDescriptionText } from "@/utils/description";
import { getActorPermissions } from "@/utils/stormAuth";
import {
  Shield,
  Trash2,
  Plus,
  Brackets,
  Layers,
  Ban,
  Info,
  Link2,
  Tag,
  Filter,
} from "lucide-react";

export function StormOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const groups = useCanvasStore((s) => s.groups);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const deleteObjects = useCanvasStore((s) => s.deleteObjects);
  const deleteSelectedStormField = useCanvasStore(
    (s) => s.deleteSelectedStormField,
  );
  const addStormField = useCanvasStore((s) => s.addStormField);
  const addStormConstraint = useCanvasStore((s) => s.addStormConstraint);
  const createReferenceCopy = useCanvasStore((s) => s.createReferenceCopy);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const [showActionPopover, setShowActionPopover] = useState(false);
  const [showDescriptionPopover, setShowDescriptionPopover] = useState(false);
  const [showPermissionsPopover, setShowPermissionsPopover] = useState(false);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [showQueryItemPopover, setShowQueryItemPopover] = useState(false);
  const [queryItemPopoverMode, setQueryItemPopoverMode] = useState<
    "create" | "edit"
  >("create");

  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const permissionsButtonRef = useRef<HTMLButtonElement>(null);

  const selectedStorm = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const obj = objects.find((o) => o.id === selectedIds[0]);
    if (obj && obj.type === "storm" && obj.stormData) return obj;
    return null;
  }, [selectedIds, objects, isLocked]);

  if (!selectedStorm || !selectedStorm.stormData || isDragging) return null;

  const data = selectedStorm.stormData;
  const kind = data.kind;
  const isArray = Boolean(data.isArray);
  const phase = data.phase;

  // Membership shows a one-click way to detach this card from its group.
  const parentGroup = selectedStorm.groupId
    ? groups.find((g) => g.id === selectedStorm.groupId)
    : undefined;

  const sf = stormSelectedField;
  const selectedField =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? (data.fields.find((f) => f.id === sf.fieldId) ??
        data.responseFields?.find((f) => f.id === sf.fieldId) ??
        null)
      : null;

  const selectedQueryItem =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? (data.queryItems?.find((q) => q.id === sf.fieldId) ?? null)
      : null;

  const selectedConstraint =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? (data.constraints?.find((c) => c.id === sf.fieldId) ?? null)
      : null;

  const isRowSelected = Boolean(
    selectedField || selectedQueryItem || selectedConstraint,
  );

  const currentDescription =
    isRowSelected && sf?.fieldId
      ? findDescriptionText(selectedStorm, sf.fieldId)
      : data.description;

  const infoButtonTitle = currentDescription
    ? `Description: ${currentDescription}`
    : isRowSelected
      ? "Add Field Description"
      : "Add Description";

  const handleDelete = () => {
    if (isRowSelected) {
      deleteSelectedStormField();
    } else {
      deleteObjects([selectedStorm.id]);
    }
  };

  const trashTitle = isRowSelected
    ? selectedField
      ? selectedField.name
        ? `Delete Field "${selectedField.name}"`
        : "Delete Field"
      : selectedQueryItem
        ? "Delete Query Item"
        : selectedConstraint
          ? "Delete Constraint Rule"
          : "Delete Field"
    : "Delete Card";

  const hasTagActive = Boolean(selectedField?.tag || showTagPopover);
  const hasQueryItemActive = Boolean(
    selectedQueryItem ||
      (showQueryItemPopover && queryItemPopoverMode === "edit"),
  );

  const tagButtonTitle = selectedField
    ? selectedField.tag
      ? `Tag: "${selectedField.tag}" (${selectedField.name})`
      : `Set Tag for "${selectedField.name}"`
    : "Set Field Tag";

  const handleOpenEditQueryItem = () => {
    setQueryItemPopoverMode("edit");
    setShowQueryItemPopover(true);
    setShowTagPopover(false);
    setShowActionPopover(false);
    setShowDescriptionPopover(false);
    setShowPermissionsPopover(false);
  };

  const handleOpenAddQueryItem = () => {
    setQueryItemPopoverMode("create");
    setShowQueryItemPopover(true);
    setShowTagPopover(false);
    setShowActionPopover(false);
    setShowDescriptionPopover(false);
    setShowPermissionsPopover(false);
  };

  // Calculate screen position & zoom scale
  const zoom = viewport.zoom;
  const screenX = (selectedStorm.x - viewport.x) * zoom;
  const screenY = (selectedStorm.y - viewport.y) * zoom;
  const cardWidth = selectedStorm.width * zoom;
  const cardHeight = (selectedStorm.height || 140) * zoom;

  // Scale the options bar dynamically with canvas zoom, clamped to a usable range
  const barScale = Math.max(0.35, Math.min(2.0, zoom));

  // Position bar centered horizontally above the card (flip below if too close to top)
  const barX = screenX + cardWidth / 2;
  const isAbove = screenY >= 48 * barScale + 10;
  const barY = isAbove ? screenY - 10 : screenY + cardHeight + 10;

  // A BDD (Given/When/Then) card's phase is its identity — switching it also
  // refreshes a default title ("Given"/"When"/"Then") so the header stays in sync.
  const handleSetPhase = (targetPhase: BddPhase) => {
    const current = selectedStorm.stormData!;
    const trimmedName = current.name.trim();
    const isDefaultTitle =
      trimmedName === "" ||
      Object.values(STORM_PHASE_TITLES).includes(trimmedName);
    updateObject(selectedStorm.id, {
      stormData: {
        ...current,
        phase: targetPhase,
        ...(isDefaultTitle ? { name: STORM_PHASE_TITLES[targetPhase] } : {}),
      },
    });
  };

  const handleToggleArray = () => {
    updateObject(selectedStorm.id, {
      stormData: {
        ...selectedStorm.stormData!,
        isArray: !isArray,
      },
    });
  };

  const handleAddRow = () => {
    if (kind === "query") {
      addStormField(selectedStorm.id, "params");
    } else {
      addStormField(selectedStorm.id);
    }
  };

  return (
    <>
      <div
        className={`pointer-events-none absolute z-40 -translate-x-1/2 ${
          isAbove ? "-translate-y-full" : ""
        }`}
        style={{
          left: barX,
          top: barY,
        }}
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md select-none"
          style={{
            zoom: barScale,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
        {/* BDD Phase switch (Given / When / Then) — only the Given/When/Then
            card kind carries a phase; every other kind is fixed at creation. */}
        {stormHasPhase(kind) && (
          <div className="flex items-center rounded-lg bg-gray-100 p-0.5">
            {(["given", "when", "then"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handleSetPhase(p)}
                title={`${STORM_PHASE_TITLES[p]} step`}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition-all ${
                  phase === p
                    ? "text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                style={
                  phase === p
                    ? { backgroundColor: STORM_PHASE_COLORS[p] }
                    : undefined
                }
              >
                {STORM_PHASE_LABELS[p]}
              </button>
            ))}
          </div>
        )}

        {/* Collection Array [] Toggle */}
        <button
          onClick={handleToggleArray}
          title="Toggle Array Collection []"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
            isArray
              ? "border border-blue-200 bg-blue-100 text-blue-700"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Brackets size={16} />
        </button>

        {/* RBAC Action Button (Command / Query) */}
        {stormHasAction(kind) && (
          <button
            ref={actionButtonRef}
            onClick={() => setShowActionPopover((v) => !v)}
            title={
              data.action
                ? `Authorization Action: ${data.action}`
                : "Configure Authorization Action"
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              data.action
                ? "border border-blue-200 bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Shield size={16} className="text-blue-600" />
          </button>
        )}

        {/* Card or field description ⓘ — mirrors the action button: a header badge on
            the card plus a panel here in the options bar. */}
        <button
          onClick={() => setShowDescriptionPopover((v) => !v)}
          title={infoButtonTitle}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
            currentDescription
              ? "border border-sky-200 bg-sky-50 text-sky-700"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Info size={16} className="text-sky-600" />
        </button>

        {/* Set Field Tag Button — only visible when a field is selected */}
        {stormHasTags(kind) && Boolean(selectedField) && (
          <button
            onClick={() => setShowTagPopover((v) => !v)}
            title={tagButtonTitle}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              hasTagActive
                ? "border border-orange-200 bg-orange-50 text-orange-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Tag
              size={16}
              className={hasTagActive ? "text-orange-600" : "text-gray-600"}
            />
          </button>
        )}

        {/* Edit Query Item Button — only visible when a query item row is selected on state/constraint card */}
        {stormHasQueryItems(kind) && Boolean(selectedQueryItem) && (
          <button
            onClick={handleOpenEditQueryItem}
            title={
              selectedQueryItem?.types.length
                ? `Edit Query Item: ${selectedQueryItem.types.join(", ")}`
                : "Edit Query Item"
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              hasQueryItemActive
                ? "border border-violet-200 bg-violet-50 text-violet-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Filter
              size={16}
              className={
                hasQueryItemActive
                  ? "text-violet-600"
                  : "text-gray-600"
              }
            />
          </button>
        )}

        {/* Permissions Button (Actor) */}
        {kind === "actor" && (
          <button
            ref={permissionsButtonRef}
            onClick={() => setShowPermissionsPopover((v) => !v)}
            title={`Permissions (${getActorPermissions(data).length})`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
          >
            <Shield size={16} className="text-pink-600" />
          </button>
        )}

        {/* Add Field Button (hidden on the fieldless Actor chip). On Query
            cards this appends to the Params list; a dedicated Response button
            follows. */}
        {kind !== "actor" && (
          <button
            onClick={handleAddRow}
            title={kind === "query" ? "Add Param Field" : "Add Field"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <Plus size={16} />
          </button>
        )}

        {/* Add Response Field Button (Query cards — the Response section) */}
        {kind === "query" && (
          <button
            onClick={() => addStormField(selectedStorm.id, "response")}
            title="Add Response Field"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-700 hover:bg-indigo-50"
          >
            <Plus size={16} />
          </button>
        )}

        {/* Add DCB Query Item Button (State and Constraint cards) */}
        {stormHasQueryItems(kind) && (
          <button
            onClick={handleOpenAddQueryItem}
            title="Add DCB Query Item"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              showQueryItemPopover && queryItemPopoverMode === "create"
                ? "border border-violet-200 bg-violet-50 text-violet-700"
                : "text-violet-700 hover:bg-violet-50"
            }`}
          >
            <Layers size={16} />
          </button>
        )}

        {/* Add Constraint Rule Button (Constraint cards only) */}
        {kind === "constraint" && (
          <button
            onClick={() => addStormConstraint(selectedStorm.id)}
            title="Add Constraint Rule"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-700 hover:bg-teal-50"
          >
            <Ban size={16} />
          </button>
        )}

        {/* Create Reference Copy — linked duplicate, content stays in sync */}
        <button
          onClick={() => createReferenceCopy([selectedStorm.id])}
          title="Create Reference Copy"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <Link2 size={16} />
        </button>

        {/* Remove from Group — detaches just this card, keeping the group */}
        {parentGroup && !parentGroup.locked && (
          <>
            <div className="h-5 w-px bg-gray-200" />
            <RemoveFromGroupButton
              objectId={selectedStorm.id}
              groupName={parentGroup.name}
            />
          </>
        )}

        {/* Delete Card / Field Button */}
        <button
          onClick={handleDelete}
          title={trashTitle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>
      </div>

      {/* Action Popover */}
      {showActionPopover && (
        <ActionPopover
          card={selectedStorm}
          onClose={() => setShowActionPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Description Panel */}
      {showDescriptionPopover && (
        <DescriptionPopover
          target={selectedStorm}
          onClose={() => setShowDescriptionPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Permissions Popover */}
      {showPermissionsPopover && (
        <PermissionsPopover
          actor={selectedStorm}
          onClose={() => setShowPermissionsPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Tag Popover */}
      {showTagPopover && selectedField && (
        <TagPopover
          card={selectedStorm}
          onClose={() => setShowTagPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Query Item Popover */}
      {showQueryItemPopover &&
        (queryItemPopoverMode === "create" || selectedQueryItem) && (
          <QueryItemPopover
            card={selectedStorm}
            queryItemId={
              queryItemPopoverMode === "edit"
                ? selectedQueryItem?.id
                : undefined
            }
            onClose={() => setShowQueryItemPopover(false)}
            anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
          />
        )}
    </>
  );
}
