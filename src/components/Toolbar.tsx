import React from "react";
import {
  MousePointer,
  Terminal,
  Zap,
  User,
  Database,
  Search,
  Ban,
  Globe,
  Box,
  List,
  Brackets,
  Parentheses,
  StickyNote as StickyIcon,
  Type,
  Trash2,
  Workflow,
  FolderPlus,
  ListChecks,
  PenLine,
} from "lucide-react";
import { useCanvasStore } from "@/store";
import type {
  CanvasObject,
  StormData,
  StormKind,
  ModelData,
  ModelNodeKind,
} from "@/types";
import { STORM_KIND_COLORS, STORM_KIND_LABELS } from "@/constants/storm";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import {
  computeModelNodeHeight,
  computeStormCardHeight,
} from "@/utils/cardDimensions";
import { spawnAtViewportCenter } from "@/utils/viewport";

interface ToolItemProps {
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  isActive?: boolean;
  color?: string;
  danger?: boolean;
}

function ToolButton({
  onClick,
  icon,
  tooltip,
  isActive = false,
  color,
  danger = false,
}: ToolItemProps) {
  return (
    <div className="group relative flex items-center justify-center">
      <button
        onClick={onClick}
        onMouseDown={(e) => {
          // Mouse clicks should not focus the tool button. Otherwise, after a
          // later key press (e.g. Escape returning to Select), the browser draws
          // a :focus-visible ring that reads as "this tool is still active".
          e.preventDefault();
        }}
        title={tooltip}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-90 ${
          isActive
            ? "bg-blue-600 text-white shadow-sm"
            : danger
              ? "text-red-500 hover:bg-red-50 hover:text-red-600"
              : "border border-transparent hover:border-gray-200/80 hover:bg-gray-100/90 hover:shadow-xs"
        }`}
        style={!isActive && color ? { color } : undefined}
      >
        {icon}
      </button>

      {/* Floating Hover Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {tooltip}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  );
}

export function Toolbar() {
  const currentTool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const selectedIds = useCanvasStore((state) => state.selectedIds);
  const objects = useCanvasStore((state) => state.objects);
  const groups = useCanvasStore((state) => state.groups);

  const groupTooltip = React.useMemo(() => {
    const explicitGroupIds = new Set(
      selectedIds
        .filter((id) => id.startsWith("__group:"))
        .map((id) => id.replace("__group:", "")),
    );
    const cardIds = selectedIds.filter((id) => !id.startsWith("__group:"));
    const memberGroup = cardIds.some((id) => {
      const obj = objects.find((o) => o.id === id);
      return obj?.groupId && groups.some((g) => g.id === obj.groupId);
    });
    const hasUnassigned = cardIds.some((id) => {
      const obj = objects.find((o) => o.id === id);
      return obj && !obj.groupId;
    });

    // Two or more selected groups wrap into a new parent group.
    if (explicitGroupIds.size >= 2) {
      return "Nest Groups (Cmd+G)";
    }
    // Every selected card already lives in the same group -> child group.
    const memberGroupIds = new Set(
      cardIds
        .map((id) => objects.find((o) => o.id === id)?.groupId)
        .filter((gid): gid is string => Boolean(gid)),
    );
    const allInExistingGroup =
      cardIds.length > 0 &&
      cardIds.every((id) => {
        const gid = objects.find((o) => o.id === id)?.groupId;
        return Boolean(gid) && groups.some((g) => g.id === gid);
      });
    if (
      explicitGroupIds.size === 0 &&
      allInExistingGroup &&
      memberGroupIds.size === 1
    ) {
      return "Create Sub-group (Cmd+G)";
    }
    if ((explicitGroupIds.size === 1 || memberGroup) && hasUnassigned) {
      return "Add to Group (Cmd+G)";
    }
    return "Group (Cmd+G)";
  }, [selectedIds, objects, groups]);

  // Add specific Storm Card
  //
  // New cards start empty: no sample title, fields, action, permissions,
  // query items or constraint lines. Every piece of content is added from
  // the options bar, so the card carries no prefilled defaults.
  const handleAddStormCard = (kind: StormKind) => {
    const id = `storm-${kind}-${Date.now().toString(36)}`;
    const width = kind === "actor" ? 220 : kind === "external" ? 240 : 260;

    const stormData: StormData = {
      kind,
      name: "",
      fields: [],
      // BDD cards keep their Given/When/Then phase — it is the card's identity,
      // not prefilled content.
      ...(kind === "bdd" ? { phase: "given" as const } : {}),
    };

    const bounds = spawnAtViewportCenter(
      useCanvasStore.getState().viewport,
      width,
      computeStormCardHeight(stormData),
    );

    const newObj: CanvasObject = {
      id,
      type: "storm",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      stormData,
    };

    useCanvasStore.getState().addObject(newObj);
  };

  // Add specific Data Model Node
  //
  // Like storm cards, new model nodes start empty: no sample title, fields,
  // enum values or item/inner types.
  const handleAddModelNode = (kind: ModelNodeKind) => {
    const id = `model-${kind}-${Date.now().toString(36)}`;
    const width = kind === "object" ? 240 : 200;

    const modelData: ModelData = { kind, name: "" };
    if (kind === "object") {
      modelData.fields = [];
    } else if (kind === "enum") {
      modelData.values = [];
    } else if (kind === "array") {
      modelData.itemType = "";
    } else if (kind === "wrap") {
      modelData.innerType = "";
    }

    const bounds = spawnAtViewportCenter(
      useCanvasStore.getState().viewport,
      width,
      computeModelNodeHeight(modelData),
    );

    const newObj: CanvasObject = {
      id,
      type: "model",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      modelData,
    };

    useCanvasStore.getState().addObject(newObj);
  };

  // Add Sticky Note
  const handleAddSticky = () => {
    const bounds = spawnAtViewportCenter(
      useCanvasStore.getState().viewport,
      180,
      140,
    );
    const newObj: CanvasObject = {
      id: `sticky-${Date.now()}`,
      type: "stickyNote",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      text: "Sticky Note",
    };
    useCanvasStore.getState().addObject(newObj);
  };

  // Add Text Box
  const handleAddText = () => {
    const bounds = spawnAtViewportCenter(
      useCanvasStore.getState().viewport,
      240,
      36,
    );
    const newObj: CanvasObject = {
      id: `text-${Date.now()}`,
      type: "textBox",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      text: "Text",
    };
    useCanvasStore.getState().addObject(newObj);
  };

  const handleClearBoard = () => {
    useCanvasStore.getState().resetBoard();
  };

  const stormIcons: Record<StormKind, React.ReactNode> = {
    command: <Terminal size={20} />,
    event: <Zap size={20} />,
    actor: <User size={20} />,
    state: <Database size={20} />,
    query: <Search size={20} />,
    constraint: <Ban size={20} />,
    external: <Globe size={20} />,
    bdd: <ListChecks size={20} />,
  };

  const modelIcons: Record<ModelNodeKind, React.ReactNode> = {
    object: <Box size={20} />,
    enum: <List size={20} />,
    array: <Brackets size={20} />,
    wrap: <Parentheses size={20} />,
  };

  const stormKinds: StormKind[] = [
    "command",
    "event",
    "actor",
    "state",
    "query",
    "constraint",
    "external",
  ];

  const modelKinds: ModelNodeKind[] = ["object", "enum", "array", "wrap"];

  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md">
      {/* Navigation & Connector Tools */}
      <div className="flex items-center gap-1">
        <ToolButton
          onClick={() => setTool("select")}
          icon={<MousePointer size={20} />}
          tooltip="Select Tool (V)"
          isActive={currentTool === "select"}
        />
        <ToolButton
          onClick={() => setTool("connector")}
          icon={<Workflow size={20} />}
          tooltip="Connector (L)"
          isActive={currentTool === "connector"}
        />
        <ToolButton
          onClick={() => setTool("line")}
          icon={<PenLine size={20} />}
          tooltip="Line (D)"
          isActive={currentTool === "line"}
        />
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Storm Cards (Icons with Tooltips) */}
      <div className="flex items-center gap-1">
        {stormKinds.map((kind) => (
          <ToolButton
            key={kind}
            onClick={() => handleAddStormCard(kind)}
            icon={stormIcons[kind]}
            tooltip={`${STORM_KIND_LABELS[kind]}`}
            color={STORM_KIND_COLORS[kind]}
          />
        ))}
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* BDD Scenario Card (Given/When/Then) — a card of its own */}
      <div className="flex items-center gap-1">
        <ToolButton
          onClick={() => handleAddStormCard("bdd")}
          icon={stormIcons.bdd}
          tooltip={STORM_KIND_LABELS.bdd}
          color={STORM_KIND_COLORS.bdd}
        />
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Model Nodes (Icons with Tooltips) */}
      <div className="flex items-center gap-1">
        {modelKinds.map((kind) => (
          <ToolButton
            key={kind}
            onClick={() => handleAddModelNode(kind)}
            icon={modelIcons[kind]}
            tooltip={`${MODEL_KIND_LABELS[kind]}`}
            color={MODEL_KIND_COLORS[kind]}
          />
        ))}
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Supporting Shapes & Grouping */}
      <div className="flex items-center gap-1">
        <ToolButton
          onClick={handleAddSticky}
          icon={<StickyIcon size={20} />}
          tooltip="Note (S)"
          color="#b45309"
        />
        <ToolButton
          onClick={handleAddText}
          icon={<Type size={20} />}
          tooltip="Text (T)"
          color="#334155"
        />
        <ToolButton
          onClick={() => useCanvasStore.getState().groupObjects()}
          icon={<FolderPlus size={20} />}
          tooltip={groupTooltip}
          color="#6366f1"
        />
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      {/* Clear Canvas */}
      <ToolButton
        onClick={handleClearBoard}
        icon={<Trash2 size={20} />}
        tooltip="Clear Canvas"
        danger
      />
    </div>
  );
}
