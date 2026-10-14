import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AArrowDown,
  AArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  FileCode2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import { downloadSpecification, serializeSpecification } from "@/utils/specExport";
import { buildYamlOutline, type YamlOutlineNode } from "@/utils/yamlOutline";
import { useFontScale } from "@/hooks/useFontScale";

/** Storage key for the preview's persisted font scale. */
const SPEC_FONT_SCALE_STORAGE_KEY = "event_modeling_spec_font_scale";

/**
 * Preview modal for the board's YAML specification. It renders exactly the text
 * that will be copied or downloaded, so what the user reviews is what they get.
 * Lines are shown in a collapsible outline: any line that owns nested content
 * gets a fold toggle in the gutter, while copy/download always use the full
 * document. The preview text size can be scaled up/down, matching the AI panel.
 */
export function ExportSpecModal() {
  const { t } = useTranslation();

  const isOpen = useCanvasStore((s) => s.isExportModalOpen);
  const setOpen = useCanvasStore((s) => s.setExportModalOpen);
  const projectName = useCanvasStore((s) => s.projectName);
  const elements = useCanvasStore((s) => s.elements);

  const [copied, setCopied] = useState(false);
  /** Ids of outline lines the user has folded shut. */
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

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

  // Collapsible tree derived from the serialized text, so the outline shows the
  // same lines the user would copy (fold toggles sit in a gutter beside them).
  const outline = useMemo(() => buildYamlOutline(yaml), [yaml]);

  const toggleNode = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(outline.foldableIds));
  }, [outline.foldableIds]);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setCollapsed(new Set());
    }
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
        className="spec-modal grid max-h-[92vh] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
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
              onClick={expandAll}
              disabled={outline.foldableIds.length === 0}
              title={t("export.expandAll")}
              aria-label={t("export.expandAll")}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
            >
              <ChevronsUpDown size={16} />
            </button>
            <button
              onClick={collapseAll}
              disabled={outline.foldableIds.length === 0}
              title={t("export.collapseAll")}
              aria-label={t("export.collapseAll")}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
            >
              <ChevronsDownUp size={16} />
            </button>
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
        <div className="min-h-0 overflow-hidden p-3">
          <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200/70 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-800 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200">
            {outline.roots.map((node) => (
              <YamlOutlineRow
                key={node.id}
                node={node}
                collapsed={collapsed}
                onToggle={toggleNode}
              />
            ))}
          </div>
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

/**
 * One line of the YAML outline, rendered recursively. Foldable lines get a
 * caret in the gutter; collapsing a line hides its whole subtree and shows how
 * many lines are hidden. Non-foldable lines keep an empty spacer so the text of
 * every row lines up.
 */
function YamlOutlineRow({
  node,
  collapsed,
  onToggle,
}: {
  node: YamlOutlineNode;
  collapsed: Set<number>;
  onToggle: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = hasChildren && collapsed.has(node.id);

  return (
    <>
      <div className="flex items-start rounded hover:bg-gray-200/40 dark:hover:bg-zinc-800/40">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={!isCollapsed}
            className="mt-[1px] flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="whitespace-pre-wrap break-words">{node.text}</span>
        {isCollapsed && (
          <span className="mt-[1px] ml-2 shrink-0 select-none rounded bg-gray-200/70 px-1 text-[10px] text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
            ⋯ {node.descendants}
          </span>
        )}
      </div>
      {!isCollapsed &&
        node.children.map((child) => (
          <YamlOutlineRow
            key={child.id}
            node={child}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
