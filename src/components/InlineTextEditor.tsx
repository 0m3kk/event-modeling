import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormData } from "@/types";
import { stormHasInputFields } from "@/constants/storm";
import { getActorPermissions } from "@/utils/stormAuth";

/**
 * Resolves which StormData field list an inline edit targets from the hit
 * zone's section. State/Constraint split fields into input params/output
 * fields; Query uses params/response; every other kind edits `fields`.
 */
function stormFieldListKey(
  data: StormData,
  section?: "params" | "response",
): "fields" | "inputFields" | "outputFields" | "responseFields" {
  if (stormHasInputFields(data.kind)) {
    return section === "response" ? "outputFields" : "inputFields";
  }
  return section === "response" ? "responseFields" : "fields";
}

export function InlineTextEditor() {
  const inlineEdit = useCanvasStore((s) => s.inlineEdit);
  const setInlineEdit = useCanvasStore((s) => s.setInlineEdit);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const isLocked = useCanvasStore((s) => s.isLocked);

  const groups = useCanvasStore((s) => s.groups);
  const updateGroup = useCanvasStore((s) => s.updateGroup);

  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isCommittedRef = useRef(false);

  useEffect(() => {
    if (inlineEdit) {
      setValue(inlineEdit.initialValue || "");
      isCommittedRef.current = false;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
    }
  }, [inlineEdit]);

  if (!inlineEdit || isLocked) return null;

  const obj = objects.find((o) => o.id === inlineEdit.objectId);
  const grp = !obj ? groups.find((g) => g.id === inlineEdit.objectId) : null;
  if (!obj && !grp) return null;

  const { zone } = inlineEdit;
  const zoom = viewport.zoom;

  // Calculate screen position (for group, zone.bounds are in world coords; for obj, in local coords)
  const originX = obj ? obj.x : 0;
  const originY = obj ? obj.y : 0;
  const worldX = originX + zone.bounds.x;
  const worldY = originY + zone.bounds.y;
  const screenX = (worldX - viewport.x) * zoom;
  const screenY = (worldY - viewport.y) * zoom;
  const screenW = Math.max(80, zone.bounds.width * zoom);
  const screenH = Math.max(24, zone.bounds.height * zoom);

  const isMultiLine =
    zone.type === "stickyText" ||
    zone.type === "constraint" ||
    (zone.type === "textBoxText" && value.includes("\n"));

  const commit = () => {
    if (isCommittedRef.current) return;
    isCommittedRef.current = true;

    const trimmed = value.trim();
    if (grp) {
      updateGroup(grp.id, { name: trimmed || "Group" });
    } else if (obj) {
      applyUpdate(obj, zone, trimmed, updateObject);
    }
    setInlineEdit(null);
  };

  const cancel = () => {
    isCommittedRef.current = true;
    setInlineEdit(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }

    if (e.key === "Enter") {
      if (isMultiLine && e.shiftKey) {
        // Allow newline on Shift+Enter in multi-line
        return;
      }
      e.preventDefault();
      commit();
    }
  };

  return (
    <div
      className="pointer-events-auto absolute z-50"
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        width: `${screenW}px`,
        height: `${screenH}px`,
      }}
    >
      {isMultiLine ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="h-full w-full resize-none rounded border border-blue-500 bg-white/95 dark:bg-zinc-900/95 p-1.5 font-mono text-xs text-gray-900 dark:text-zinc-100 shadow-md outline-none focus:ring-1 focus:ring-blue-500"
          style={{
            fontSize: `${Math.max(10, (zone.type === "constraint" ? 10 : 13) * zoom)}px`,
            lineHeight: "1.3",
          }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="h-full w-full rounded border border-blue-500 bg-white/95 dark:bg-zinc-900/95 px-1.5 font-mono text-xs text-gray-900 dark:text-zinc-100 shadow-md outline-none focus:ring-1 focus:ring-blue-500"
          style={{
            fontSize: `${Math.max(10, (zone.type === "header" ? 12 : 11) * zoom)}px`,
          }}
        />
      )}
    </div>
  );
}

function applyUpdate(
  obj: CanvasObject,
  zone: import("@/engine/renderers").CardHitZone,
  newValue: string,
  updateObject: (id: string, patch: Partial<CanvasObject>) => void,
) {
  if (zone.type === "header") {
    if (obj.type === "storm" && obj.stormData) {
      updateObject(obj.id, {
        stormData: {
          ...obj.stormData,
          name: newValue || "Untitled",
        },
      });
    } else if (obj.type === "model" && obj.modelData) {
      updateObject(obj.id, {
        modelData: {
          ...obj.modelData,
          name: newValue || "UntitledModel",
        },
      });
    } else {
      updateObject(obj.id, { text: newValue });
    }
  } else if (zone.type === "fieldName") {
    if (obj.type === "storm" && obj.stormData) {
      if (obj.stormData.kind === "actor") {
        const perms = getActorPermissions(obj.stormData);
        const index = zone.fieldId
          ? parseInt(zone.fieldId.replace("perm-", ""), 10)
          : -1;
        let nextPerms: string[];
        if (index >= 0 && index < perms.length) {
          nextPerms = [...perms];
          if (newValue.trim()) {
            nextPerms[index] = newValue.trim();
          } else {
            nextPerms.splice(index, 1);
          }
        } else {
          nextPerms = perms
            .map((p) => (p === zone.currentText ? newValue.trim() : p))
            .filter(Boolean);
        }
        updateObject(obj.id, {
          stormData: {
            ...obj.stormData,
            permissions: nextPerms,
            fields: [],
          },
        });
      } else {
        const key = stormFieldListKey(obj.stormData, zone.section);
        const list = obj.stormData[key] ?? [];
        const nextList = list.map((f) =>
          f.id === zone.fieldId ? { ...f, name: newValue } : f,
        );
        updateObject(obj.id, {
          stormData: { ...obj.stormData, [key]: nextList },
        });
      }
    } else if (obj.type === "model" && obj.modelData) {
      const list = obj.modelData.fields ?? [];
      const nextList = list.map((f) =>
        f.id === zone.fieldId ? { ...f, name: newValue } : f,
      );
      updateObject(obj.id, {
        modelData: {
          ...obj.modelData,
          fields: nextList,
        },
      });
    }
  } else if (zone.type === "fieldTag" && obj.type === "storm" && obj.stormData) {
    const key = stormFieldListKey(obj.stormData, zone.section);
    const list = obj.stormData[key] ?? [];
    const cleanTag = newValue.trim().replace(/^#+/, "");
    const nextList = list.map((f) =>
      f.id === zone.fieldId ? { ...f, tag: cleanTag || undefined } : f,
    );
    updateObject(obj.id, {
      stormData: { ...obj.stormData, [key]: nextList },
    });
  } else if (zone.type === "enumValue" && obj.type === "model" && obj.modelData) {
    const list = obj.modelData.values ?? [];
    const nextList = list.map((v) =>
      v.id === zone.valueId
        ? { ...v, name: newValue, value: newValue }
        : v,
    );
    updateObject(obj.id, {
      modelData: {
        ...obj.modelData,
        values: nextList,
      },
    });
  } else if (zone.type === "constraint" && obj.type === "storm" && obj.stormData) {
    const list = obj.stormData.constraints ?? [];
    const nextList = list.map((c) =>
      c.id === zone.constraintId ? { ...c, text: newValue } : c,
    );
    updateObject(obj.id, {
      stormData: {
        ...obj.stormData,
        constraints: nextList,
      },
    });
  } else if (zone.type === "bddStepName" && obj.type === "storm" && obj.stormData) {
    const steps = obj.stormData.steps ?? [];
    const nextSteps = steps.map((s) =>
      s.id === zone.fieldId ? { ...s, name: newValue } : s,
    );
    updateObject(obj.id, {
      stormData: { ...obj.stormData, steps: nextSteps },
    });
  } else if (
    (zone.type === "bddPayloadKey" || zone.type === "bddPayloadValue") &&
    obj.type === "storm" &&
    obj.stormData
  ) {
    const steps = obj.stormData.steps ?? [];
    const key = zone.type === "bddPayloadKey" ? "key" : "value";
    const nextSteps = steps.map((s) =>
      s.id === zone.fieldId
        ? {
            ...s,
            payload: (s.payload ?? []).map((p) =>
              p.id === zone.valueId ? { ...p, [key]: newValue } : p,
            ),
          }
        : s,
    );
    updateObject(obj.id, {
      stormData: { ...obj.stormData, steps: nextSteps },
    });
  } else if (zone.type === "queryItem" && obj.type === "storm" && obj.stormData) {
    const types = newValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const list = obj.stormData.queryItems ?? [];
    const nextList = list.map((q) =>
      q.id === zone.queryItemId ? { ...q, types } : q,
    );
    updateObject(obj.id, {
      stormData: {
        ...obj.stormData,
        queryItems: nextList,
      },
    });
  } else if (zone.type === "stickyText" || zone.type === "textBoxText") {
    updateObject(obj.id, { text: newValue });
  }
}
