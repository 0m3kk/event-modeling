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
  Cloud,
  CloudUpload,
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
import { CodegenSpecExportModal } from "./CodegenSpecExportModal";
import { ExportImageModal } from "./ExportImageModal";
import { NewBoardModal } from "./NewBoardModal";
import { GoogleDriveModal } from "./GoogleDriveModal";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useTranslation } from "react-i18next";
import { isDesktopApp } from "@/utils/platform";
import { MENU_ACTION_EVENT } from "@/constants/menu";

const IS_DESKTOP = isDesktopApp();

export function Header() {
  const { t } = useTranslation();
  const objectCount = useCanvasStore((state) => state.objects.length);
  const selectedCount = useCanvasStore((state) => state.selectedIds.length);
  const zoom = useCanvasStore((state) => state.viewport.zoom);
  const isSearchOpen = useCanvasStore((state) => state.isSearchOpen);
  const setSearchOpen = useCanvasStore((state) => state.setSearchOpen);

  const projectName = useCanvasStore((state) => state.projectName);
  const setProjectName = useCanvasStore((state) => state.setProjectName);
  const googleDriveFileId = useCanvasStore((state) => state.googleDriveFileId);

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
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);
  const [googleDriveModalTab, setGoogleDriveModalTab] = useState<"save" | "open">("save");

  const handleOpenGoogleDriveSave = useCallback(() => {
    setIsFileMenuOpen(false);
    setIsExportMenuOpen(false);
    setGoogleDriveModalTab("save");
    setIsGoogleDriveModalOpen(true);
  }, []);

  const handleOpenGoogleDriveOpen = useCallback(() => {
    setIsFileMenuOpen(false);
    setIsExportMenuOpen(false);
    setGoogleDriveModalTab("open");
    setIsGoogleDriveModalOpen(true);
  }, []);

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
        // The desktop build routes Cmd+S through the native menu accelerator.
        if (IS_DESKTOP) return;
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

  // Keep the latest handlers reachable from the native menu listener without
  // re-subscribing on every render.
  const menuActionsRef = useRef<Record<string, () => void>>({});
  useEffect(() => {
    menuActionsRef.current = {
      "file.new": handleNewBoard,
      "file.open": handleOpenFileClick,
      "file.open_drive": handleOpenGoogleDriveOpen,
      "file.save": handleSaveFile,
      "file.save_drive": handleOpenGoogleDriveSave,
      "file.restore_backup": handleRestoreBackup,
      "edit.search": () => {
        const store = useCanvasStore.getState();
        store.setSearchOpen(!store.isSearchOpen);
      },
      "view.zoom_in": handleZoomIn,
      "view.zoom_out": handleZoomOut,
      "view.zoom_reset": handleResetZoom,
      "export.image": () => setIsExportImageModalOpen(true),
      "export.json_schema": () => setIsJsonSchemaModalOpen(true),
      "export.drive": handleOpenGoogleDriveSave,
    };
  });

  // Desktop only: the native application menu lives in the OS menu bar.
  useEffect(() => {
    if (!IS_DESKTOP) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<string>(MENU_ACTION_EVENT, (event) => {
          menuActionsRef.current[event.payload]?.();
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to subscribe to native menu events:", err);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <>
      <header className="flex h-12 w-full items-center justify-between border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 transition-colors">
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
                className="h-7 max-w-50 sm:max-w-70 md:max-w-90 rounded px-1.5 text-sm font-semibold text-gray-800 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-blue-500 transition-colors"
                title={t("header.projectName")}
                placeholder={t("common.untitled")}
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="group flex items-center gap-1.5 h-7 rounded px-1.5 text-sm font-semibold text-gray-800 dark:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left shrink-0"
                title={t("header.clickToRename")}
              >
                <span className="truncate max-w-50 sm:max-w-70 md:max-w-90">
                  {projectName || t("common.untitled")}
                </span>
                <Pencil
                  size={11}
                  className="text-gray-400 hidden group-hover:inline-block shrink-0"
                />
              </button>
            )}

            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <CloudCheck size={12} className="text-emerald-600" />
              <span>{saveStatus === "saving" ? t("common.saving") : t("common.saved")}</span>
            </div>

            <button
              type="button"
              onClick={handleOpenGoogleDriveSave}
              title={googleDriveFileId ? t("header.driveLinkedTooltip") : t("header.saveToDriveTooltip")}
              className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <Cloud size={12} className={googleDriveFileId ? "text-blue-600" : "text-gray-400"} />
              <span>{googleDriveFileId ? t("header.driveLinked") : t("header.drive")}</span>
            </button>
          </div>

          {/* Desktop uses the native OS menu bar instead of in-app dropdowns. */}
          {!IS_DESKTOP && (
            <>
              <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />

              {/* File Dropdown */}
              <div className="relative" ref={fileMenuRef}>
                <button
                  onClick={() => {
                    setIsFileMenuOpen((v) => !v);
                    setIsExportMenuOpen(false);
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  <span>{t("header.fileMenu")}</span>
                  <ChevronDown size={12} className="text-gray-400" />
                </button>

                {isFileMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
                    <button
                      onClick={handleNewBoard}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <FilePlus size={14} className="text-gray-400" />
                        <span>{t("header.newBoard")}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">⌘N</span>
                    </button>
                    <button
                      onClick={handleOpenFileClick}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <FolderOpen size={14} className="text-gray-400" />
                      <span>{t("header.openLocal")}</span>
                    </button>
                    <button
                      onClick={handleOpenGoogleDriveOpen}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Cloud size={14} className="text-blue-500" />
                      <span>{t("header.openDrive")}</span>
                    </button>
                    <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                    <button
                      onClick={handleSaveFile}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Save size={14} className="text-gray-400" />
                        <span>{t("header.saveLocal")}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">⌘S</span>
                    </button>
                    <button
                      onClick={handleOpenGoogleDriveSave}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <CloudUpload size={14} className="text-blue-500" />
                      <span>{t("header.saveDrive")}</span>
                    </button>
                    <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                    <button
                      onClick={handleRestoreBackup}
                      disabled={!hasBackup()}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <History size={14} className="text-gray-400" />
                      <span>{t("header.restoreBackup")}</span>
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
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  <span>{t("header.exportMenu")}</span>
                  <ChevronDown size={12} className="text-gray-400" />
                </button>

                {isExportMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-44 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
                    <button
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        setIsExportImageModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                    >
                      <Download size={14} className="text-gray-400" />
                      <span>{t("header.exportImage")}</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        setIsJsonSchemaModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                    >
                      <FileCode2 size={14} className="text-blue-500" />
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {t("header.exportCodegenSpec")}
                      </span>
                    </button>
                    <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                    <button
                      onClick={handleOpenGoogleDriveSave}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                    >
                      <CloudUpload size={14} className="text-blue-500" />
                      <span>{t("header.exportDrive")}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="hidden items-center gap-2 border-l border-gray-200 dark:border-zinc-800 pl-3 text-xs text-gray-500 dark:text-zinc-400 sm:flex">
            <span>{t("common.objects", { count: objectCount })}</span>
            {selectedCount > 0 && (
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {t("common.selected", { count: selectedCount })}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Tools, Search, Undo/Redo, Zoom & Language/Theme */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button
            onClick={() => setSearchOpen(!isSearchOpen)}
            title={t("header.searchTooltip")}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200/90 dark:border-zinc-700/80 bg-gray-50/80 dark:bg-zinc-800/80 px-2.5 py-1 text-xs text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-800 dark:hover:text-zinc-200 cursor-pointer"
          >
            <Search size={14} />
            <span>{t("common.search")}</span>
            <kbd className="py-0.2 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1 font-mono text-[10px] text-gray-400 dark:text-zinc-400">
              ⌘F
            </kbd>
          </button>

          <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-zinc-800" />

          {/* Undo / Redo */}
          <div className="flex items-center border-r border-gray-200 dark:border-zinc-800 pr-2">
            <button
              onClick={() => undo()}
              disabled={!canUndo()}
              title={t("header.undoTooltip")}
              className="rounded p-1.5 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={() => redo()}
              disabled={!canRedo()}
              title={t("header.redoTooltip")}
              className="rounded p-1.5 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <Redo2 size={16} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              title={t("header.zoomOutTooltip")}
              className="rounded p-1.5 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-200 cursor-pointer"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              title={t("header.resetZoomTooltip")}
              className="w-14 text-center font-mono text-xs text-gray-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              title={t("header.zoomInTooltip")}
              className="rounded p-1.5 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-200 cursor-pointer"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              title={t("header.resetViewTooltip")}
              className="rounded p-1.5 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-200 cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-zinc-800" />

          {/* Language Toggle */}
          <LanguageToggle />

          {/* Theme Toggle */}
          <ThemeToggle />
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
      <CodegenSpecExportModal
        isOpen={isJsonSchemaModalOpen}
        onClose={() => setIsJsonSchemaModalOpen(false)}
        onExported={(detail) =>
          showToast(t("header.toast.codegenSpecSuccess", { detail }))
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
      <GoogleDriveModal
        isOpen={isGoogleDriveModalOpen}
        initialTab={googleDriveModalTab}
        onClose={() => setIsGoogleDriveModalOpen(false)}
        onSuccessToast={showToast}
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
