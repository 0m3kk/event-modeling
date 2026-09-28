import { useEffect, useRef } from "react";
import { PixiEngine } from "@/engine/PixiEngine";
import { useCanvasStore, undo, redo } from "@/store";
import { spawnAtViewportCenter } from "@/utils/viewport";
import { computeStormCardHeight } from "@/utils/cardDimensions";
import { makeUniqueName, collectComponentNameKeys } from "@/utils/naming";
import type { CanvasObject, StormData, StormKind } from "@/types";

export function PixiCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PixiEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new PixiEngine(containerRef.current);
    engineRef.current = engine;

    engine.init().catch((err) => {
      console.error("Failed to initialize PixiEngine:", err);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Spacebar hold for temporary hand tool
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        engine.setSpaceHeld(true);
        return;
      }

      // Shortcuts
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Tab: Spawn next timeline event to the right (with connector)
      if (e.code === "Tab" && !isCmdOrCtrl && !e.altKey) {
        e.preventDefault();
        const { selectedIds, objects, viewport } = useCanvasStore.getState();
        const baseName = "Event";
        const uniqueName = makeUniqueName(
          baseName,
          collectComponentNameKeys(objects),
        );

        if (selectedIds.length === 1) {
          const selectedObj = objects.find((o) => o.id === selectedIds[0]);
          if (selectedObj) {
            const nextX = selectedObj.x + (selectedObj.width || 200) + 40;
            const nextY = selectedObj.y;
            const newId = `storm-${Date.now()}`;
            const stormData: StormData = {
              kind: "event",
              name: uniqueName,
              fields: [],
            };
            const newHeight = computeStormCardHeight(stormData);
            const newEventObj: CanvasObject = {
              id: newId,
              type: "storm",
              x: nextX,
              y: nextY,
              width: 200,
              height: newHeight,
              stormData,
            };

            const connId = `conn-${Date.now()}`;
            const connObj: CanvasObject = {
              id: connId,
              type: "connector",
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              connectorData: {
                start: { objectId: selectedObj.id, anchor: "right" },
                end: { objectId: newId, anchor: "left" },
              },
            };

            useCanvasStore.getState().addObjects([newEventObj, connObj]);
            useCanvasStore.getState().setSelectedIds([newId]);
            useCanvasStore.getState().setInlineEdit({
              objectId: newId,
              zone: {
                type: "header",
                bounds: { x: 12, y: 6, width: 140, height: 24 },
              },
              initialValue: uniqueName,
            });
            return;
          }
        }

        // Default spawn at viewport center if nothing selected
        const bounds = spawnAtViewportCenter(viewport, 200, 120);
        const newId = `storm-${Date.now()}`;
        const stormData: StormData = {
          kind: "event",
          name: uniqueName,
          fields: [],
        };
        const newHeight = computeStormCardHeight(stormData);
        useCanvasStore.getState().addObject({
          id: newId,
          type: "storm",
          x: bounds.x,
          y: bounds.y,
          width: 200,
          height: newHeight,
          stormData,
        });
        useCanvasStore.getState().setSelectedIds([newId]);
        useCanvasStore.getState().setInlineEdit({
          objectId: newId,
          zone: {
            type: "header",
            bounds: { x: 12, y: 6, width: 140, height: 24 },
          },
          initialValue: uniqueName,
        });
        return;
      }

      // 1-7: Switch card kind for selected storm card
      const KIND_DIGIT_MAP: Record<string, StormKind> = {
        Digit1: "command",
        Digit2: "event",
        Digit3: "actor",
        Digit4: "state",
        Digit5: "constraint",
        Digit6: "notify",
        Digit7: "query",
      };
      if (
        KIND_DIGIT_MAP[e.code] &&
        !isCmdOrCtrl &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const { selectedIds, objects } = useCanvasStore.getState();
        if (selectedIds.length === 1) {
          const selectedObj = objects.find((o) => o.id === selectedIds[0]);
          if (
            selectedObj &&
            selectedObj.type === "storm" &&
            selectedObj.stormData &&
            selectedObj.stormData.kind !== "bdd"
          ) {
            e.preventDefault();
            const targetKind = KIND_DIGIT_MAP[e.code];
            const updatedData: StormData = {
              ...selectedObj.stormData,
              kind: targetKind,
            };
            const newHeight = computeStormCardHeight(updatedData);
            useCanvasStore.getState().updateObject(selectedObj.id, {
              stormData: updatedData,
              height: newHeight,
            });
            return;
          }
        }
      }

      if (isCmdOrCtrl && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isCmdOrCtrl && e.code === "KeyY") {
        e.preventDefault();
        redo();
        return;
      }

      if (isCmdOrCtrl && e.code === "KeyA") {
        e.preventDefault();
        useCanvasStore.getState().selectAll();
        return;
      }

      if (e.code === "KeyV") {
        useCanvasStore.getState().setTool("select");
        return;
      }

      if (e.code === "KeyL") {
        useCanvasStore.getState().setTool("connector");
        return;
      }

      if (isCmdOrCtrl && e.code === "KeyG") {
        e.preventDefault();
        if (e.shiftKey) {
          useCanvasStore.getState().ungroupObjects();
        } else {
          useCanvasStore.getState().groupObjects();
        }
        return;
      }

      if (e.code === "KeyS" && !isCmdOrCtrl) {
        const bounds = spawnAtViewportCenter(
          useCanvasStore.getState().viewport,
          180,
          140,
        );
        useCanvasStore.getState().addObject({
          id: `sticky-${Date.now()}`,
          type: "stickyNote",
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          text: "Sticky Note",
        });
        return;
      }

      if (e.code === "KeyT" && !isCmdOrCtrl) {
        const bounds = spawnAtViewportCenter(
          useCanvasStore.getState().viewport,
          220,
          36,
        );
        useCanvasStore.getState().addObject({
          id: `text-${Date.now()}`,
          type: "textBox",
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          text: "Text",
        });
        return;
      }

      if (isCmdOrCtrl && e.code === "KeyF") {
        e.preventDefault();
        const current = useCanvasStore.getState().isSearchOpen;
        useCanvasStore.getState().setSearchOpen(!current);
        return;
      }

      if (isCmdOrCtrl && e.code === "KeyC") {
        const stormSelectedField = useCanvasStore.getState().stormSelectedField;
        if (stormSelectedField?.fieldId) {
          e.preventDefault();
          useCanvasStore.getState().copySelectedFields();
          return;
        }
      }

      if (isCmdOrCtrl && e.code === "KeyV") {
        const { selectedIds, fieldClipboard } = useCanvasStore.getState();
        if (selectedIds.length === 1 && fieldClipboard) {
          e.preventDefault();
          useCanvasStore.getState().pasteFields(selectedIds[0]);
          return;
        }
      }

      if (e.altKey && e.code === "ArrowUp") {
        const stormSelectedField = useCanvasStore.getState().stormSelectedField;
        if (stormSelectedField?.fieldId) {
          e.preventDefault();
          useCanvasStore
            .getState()
            .moveRow(
              stormSelectedField.objectId,
              stormSelectedField.fieldId,
              "up",
            );
          return;
        }
      }

      if (e.altKey && e.code === "ArrowDown") {
        const stormSelectedField = useCanvasStore.getState().stormSelectedField;
        if (stormSelectedField?.fieldId) {
          e.preventDefault();
          useCanvasStore
            .getState()
            .moveRow(
              stormSelectedField.objectId,
              stormSelectedField.fieldId,
              "down",
            );
          return;
        }
      }

      if (e.code === "Backspace" || e.code === "Delete") {
        const stormSelectedField = useCanvasStore.getState().stormSelectedField;
        if (stormSelectedField?.fieldId) {
          e.preventDefault();
          useCanvasStore.getState().deleteSelectedStormField();
          return;
        }

        const selectedIds = useCanvasStore.getState().selectedIds;
        if (selectedIds.length > 0) {
          e.preventDefault();
          useCanvasStore.getState().deleteObjects(selectedIds);
        }
        return;
      }

      if (e.code === "Escape") {
        if (useCanvasStore.getState().tool === "connector") {
          const handled = engine.handleEscape();
          if (!handled) {
            useCanvasStore.getState().setTool("select");
          }
          return;
        }
        engine.cancelConnectorCreation();
        useCanvasStore.getState().setSearchOpen(false);
        useCanvasStore.getState().clearSelection();
        useCanvasStore.getState().setStormSelectedField(null);
        useCanvasStore.getState().clearModelPopups();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        engine.setSpaceHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      void engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none"
      tabIndex={0}
    />
  );
}
