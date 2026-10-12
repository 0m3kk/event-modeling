import { useState, useEffect } from "react";
import { X, Cloud, Loader2, LogOut, Download, Upload, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  signInWithGoogle,
  signOutGoogle,
  getActiveGoogleAuth,
  listDriveFiles,
  saveToGoogleDrive,
  downloadFromGoogleDrive,
  getStoredGoogleClientId,
  setStoredGoogleClientId,
  type GoogleDriveFile,
  type GoogleUserProfile,
} from "@/utils/googleDrive";
import { serializeProject, parseProjectFile } from "@/utils/fileIO";

export function GoogleDriveModal() {
  const { t } = useTranslation();
  const isOpen = useCanvasStore((s) => s.isGoogleDriveModalOpen);
  const setOpen = useCanvasStore((s) => s.setGoogleDriveModalOpen);
  const initialTab = useCanvasStore((s) => s.driveModalTab);

  const projectName = useCanvasStore((s) => s.projectName);
  const setProjectName = useCanvasStore((s) => s.setProjectName);
  const elements = useCanvasStore((s) => s.elements);
  const viewport = useCanvasStore((s) => s.viewport);
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

  useEffect(() => {
    setTab(initialTab);
    setSaveFileName(projectName);
  }, [initialTab, projectName, isOpen]);

  useEffect(() => {
    if (auth.accessToken && tab === "open") {
      loadFilesList();
    }
  }, [auth.accessToken, tab]);

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

  const handleSave = async () => {
    if (!auth.accessToken) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const json = serializeProject({ name: saveFileName, elements, viewport });
      const res = await saveToGoogleDrive(
        auth.accessToken,
        saveFileName,
        json,
        googleDriveFileId,
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
      const json = await downloadFromGoogleDrive(auth.accessToken, file.id);
      const project = parseProjectFile(json);
      useCanvasStore.getState().loadProject(project);
      setGoogleDriveFileId(file.id, file.name);
      setStatusMessage(t("drive.openSuccess", { name: file.name }));
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
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
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
                        {file.name}
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
