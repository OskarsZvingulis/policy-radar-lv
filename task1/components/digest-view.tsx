"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ItemCard } from "@/components/item-card";
import { SourceStatusRow, type LiveSourceState } from "@/components/source-status";
import { absoluteDay } from "@/lib/relative-date";
import { SOURCE_REGISTRY } from "@/lib/digest/registry";
import { groupDigest } from "@/lib/digest/group";
import type { DigestResult, ScoredItem, SourceId } from "@/lib/types";

// Pending placeholders shown before the first live event for a source lands.
// Derived from the shared registry rather than a hand-kept copy, which is
// what let the subtitle count and the chips disagree.
const SOURCE_PLACEHOLDERS: { source: SourceId; label: string }[] = SOURCE_REGISTRY.map((s) => ({
  source: s.id,
  label: s.label,
}));

function minutesAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "moments ago";
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}

/** One figure of the scanned / relevant / open-to-submissions headline. */
function Stat({ n, label }: { n: number; label: string }) {
  return (
    // Reversed so the number reads first visually while the DOM keeps the
    // term-then-definition order a screen reader announces.
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-semibold tabular-nums">{n}</dd>
    </div>
  );
}

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

export function DigestView({ initialData }: { initialData: DigestResult | null }) {
  const [digest, setDigest] = useState<DigestResult | null>(initialData);
  const [liveSources, setLiveSources] = useState<LiveSourceState[]>(
    initialData
      ? toLiveSources(initialData)
      : SOURCE_PLACEHOLDERS.map((s) => ({ ...s, status: "pending" as const })),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"deadline" | "relevance">("deadline");
  // Non-null when the digest on screen was replayed from cache rather than
  // scanned just now, so Refresh returning instantly doesn't look broken.
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);
  const started = useRef(false);

  function handleRefresh() {
    setRefreshing(true);
    setRunError(null);
    setCacheAgeMs(null);
    setLiveSources(SOURCE_PLACEHOLDERS.map((s) => ({ ...s, status: "pending" as const })));

    const es = new EventSource("/api/digest/stream");

    es.addEventListener("source", (ev) => {
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
      setRefreshing(false);
      es.close();
      setRunError(message);
      setLiveSources((prev) =>
        prev.map((s) => (s.status === "pending" ? { ...s, status: "error" as const } : s)),
      );
    };

    // The server's own failure event. Named `failed` rather than `error`
    // because EventSource fires `error` itself for transport problems, so the
    // two landed on one listener and the server's message was discarded in
    // favour of a guess about the connection.
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

    // Transport-level failure. With no digest yet, the page used to go on
    // claiming it was scanning, pending dots still pulsing, nothing running.
    es.addEventListener("error", () => {
      stop("The connection to the scan dropped before it finished. Nothing is running now.");
    });
  }

  // Cold cache (nothing generated yet this week) → auto-run the same live
  // stream a manual "Refresh" click would, instead of showing a dead page.
  useEffect(() => {
    if (!initialData && !started.current) {
      started.current = true;
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceOptions = useMemo(
    () => (digest ? digest.sources.map((s) => ({ id: s.source, label: s.label })) : []),
    [digest],
  );

  const visibleItems: ScoredItem[] = useMemo(() => {
    if (!digest) return [];
    if (sourceFilter === "all") return digest.scored;
    return digest.scored.filter((i) => i.source === sourceFilter);
  }, [digest, sourceFilter]);

  /**
   * The one split that survives: an item either has an open window you can
   * submit into, or it does not. That is a fact about the source, unlike the
   * urgency tiers this replaced, which asked the reader to act on votes they
   * have no part in. Items you can act on sort by deadline (soonest first,
   * because that is the decision); the rest sort by relevance.
   */
  const { openItems, awarenessItems } = useMemo(() => {
    const { open, awareness } = groupDigest(visibleItems, { sortBy });
    return { openItems: open, awarenessItems: openOnly ? [] : awareness };
  }, [visibleItems, sortBy, openOnly]);

  const actionableCount = useMemo(
    () => (digest ? groupDigest(digest.scored).open.length : 0),
    [digest],
  );

  /** Per-source contribution to the digest, so a chip can read "3 of 100". */
  const surfacedBySource = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of digest?.scored ?? []) out[item.source] = (out[item.source] ?? 0) + 1;
    return out;
  }, [digest]);

  /**
   * Sources whose data is missing or suspect. A source that fetched fine but
   * parsed nothing belongs here too: the server logs that case, but a reader
   * looking at the page could not tell a broken parser from a quiet week.
   */
  const degraded = useMemo(
    () => (digest?.sources ?? []).filter((s) => s.status !== "ok" || s.count === 0),
    [digest],
  );

  // There is deliberately no separate "Closing soonest" box here. With the
  // default sort it listed the same five items as the section immediately
  // below it, so the page opened by saying everything twice. The markdown
  // export keeps its version, where there is no list underneath to repeat.

  return (
    // ~75ch: the measure prose stays readable at. The page was 768px wide,
    // which at this body size ran to roughly 95 characters a line.
    <div className="mx-auto flex w-full max-w-[75ch] flex-col gap-6 px-4 py-8 leading-relaxed">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">Policy Radar LV</h1>
            <p className="text-sm text-muted-foreground">
              Weekly startup-relevance digest across {SOURCE_PLACEHOLDERS.length} Latvian policy
              sources.
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Scanning…" : "Refresh"}
          </Button>
        </div>

        <SourceStatusRow sources={liveSources} surfacedBySource={surfacedBySource} />

        {digest ? (
          <div className="flex flex-col gap-1">
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <Stat n={digest.totalScanned} label="scanned" />
              <Stat n={digest.totalSurfaced} label="startup-relevant" />
              <Stat n={actionableCount} label="open to submissions" />
            </dl>
            <p className="text-sm text-muted-foreground">
              {cacheAgeMs === null
                ? "Minutes of reading instead of the ~5 hours this used to take manually."
                : `Showing results from ${minutesAgo(cacheAgeMs)}. The sources are only re-scanned every few minutes.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {runError
              ? "No digest to show. The scan above did not complete."
              : "Running the first scan of the week against the live sources…"}
          </p>
        )}

        {runError && (
          <Alert variant="destructive">
            <AlertTitle>Scan did not complete</AlertTitle>
            <AlertDescription>
              {runError}{" "}
              <button onClick={handleRefresh} className="underline underline-offset-4">
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* A partial digest that looks complete is the failure mode worth
            shouting about: the reader has no way to know a source is missing. */}
        {digest && degraded.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>
              This digest is incomplete: {degraded.length} of {digest.sources.length} sources did
              not deliver
            </AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-0.5">
                {degraded.map((s) => (
                  <li key={s.source}>
                    <strong>{s.label}</strong>:{" "}
                    {s.status === "timeout"
                      ? "timed out before returning anything"
                      : s.status === "partial"
                        ? `hit its time limit after ${s.count} items, so later ones are missing`
                        : s.status === "error"
                          ? (s.error ?? "failed")
                          : "fetched successfully but returned no items, which may mean the page changed shape"}
                  </li>
                ))}
              </ul>
              Items from these sources are missing below.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-sm text-muted-foreground">
          <Link href="/methodology" className="underline underline-offset-4">
            Methodology
          </Link>
          <span aria-hidden>·</span>
          <a href="/api/digest/markdown" className="underline underline-offset-4" target="_blank">
            Export as Markdown
          </a>
          {/* Rules-only is the designed default, not a fault — it belongs in
              the same muted line as the other metadata, not in a banner. */}
          {digest && !digest.llmAvailable && (
            <>
              <span aria-hidden>·</span>
              <span>Rules-only: no LLM key set, so no written explanations</span>
            </>
          )}
        </div>
      </header>

      <Separator />

      {digest && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                  className="size-4 accent-foreground"
                />
                Open deadlines only
              </label>
              <label className="flex items-center gap-2">
                Sort by
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "deadline" | "relevance")}
                  className="rounded-md border bg-background px-2 py-1"
                >
                  <option value="deadline">deadline</option>
                  <option value="relevance">relevance</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={sourceFilter === "all" ? "secondary" : "ghost"}
                aria-pressed={sourceFilter === "all"}
                onClick={() => setSourceFilter("all")}
              >
                All sources
              </Button>
              {sourceOptions.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={sourceFilter === s.id ? "secondary" : "ghost"}
                  aria-pressed={sourceFilter === s.id}
                  onClick={() => setSourceFilter(s.id)}
                >
                  <span lang="lv">{s.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {openItems.length + awarenessItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {openOnly
                ? "Nothing here has an open submission window right now."
                : "No startup-relevant items from this source this week."}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {openItems.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">
                    You can still submit on these{" "}
                    <span className="font-normal text-muted-foreground">({openItems.length})</span>
                  </h2>
                  {openItems.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </section>
              )}

              {awarenessItems.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">
                    Worth knowing about{" "}
                    <span className="font-normal text-muted-foreground">
                      ({awarenessItems.length})
                    </span>
                  </h2>
                  <p className="-mt-2 text-xs text-muted-foreground">
                    No open submission window. These are moving through the process, or already
                    decided.
                  </p>
                  {awarenessItems.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </section>
              )}
            </div>
          )}

          <Separator />
          <footer className="flex flex-col gap-1 pb-6 text-xs text-muted-foreground">
            <span>
              Digest generated{" "}
              {new Date(digest.generatedAt).toLocaleString("en-GB", { timeZone: "Europe/Riga" })}{" "}
              (Europe/Riga) · week of {absoluteDay(digest.weekStart)}
            </span>
            <span>
              Run <code className="rounded bg-muted px-1 py-0.5">{digest.runId}</code>
              {digest.llmUsage ? (
                <>
                  {" "}
                  · LLM: {digest.llmUsage.model} · cost this run: $
                  {digest.llmUsage.estimatedCostUsd.toFixed(4)} ({digest.llmUsage.inputTokens}+
                  {digest.llmUsage.outputTokens} tokens)
                </>
              ) : (
                " · rules-only, $0.00"
              )}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
