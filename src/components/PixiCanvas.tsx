import { useEffect, useRef } from "react";
import { PixiEngine } from "@/engine/PixiEngine";
import { useCanvasStore, undo, redo } from "@/store";
import { toolRegistry } from "@/tools";

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
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Spacebar for hand pan
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        engine.setSpaceHeld(true);
        return;
      }

      // Undo / Redo
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

      // Select All
      if (isCmdOrCtrl && e.code === "KeyA") {
        e.preventDefault();
        useCanvasStore.getState().selectAll();
        return;
      }

      // Select tool
      if (e.code === "KeyV" && !isCmdOrCtrl) {
        useCanvasStore.getState().setTool("select");
        return;
      }

      // Search dialog
      if (isCmdOrCtrl && (e.code === "KeyK" || e.code === "KeyF")) {
        e.preventDefault();
        const current = useCanvasStore.getState().isSearchOpen;
        useCanvasStore.getState().setSearchOpen(!current);
        return;
      }

      // Delete selected
      if (e.code === "Delete" || e.code === "Backspace") {
        const selectedField = useCanvasStore.getState().selectedField;
        if (selectedField) {
          e.preventDefault();
          const elements = useCanvasStore.getState().elements;
          const el = elements.find((item) => item.id === selectedField.elementId);
          if (el && el.data.fields && el.data.fields.length > selectedField.fieldIndex) {
            const nextFields = el.data.fields.filter(
              (_: any, i: number) => i !== selectedField.fieldIndex,
            );
            const tool = toolRegistry.get(el.type);
            const nextData = { ...el.data, fields: nextFields };
            const nextSize = tool?.computeSize ? tool.computeSize(nextData) : null;
            useCanvasStore.getState().updateElement(el.id, {
              height: nextSize ? nextSize.height : el.height,
              data: nextData,
            });
            useCanvasStore.getState().setSelectedField(null);
            return;
          }
        }

        const selectedIds = useCanvasStore.getState().selectedIds;
        if (selectedIds.length > 0) {
          e.preventDefault();
          useCanvasStore.getState().deleteElements(selectedIds);
        }
        return;
      }

      // Escape
      if (e.code === "Escape") {
        engine.cancelInteraction();
        useCanvasStore.getState().setTool("select");
        useCanvasStore.getState().clearSelection();
        useCanvasStore.getState().setSearchOpen(false);
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
      className="relative h-full w-full overflow-hidden select-none outline-none focus:outline-none"
    />
  );
}
