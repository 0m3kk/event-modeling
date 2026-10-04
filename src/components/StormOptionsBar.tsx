import { useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import type { BddPhase, StormQueryItem } from "@/types";
import {
  STORM_PHASE_COLORS,
  STORM_PHASE_LABELS,
  STORM_PHASE_TITLES,
  bddDefaultRefForPhase,
  bddRefsForPhase,
  stormHasAction,
  stormHasInputFields,
  stormHasPhase,
  stormHasQueryItems,
  stormHasResponseFields,
  stormHasSteps,
  stormHasTags,
  stormHasValidation,
} from "@/constants/storm";
import { ActionPopover } from "./ActionPopover";
import { BddStepPopover } from "./BddStepPopover";
import { DescriptionPopover } from "./DescriptionPopover";
import { PermissionsPopover } from "./PermissionsPopover";
import { TagPopover } from "./TagPopover";
import { QueryItemPopover } from "./QueryItemPopover";
import { ValidationPopover } from "./ValidationPopover";
import { ConstraintRulePopover } from "./ConstraintRulePopover";
import { FieldMappingPopover } from "./FieldMappingPopover";
import { RemoveFromGroupButton } from "./RemoveFromGroupButton";
import { findDescriptionText } from "@/utils/description";
import { getActorPermissions } from "@/utils/stormAuth";
import {
  describeValidationRules,
  hasValidationRules,
} from "@/utils/fieldValidation";
import { fieldNameMatches } from "@/utils/naming";
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
  ListChecks,
  Pencil,
  PlusCircle,
  Code2,
  ArrowLeftRight,
} from "lucide-react";

export function StormOptionsBar() {
  const { t } = useTranslation();
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
  const validationTarget = useCanvasStore((s) => s.validationTarget);
  const setValidationTarget = useCanvasStore((s) => s.setValidationTarget);
  const mappingTarget = useCanvasStore((s) => s.mappingTarget);
  const setMappingTarget = useCanvasStore((s) => s.setMappingTarget);
  const bddStepPopup = useCanvasStore((s) => s.bddStepPopup);
  const setBddStepPopup = useCanvasStore((s) => s.setBddStepPopup);
  const queryItemPopup = useCanvasStore((s) => s.queryItemPopup);
  const setQueryItemPopup = useCanvasStore((s) => s.setQueryItemPopup);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const [showActionPopover, setShowActionPopover] = useState(false);
  const [showDescriptionPopover, setShowDescriptionPopover] = useState(false);
  const [showPermissionsPopover, setShowPermissionsPopover] = useState(false);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [showQueryItemPopover, setShowQueryItemPopover] = useState(false);
  const [queryItemPopoverMode, setQueryItemPopoverMode] = useState<
    "create" | "edit"
  >("create");
  const [showConstraintRulePopover, setShowConstraintRulePopover] = useState(false);

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
  const isStepKind = stormHasSteps(kind);

  // Membership shows a one-click way to detach this card from its group.
  const parentGroup = selectedStorm.groupId
    ? groups.find((g) => g.id === selectedStorm.groupId)
    : undefined;

  const sf = stormSelectedField;
  const selectedField =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? (data.fields.find((f) => f.id === sf.fieldId) ??
        data.inputFields?.find((f) => f.id === sf.fieldId) ??
        data.outputFields?.find((f) => f.id === sf.fieldId) ??
        data.responseFields?.find((f) => f.id === sf.fieldId) ??
        null)
      : null;

  // Only INPUT params (State/Constraint) or primary fields (Event/BDD) carry
  // tags; projected output fields and Command/Query responses never do.
  const taggableField =
    selectedField && stormHasTags(kind)
      ? stormHasInputFields(kind)
        ? (data.inputFields ?? []).some((f) => f.id === selectedField.id)
        : data.fields.some((f) => f.id === selectedField.id)
      : false;

  // Command payload fields and Query params are the only user input the board
  // validates. Command/Query Response fields live in `responseFields`, so a
  // selected response row simply falls through to null here.
  const validationField =
    selectedField && stormHasValidation(kind)
      ? data.fields.some((f) => f.id === selectedField.id)
        ? selectedField
        : null
      : null;

  // The validation panel is driven by store state so the canvas ✓ badge can
  // open it. It stays open only while the targeted field remains selected.
  const showValidationPopover = Boolean(
    validationTarget &&
      validationTarget.objectId === selectedStorm.id &&
      validationTarget.fieldId === validationField?.id,
  );

  const hasValidationActive = Boolean(
    showValidationPopover ||
      (validationField && hasValidationRules(validationField.validation)),
  );

  const validationButtonTitle = validationField
    ? hasValidationRules(validationField.validation)
      ? `Validation: ${describeValidationRules(validationField.validation)}`
      : `Set Validation for "${validationField.name}"`
    : "Set Field Validation";

  // Field mapping applies to Event fields and Command/Query response fields,
  // plus State/Constraint outputFields (which configure projection via Query Items).
  const isOutputField = Boolean(
    (kind === "state" || kind === "constraint") &&
      selectedField &&
      (data.outputFields ?? []).some((f) => f.id === selectedField.id),
  );

  let outputFieldProjectedExpr: string | undefined;
  let outputFieldMatchedQi: StormQueryItem | undefined;
  if (isOutputField && selectedField) {
    for (const q of data.queryItems ?? []) {
      if (!q.set) continue;
      for (const [key, expr] of Object.entries(q.set)) {
        if (
          fieldNameMatches(selectedField.name, key) ||
          fieldNameMatches(selectedField.id, key)
        ) {
          outputFieldProjectedExpr = expr;
          outputFieldMatchedQi = q;
          break;
        }
      }
      if (outputFieldProjectedExpr) break;
    }
  }

  const isMappableField =
    selectedField &&
    (kind === "event" ||
      kind === "external" ||
      ((kind === "command" || kind === "query") &&
        (data.responseFields ?? []).some((f) => f.id === selectedField.id)) ||
      isOutputField);

  const mappingSection: "params" | "response" | undefined =
    selectedField &&
    ((data.responseFields ?? []).some((f) => f.id === selectedField.id) ||
      (data.outputFields ?? []).some((f) => f.id === selectedField.id))
      ? "response"
      : undefined;

  const showMappingPopover = Boolean(
    mappingTarget &&
      mappingTarget.objectId === selectedStorm.id &&
      mappingTarget.fieldId === selectedField?.id,
  );

  const hasMappingActive = Boolean(
    showMappingPopover ||
      (isOutputField && outputFieldProjectedExpr) ||
      (!isOutputField && isMappableField && selectedField?.mapping?.trim()),
  );

  const mappingButtonTitle = isOutputField
    ? outputFieldProjectedExpr
      ? `Projection: ${outputFieldProjectedExpr} (Query Item: ${outputFieldMatchedQi?.types?.join(", ") || "item"})`
      : `Set Projection for "${selectedField?.name}" (Configured in Query Item)`
    : isMappableField
      ? selectedField?.mapping?.trim()
        ? `Mapping: ${selectedField.mapping}`
        : `Set Field Mapping for "${selectedField?.name}" (Required for Codegen)`
      : "Set Field Mapping";

  const selectedQueryItem =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? (data.queryItems?.find((q) => q.id === sf.fieldId) ?? null)
      : null;

  const selectedConstraint =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? (data.constraints?.find((c) => c.id === sf.fieldId) ?? null)
      : null;

  const selectedStep =
    sf && sf.objectId === selectedStorm.id && sf.fieldId
      ? ((data.steps ?? []).find((s) => s.id === sf.fieldId) ?? null)
      : null;

  // The step popover is store-driven so the canvas "add step" placeholder can
  // open it directly. It only stays open for the selected card.
  const showBddStepPopover = Boolean(
    isStepKind && bddStepPopup && bddStepPopup.objectId === selectedStorm.id,
  );

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
    if (isRowSelected || selectedStep) {
      deleteSelectedStormField();
    } else {
      deleteObjects([selectedStorm.id]);
    }
  };

  const trashTitle = selectedStep
    ? selectedStep.name
      ? `Delete Step "${selectedStep.name}"`
      : "Delete Step"
    : isRowSelected
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

  const hasStoreQueryItemPopup = Boolean(
    queryItemPopup && queryItemPopup.objectId === selectedStorm.id,
  );
  const showQueryItemActive =
    (showQueryItemPopover &&
      (queryItemPopoverMode === "create" ||
        selectedQueryItem ||
        Boolean(data.queryItems?.length))) ||
    hasStoreQueryItemPopup;
  const queryItemEffectiveMode = hasStoreQueryItemPopup
    ? queryItemPopup?.queryItemId
      ? "edit"
      : "create"
    : queryItemPopoverMode;

  const hasTagActive = Boolean(selectedField?.tag || showTagPopover);
  const hasQueryItemActive = Boolean(
    selectedQueryItem ||
      (showQueryItemActive && queryItemEffectiveMode === "edit"),
  );

  const tagButtonTitle = selectedField
    ? selectedField.tag
      ? `Tag: "${selectedField.tag}" (${selectedField.name})`
      : `Set Tag for "${selectedField.name}"`
    : "Set Field Tag";

  const closeAllPopovers = () => {
    setShowActionPopover(false);
    setShowDescriptionPopover(false);
    setShowPermissionsPopover(false);
    setShowTagPopover(false);
    setShowQueryItemPopover(false);
    setValidationTarget(null);
    setMappingTarget(null);
    setBddStepPopup(null);
    setQueryItemPopup(null);
  };

  const handleToggleMappingPopover = () => {
    if (!selectedField) return;
    const next = !showMappingPopover;
    closeAllPopovers();
    if (next) {
      setMappingTarget({
        objectId: selectedStorm.id,
        fieldId: selectedField.id,
        section: mappingSection,
      });
    }
  };

  const handleToggleActionPopover = () => {
    const next = !showActionPopover;
    closeAllPopovers();
    if (next) setShowActionPopover(true);
  };

  const handleTogglePermissionsPopover = () => {
    const next = !showPermissionsPopover;
    closeAllPopovers();
    if (next) setShowPermissionsPopover(true);
  };

  const handleToggleTagPopover = () => {
    const next = !showTagPopover;
    closeAllPopovers();
    if (next) setShowTagPopover(true);
  };

  const handleOpenEditQueryItem = () => {
    if (showQueryItemActive && queryItemEffectiveMode === "edit") {
      setShowQueryItemPopover(false);
      setQueryItemPopup(null);
      return;
    }
    closeAllPopovers();
    setQueryItemPopoverMode("edit");
    setShowQueryItemPopover(true);
  };

  const handleOpenAddQueryItem = () => {
    if (showQueryItemActive && queryItemEffectiveMode === "create") {
      setShowQueryItemPopover(false);
      setQueryItemPopup(null);
      return;
    }
    closeAllPopovers();
    setQueryItemPopoverMode("create");
    setShowQueryItemPopover(true);
  };

  const handleToggleValidationPopover = () => {
    if (showValidationPopover) {
      setValidationTarget(null);
      return;
    }
    closeAllPopovers();
    if (validationField) {
      setValidationTarget({
        objectId: selectedStorm.id,
        fieldId: validationField.id,
      });
    }
  };

  const handleToggleDescriptionPopover = () => {
    const next = !showDescriptionPopover;
    closeAllPopovers();
    if (next) setShowDescriptionPopover(true);
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
    // A step's ref must fit its phase (Given = events, When = command/query,
    // Then = outcomes). Refs that no longer fit are coerced to the phase's
    // default so the card stays coherent while names/payloads are preserved.
    const allowed = bddRefsForPhase(targetPhase);
    const steps = (current.steps ?? []).map((step) =>
      allowed.includes(step.ref)
        ? step
        : { ...step, ref: bddDefaultRefForPhase(targetPhase) },
    );
    updateObject(selectedStorm.id, {
      stormData: {
        ...current,
        phase: targetPhase,
        ...(isDefaultTitle ? { name: STORM_PHASE_TITLES[targetPhase] } : {}),
        ...(current.steps ? { steps } : {}),
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
    if (isStepKind) {
      if (
        showBddStepPopover &&
        bddStepPopup?.objectId === selectedStorm.id &&
        !bddStepPopup?.stepId
      ) {
        setBddStepPopup(null);
        return;
      }
      closeAllPopovers();
      setBddStepPopup({ objectId: selectedStorm.id });
      return;
    }
    if (kind === "query") {
      addStormField(selectedStorm.id, "params");
    } else {
      addStormField(selectedStorm.id);
    }
  };

  const handleEditStep = () => {
    if (!selectedStep) return;
    if (
      showBddStepPopover &&
      bddStepPopup?.objectId === selectedStorm.id &&
      bddStepPopup?.stepId === selectedStep.id
    ) {
      setBddStepPopup(null);
      return;
    }
    closeAllPopovers();
    setBddStepPopup({ objectId: selectedStorm.id, stepId: selectedStep.id });
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
          className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-gray-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-900/95 px-3.5 py-2 shadow-2xl backdrop-blur-md select-none"
          style={{
            zoom: barScale,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
        {/* BDD Phase switch (Given / When / Then) — only the Given/When/Then
            card kind carries a phase; every other kind is fixed at creation. */}
        {stormHasPhase(kind) && (
          <div className="flex items-center rounded-lg bg-gray-100 dark:bg-zinc-800 p-0.5">
            {(["given", "when", "then"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handleSetPhase(p)}
                title={`${STORM_PHASE_TITLES[p]} step`}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                  phase === p
                    ? "text-white shadow-xs"
                    : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100"
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

        {/* Collection Array [] Toggle — irrelevant for scenario step cards */}
        {!isStepKind && (
          <button
            onClick={handleToggleArray}
            title={t("popovers.optionsBar.arrayCollection")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              isArray
                ? "border border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <Brackets size={16} />
          </button>
        )}

        {/* RBAC Action Button (Command / Query) */}
        {stormHasAction(kind) && (
          <button
            ref={actionButtonRef}
            onClick={handleToggleActionPopover}
            title={
              data.action
                ? `Authorization Action: ${data.action}`
                : t("popovers.action.title")
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              data.action
                ? "border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <Shield size={16} className="text-blue-600 dark:text-blue-400" />
          </button>
        )}

        {/* Card or field description ⓘ — mirrors the action button: a header badge on
            the card plus a panel here in the options bar. */}
        <button
          onClick={handleToggleDescriptionPopover}
          title={infoButtonTitle}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentDescription
              ? "border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
              : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
          }`}
        >
          <Info size={16} className="text-sky-600 dark:text-sky-400" />
        </button>

        {/* Set Field Tag Button — only visible when a taggable row is selected */}
        {taggableField && (
          <button
            onClick={handleToggleTagPopover}
            title={tagButtonTitle}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              hasTagActive
                ? "border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <Tag
              size={16}
              className={hasTagActive ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-zinc-400"}
            />
          </button>
        )}

        {/* Set Field Validation Button — only visible when a Command payload
            field or Query param row is selected */}
        {validationField && (
          <button
            onClick={handleToggleValidationPopover}
            title={validationButtonTitle}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              hasValidationActive
                ? "border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <ListChecks
              size={16}
              className={
                hasValidationActive ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-zinc-400"
              }
            />
          </button>
        )}

        {/* Set Field Mapping Button — only visible when an Event field or Response field is selected */}
        {isMappableField && (
          <button
            onClick={handleToggleMappingPopover}
            title={mappingButtonTitle}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              hasMappingActive
                ? "border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <ArrowLeftRight
              size={16}
              className={
                hasMappingActive ? "text-cyan-600 dark:text-cyan-400" : "text-gray-600 dark:text-zinc-400"
              }
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
                : t("popovers.queryItem.title")
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              hasQueryItemActive
                ? "border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <Filter
              size={16}
              className={
                hasQueryItemActive
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-zinc-400"
              }
            />
          </button>
        )}

        {/* Permissions Button (Actor) */}
        {kind === "actor" && (
          <button
            ref={permissionsButtonRef}
            onClick={handleTogglePermissionsPopover}
            title={`Permissions (${getActorPermissions(data).length})`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-pink-200 dark:border-pink-800 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/40 cursor-pointer"
          >
            <Shield size={16} className="text-pink-600 dark:text-pink-400" />
          </button>
        )}

        {/* Add Field Button (hidden on the fieldless Actor chip and on BDD
            scenario step cards, which add steps instead). On Query cards this
            appends to the Params list; on State/Constraint it appends to the
            INPUT params. A dedicated output/response button follows. */}
        {kind !== "actor" && !isStepKind && (
          <button
            onClick={handleAddRow}
            title={
              kind === "query"
                ? "Add Param Field"
                : stormHasInputFields(kind)
                  ? "Add Input Param"
                  : "Add Field"
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 cursor-pointer"
          >
            <Plus size={16} />
          </button>
        )}

        {/* Edit Step Button — only when a scenario step row is selected */}
        {isStepKind && selectedStep && (
          <button
            onClick={handleEditStep}
            title={
              selectedStep.name
                ? `Edit Step: ${selectedStep.name}`
                : "Edit Step"
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              showBddStepPopover
                ? "border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100"
            }`}
          >
            <Pencil
              size={15}
              className={showBddStepPopover ? "text-sky-600 dark:text-sky-400" : "text-gray-600 dark:text-zinc-400"}
            />
          </button>
        )}

        {/* Add Step Button (BDD scenario cards) */}
        {isStepKind && (
          <button
            onClick={handleAddRow}
            title={t("popovers.optionsBar.addStep")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              showBddStepPopover && !bddStepPopup?.stepId
                ? "border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                : "text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
            }`}
          >
            <PlusCircle size={16} />
          </button>
        )}

        {/* Add Response Field Button (Query / Command cards — the RESPONSE section) */}
        {stormHasResponseFields(kind) && (
          <button
            onClick={() => addStormField(selectedStorm.id, "response")}
            title={t("popovers.optionsBar.addResponse")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
          >
            <Plus size={16} />
          </button>
        )}

        {/* Add Output Field Button (State/Constraint — rehydrated FIELDS band) */}
        {stormHasInputFields(kind) && (
          <button
            onClick={() => addStormField(selectedStorm.id, "response")}
            title={t("popovers.optionsBar.addOutput")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
          >
            <Plus size={16} />
          </button>
        )}

        {/* Add DCB Query Item Button (State and Constraint cards) */}
        {stormHasQueryItems(kind) && (
          <button
            onClick={handleOpenAddQueryItem}
            title={t("popovers.optionsBar.addQueryItem")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
              showQueryItemPopover && queryItemPopoverMode === "create"
                ? "border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"
                : "text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40"
            }`}
          >
            <Layers size={16} />
          </button>
        )}

        {/* Add Constraint Rule Button (Constraint cards only) */}
        {kind === "constraint" && (
          <button
            onClick={() => addStormConstraint(selectedStorm.id)}
            title={t("popovers.optionsBar.addConstraint")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
          >
            <Ban size={16} />
          </button>
        )}

        {/* Configure Constraint Rule (Codegen) */}
        {kind === "constraint" && selectedConstraint && (
          <button
            onClick={() => setShowConstraintRulePopover(!showConstraintRulePopover)}
            title={
              selectedConstraint.assert
                ? `Rule: ${selectedConstraint.code || "assert"} (${selectedConstraint.assert})`
                : "Configure Constraint Rule (Codegen)"
            }
            className={`flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer transition-colors ${
              showConstraintRulePopover || selectedConstraint.assert || selectedConstraint.code
                ? "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 font-semibold"
                : "text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
            }`}
          >
            <Code2 size={16} />
          </button>
        )}

        {/* Create Reference Copy — linked duplicate, content stays in sync */}
        <button
          onClick={() => createReferenceCopy([selectedStorm.id])}
          title={t("popovers.optionsBar.createRef")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 cursor-pointer"
        >
          <Link2 size={16} />
        </button>

        {/* Remove from Group — detaches just this card, keeping the group */}
        {parentGroup && !parentGroup.locked && (
          <>
            <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
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
      {showTagPopover && taggableField && (
        <TagPopover
          card={selectedStorm}
          onClose={() => setShowTagPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Validation Popover (Command payload / Query params) */}
      {showValidationPopover && validationField && (
        <ValidationPopover
          target={selectedStorm}
          onClose={() => setValidationTarget(null)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Query Item Popover */}
      {showQueryItemActive && (
        <QueryItemPopover
          card={selectedStorm}
          queryItemId={
            queryItemEffectiveMode === "edit"
              ? (selectedQueryItem?.id ??
                queryItemPopup?.queryItemId ??
                data.queryItems?.[0]?.id)
              : undefined
          }
          onClose={() => {
            setShowQueryItemPopover(false);
            setQueryItemPopup(null);
          }}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* BDD Scenario Step Popover (create when stepId is omitted) */}
      {showBddStepPopover && bddStepPopup && (
        <BddStepPopover
          card={selectedStorm}
          stepId={bddStepPopup.stepId}
          onClose={() => setBddStepPopup(null)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Constraint Rule Popover (Codegen) */}
      {showConstraintRulePopover && selectedConstraint && (
        <ConstraintRulePopover
          card={selectedStorm}
          constraintId={selectedConstraint.id}
          onClose={() => setShowConstraintRulePopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}

      {/* Field Mapping Popover (Codegen) */}
      {showMappingPopover && selectedField && (
        <FieldMappingPopover
          card={selectedStorm}
          fieldId={selectedField.id}
          section={mappingSection}
          onClose={() => setMappingTarget(null)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}
    </>
  );
}
