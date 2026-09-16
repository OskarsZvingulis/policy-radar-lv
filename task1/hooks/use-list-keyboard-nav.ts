"use client";

import { useEffect, type RefObject } from "react";

/**
 * "/" focuses search, j/k or arrows move focus between rows (native <button>
 * / role="button" semantics then make Enter/Space open them, no separate
 * Enter handler needed here), Escape closes the open detail. Pulled out of
 * DigestApp since it's a self-contained document-level listener with no
 * dependency on the rest of the shell beyond these three inputs.
 */
export function useListKeyboardNav({
  searchRef,
  hasSelection,
  onEscape,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  hasSelection: boolean;
  onEscape: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (hasSelection) onEscape();
        else if (typing) target.blur();
        return;
      }
      if (typing) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-item-row]"));
      if (rows.length === 0) return;
      e.preventDefault();
      const current = rows.indexOf(document.activeElement as HTMLElement);
      const dir = e.key === "j" || e.key === "ArrowDown" ? 1 : -1;
      const next = current === -1 ? 0 : Math.min(Math.max(current + dir, 0), rows.length - 1);
      rows[next].focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchRef, hasSelection, onEscape]);
}
