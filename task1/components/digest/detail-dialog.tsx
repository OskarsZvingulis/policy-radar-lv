import { Dialog } from "@base-ui/react/dialog";
import type { ScoredItem } from "@/lib/types";
import { ItemDetail } from "./item-detail";

/**
 * Below xl, a selected item opens as a full-screen overlay instead of a
 * persistent third column, since there isn't room for three panes. The
 * caller only mounts this when there's actually a selection: an invisible
 * Dialog still scroll-locks the page and hides the rest of the app from
 * assistive tech, so "hidden with a class" isn't enough, it must not mount.
 * Also why `open` is always true here rather than a prop: with no exit
 * transition defined on this popup, base-ui's own close animation
 * bookkeeping left the Popup at display:block after both Escape and the
 * Back button, i.e. `open` going false didn't reliably unmount it. Removing
 * the whole subtree from React the moment the caller stops mounting it
 * sidesteps that regardless of the cause.
 */
export function DetailDialog({
  item,
  now,
  llmAvailable,
  onClose,
}: {
  item: ScoredItem | null;
  now: Date;
  llmAvailable?: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Popup className="scroll-pane fixed inset-0 z-50 overflow-y-auto bg-background md:inset-6 md:rounded-lg md:border md:border-border md:shadow-lg">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-4 py-2">
            <Dialog.Title className="text-sm font-medium">Details</Dialog.Title>
            <Dialog.Close className="flex min-h-11 min-w-11 items-center justify-center rounded px-2 py-1 text-sm underline underline-offset-2">
              Back
            </Dialog.Close>
          </div>
          {item && <ItemDetail item={item} now={now} llmAvailable={llmAvailable} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
