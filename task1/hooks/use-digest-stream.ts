"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DigestResult } from "@/lib/types";
import { SOURCE_REGISTRY } from "@/lib/digest/registry";

export interface LiveSourceState {
  source: string;
  label: string;
  status: "pending" | "ok" | "error" | "timeout" | "partial";
  count?: number;
  durationMs?: number;
  error?: string;
}

const PLACEHOLDERS: LiveSourceState[] = SOURCE_REGISTRY.map((s) => ({
  source: s.id,
  label: s.label,
  status: "pending",
}));

function toLiveSources(digest: DigestResult): LiveSourceState[] {
  return digest.sources.map((s) => ({
    source: s.source,
    label: s.label,
    status: s.status,
    count: s.count,
    durationMs: s.durationMs,
    error: s.error,
  }));
}

/**
 * Owns the SSE lifecycle for a live digest run, and nothing else: no
 * filtering, no URL state. Moved out of the page component so that logic is
 * readable on its own and the component tree doesn't re-render on every
 * source event for reasons unrelated to the stream.
 */
export function useDigestStream(initialData: DigestResult | null) {
  const [digest, setDigest] = useState<DigestResult | null>(initialData);
  const [liveSources, setLiveSources] = useState<LiveSourceState[]>(
    initialData ? toLiveSources(initialData) : PLACEHOLDERS,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // Non-null when the digest on screen was replayed from cache rather than
  // scanned just now, so an instant Refresh doesn't look broken.
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(() => {
    // Supersede whatever connection is already open. Without this, React
    // Strict Mode's dev-only mount→unmount→remount cycle left the first
    // mount's EventSource running forever in the background with no
    // cleanup, so two live scans could end up updating state at once.
    esRef.current?.close();

    setRefreshing(true);
    setRunError(null);
    setCacheAgeMs(null);
    setLiveSources(PLACEHOLDERS);

    const es = new EventSource("/api/digest/stream");
    esRef.current = es;

    // A superseded connection's own late events must not overwrite a newer
    // run's state, even if it fires after being told to close.
    const current = () => esRef.current === es;

    es.addEventListener("source", (ev) => {
      if (!current()) return;
      const data = JSON.parse((ev as MessageEvent).data);
      setLiveSources((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.source === data.source);
        const updated: LiveSourceState = {
          source: data.source,
          label: data.label,
          status: data.status,
          count: data.count,
          durationMs: data.durationMs,
          error: data.error,
        };
        if (idx >= 0) next[idx] = updated;
        else next.push(updated);
        return next;
      });
    });

    es.addEventListener("done", (ev) => {
      if (!current()) return;
      const data: DigestResult & { fromCache?: boolean; ageMs?: number } = JSON.parse(
        (ev as MessageEvent).data,
      );
      setDigest(data);
      setLiveSources(toLiveSources(data));
      setRefreshing(false);
      setRunError(null);
      setCacheAgeMs(data.fromCache ? (data.ageMs ?? 0) : null);
      es.close();
    });

    const stop = (message: string) => {
      if (!current()) return;
      setRefreshing(false);
      es.close();
      setRunError(message);
      setLiveSources((prev) =>
        prev.map((s) => (s.status === "pending" ? { ...s, status: "error" as const } : s)),
      );
    };

    // The server's own failure event, named `failed` rather than `error`
    // because EventSource fires `error` itself for transport problems, and the
    // two landed on one listener and the server's message was discarded.
    es.addEventListener("failed", (ev) => {
      let message = "The scan could not be completed.";
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (typeof data?.message === "string") message = data.message;
      } catch {
        // keep the generic message
      }
      stop(message);
    });

    es.addEventListener("error", () => {
      stop("The connection to the scan dropped before it finished. Nothing is running now.");
    });
  }, []);

  // Cold cache (nothing generated yet this week) auto-runs the same live
  // stream a manual Refresh click would, instead of showing a dead page.
  // Owning this as an effect (rather than an imperative call the consumer
  // fires from its own effect) is what makes the cleanup below actually
  // able to close the connection this specific mount opened.
  useEffect(() => {
    // Opening an EventSource is a subscription to an external system, not a
    // plain state update; the lint rule can't see through the `refresh` call
    // to know that's what this is.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialData) refresh();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
    // Intentionally mount-only: `refresh` is stable (empty dep array) and
    // `initialData` is a one-time server-render value, not something a
    // later prop change should re-trigger a scan for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { digest, liveSources, refreshing, runError, cacheAgeMs, refresh };
}
