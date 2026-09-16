"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  parseUrlState,
  serializeUrlState,
  urlStateReducer,
  type UrlState,
} from "@/lib/digest/url-state";

const QUERY_WRITE_DEBOUNCE_MS = 200;

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/**
 * React holds the real filter/page/item state; the URL is a one-way mirror
 * of it, updated with history.replaceState rather than routed through
 * Next's router, so a filter change is a synchronous local state update, not
 * a server round trip. See lib/digest/url-state.ts for why that distinction
 * is the actual fix, not just a style preference.
 */
export function useUrlState(): [UrlState, (patch: Partial<UrlState>) => void] {
  const [state, dispatch] = useReducer(urlStateReducer, undefined, () =>
    parseUrlState(typeof window === "undefined" ? "" : window.location.search),
  );

  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set by setState just before dispatching, read by the effect below once
  // the resulting render commits. A query-only change (typing) debounces its
  // URL write; every other change writes immediately. The React state update
  // itself is never debounced, only the address-bar write.
  const queryOnlyRef = useRef(false);

  const setState = useCallback((patch: Partial<UrlState>) => {
    queryOnlyRef.current = Object.keys(patch).length === 1 && "query" in patch;
    dispatch({ type: "patch", patch });
  }, []);

  // Mirrors state to the URL. Keyed on `state` rather than called inline
  // from setState so it always writes React's own authoritative post-render
  // value, never a hand-recomputed copy that could drift from the reducer.
  useEffect(() => {
    const url = (() => {
      const qs = serializeUrlState(state);
      return qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    })();
    const commit = () => {
      if (url !== currentUrl()) window.history.replaceState(window.history.state, "", url);
    };

    clearTimeout(writeTimer.current);
    if (queryOnlyRef.current) {
      writeTimer.current = setTimeout(commit, QUERY_WRITE_DEBOUNCE_MS);
      return () => clearTimeout(writeTimer.current);
    }
    commit();
  }, [state]);

  // Browser back/forward: replaceState never fires popstate on its own (only
  // real navigation does), so this can't loop back on the effect above.
  useEffect(() => {
    function onPopState() {
      dispatch({ type: "replace", state: parseUrlState(window.location.search) });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return [state, setState];
}
