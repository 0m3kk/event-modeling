import { Header } from "@/components/Header";
import { PixiCanvas } from "@/components/PixiCanvas";
import { Toolbar } from "@/components/Toolbar";
import { InlineTextEditor } from "@/components/InlineTextEditor";
import { TypeSelectPopover } from "@/components/TypeSelectPopover";
import { DescTooltip } from "@/components/DescTooltip";
import { ActionTooltip } from "@/components/ActionTooltip";
import { ValidationTooltip } from "@/components/ValidationTooltip";
import { StormOptionsBar } from "@/components/StormOptionsBar";
import { ModelOptionsBar } from "@/components/ModelOptionsBar";
import { GroupOptionsBar } from "@/components/GroupOptionsBar";
import { ConnectorOptionsBar } from "@/components/ConnectorOptionsBar";
import { LineOptionsBar } from "@/components/LineOptionsBar";
import { AlignOptionsBar } from "@/components/AlignOptionsBar";
import { RemoveFromGroupBar } from "@/components/RemoveFromGroupBar";
import { ModelCardPopup } from "@/components/ModelCardPopup";
import { SearchModal } from "@/components/SearchModal";
import { AIPanel } from "@/components/AIPanel";
import { useCanvasStore } from "@/store";
import { useTheme } from "@/hooks/useTheme";

export function App() {
  useTheme();
  const isSearchOpen = useCanvasStore((s) => s.isSearchOpen);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#f9fafb] dark:bg-[#121214] text-gray-900 dark:text-zinc-100">
      <Header />
      <main className="relative flex-1 overflow-hidden outline-none focus:outline-none" id="canvas-container">
        <PixiCanvas />
        <InlineTextEditor />
        <TypeSelectPopover />
        <ModelCardPopup />
        <DescTooltip />
        <ActionTooltip />
        <ValidationTooltip />
        <StormOptionsBar />
        <ModelOptionsBar />
        <GroupOptionsBar />
        <ConnectorOptionsBar />
        <LineOptionsBar />
        <AlignOptionsBar />
        <RemoveFromGroupBar />
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setSearchOpen(false)}
        />
        <AIPanel />
        <Toolbar />
      </main>
    </div>
  );
}

export default App;
