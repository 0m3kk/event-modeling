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
      {/* Left: Project title & File menu */}
      <div className="flex items-center gap-3">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2 font-bold text-sm tracking-tight text-orange-600 dark:text-orange-500">
          <div className="h-6 w-6 rounded-lg bg-orange-600 dark:bg-orange-500 text-white flex items-center justify-center text-xs font-black">
            EM
          </div>
          <span>EventModeling</span>
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-zinc-800" />

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
            className="rounded border border-blue-500 bg-transparent px-2 py-0.5 text-sm font-medium outline-none"
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="rounded px-2 py-0.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
          >
            {projectName}
          </button>
        )}

        {/* File Dropdown */}
        <div className="relative" ref={fileMenuRef}>
          <button
            onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
            className="flex items-center gap-1 rounded-lg border border-gray-200/80 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span>{t("header.file")}</span>
            <ChevronDown size={14} />
          </button>

          {isFileMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 z-50">
              <button
                onClick={handleNewBoard}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <FilePlus size={15} />
                <span>{t("header.newBoard")}</span>
              </button>
              <button
                onClick={handleOpenLocal}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <FolderOpen size={15} />
                <span>{t("header.openLocal")}</span>
              </button>
              <button
                onClick={handleSaveLocal}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
          className="flex items-center gap-1.5 rounded-lg border border-gray-200/80 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Cloud size={15} className="text-blue-500" />
          <span>{t("header.drive")}</span>
        </button>
      </div>

      {/* Center: Undo/Redo & Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          title={t("header.undo")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={t("header.redo")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <Redo2 size={16} />
        </button>

        <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />

        <button
          onClick={() => handleZoom(0.85)}
          title={t("header.zoomOut")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <ZoomOut size={16} />
        </button>
        <span
          onClick={handleResetZoom}
          title={t("header.resetZoom")}
          className="cursor-pointer px-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => handleZoom(1.15)}
          title={t("header.zoomIn")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleResetZoom}
          title={t("header.resetZoom")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Right: Search, Language, Theme, AI Panel */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSearchOpen(true)}
          title={t("header.search")}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200/80 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <Search size={14} />
          <span className="hidden sm:inline">⌘K</span>
        </button>

        <button
          onClick={toggleLanguage}
          className="rounded-lg border border-gray-200/80 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          {i18n.language.toUpperCase()}
        </button>

        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
        >
          {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="h-5 w-px bg-gray-200 dark:bg-zinc-800" />

        <button
          onClick={() => setAIPanelOpen(!isAIPanelOpen)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            isAIPanelOpen
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
          }`}
        >
          <Sparkles size={15} />
          <span>{t("header.aiAssistant")}</span>
        </button>
      </div>
    </header>
  );
}
