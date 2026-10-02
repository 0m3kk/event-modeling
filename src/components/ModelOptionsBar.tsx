import { useState, useMemo } from "react";
import { useCanvasStore } from "@/store";
import type { ModelField } from "@/types";
import { MODEL_KIND_LABELS } from "@/constants/model";
import { DescriptionPopover } from "./DescriptionPopover";
import { ValidationPopover } from "./ValidationPopover";
import { RemoveFromGroupButton } from "./RemoveFromGroupButton";
import { findDescriptionText } from "@/utils/description";
import {
  describeValidationRules,
  hasValidationRules,
  modelValidationScope,
} from "@/utils/fieldValidation";
import {
  Link2,
  Plus,
  Trash2,
  Info,
  ListChecks,
} from "lucide-react";

export function ModelOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const groups = useCanvasStore((s) => s.groups);
  const viewport = useCanvasStore((s) => s.viewport);
  const deleteObjects = useCanvasStore((s) => s.deleteObjects);
  const deleteSelectedStormField = useCanvasStore(
    (s) => s.deleteSelectedStormField,
  );
  const addModelField = useCanvasStore((s) => s.addModelField);
  const addModelEnumValue = useCanvasStore((s) => s.addModelEnumValue);
  const createReferenceCopy = useCanvasStore((s) => s.createReferenceCopy);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const validationTarget = useCanvasStore((s) => s.validationTarget);
  const setValidationTarget = useCanvasStore((s) => s.setValidationTarget);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const [showDescriptionPopover, setShowDescriptionPopover] = useState(false);

  const selectedModel = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const obj = objects.find((o) => o.id === selectedIds[0]);
    if (obj && obj.type === "model" && obj.modelData) return obj;
    return null;
  }, [selectedIds, objects, isLocked]);

  if (!selectedModel || !selectedModel.modelData || isDragging) return null;

  const data = selectedModel.modelData;
  const kind = data.kind;

  // Membership shows a one-click way to detach this node from its group.
  const parentGroup = selectedModel.groupId
    ? groups.find((g) => g.id === selectedModel.groupId)
    : undefined;

  // Calculate screen position & zoom scale
  const zoom = viewport.zoom;
  const screenX = (selectedModel.x - viewport.x) * zoom;
  const screenY = (selectedModel.y - viewport.y) * zoom;
  const cardWidth = selectedModel.width * zoom;
  const cardHeight = (selectedModel.height || 140) * zoom;

  const barScale = Math.max(0.35, Math.min(2.0, zoom));

  const barX = screenX + cardWidth / 2;
  const isAbove = screenY >= 48 * barScale + 10;
  const barY = isAbove ? screenY - 10 : screenY + cardHeight + 10;

  const handleAddRow = () => {
    if (kind === "object") {
      addModelField(selectedModel.id);
    } else if (kind === "enum") {
      addModelEnumValue(selectedModel.id);
    }
  };

  const sf = stormSelectedField;
  const isRowSelected = Boolean(
    sf &&
      sf.objectId === selectedModel.id &&
      sf.fieldId &&
      ((kind === "object" && data.fields?.some((f) => f.id === sf.fieldId)) ||
        (kind === "enum" && data.values?.some((v) => v.id === sf.fieldId))),
  );

  const selectedModelRow = (() => {
    if (!isRowSelected || !sf?.fieldId) return null;
    if (kind === "object") {
      return data.fields?.find((f) => f.id === sf.fieldId) ?? null;
    }
    if (kind === "enum") {
      return data.values?.find((v) => v.id === sf.fieldId) ?? null;
    }
    return null;
  })();

  const currentDescription =
    isRowSelected && sf?.fieldId
      ? findDescriptionText(selectedModel, sf.fieldId)
      : data.description;

  // Validation scope: object → per field row; array/wrap → the whole node;
  // enum → none.
  const validationScope = modelValidationScope(kind);
  const selectedModelField =
    kind === "object" && isRowSelected
      ? ((selectedModelRow as ModelField | null) ?? null)
      : null;
  const canValidate =
    validationScope !== "none" &&
    (validationScope !== "field" || Boolean(selectedModelField));
  const validationValue =
    validationScope === "field"
      ? selectedModelField?.validation
      : validationScope === "none"
        ? undefined
        : data.validation;
  const hasValidation = hasValidationRules(validationValue);

  const expectedValidationFieldId =
    validationScope === "field" ? selectedModelField?.id : undefined;
  const showValidationPopover = Boolean(
    validationTarget &&
      validationTarget.objectId === selectedModel.id &&
      validationTarget.fieldId === expectedValidationFieldId,
  );

  const validationButtonTitle = hasValidation
    ? `Validation: ${describeValidationRules(validationValue)}`
    : validationScope === "field"
      ? `Set Validation for "${selectedModelField?.name ?? "field"}"`
      : `Set Validation for this ${MODEL_KIND_LABELS[kind]}`;

  const handleToggleValidationPopover = () => {
    if (showValidationPopover) {
      setValidationTarget(null);
      return;
    }
    setShowDescriptionPopover(false);
    if (canValidate) {
      setValidationTarget({
        objectId: selectedModel.id,
        fieldId: expectedValidationFieldId,
      });
    }
  };

  const handleToggleDescriptionPopover = () => {
    const next = !showDescriptionPopover;
    if (next) setValidationTarget(null);
    setShowDescriptionPopover(next);
  };

  const infoTitle = currentDescription
    ? `Description: ${currentDescription}`
    : isRowSelected
      ? kind === "enum"
        ? "Add Value Description"
        : "Add Field Description"
      : "Add Description";

  const handleDelete = () => {
    if (isRowSelected) {
      deleteSelectedStormField();
    } else {
      deleteObjects([selectedModel.id]);
    }
  };

  const trashTitle = isRowSelected
    ? kind === "enum"
      ? selectedModelRow?.name
        ? `Delete Value "${selectedModelRow.name}"`
        : "Delete Value"
      : selectedModelRow?.name
        ? `Delete Field "${selectedModelRow.name}"`
        : "Delete Field"
    : "Delete Model";

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
          className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-gray-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-900/95 px-3.5 py-2 shadow-2xl backdrop-blur-md select-none"
          style={{
            zoom: barScale,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
        {/* Add Field / Value */}
        {(kind === "object" || kind === "enum") && (
          <>
            <button
              onClick={handleAddRow}
              title={kind === "object" ? "Add Field" : "Add Value"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 cursor-pointer"
            >
              <Plus size={16} />
            </button>
            <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />
          </>
        )}

        {/* Card or field description ⓘ — panel mirrored from the storm options bar */}
        <button
          onClick={handleToggleDescriptionPopover}
          title={infoTitle}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentDescription
              ? "border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
              : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
          }`}
        >
          <Info size={16} className="text-sky-600 dark:text-sky-400" />
        </button>

        {/* Field / node validation ✓ — object fields, array length, wrap rules */}
        {canValidate && (
          <button
            onClick={handleToggleValidationPopover}
            title={validationButtonTitle}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              hasValidation || showValidationPopover
                ? "border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <ListChecks
              size={16}
              className={
                hasValidation || showValidationPopover
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-gray-600 dark:text-zinc-400"
              }
            />
          </button>
        )}

        <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

        {/* Create Reference Copy — linked duplicate, content stays in sync */}
        <button
          onClick={() => createReferenceCopy([selectedModel.id])}
          title="Create Reference Copy"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 cursor-pointer"
        >
          <Link2 size={16} />
        </button>

        <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

        {/* Remove from Group — detaches just this node, keeping the group */}
        {parentGroup && !parentGroup.locked && (
          <>
            <RemoveFromGroupButton
              objectId={selectedModel.id}
              groupName={parentGroup.name}
            />
            <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />
          </>
        )}

        {/* Delete Field / Model Button */}
        <button
          onClick={handleDelete}
          title={trashTitle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      </div>
      </div>

      {/* Description Panel */}
      {showDescriptionPopover && (
        <DescriptionPopover
          target={selectedModel}
          onClose={() => setShowDescriptionPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Validation Panel (object field / array node / wrap node) */}
      {showValidationPopover && canValidate && (
        <ValidationPopover
          target={selectedModel}
          onClose={() => setValidationTarget(null)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}
    </>
  );
}
