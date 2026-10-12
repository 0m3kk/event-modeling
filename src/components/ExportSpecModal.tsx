import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AArrowDown, AArrowUp, Check, Copy, Download, FileCode2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import { downloadSpecification, serializeSpecification } from "@/utils/specExport";
import { useFontScale } from "@/hooks/useFontScale";

/** Storage key for the preview's persisted font scale. */
const SPEC_FONT_SCALE_STORAGE_KEY = "event_modeling_spec_font_scale";

/**
 * Preview modal for the board's YAML specification. It renders exactly the text
 * that will be copied or downloaded, so what the user reviews is what they get.
 * The preview text size can be scaled up/down, matching the AI panel.
 */
export function ExportSpecModal() {
  const { t } = useTranslation();

  const isOpen = useCanvasStore((s) => s.isExportModalOpen);
  const setOpen = useCanvasStore((s) => s.setExportModalOpen);
  const projectName = useCanvasStore((s) => s.projectName);
  const elements = useCanvasStore((s) => s.elements);

  const [copied, setCopied] = useState(false);

  const {
    fontScale,
    increase: increaseFont,
    decrease: decreaseFont,
    canDecrease: canDecreaseFont,
    canIncrease: canIncreaseFont,
  } = useFontScale(SPEC_FONT_SCALE_STORAGE_KEY);

  // The spec is only built while the modal is open, over the board it opened on.
  const yaml = useMemo(
    () => (isOpen ? serializeSpecification({ name: projectName, elements }) : ""),
    [isOpen, projectName, elements],
  );

  useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context); ignore.
    }
  };

  const handleDownload = async () => {
    await downloadSpecification(yaml, projectName);
  };

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ "--panel-font-scale": String(fontScale) } as CSSProperties}
        className="spec-modal flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <FileCode2 size={18} className="text-blue-500" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800 dark:text-zinc-100">
                {t("export.title")}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-zinc-500">
                {t("export.subtitle")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={decreaseFont}
              disabled={!canDecreaseFont}
              title={t("export.decreaseFont")}
              aria-label={t("export.decreaseFont")}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
            >
              <AArrowDown size={16} />
            </button>
            <button
              onClick={increaseFont}
              disabled={!canIncreaseFont}
              title={t("export.increaseFont")}
              aria-label={t("export.increaseFont")}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
            >
              <AArrowUp size={16} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title={t("common.close")}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <pre className="h-full max-h-[60vh] overflow-auto rounded-xl border border-gray-200/70 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-800 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200">
            {yaml}
          </pre>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-zinc-800">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200/80 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
          >
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
            <span>{copied ? t("export.copied") : t("export.copy")}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
          >
            <Download size={14} />
            <span>{t("export.download")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
