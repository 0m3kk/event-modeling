import { useState, useRef, useEffect } from "react";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  FolderOpen,
  Save,
  FilePlus,
  Cloud,
  Sparkles,
  Sun,
  Moon,
  ChevronDown,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore, undo, redo } from "@/store";
import { useTheme } from "@/hooks/useTheme";
import { saveProjectToFile, openProjectFromFile } from "@/utils/fileIO";

export function Header() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();

  const projectName = useCanvasStore((s) => s.projectName);
  const setProjectName = useCanvasStore((s) => s.setProjectName);
  const zoom = useCanvasStore((s) => s.viewport.zoom);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const canUndo = useCanvasStore((s) => s.canUndo());
  const canRedo = useCanvasStore((s) => s.canRedo());

  const isAIPanelOpen = useCanvasStore((s) => s.isAIPanelOpen);
  const setAIPanelOpen = useCanvasStore((s) => s.setAIPanelOpen);

  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  const setGoogleDriveModalOpen = useCanvasStore((s) => s.setGoogleDriveModalOpen);

  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(projectName);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleInput(projectName);
  }, [projectName]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    const trimmed = titleInput.trim();
    const finalName = trimmed || "Untitled Board";
    setTitleInput(finalName);
    if (finalName !== projectName) {
      setProjectName(finalName);
    }
  };

  // File menu dropdown
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setIsFileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleZoom = (factor: number) => {
    const next = Math.min(5, Math.max(0.1, zoom * factor));
    setViewport({ zoom: next });
  };

  const handleResetZoom = () => {
    setViewport({ zoom: 1 });
  };

  const handleSaveLocal = async () => {
    setIsFileMenuOpen(false);
    const { projectName, elements, viewport } = useCanvasStore.getState();
    await saveProjectToFile({ name: projectName, elements, viewport });
  };

  const handleOpenLocal = async () => {
    setIsFileMenuOpen(false);
    try {
      const project = await openProjectFromFile();
      if (project) {
        useCanvasStore.getState().loadProject(project);
      }
    } catch (err: any) {
      alert(`Lỗi đọc tệp: ${err.message}`);
    }
  };

  const handleNewBoard = () => {
    setIsFileMenuOpen(false);
    if (confirm(t("modal.newBoardDesc"))) {
      useCanvasStore.getState().clearBoard();
      setProjectName("Untitled Board");
    }
  };

  const toggleLanguage = () => {
    const next = i18n.language === "vi" ? "en" : "vi";
    i18n.changeLanguage(next);
    localStorage.setItem("event-modeling-lang", next);
  };

  return (
    <header className="flex h-14 w-full items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/90 select-none z-30">
      {/* Left: Project title & File menu & Google Drive */}
      <div className="flex items-center gap-2">
        {/* Title input */}
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSubmit();
              if (e.key === "Escape") {
                setTitleInput(projectName);
                setIsEditingTitle(false);
              }
            }}
            className="rounded border border-blue-500 bg-transparent px-2.5 py-1 text-xs font-semibold outline-none"
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="rounded px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100 dark:text-zinc-200 dark:hover:bg-zinc-800/80 cursor-pointer"
          >
            {projectName}
          </button>
        )}

        <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />

        {/* File Dropdown */}
        <div className="relative" ref={fileMenuRef}>
          <button
            onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
            className="flex items-center gap-1 rounded-lg border border-gray-200/80 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <span>{t("header.file")}</span>
            <ChevronDown size={13} />
          </button>

          {isFileMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 z-50">
              <button
                onClick={handleNewBoard}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <FilePlus size={15} />
                <span>{t("header.newBoard")}</span>
              </button>
              <button
                onClick={handleOpenLocal}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <FolderOpen size={15} />
                <span>{t("header.openLocal")}</span>
              </button>
              <button
                onClick={handleSaveLocal}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Save size={15} />
                <span>{t("header.saveLocal")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Google Drive Button */}
        <button
          onClick={() => setGoogleDriveModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200/80 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <Cloud size={14} className="text-blue-500" />
          <span>{t("header.drive")}</span>
        </button>
      </div>

      {/* Right: Undo/Redo & Zoom + Search, Language, Theme, AI Panel */}
      <div className="flex items-center gap-2">
        {/* Undo/Redo & Zoom Controls */}
        <div className="flex items-center gap-0.5 rounded-xl border border-gray-200/80 bg-gray-50/70 p-0.5 dark:border-zinc-800/80 dark:bg-zinc-800/40">
          <button
            onClick={undo}
            disabled={!canUndo}
            title={t("header.undo")}
            className="rounded-lg p-1.5 text-gray-700 hover:bg-white disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title={t("header.redo")}
            className="rounded-lg p-1.5 text-gray-700 hover:bg-white disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
          >
            <Redo2 size={15} />
          </button>

          <div className="mx-1 h-3.5 w-px bg-gray-200 dark:bg-zinc-700" />

          <button
            onClick={() => handleZoom(0.85)}
            title={t("header.zoomOut")}
            className="rounded-lg p-1.5 text-gray-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
          >
            <ZoomOut size={15} />
          </button>
          <span
            onClick={handleResetZoom}
            title={t("header.resetZoom")}
            className="cursor-pointer px-1 text-xs font-mono font-medium text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => handleZoom(1.15)}
            title={t("header.zoomIn")}
            className="rounded-lg p-1.5 text-gray-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={handleResetZoom}
            title={t("header.resetZoom")}
            className="rounded-lg p-1.5 text-gray-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />

        <button
          onClick={() => setSearchOpen(true)}
          title={t("header.search")}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200/80 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <Search size={14} />
          <span className="hidden sm:inline font-mono">⌘K</span>
        </button>

        <button
          onClick={toggleLanguage}
          className="rounded-lg border border-gray-200/80 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer font-mono"
        >
          {i18n.language.toUpperCase()}
        </button>

        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />

        <button
          onClick={() => setAIPanelOpen(!isAIPanelOpen)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            isAIPanelOpen
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
          }`}
        >
          <Sparkles size={14} />
          <span>{t("header.aiAssistant")}</span>
        </button>
      </div>
    </header>
  );
}
