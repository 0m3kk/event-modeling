import { useState } from "react";
import { LogIn, LogOut, KeyRound } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { CommandCardData, CommandField } from "./index";
import { commandCardTool, getCommandInputs, getCommandResponses } from "./index";
import { useCanvasStore } from "@/store";
import { ActionTokenPopover } from "../common/ActionTokenPopover";

interface CommandCardOptionsProps {
  element: CanvasElement<CommandCardData>;
  onUpdate: (partial: Partial<CommandCardData>) => void;
}

export function CommandCardOptions({ element, onUpdate }: CommandCardOptionsProps) {
  const [isActionOpen, setIsActionOpen] = useState(false);
  const handleAddInput = () => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const newInput: CommandField = {
      name: `input${inputs.length + 1}`,
      type: "string",
    };
    const nextInputs = [...inputs, newInput];
    const nextData: CommandCardData = {
      ...element.data,
      inputs: nextInputs,
      responses,
    };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;

    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    });
  };

  const handleAddResponse = () => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const newResponse: CommandField = {
      name: `res${responses.length + 1}`,
      type: "string",
    };
    const nextResponses = [...responses, newResponse];
    const nextData: CommandCardData = {
      ...element.data,
      inputs,
      responses: nextResponses,
    };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;

    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleAddInput}
        title="Add Input Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogIn size={16} />
      </button>

      <button
        onClick={handleAddResponse}
        title="Add Response Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogOut size={16} />
      </button>

      <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />

      <div className="relative">
        <button
          onClick={() => setIsActionOpen((prev) => !prev)}
          title={element.data.action ? `Action: ${element.data.action}` : "Set Action Token"}
          className={`flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${
            element.data.action
              ? "bg-blue-500/15 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
              : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <KeyRound size={16} />
        </button>

        <ActionTokenPopover
          value={element.data.action}
          isOpen={isActionOpen}
          onClose={() => setIsActionOpen(false)}
          onCommit={(value) => onUpdate({ action: value || undefined })}
        />
      </div>
    </div>
  );
}
