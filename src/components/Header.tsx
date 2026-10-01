import { useState, useRef, useEffect, useCallback } from "react";
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
  History,
  Download,
  FileCode2,
  ChevronDown,
  CloudCheck,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { useCanvasStore, undo, redo, canUndo, canRedo, clearHistory } from "@/store";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  serializeStormFile,
  downloadStormFile,
  readStormFile,
  createBackup,
  hasBackup,
  restoreBackup,
  saveAutoSave,
} from "@/utils/fileIO";
import { DEFAULT_VIEWPORT } from "@/constants/canvas";
import { JsonSchemaExportModal } from "./JsonSchemaExportModal";
import { ExportImageModal } from "./ExportImageModal";
import { NewBoardModal } from "./NewBoardModal";

export function Header() {
  const objectCount = useCanvasStore((state) => state.objects.length);
  const selectedCount = useCanvasStore((state) => state.selectedIds.length);
  const zoom = useCanvasStore((state) => state.viewport.zoom);
  const isSearchOpen = useCanvasStore((state) => state.isSearchOpen);
  const setSearchOpen = useCanvasStore((state) => state.setSearchOpen);

  const projectName = useCanvasStore((state) => state.projectName);
  const setProjectName = useCanvasStore((state) => state.setProjectName);

  const [titleInput, setTitleInput] = useState(projectName);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
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
    const finalName = trimmed || "Untitled";
    setTitleInput(finalName);
    if (finalName !== projectName) {
      setProjectName(finalName);
    }
  };

  const { saveStatus } = useAutoSave();

  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isJsonSchemaModalOpen, setIsJsonSchemaModalOpen] = useState(false);
  const [isExportImageModalOpen, setIsExportImageModalOpen] = useState(false);
  const [isNewBoardModalOpen, setIsNewBoardModalOpen] = useState(false);

  // Transient success toast shown after an export finishes.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const fileMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        fileMenuRef.current &&
        !fileMenuRef.current.contains(e.target as Node)
      ) {
        setIsFileMenuOpen(false);
      }
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleZoomIn = () => {
    const nextZoom = Math.min(5.0, zoom * 1.2);
    useCanvasStore.getState().setViewport({ zoom: nextZoom });
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(0.1, zoom / 1.2);
    useCanvasStore.getState().setViewport({ zoom: nextZoom });
  };

  const handleResetZoom = () => {
    useCanvasStore.getState().setViewport({ zoom: 1 });
  };

  // Board data and the camera are read at call time so the save/backup actions
  // don't re-render the header on every camera move or drag frame.
  const executeNewBoard = useCallback(() => {
    setIsNewBoardModalOpen(false);
    const { objects, groups, viewport } = useCanvasStore.getState();
    if (objects.length > 0 || groups.length > 0) {
      createBackup({ objects, groups, viewport, name: projectName });
    }
    useCanvasStore.getState().resetBoard([], [], "Untitled");
    clearHistory();
    saveAutoSave({
      objects: [],
      groups: [],
      viewport: {
        ...DEFAULT_VIEWPORT,
        screenWidth: viewport.screenWidth,
        screenHeight: viewport.screenHeight,
      },
      name: "Untitled",
    });
  }, [projectName]);

  const handleNewBoard = useCallback(() => {
    setIsFileMenuOpen(false);
    const { objects, groups } = useCanvasStore.getState();
    if (objects.length > 0 || groups.length > 0) {
      setIsNewBoardModalOpen(true);
    } else {
      executeNewBoard();
    }
  }, [executeNewBoard]);

  const handleSaveFile = useCallback(() => {
    setIsFileMenuOpen(false);
    const saveName =
      (isEditingTitle ? titleInput : projectName).trim() || "Untitled";
    if (isEditingTitle && saveName !== projectName) {
      setProjectName(saveName);
      setTitleInput(saveName);
      setIsEditingTitle(false);
    }
    const { objects, groups, viewport } = useCanvasStore.getState();
    const serialized = serializeStormFile({
      objects,
      groups,
      viewport,
      name: saveName,
    });
    downloadStormFile(JSON.parse(serialized), saveName);
  }, [isEditingTitle, titleInput, projectName, setProjectName]);

  // Keyboard shortcuts: Cmd+S / Ctrl+S to save, Cmd+N / Ctrl+N for new board
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.code === "KeyS") {
        e.preventDefault();
        handleSaveFile();
      } else if (isCmdOrCtrl && e.code === "KeyN") {
        e.preventDefault();
        handleNewBoard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveFile, handleNewBoard]);

  const handleOpenFileClick = () => {
    setIsFileMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const project = await readStormFile(file);
      // Create backup before applying
      const { objects, groups, viewport } = useCanvasStore.getState();
      createBackup({ objects, groups, viewport, name: projectName });
      const loadedName =
        project.name?.trim() ||
        file.name.replace(/\.(storm|json)$/i, "").trim() ||
        "Untitled";
      useCanvasStore
        .getState()
        .resetBoard(project.objects, project.groups, loadedName);
      if (project.viewport) {
        useCanvasStore.getState().setViewport(project.viewport);
      }
      clearHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open file";
      alert(msg);
    } finally {
      // Clear file input
      e.target.value = "";
    }
  };

  const handleRestoreBackup = () => {
    setIsFileMenuOpen(false);
    if (!hasBackup()) {
      alert("No backup found to restore.");
      return;
    }

    try {
      const { objects, groups, viewport } = useCanvasStore.getState();
      const restored = restoreBackup({
        objects,
        groups,
        viewport,
        name: projectName,
      });
      useCanvasStore
        .getState()
        .resetBoard(
          restored.objects,
          restored.groups,
          restored.name || "Restored Project",
        );
      if (restored.viewport) {
        useCanvasStore.getState().setViewport(restored.viewport);
      }
      clearHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore backup";
      alert(msg);
    }
  };

  return (
    <>
      <header className="flex h-12 w-full items-center justify-between border-b border-gray-200 bg-white px-4">
        {/* Left Side: Logo & File Menus */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Editable Project Name */}
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleInput}
                style={{ width: `${Math.max(titleInput.length + 1, 8)}ch` }}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    setTitleInput(projectName);
                    setIsEditingTitle(false);
                  }
                }}
                className="h-7 max-w-50 sm:max-w-70 md:max-w-90 rounded px-1.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 border border-blue-500 transition-colors"
                title="Project name"
                placeholder="Untitled"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="group flex items-center gap-1.5 h-7 rounded px-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer text-left shrink-0"
                title="Click to rename project"
              >
                <span className="truncate max-w-50 sm:max-w-70 md:max-w-90">
                  {projectName || "Untitled"}
                </span>
                <Pencil
                  size={11}
                  className="text-gray-400 hidden group-hover:inline-block shrink-0"
                />
              </button>
            )}

            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              <CloudCheck size={12} className="text-emerald-600" />
              <span>{saveStatus === "saving" ? "Saving..." : "Saved"}</span>
            </div>
          </div>

          <div className="mx-1 h-4 w-px bg-gray-200" />

          {/* File Dropdown */}
          <div className="relative" ref={fileMenuRef}>
            <button
              onClick={() => {
                setIsFileMenuOpen((v) => !v);
                setIsExportMenuOpen(false);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              <span>File</span>
              <ChevronDown size={12} className="text-gray-400" />
            </button>

            {isFileMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
                <button
                  onClick={handleNewBoard}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FilePlus size={14} className="text-gray-400" />
                    <span>New</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">⌘N</span>
                </button>
                <button
                  onClick={handleOpenFileClick}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <FolderOpen size={14} className="text-gray-400" />
                  <span>Open</span>
                </button>
                <button
                  onClick={handleSaveFile}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Save size={14} className="text-gray-400" />
                    <span>Save</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">⌘S</span>
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={handleRestoreBackup}
                  disabled={!hasBackup()}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  <History size={14} className="text-gray-400" />
                  <span>Restore</span>
                </button>
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => {
                setIsExportMenuOpen((v) => !v);
                setIsFileMenuOpen(false);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              <span>Export</span>
              <ChevronDown size={12} className="text-gray-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    setIsExportImageModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <Download size={14} className="text-gray-400" />
                  <span>Image</span>
                </button>
                <button
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    setIsJsonSchemaModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <FileCode2 size={14} className="text-blue-500" />
                  <span className="font-medium text-blue-600">
                    JSON Schema
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 border-l border-gray-200 pl-3 text-xs text-gray-500 sm:flex">
            <span>{objectCount} objects</span>
            {selectedCount > 0 && (
              <span className="font-medium text-blue-600">
                ({selectedCount} selected)
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Tools, Search, Undo/Redo & Zoom */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button
            onClick={() => setSearchOpen(!isSearchOpen)}
            title="Search (Cmd+F)"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200/90 bg-gray-50/80 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className="py-0.2 rounded border border-gray-200 bg-white px-1 font-mono text-[10px] text-gray-400">
              ⌘F
            </kbd>
          </button>

          <div className="mx-1 h-5 w-px bg-gray-200" />

          {/* Undo / Redo */}
          <div className="flex items-center border-r border-gray-200 pr-2">
            <button
              onClick={() => undo()}
              disabled={!canUndo()}
              title="Undo (Cmd+Z)"
              className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={() => redo()}
              disabled={!canRedo()}
              title="Redo (Cmd+Shift+Z)"
              className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 size={16} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset Zoom to 100%"
              className="w-14 text-center font-mono text-xs text-gray-700 hover:text-blue-600"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset View"
              className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Hidden file input for opening .storm files */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".storm,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Modals */}
      <JsonSchemaExportModal
        isOpen={isJsonSchemaModalOpen}
        onClose={() => setIsJsonSchemaModalOpen(false)}
        onExported={(detail) =>
          showToast(`JSON Schema exported successfully — ${detail}`)
        }
      />
      <ExportImageModal
        isOpen={isExportImageModalOpen}
        onClose={() => setIsExportImageModalOpen(false)}
        onOpenJsonSchema={() => {
          setIsExportImageModalOpen(false);
          setIsJsonSchemaModalOpen(true);
        }}
        onExported={(format, detail) =>
          showToast(
            format === "png"
              ? `PNG exported successfully — ${detail}`
              : `SVG exported successfully — ${detail}`,
          )
        }
      />
      <NewBoardModal
        isOpen={isNewBoardModalOpen}
        onClose={() => setIsNewBoardModalOpen(false)}
        onConfirm={executeNewBoard}
      />

      {/* Export success toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="toast-enter fixed top-16 right-5 z-[60] flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-emerald-500/40 ring-1 ring-emerald-900/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
            <CheckCircle2 size={20} className="text-white" />
          </span>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}
