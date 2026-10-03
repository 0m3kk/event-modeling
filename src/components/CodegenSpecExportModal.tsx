import { useState, useMemo, useEffect } from "react";
import { X, Copy, Check, Download, FileCode2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  exportCodegenSpec,
  type CodegenExportFormat,
} from "@/utils/codegenSpecExport";

interface CodegenSpecExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the spec file has been downloaded, so the app can confirm success. */
  onExported?: (detail: string) => void;
}

export function CodegenSpecExportModal({
  isOpen,
  onClose,
  onExported,
}: CodegenSpecExportModalProps) {
  const { t } = useTranslation();
  const objects = useCanvasStore((s) => s.objects);
  const groups = useCanvasStore((s) => s.groups);
  const projectName = useCanvasStore((s) => s.projectName);
  const [format, setFormat] = useState<CodegenExportFormat>("json");
  const [copied, setCopied] = useState(false);

  const specString = useMemo(() => {
    return exportCodegenSpec(objects, groups, { format, projectName });
  }, [objects, groups, format, projectName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(specString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy Codegen spec to clipboard:", err);
    }
  };

  const handleDownload = () => {
    const mimeType = format === "yaml" ? "text/yaml;charset=utf-8" : "application/json";
    const blob = new Blob([specString], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const sanitizedTitle = (projectName || "domain")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const fileName = `${sanitizedTitle || "domain"}-spec.${format}`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onExported?.(fileName);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/70 dark:border-zinc-800 dark:bg-zinc-800/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileCode2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">
                {t("modals.codegenSpec.title")}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                {t("modals.codegenSpec.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar controls */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-600 mr-1 dark:text-zinc-400">
              {t("modals.codegenSpec.format")}
            </span>
            <button
              onClick={() => setFormat("json")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                format === "json"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => setFormat("yaml")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                format === "yaml"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              YAML
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-green-600 dark:text-green-400" />
                  <span className="text-green-600 dark:text-green-400">{t("modals.codegenSpec.copied")}</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>{t("modals.codegenSpec.copy", { format: format.toUpperCase() })}</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-2xs"
            >
              <Download size={13} />
              <span>{t("modals.codegenSpec.download", { ext: format })}</span>
            </button>
          </div>
        </div>

        {/* Code Content Preview */}
        <div className="relative flex-1 overflow-auto bg-gray-950 p-4 font-mono text-xs text-gray-100 dark:bg-zinc-950 dark:text-zinc-200">
          <pre className="whitespace-pre">{specString}</pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-400 bg-gray-50/50 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-500">
          <span>
            {t("modals.codegenSpec.linesCount", {
              lines: specString.split("\n").length,
              size: (new Blob([specString]).size / 1024).toFixed(1),
            })}
          </span>
          <span>{t("modals.codegenSpec.compatibility")}</span>
        </div>
      </div>
    </div>
  );
}

// Keep JsonSchemaExportModal export as an alias for backward compatibility
export const JsonSchemaExportModal = CodegenSpecExportModal;
