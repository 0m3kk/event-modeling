import { useMemo, useState } from "react";
import { LogIn, LogOut, Layers } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { FieldTagPopover } from "@/components/FieldTagPopover";
import { toDisplayName } from "@/utils/naming";
import {
  computeServiceCardSize,
  getServiceRows,
  type ServiceCardData,
  type ServiceField,
  type ServiceGroup,
} from "./layout";

interface ServiceCardOptionsProps {
  element: CanvasElement<ServiceCardData>;
  onUpdate: (partial: Partial<ServiceCardData>) => void;
}

/**
 * Options bar for a Service card. A Service card is a single method execution,
 * so the structural actions are adding a param or a return field, plus the
 * interface name that groups methods into one generated service interface.
 */
export function ServiceCardOptions({ element, onUpdate }: ServiceCardOptionsProps) {
  const elements = useCanvasStore((s) => s.elements);
  const [isInterfacePopoverOpen, setIsInterfacePopoverOpen] = useState(false);

  // Interface names already used by other Service cards, offered as suggestions.
  const suggestedServiceNames = useMemo(() => {
    const names = new Set<string>();
    for (const el of elements) {
      if (el.type !== "serviceCard") continue;
      const serviceName = (el.data as ServiceCardData | undefined)?.serviceName;
      if (typeof serviceName === "string" && serviceName) names.add(serviceName);
    }
    return Array.from(names);
  }, [elements]);

  const handleAddRow = (group: ServiceGroup) => {
    const rows = getServiceRows(element.data, group);
    const newRow: ServiceField = {
      name: group === "params" ? `param${rows.length + 1}` : `res${rows.length + 1}`,
      type: "string",
    };
    const nextData: ServiceCardData = { ...element.data, [group]: [...rows, newRow] };
    const nextSize = computeServiceCardSize(nextData, element.width);
    // Only the content-driven height changes; a user-resized width is preserved.
    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize.height,
      data: nextData,
    });
  };

  const handleSelectServiceName = (serviceName: string | null) => {
    onUpdate({ serviceName: serviceName ?? undefined });
  };

  const currentServiceName = element.data.serviceName;

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setIsInterfacePopoverOpen(!isInterfacePopoverOpen)}
          title={
            currentServiceName
              ? `Service Interface: ${toDisplayName(currentServiceName)} (click to change)`
              : "Set Service Interface"
          }
          className={`flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${
            currentServiceName
              ? "bg-sky-500/15 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
              : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <Layers size={16} />
        </button>

        <FieldTagPopover
          currentTag={currentServiceName}
          fieldName={element.data.name}
          suggestedTags={suggestedServiceNames}
          isOpen={isInterfacePopoverOpen}
          onClose={() => setIsInterfacePopoverOpen(false)}
          onSelectTag={handleSelectServiceName}
          title="Service Interface"
          hint="Methods sharing a service name are generated into one interface."
          prefix=""
          placeholder="e.g. orderService"
          suggestionsLabel="Existing Services"
          removeLabel="Remove service name"
        />
      </div>

      <button
        onClick={() => handleAddRow("params")}
        title="Add Param Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogIn size={16} />
      </button>

      <button
        onClick={() => handleAddRow("returns")}
        title="Add Return Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
