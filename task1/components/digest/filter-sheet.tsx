"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { FilterSidebar } from "./filter-sidebar";
import type { ViewId, FilterCounts } from "@/lib/digest/filter";

/**
 * Below the desktop breakpoint the sidebar has nowhere to live permanently,
 * so it opens on demand. This wraps the exact same FilterSidebar content
 * (no second copy of the filter controls to keep in sync) in a bottom-sheet
 * shell.
 */
export function FilterSheet({
  open,
  onOpenChange,
  ...sidebarProps
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ViewId;
  onViewChange: (v: ViewId) => void;
  topics: string[];
  onTopicsChange: (t: string[]) => void;
  sources: string[];
  onSourcesChange: (s: string[]) => void;
  counts: FilterCounts;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="scroll-pane fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg transition-transform duration-150 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-medium">Filters</Dialog.Title>
            <Dialog.Close
              render={
                <Button variant="ghost" size="sm" className="h-11 min-w-11">
                  Done
                </Button>
              }
            />
          </div>
          <FilterSidebar {...sidebarProps} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
