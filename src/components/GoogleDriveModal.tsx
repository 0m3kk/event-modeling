import { useState, useEffect } from "react";
import {
  X,
  Cloud,
  Loader2,
  LogOut,
  Download,
  Upload,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  signInWithGoogle,
  signOutGoogle,
  getActiveGoogleAuth,
  listDriveFiles,
  listDriveFolders,
  createDriveFolder,
  saveToGoogleDrive,
  downloadFromGoogleDrive,
  getStoredGoogleClientId,
  setStoredGoogleClientId,
  getStoredDriveFolderPath,
  setStoredDriveFolderPath,
  stripFileExtension,
  type GoogleDriveFile,
  type GoogleDriveFolder,
  type DriveFolderPath,
  type GoogleUserProfile,
} from "@/utils/googleDrive";
import { serializeProjectV3, parseProjectBytes } from "@/utils/projectFile";
import { changeRecorder } from "@/store/recorder";

export function GoogleDriveModal() {
  const { t } = useTranslation();
  const isOpen = useCanvasStore((s) => s.isGoogleDriveModalOpen);
  const setOpen = useCanvasStore((s) => s.setGoogleDriveModalOpen);
  const initialTab = useCanvasStore((s) => s.driveModalTab);

  const projectName = useCanvasStore((s) => s.projectName);
  const setProjectName = useCanvasStore((s) => s.setProjectName);
  const elements = useCanvasStore((s) => s.elements);
  const viewport = useCanvasStore((s) => s.viewport);
  const projectId = useCanvasStore((s) => s.projectId);
  const projectCreatedAt = useCanvasStore((s) => s.projectCreatedAt);
  const googleDriveFileId = useCanvasStore((s) => s.googleDriveFileId);
  const googleDriveFileName = useCanvasStore((s) => s.googleDriveFileName);
  const setGoogleDriveFileId = useCanvasStore((s) => s.setGoogleDriveFileId);

  const [tab, setTab] = useState<"save" | "open">(initialTab);
  const [clientId, setClientId] = useState(getStoredGoogleClientId);
  const [isConfiguringClientId, setIsConfiguringClientId] = useState(!getStoredGoogleClientId());

  const [auth, setAuth] = useState(getActiveGoogleAuth);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [saveFileName, setSaveFileName] = useState(projectName);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Destination folder for new Drive files. An empty path means My Drive root.
  const [folderPath, setFolderPath] = useState<DriveFolderPath>(getStoredDriveFolderPath);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<DriveFolderPath>([]);
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [isFolderLoading, setIsFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    setTab(initialTab);
    setSaveFileName(projectName);
    setIsFolderPickerOpen(false);
  }, [initialTab, projectName, isOpen]);

  useEffect(() => {
    if (auth.accessToken && tab === "open") {
      loadFilesList();
    }
  }, [auth.accessToken, tab]);

  // When the modal opens without a valid session, try to restore it silently
  // (no popup) using a previously granted consent, so a returning visitor does
  // not have to sign in again while the Google session is still alive.
  useEffect(() => {
    if (!isOpen || auth.accessToken) return;
    const storedClientId = getStoredGoogleClientId();
    if (!storedClientId) return;
    let cancelled = false;
    signInWithGoogle(storedClientId, { silent: true })
      .then((res) => {
        if (!cancelled && res.accessToken) {
          setAuth(res);
          setIsConfiguringClientId(false);
        }
      })
      .catch(() => {
        // Silent refresh needs a live Google session; fall back to manual sign-in.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, auth.accessToken]);

  const loadFilesList = async () => {
    if (!auth.accessToken) return;
    setIsLoading(true);
    try {
      const list = await listDriveFiles(auth.accessToken);
      setFiles(list);
    } catch (err: any) {
      setStatusMessage(t("drive.errorList", { message: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!clientId.trim()) {
      setIsConfiguringClientId(true);
      return;
    }
    setIsLoading(true);
    setStatusMessage(null);
    try {
      setStoredGoogleClientId(clientId.trim());
      const res = await signInWithGoogle(clientId.trim());
      setAuth(res);
      setIsConfiguringClientId(false);
    } catch (err: any) {
      setStatusMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    signOutGoogle();
    setAuth({ accessToken: null, user: null });
    setFiles([]);
  };

  const loadFolders = async (path: DriveFolderPath) => {
    if (!auth.accessToken) return;
    setIsFolderLoading(true);
    setFolderError(null);
    try {
      const parentId = path.length ? path[path.length - 1].id : null;
      const list = await listDriveFolders(auth.accessToken, parentId);
      setFolders(list);
    } catch (err: any) {
      setFolderError(t("drive.errorFolders", { message: err.message }));
      setFolders([]);
    } finally {
      setIsFolderLoading(false);
    }
  };

  const openFolderPicker = () => {
    setBrowsePath(folderPath);
    setNewFolderName("");
    setIsFolderPickerOpen(true);
    loadFolders(folderPath);
  };

  const navigateToFolder = (folder: GoogleDriveFolder) => {
    const next = [...browsePath, folder];
    setBrowsePath(next);
    loadFolders(next);
  };

  const navigateToCrumb = (index: number) => {
    const next = index < 0 ? [] : browsePath.slice(0, index + 1);
    setBrowsePath(next);
    loadFolders(next);
  };

  const handleCreateFolder = async () => {
    if (!auth.accessToken) return;
    const name = newFolderName.trim();
    if (!name) return;
    setIsFolderLoading(true);
    setFolderError(null);
    try {
      const parentId = browsePath.length ? browsePath[browsePath.length - 1].id : null;
      const created = await createDriveFolder(auth.accessToken, name, parentId);
      const next = [...browsePath, created];
      setBrowsePath(next);
      setNewFolderName("");
      await loadFolders(next);
    } catch (err: any) {
      setFolderError(t("drive.errorCreateFolder", { message: err.message }));
    } finally {
      setIsFolderLoading(false);
    }
  };

  const handleSelectFolder = () => {
    setFolderPath(browsePath);
    setStoredDriveFolderPath(browsePath);
    setIsFolderPickerOpen(false);
  };

  const isCurrentFolder = (path: DriveFolderPath) =>
    path.length === folderPath.length && path.every((f, i) => f.id === folderPath[i].id);

  const selectedFolderLabel = folderPath.length
    ? folderPath.map((f) => f.name).join(" / ")
    : t("drive.myDrive");

  const handleSave = async () => {
    if (!auth.accessToken) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      changeRecorder.flush();
      const bytes = serializeProjectV3({
        name: saveFileName,
        elements,
        viewport,
        log: changeRecorder.getLog(),
        id: projectId,
        createdAt: projectCreatedAt,
        withCheckpoint: true,
      });
      const targetFolderId = folderPath.length ? folderPath[folderPath.length - 1].id : null;
      const res = await saveToGoogleDrive(
        auth.accessToken,
        saveFileName,
        bytes,
        googleDriveFileId,
        targetFolderId,
      );
      setGoogleDriveFileId(res.id, saveFileName);
      setProjectName(saveFileName);
      setStatusMessage(t("drive.saveSuccess"));
      setTimeout(() => setOpen(false), 1200);
    } catch (err: any) {
      setStatusMessage(t("drive.errorSave", { message: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFile = async (file: GoogleDriveFile) => {
    if (!auth.accessToken) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const bytes = await downloadFromGoogleDrive(auth.accessToken, file.id);
      const project = parseProjectBytes(bytes);
      useCanvasStore.getState().loadProject(project);
      setGoogleDriveFileId(file.id, file.name);
      setStatusMessage(
        t("drive.openSuccess", { name: stripFileExtension(file.name) }),
      );
      setTimeout(() => setOpen(false), 800);
    } catch (err: any) {
      setStatusMessage(t("drive.errorOpen", { message: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Cloud className="text-blue-500" size={18} />
            <span>{t("drive.title")}</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        {!auth.accessToken ? (
          /* Sign-in prompt */
          <div className="space-y-4 py-4">
            <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed">
              {t("drive.connectDesc")}
            </p>

            {isConfiguringClientId || !clientId ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-zinc-300">
                  {t("drive.clientIdLabel")}
                </label>
                <input
                  type="text"
                  placeholder={t("drive.clientIdPlaceholder")}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:text-zinc-100"
                />
                <p className="text-[11px] text-gray-400">
                  {t("drive.clientIdHelp")}
                </p>
              </div>
            ) : null}

            {statusMessage && (
              <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {statusMessage}
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
              <span>{t("drive.signIn")}</span>
            </button>
          </div>
        ) : (
          /* Authenticated UI */
          <div className="space-y-4 py-3">
            {/* User Profile Bar */}
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-zinc-800/60">
              <div className="flex items-center gap-2">
                {auth.user?.picture ? (
                  <img src={auth.user.picture} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                    {auth.user?.email?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <span className="text-xs font-medium text-gray-800 dark:text-zinc-200">
                  {auth.user?.email || t("drive.connected")}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                title={t("drive.signOut")}
                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
              >
                <LogOut size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-zinc-800">
              <button
                onClick={() => setTab("save")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                  tab === "save"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {t("drive.saveTab")}
              </button>
              <button
                onClick={() => setTab("open")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                  tab === "open"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {t("drive.openTab")}
              </button>
            </div>

            {statusMessage && (
              <div className="rounded-lg bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                {statusMessage}
              </div>
            )}

            {tab === "save" ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{t("drive.fileName")}</label>
                  <input
                    type="text"
                    value={saveFileName}
                    onChange={(e) => setSaveFileName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:text-zinc-100"
                  />
                  {googleDriveFileId && (
                    <p className="text-[11px] text-green-600 dark:text-green-400">
                      {t("drive.overwriteHint", {
                        name: googleDriveFileName || saveFileName,
                      })}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{t("drive.folderLabel")}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 dark:border-zinc-700">
                      <Folder size={14} className="shrink-0 text-amber-500" />
                      <span className="truncate text-xs text-gray-800 dark:text-zinc-200">
                        {selectedFolderLabel}
                      </span>
                    </div>
                    <button
                      onClick={openFolderPicker}
                      disabled={isLoading || Boolean(googleDriveFileId)}
                      className="shrink-0 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      {t("drive.chooseFolder")}
                    </button>
                  </div>
                  {googleDriveFileId ? (
                    <p className="text-[11px] text-gray-400">{t("drive.folderLockedHint")}</p>
                  ) : null}
                </div>

                {isFolderPickerOpen && !googleDriveFileId && (
                  <div className="space-y-2 rounded-xl border border-gray-200 p-2.5 dark:border-zinc-700">
                    {/* Breadcrumb */}
                    <div className="flex min-w-0 items-center gap-0.5">
                      <button
                        onClick={() => navigateToCrumb(-1)}
                        disabled={browsePath.length === 0}
                        title={t("drive.myDrive")}
                        className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        onClick={() => navigateToCrumb(-1)}
                        className="truncate rounded px-1 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        {t("drive.myDrive")}
                      </button>
                      {browsePath.map((crumb, index) => (
                        <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                          <ChevronRight size={12} className="shrink-0 text-gray-400" />
                          <button
                            onClick={() => navigateToCrumb(index)}
                            className="truncate rounded px-1 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            {crumb.name}
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Subfolders */}
                    <div className="max-h-36 overflow-y-auto">
                      {isFolderLoading ? (
                        <div className="flex items-center justify-center py-4 text-xs text-gray-400">
                          <Loader2 size={14} className="mr-2 animate-spin" />
                          <span>{t("drive.loading")}</span>
                        </div>
                      ) : folders.length === 0 ? (
                        <div className="py-4 text-center text-xs text-gray-400">
                          {t("drive.noFolders")}
                        </div>
                      ) : (
                        folders.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => navigateToFolder(folder)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-100 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Folder size={14} className="shrink-0 text-amber-500" />
                            <span className="truncate">{folder.name}</span>
                            <ChevronRight size={12} className="ml-auto shrink-0 text-gray-400" />
                          </button>
                        ))
                      )}
                    </div>

                    {/* New folder */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder={t("drive.newFolderPlaceholder")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateFolder();
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:text-zinc-100"
                      />
                      <button
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim() || isFolderLoading}
                        title={t("drive.createFolder")}
                        className="shrink-0 rounded-lg bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        <FolderPlus size={14} />
                      </button>
                    </div>

                    {folderError && (
                      <div className="rounded-lg bg-red-50 p-2 text-[11px] text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        {folderError}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsFolderPickerOpen(false)}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        onClick={handleSelectFolder}
                        className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                      >
                        <Check size={13} />
                        <span>
                          {isCurrentFolder(browsePath)
                            ? t("drive.folderSelected")
                            : t("drive.useThisFolder")}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={isLoading || !saveFileName.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  <span>{t("drive.saveBtn")}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-gray-400">
                    <Loader2 size={16} className="animate-spin mr-2" />
                    <span>{t("drive.loading")}</span>
                  </div>
                ) : files.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">
                    {t("drive.noFiles")}
                  </div>
                ) : (
                  files.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => handleOpenFile(file)}
                      className="flex items-center justify-between rounded-xl border border-gray-100 p-2.5 hover:border-blue-500 hover:bg-blue-50/30 cursor-pointer transition-colors dark:border-zinc-800 dark:hover:bg-zinc-800/60"
                    >
                      <div className="truncate text-xs font-medium text-gray-800 dark:text-zinc-200">
                        {stripFileExtension(file.name)}
                      </div>
                      <Download size={14} className="text-gray-400" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
