import { LayoutGrid } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import type { DomainData } from "./layout";

interface DomainOptionsProps {
  element: CanvasElement<DomainData>;
  onUpdate?: (partial: Partial<DomainData>) => void;
}

/**
 * Options bar for a Domain: a single "Arrange" action that tidies the Domain's
 * direct children — definition Groups stacked in a column on the left, Slices in
 * a row beside them. It also records the Slice order, which from then on makes
 * dropping a Slice inside the Domain reorder it instead of parking it freely.
 */
export function DomainOptions({ element }: DomainOptionsProps) {
  const arrangeDomain = useCanvasStore((s) => s.arrangeDomain);

  return (
    <button
      onClick={() => arrangeDomain(element.id)}
      title="Arrange Domain (groups in a column, slices in a row)"
      className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
    >
      <LayoutGrid size={16} />
    </button>
  );
}
