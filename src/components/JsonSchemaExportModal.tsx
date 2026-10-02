import { useState, useMemo, useEffect } from "react";
import { X, Copy, Check, Download, FileCode2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  exportCanvasJsonSchema,
  type JsonSchemaDialect,
} from "@/utils/jsonSchemaExport";

interface JsonSchemaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the schema file has been downloaded, so the app can confirm success. */
  onExported?: (detail: string) => void;
}

export function JsonSchemaExportModal({
  isOpen,
  onClose,
  onExported,
}: JsonSchemaExportModalProps) {
  const { t } = useTranslation();
  const objects = useCanvasStore((s) => s.objects);
  const [dialect, setDialect] = useState<JsonSchemaDialect>("draft-07");
  const [copied, setCopied] = useState(false);

  const schemaString = useMemo(() => {
    return exportCanvasJsonSchema(objects, { dialect });
  }, [objects, dialect]);

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
      await navigator.clipboard.writeText(schemaString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy JSON schema to clipboard:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([schemaString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domain-schema-${dialect}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onExported?.(`domain-schema-${dialect}.json`);
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
                {t("modals.jsonSchema.title")}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                {t("modals.jsonSchema.subtitle")}
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
              {t("modals.jsonSchema.dialect")}
            </span>
            <button
              onClick={() => setDialect("draft-07")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dialect === "draft-07"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              Draft-07
            </button>
            <button
              onClick={() => setDialect("2020-12")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dialect === "2020-12"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              Draft 2020-12
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
                  <span className="text-green-600 dark:text-green-400">{t("modals.jsonSchema.copiedJson")}</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>{t("modals.jsonSchema.copyJson")}</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-2xs"
            >
              <Download size={13} />
              <span>{t("modals.jsonSchema.downloadJson")}</span>
            </button>
          </div>
        </div>

        {/* Code Content Preview */}
        <div className="relative flex-1 overflow-auto bg-gray-950 p-4 font-mono text-xs text-gray-100 dark:bg-zinc-950 dark:text-zinc-200">
          <pre className="whitespace-pre">{schemaString}</pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-400 bg-gray-50/50 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-500">
          <span>
            {t("modals.jsonSchema.linesCount", {
              lines: schemaString.split("\n").length,
              size: (new Blob([schemaString]).size / 1024).toFixed(1),
            })}
          </span>
          <span>{t("modals.jsonSchema.compatibility")}</span>
        </div>
      </div>
    </div>
  );
}
