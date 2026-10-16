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

      // Duplicate / Copy reference
      if (isCmdOrCtrl && e.code === "KeyD") {
        e.preventDefault();
        const selectedIds = useCanvasStore.getState().selectedIds;
        if (selectedIds.length === 1) {
          useCanvasStore.getState().createReferenceCopy(selectedIds[0]);
        }
        return;
      }

      // Copy selection into the clipboard
      if (isCmdOrCtrl && e.code === "KeyC") {
        e.preventDefault();
        useCanvasStore.getState().copySelection();
        return;
      }

      // Paste the clipboard as independent copies
      if (isCmdOrCtrl && e.code === "KeyV") {
        e.preventDefault();
        useCanvasStore.getState().pasteClipboard();
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

      // Arrow Up / Down navigation between fields and sections
      if (!isCmdOrCtrl && (e.code === "ArrowUp" || e.code === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const state = useCanvasStore.getState();
        if (state.selectedField && !state.inlineEdit) {
          e.preventDefault();
          const direction = (e.code === "ArrowDown" || e.key === "ArrowDown") ? "down" : "up";
          state.navigateSelectedField(direction);
          return;
        }
      }

      // Delete selected
      if (e.code === "Delete" || e.code === "Backspace") {
        const selectedField = useCanvasStore.getState().selectedField;
        if (selectedField) {
          e.preventDefault();
          useCanvasStore.getState().deleteSelectedField();
          return;
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
