import { Header } from "@/components/Header";
import { PixiCanvas } from "@/components/PixiCanvas";
import { Toolbar } from "@/components/Toolbar";
import { InlineTextEditor } from "@/components/InlineTextEditor";
import { TypeSelectPopover } from "@/components/TypeSelectPopover";
import { DescTooltip } from "@/components/DescTooltip";
import { ActionTooltip } from "@/components/ActionTooltip";
import { StormOptionsBar } from "@/components/StormOptionsBar";
import { ModelOptionsBar } from "@/components/ModelOptionsBar";
import { GroupOptionsBar } from "@/components/GroupOptionsBar";
import { AlignOptionsBar } from "@/components/AlignOptionsBar";
import { SearchModal } from "@/components/SearchModal";
import { AIPanel } from "@/components/AIPanel";
import { useCanvasStore } from "@/store";

export function App() {
  const isSearchOpen = useCanvasStore((s) => s.isSearchOpen);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#f9fafb]">
      <Header />
      <main className="relative flex-1 overflow-hidden" id="canvas-container">
        <PixiCanvas />
        <InlineTextEditor />
        <TypeSelectPopover />
        <DescTooltip />
        <ActionTooltip />
        <StormOptionsBar />
        <ModelOptionsBar />
        <GroupOptionsBar />
        <AlignOptionsBar />
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
