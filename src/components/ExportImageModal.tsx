import { useState, useEffect, useMemo } from "react";
import { X, Image as ImageIcon, Download, Copy, Check, Sparkles } from "lucide-react";
import { useCanvasStore } from "@/store";
import { getActivePixiEngine } from "@/engine/PixiEngine";
import {
  computeCanvasBounds,
  exportCanvasToSvg,
  downloadSvg,
  downloadBlob,
} from "@/utils/imageExport";

interface ExportImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenJsonSchema?: () => void;
}

export function ExportImageModal({
  isOpen,
  onClose,
  onOpenJsonSchema,
}: ExportImageModalProps) {
  const objects = useCanvasStore((s) => s.objects);
  const groups = useCanvasStore((s) => s.groups);

  const [tab, setTab] = useState<"png" | "svg">("png");
  const [scale, setScale] = useState<number>(2);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);

  const bounds = useMemo(() => {
    return computeCanvasBounds(objects, groups, 40);
  }, [objects, groups]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownloadPng = async () => {
    setIsExporting(true);
    try {
      const engine = getActivePixiEngine();
      if (!engine) {
        alert("Canvas engine is not available for export.");
        return;
      }
      const blob = await engine.exportPng({ scale, padding: 40 });
      downloadBlob(blob, "event-storming-board");
      onClose();
    } catch (err) {
      console.error("Failed to export PNG:", err);
      alert("Failed to export PNG image.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSvg = () => {
    const svg = exportCanvasToSvg(objects, groups, { padding: 40 });
    downloadSvg(svg, "event-storming-board");
    onClose();
  };

  const handleCopySvg = async () => {
    const svg = exportCanvasToSvg(objects, groups, { padding: 40 });
    try {
      await navigator.clipboard.writeText(svg);
      setCopiedSvg(true);
      setTimeout(() => setCopiedSvg(false), 2000);
    } catch (err) {
      console.error("Failed to copy SVG:", err);
    }
  };

  const estimatedWidth = Math.round(bounds.width * scale);
  const estimatedHeight = Math.round(bounds.height * scale);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ImageIcon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Export Image
              </h2>
              <p className="text-[11px] text-gray-500">
                Download high-resolution image of your board
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-gray-100 bg-gray-50/40 px-5 pt-2">
          <button
            onClick={() => setTab("png")}
            className={`border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
              tab === "png"
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            PNG Image
          </button>
          <button
            onClick={() => setTab("svg")}
            className={`border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
              tab === "svg"
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            SVG Vector
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {tab === "png" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Resolution Scale
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 1, label: "1x", desc: "Standard" },
                    { val: 2, label: "2x", desc: "High-Res (Retina)" },
                    { val: 3, label: "3x", desc: "Print / Ultra" },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setScale(item.val)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                        scale === item.val
                          ? "border-blue-600 bg-blue-50/50 text-blue-700 font-medium ring-1 ring-blue-600"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-sm font-semibold">{item.label}</span>
                      <span className="text-[10px] text-gray-500">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1 border border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-500">Output Dimensions:</span>
                  <span className="font-mono font-medium text-gray-700">
                    {estimatedWidth} × {estimatedHeight} px
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Elements:</span>
                  <span className="font-medium text-gray-700">
                    {objects.length} cards & connectors, {groups.length} groups
                  </span>
                </div>
              </div>

              <button
                onClick={handleDownloadPng}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isExporting ? (
                  <>
                    <Sparkles size={14} className="animate-spin" />
                    <span>Rendering Canvas...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download PNG ({estimatedWidth}×{estimatedHeight})</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 border border-gray-100 space-y-1">
                <p className="font-medium text-gray-800">
                  Scalable Vector Graphics (SVG)
                </p>
                <p className="text-[11px] text-gray-500">
                  Infinitely scalable vector file containing crisp text, cards, connectors, and groups. Perfect for embedding in docs or importing into Figma/Illustrator.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySvg}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-2xs"
                >
                  {copiedSvg ? (
                    <>
                      <Check size={14} className="text-green-600" />
                      <span className="text-green-600">Copied SVG Code!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy SVG Markup</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadSvg}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-2xs"
                >
                  <Download size={14} />
                  <span>Download .svg</span>
                </button>
              </div>
            </div>
          )}

          {onOpenJsonSchema && (
            <div className="pt-2 border-t border-gray-100 text-center">
              <button
                onClick={() => {
                  onClose();
                  onOpenJsonSchema();
                }}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                Looking for domain schemas? Export JSON Schema instead →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
