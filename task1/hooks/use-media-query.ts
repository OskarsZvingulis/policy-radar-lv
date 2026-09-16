"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media query subscription. Used to decide which of two mutually
 * exclusive UI regions actually mounts (e.g. a persistent detail column
 * versus a Dialog), not just which one is visually hidden: a component that
 * is merely hidden with a CSS class still mounts, still runs its effects,
 * and a Dialog specifically still scroll-locks the page and hides
 * everything else from assistive tech even while invisible.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // Server snapshot: false avoids ever claiming "desktop" during SSR/first
    // paint, which would mount the wrong region before hydration can correct it.
    () => false,
  );
}
