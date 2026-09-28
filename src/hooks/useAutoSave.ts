import { useEffect, useState, useRef } from "react";
import { useCanvasStore } from "@/store";
import {
  saveAutoSave,
  loadAutoSave,
} from "@/utils/fileIO";

export function useAutoSave() {
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  // Restore on initial mount if store is currently empty
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const currentObjects = useCanvasStore.getState().objects;
      if (currentObjects.length === 0) {
        const autoSaved = loadAutoSave();
        if (
          autoSaved &&
          (autoSaved.objects.length > 0 ||
            autoSaved.groups.length > 0 ||
            Boolean(autoSaved.name))
        ) {
          useCanvasStore
            .getState()
            .resetBoard(
              autoSaved.objects,
              autoSaved.groups,
              autoSaved.name || "Untitled",
            );
          if (autoSaved.viewport) {
            useCanvasStore.getState().setViewport(autoSaved.viewport);
          }
          setLastSaved(new Date());
        }
      }
    }
  }, []);

  // Listen to store updates and auto-save (debounced)
  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (
        state.projectName === prevState.projectName &&
        state.objects === prevState.objects &&
        state.groups === prevState.groups &&
        state.viewport.x === prevState.viewport.x &&
        state.viewport.y === prevState.viewport.y &&
        state.viewport.zoom === prevState.viewport.zoom
      ) {
        return;
      }

      setSaveStatus("saving");

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const { objects, groups, viewport, projectName } =
          useCanvasStore.getState();
        saveAutoSave({ objects, groups, viewport, name: projectName });
        setSaveStatus("saved");
        setLastSaved(new Date());
      }, 800);
    });

    return () => {
      unsub();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return { saveStatus, lastSaved };
}
