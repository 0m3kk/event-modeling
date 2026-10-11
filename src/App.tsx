import { useEffect } from "react";
import { Header } from "@/components/Header";
import { PixiCanvas } from "@/components/PixiCanvas";
import { Toolbar } from "@/components/Toolbar";
import { AIPanel } from "@/components/AIPanel";
import { GoogleDriveModal } from "@/components/GoogleDriveModal";
import { SearchModal } from "@/components/SearchModal";
import { useTheme } from "@/hooks/useTheme";
import { useCanvasStore } from "@/store";
import { saveToAutoSave, loadFromAutoSave } from "@/utils/fileIO";

export function App() {
  useTheme();

  // Restore autosaved session on initial mount
  useEffect(() => {
    const saved = loadFromAutoSave();
    if (saved && saved.elements.length > 0) {
      useCanvasStore.getState().loadProject(saved);
    }
  }, []);

  // Periodic autosave to LocalStorage
  const elements = useCanvasStore((s) => s.elements);
  const projectName = useCanvasStore((s) => s.projectName);
  const viewport = useCanvasStore((s) => s.viewport);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveToAutoSave({ name: projectName, elements, viewport });
    }, 1000);
    return () => clearTimeout(timer);
  }, [elements, projectName, viewport]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#f9fafb] text-gray-900 dark:bg-[#121214] dark:text-zinc-100 overflow-hidden">
      <Header />
      <main id="canvas-container" className="relative flex-1 overflow-hidden outline-none">
        <PixiCanvas />
        <Toolbar />
        <AIPanel />
        <GoogleDriveModal />
        <SearchModal />
      </main>
    </div>
  );
}

export default App;
