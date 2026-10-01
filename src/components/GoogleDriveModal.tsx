import { useState, useEffect, useCallback, useId } from "react";
import {
  X,
  Cloud,
  CloudUpload,
  FolderOpen,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LogOut,
  LogIn,
  FileCode,
} from "lucide-react";
import { useCanvasStore, clearHistory } from "@/store";
import {
  serializeStormFile,
  parseAndValidateStormFile,
  createBackup,
} from "@/utils/fileIO";
import {
  getGoogleAuthConfig,
  setSessionGoogleAuth,
  clearGoogleAuth,
  isGoogleAuthenticated,
  fetchGoogleUserProfile,
  requestGoogleDriveAccessToken,
  uploadStormToDrive,
  listStormFilesFromDrive,
  downloadStormFromDrive,
  type GoogleAuthConfig,
  type GoogleDriveFileMeta,
  type GoogleDriveUploadResult,
} from "@/utils/googleDrive";

interface GoogleDriveModalProps {
  isOpen: boolean;
  initialTab?: "save" | "open";
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export function GoogleDriveModal({
  isOpen,
  initialTab = "save",
  onClose,
  onSuccessToast,
}: GoogleDriveModalProps) {
  const currentProjectName = useCanvasStore((s) => s.projectName);
  const setProjectName = useCanvasStore((s) => s.setProjectName);
  const googleDriveFileId = useCanvasStore((s) => s.googleDriveFileId);
  const setGoogleDriveFileId = useCanvasStore((s) => s.setGoogleDriveFileId);

  const [activeTab, setActiveTab] = useState<"save" | "open">(initialTab);
  const [authConfig, setAuthConfig] = useState<GoogleAuthConfig>(() =>
    getGoogleAuthConfig(),
  );

  // Sync tab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setAuthConfig(getGoogleAuthConfig());
      setSaveSuccessResult(null);
      setErrorMsg(null);
    }
  }, [isOpen, initialTab]);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Save Tab state
  const [saveName, setSaveName] = useState(currentProjectName);
  const [saveMode, setSaveMode] = useState<"update" | "new">("update");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessResult, setSaveSuccessResult] =
    useState<GoogleDriveUploadResult | null>(null);

  useEffect(() => {
    setSaveName(currentProjectName);
    setSaveMode(googleDriveFileId ? "update" : "new");
  }, [currentProjectName, googleDriveFileId, isOpen]);

  // Open Tab state
  const [files, setFiles] = useState<GoogleDriveFileMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

  // Common error state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAuthenticated = isGoogleAuthenticated(authConfig);

  // Unique IDs for accessibility
  const saveNameId = useId();
  const searchInputId = useId();

  // Load drive files list
  const loadFiles = useCallback(async () => {
    if (!authConfig.accessToken || !isAuthenticated) return;
    setIsLoadingFiles(true);
    setErrorMsg(null);
    try {
      const fileList = await listStormFilesFromDrive(authConfig.accessToken);
      setFiles(fileList);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load files from Google Drive";
      setErrorMsg(msg);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [authConfig.accessToken, isAuthenticated]);

  useEffect(() => {
    if (isOpen && activeTab === "open" && isAuthenticated) {
      loadFiles();
    }
  }, [isOpen, activeTab, isAuthenticated, loadFiles]);

  // Handle Google Sign-In via OAuth (using VITE_GOOGLE_CLIENT_ID from env)
  const handleSignIn = async () => {
    setErrorMsg(null);
    setIsAuthenticating(true);

    const targetClientId = authConfig.clientId.trim();
    if (!targetClientId) {
      setErrorMsg(
        "Chưa có VITE_GOOGLE_CLIENT_ID trong file .env. Vui lòng cấu hình VITE_GOOGLE_CLIENT_ID để đăng nhập.",
      );
      setIsAuthenticating(false);
      return;
    }

    try {
      const { accessToken, expiresIn } =
        await requestGoogleDriveAccessToken(targetClientId);
      const tokenExpiry = Date.now() + expiresIn * 1000;

      // Fetch user profile info
      let userEmail: string | null = null;
      let userName: string | null = null;
      let userPicture: string | null = null;
      try {
        const profile = await fetchGoogleUserProfile(accessToken);
        userEmail = profile.email;
        userName = profile.name ?? null;
        userPicture = profile.picture ?? null;
      } catch {
        // ignore profile error
      }

      const newConfig: GoogleAuthConfig = {
        clientId: targetClientId,
        accessToken,
        tokenExpiry,
        userEmail,
        userName,
        userPicture,
        isEnvClientId: true,
        isEnvAccessToken: false,
      };

      setSessionGoogleAuth(newConfig);
      setAuthConfig(newConfig);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Đăng nhập Google thất bại";
      setErrorMsg(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = () => {
    clearGoogleAuth();
    setAuthConfig(getGoogleAuthConfig());
    setFiles([]);
    setSaveSuccessResult(null);
  };

  // Perform Save to Drive
  const handleSaveToDrive = async () => {
    if (!authConfig.accessToken || !isAuthenticated) {
      setErrorMsg("Vui lòng đăng nhập Google Drive trước khi lưu.");
      return;
    }

    const trimmedName = saveName.trim() || "Untitled";
    if (trimmedName !== currentProjectName) {
      setProjectName(trimmedName);
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSaveSuccessResult(null);

    try {
      const { objects, groups, viewport } = useCanvasStore.getState();
      const content = serializeStormFile({
        objects,
        groups,
        viewport,
        name: trimmedName,
      });

      const targetFileId =
        saveMode === "update" && googleDriveFileId ? googleDriveFileId : null;

      const result = await uploadStormToDrive({
        projectName: trimmedName,
        content,
        accessToken: authConfig.accessToken,
        fileId: targetFileId,
      });

      setGoogleDriveFileId(result.id);
      setSaveSuccessResult(result);
      onSuccessToast?.(
        `Đã lưu dự án "${result.name}" vào Google Drive thành công!`,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Lỗi khi tải file lên Google Drive";
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Perform Open from Drive
  const handleOpenFile = async (file: GoogleDriveFileMeta) => {
    if (!authConfig.accessToken || !isAuthenticated) return;
    setLoadingFileId(file.id);
    setErrorMsg(null);

    try {
      const rawContent = await downloadStormFromDrive(
        file.id,
        authConfig.accessToken,
      );
      const project = parseAndValidateStormFile(rawContent);

      // Create local backup before replacing board
      const { objects, groups, viewport, projectName } =
        useCanvasStore.getState();
      createBackup({ objects, groups, viewport, name: projectName });

      const loadedName =
        project.name?.trim() ||
        file.name.replace(/\.(storm|json)$/i, "").trim() ||
        "Untitled";

      useCanvasStore
        .getState()
        .resetBoard(project.objects, project.groups, loadedName, file.id);

      if (project.viewport) {
        useCanvasStore.getState().setViewport(project.viewport);
      }
      clearHistory();

      onSuccessToast?.(`Đã tải dự án "${loadedName}" từ Google Drive!`);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Không thể đọc file dự án từ Google Drive";
      setErrorMsg(msg);
    } finally {
      setLoadingFileId(null);
    }
  };

  // Keyboard escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving && !isLoadingFiles) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, isLoadingFiles, onClose]);

  if (!isOpen) return null;

  const isConfiguredInEnv = authConfig.isEnvClientId || authConfig.isEnvAccessToken;

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="flex w-full max-w-xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Cloud size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Google Drive
              </h2>
              <p className="text-xs text-gray-500">
                Lưu trữ và đồng bộ hóa dự án Event Modeling
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Account Bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5 bg-white text-xs shrink-0">
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              {authConfig.userPicture ? (
                <img
                  src={authConfig.userPicture}
                  alt="Avatar"
                  className="h-6 w-6 rounded-full border border-gray-200"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-medium text-[10px] text-white">
                  {(authConfig.userEmail?.[0] || "G").toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-800">
                    {authConfig.userName || authConfig.userEmail || "Google Drive Connected"}
                  </span>
                  {authConfig.isEnvAccessToken && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-700">
                      .env token
                    </span>
                  )}
                </div>
                {authConfig.userName && authConfig.userEmail && (
                  <span className="text-[10px] text-gray-400">
                    {authConfig.userEmail}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-500">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>Chưa kết nối tài khoản Google</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 transition-colors"
                title="Đăng xuất khỏi Google Drive"
              >
                <LogOut size={13} />
                <span>Đăng xuất</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthenticating || !authConfig.clientId}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-white hover:bg-blue-700 transition-colors font-medium shadow-xs disabled:opacity-50"
              >
                <LogIn size={13} />
                <span>{isAuthenticating ? "Đang kết nối..." : "Đăng nhập Google"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Missing Env Notice */}
        {!isConfiguredInEnv && (
          <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 shrink-0">
            <div className="font-semibold mb-1 flex items-center gap-1.5">
              <AlertCircle size={14} className="text-amber-600" />
              Chưa cấu hình biến môi trường Google Drive
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Vui lòng khai báo trong file <code>.env</code> (hoặc <code>.env.local</code>):
            </p>
            <pre className="mt-1.5 font-mono text-[10px] text-amber-900 bg-white/80 p-2 rounded border border-amber-200 overflow-x-auto">
              VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com{"\n"}
              # hoặc Access Token trực tiếp:{"\n"}
              VITE_GOOGLE_ACCESS_TOKEN=ya29.your-token
            </pre>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-gray-100 px-5 bg-white shrink-0 mt-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("save");
              setErrorMsg(null);
            }}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-medium text-xs transition-colors ${
              activeTab === "save"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <CloudUpload size={14} />
            <span>Lưu vào Drive</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("open");
              setErrorMsg(null);
            }}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-medium text-xs transition-colors ${
              activeTab === "open"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <FolderOpen size={14} />
            <span>Mở từ Drive</span>
          </button>
        </div>

        {/* Global Error Notice */}
        {errorMsg && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-xs text-red-700 shrink-0">
            <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === "save" ? (
            /* TAB: SAVE TO DRIVE */
            <div className="space-y-4">
              <div>
                <label
                  htmlFor={saveNameId}
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Tên file dự án (.storm)
                </label>
                <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                  <input
                    id={saveNameId}
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Untitled"
                    className="flex-1 text-xs text-gray-900 focus:outline-none"
                    disabled={isSaving}
                  />
                  <span className="text-xs font-mono text-gray-400">.storm</span>
                </div>
              </div>

              {googleDriveFileId && (
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50/50 space-y-2">
                  <span className="block text-xs font-medium text-gray-700">
                    Tùy chọn lưu:
                  </span>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="saveMode"
                        checked={saveMode === "update"}
                        onChange={() => setSaveMode("update")}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Cập nhật file hiện tại trên Google Drive</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="saveMode"
                        checked={saveMode === "new"}
                        onChange={() => setSaveMode("new")}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Lưu thành bản sao mới trên Google Drive</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Success Result Box */}
              {saveSuccessResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Lưu file lên Google Drive thành công!</span>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    File: <strong>{saveSuccessResult.name}</strong>
                  </p>
                  {saveSuccessResult.webViewLink && (
                    <a
                      href={saveSuccessResult.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      <ExternalLink size={12} />
                      Mở trong Google Drive
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* TAB: OPEN FROM DRIVE */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  id={searchInputId}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm file .storm..."
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={loadFiles}
                  disabled={isLoadingFiles || !isAuthenticated}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  title="Làm mới danh sách"
                >
                  <RefreshCw
                    size={14}
                    className={isLoadingFiles ? "animate-spin" : ""}
                  />
                </button>
              </div>

              {!isAuthenticated ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-gray-500">
                  <Cloud size={32} className="text-gray-300 mb-2" />
                  <p className="font-medium text-gray-700">
                    Chưa kết nối Google Drive
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400 max-w-xs">
                    Vui lòng đăng nhập Google để xem và mở các dự án Event Modeling đã lưu trên Drive của bạn.
                  </p>
                  {authConfig.clientId && (
                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shadow-xs"
                    >
                      <LogIn size={13} />
                      <span>Đăng nhập ngay</span>
                    </button>
                  )}
                </div>
              ) : isLoadingFiles ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-gray-500">
                  <RefreshCw size={24} className="animate-spin text-blue-600 mb-2" />
                  <span>Đang tải danh sách file từ Google Drive...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-gray-500">
                  <FileCode size={30} className="text-gray-300 mb-2" />
                  <p className="font-medium text-gray-600">
                    Không tìm thấy file .storm nào
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Hãy chuyển sang tab "Lưu vào Drive" để lưu dự án hiện tại lên Google Drive.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden max-h-60 overflow-y-auto">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2.5 hover:bg-gray-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <FileCode size={18} className="text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-gray-800">
                            {file.name}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {file.modifiedTime
                              ? new Date(file.modifiedTime).toLocaleString()
                              : "N/A"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenFile(file)}
                        disabled={loadingFileId === file.id}
                        className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 shrink-0"
                      >
                        {loadingFileId === file.id ? "Đang nạp..." : "Mở"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 bg-gray-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Đóng
          </button>
          {activeTab === "save" && (
            <button
              type="button"
              onClick={handleSaveToDrive}
              disabled={isSaving || !isAuthenticated}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              <CloudUpload size={14} />
              <span>{isSaving ? "Đang lưu..." : "Lưu vào Google Drive"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
