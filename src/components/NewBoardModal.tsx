import { useEffect } from "react";
import { X, FilePlus, AlertCircle } from "lucide-react";

interface NewBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function NewBoardModal({
  isOpen,
  onClose,
  onConfirm,
}: NewBoardModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FilePlus size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Start New Board
              </h2>
              <p className="text-xs text-gray-500">
                Create a blank canvas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-800 text-xs leading-relaxed">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              Your current board will be automatically backed up. You can restore it anytime from <strong>File → Restore</strong>.
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Are you sure you want to clear the canvas and start a new board?
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 bg-gray-50/50">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer shadow-xs"
          >
            Create New Board
          </button>
        </div>
      </div>
    </div>
  );
}
