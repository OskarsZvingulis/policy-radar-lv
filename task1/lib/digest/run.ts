/**
 * Orchestrator: runs all 8 collectors in parallel (bounded by a per-source
 * timeout so one slow gov.lv server can't sink the whole digest), scores
 * every item deterministically, hands the top slice to the LLM for a
 * "why it matters" line, and assembles the final DigestResult.
 */
import type { DigestResult, Item, ScoredItem, SourceId, SourceResult } from "../types";
import { collectTapLegalActs } from "../sources/tap";
import { collectTapConsultations } from "../sources/tap-consultations";
import { collectTapMeetings } from "../sources/tap-meetings";
import { collectSaeimaCommittees } from "../sources/saeima";
import { collectEmNews, collectLiaaNews, collectAltumNews } from "../sources/rss";
import { scoreItems } from "../relevance/score";
import { scoreWithLlm, PROMPT_VERSION, LLM_MODEL, type LlmShortlistItem } from "../relevance/llm";
import { weekBounds } from "./week";
import { isDeadlineStillOpen, isWithinTrailingDays } from "../dates";
import { logger, newRunId } from "../logging";

/** Exported so tests can assert it stays above fetch-utils' MAX_FETCH_BUDGET_MS —
 *  the two drifting apart is what made the last retry unreachable. */
export const PER_SOURCE_TIMEOUT_MS = 20_000;
const LLM_SHORTLIST_SIZE = 25;
const RECENCY_WINDOW_DAYS = 7;

interface SourceDef {
  id: SourceId;
  label: string;
  run: () => Promise<Item[]>;
}

const SOURCES: SourceDef[] = [
  { id: "tap_legal_acts", label: "TAP portāls: Tiesību aktu projekti", run: collectTapLegalActs },
  { id: "tap_consultations", label: "TAP portāls: Sabiedrības līdzdalība", run: collectTapConsultations },
  { id: "tap_vss", label: "Valsts sekretāru sanāksme", run: () => collectTapMeetings("state_secretaries") },
  { id: "tap_mk", label: "Ministru kabineta sēdes", run: () => collectTapMeetings("cabinet_ministers") },
  { id: "saeima_committees", label: "Saeima: komisiju sēdes", run: collectSaeimaCommittees },
  { id: "em_news", label: "Ekonomikas ministrija", run: collectEmNews },
  { id: "liaa_news", label: "LIAA", run: collectLiaaNews },
  { id: "altum_news", label: "Altum", run: collectAltumNews },
];

/**
 * Only the Saeima collector self-limits to a trailing date window. Every
 * other source (RSS feeds especially) returns whatever is most recent in
 * its own feed/listing, with no guarantee that is actually "new this week"
 * — a low-traffic feed (Altum posts roughly weekly) can still have a
 * 2-month-old item sitting inside its "10 most recent" window. Confirmed
 * live: an Altum RSS item published 06 Jul 2026 was still surfacing in a
 * mid-September digest run. This is the one place that enforces "this is a
 * WEEKLY digest" for every source, with one deliberate exception: an item
 * whose action deadline is still open stays visible even if it was
 * originally published outside the window — staying actionable until its
 * deadline is the entire point of a consultation window.
 *
 * Note: tap_legal_acts stamps `date` as scrape time, not a true submission
 * date (see sources/tap.ts) — this filter is a structural no-op for that
 * source specifically; it always passes. That is a pre-existing, documented
 * limitation of that collector, not something this filter fixes.
 */
function isWithinRecencyWindow(item: Item): boolean {
  if (isWithinTrailingDays(item.date, RECENCY_WINDOW_DAYS)) return true;
  // A consultation is still worth showing on its closing day, however long ago
  // it opened — deadlines are calendar days, so this compares whole days.
  if (isDeadlineStillOpen(item.deadline)) return true;
  return false;
}

/**
 * The same draft act legitimately appears in more than one collector: a TAP
 * act under public consultation is listed both on /legal_acts and on
 * /public_participation, and can also sit on a VSS or MK agenda. Each
 * collector mints its own id (tap_legal_acts:26-TA-2087 vs
 * tap_consultations:26-TA-2087), so nothing downstream saw them as the same
 * document — 26-TA-2087 took two of the five slots at the top of a real
 * digest. Deduping on the TA identificator is the fix; the whole promise of
 * the product is that the reader doesn't have to notice this themselves.
 *
 * Which copy wins: the one carrying a real deadline, since that is the record
 * that can actually be acted on. Ties break on score. matchedRules are
 * unioned so the surviving card still shows every axis that fired anywhere,
 * and the score is the max of the copies — the winner keeps its own fields
 * otherwise.
 */
const TA_CODE = /\b(\d{2}-TA-\d+)\b/;

export function taIdentificator(item: { id: string; title: string }): string | undefined {
  return item.id.match(TA_CODE)?.[1] ?? item.title.match(TA_CODE)?.[1];
}

export function dedupeByAct<T extends { id: string; title: string; score: number; deadline?: string; matchedRules: string[]; sourceLabel: string }>(
  items: T[],
): T[] {
  const byAct = new Map<string, T>();
  const out: T[] = [];

  for (const item of items) {
    const code = taIdentificator(item);
    if (!code) {
      out.push(item); // nothing to key on (news, committee agendas) — keep as-is
      continue;
    }
    const seen = byAct.get(code);
    if (!seen) {
      byAct.set(code, item);
      out.push(item);
      continue;
    }
    const winner = pickPreferred(seen, item);
    const loser = winner === seen ? item : seen;
    const merged = {
      ...winner,
      score: Math.max(seen.score, item.score),
      matchedRules: [...new Set([...winner.matchedRules, ...loser.matchedRules])],
      alsoSeenIn: [...new Set([...(asAlsoSeen(seen) ?? []), ...(asAlsoSeen(item) ?? []), loser.sourceLabel])],
    } as T;
    byAct.set(code, merged);
    out.splice(out.indexOf(seen), 1, merged);
  }
  return out;
}

function asAlsoSeen(item: { alsoSeenIn?: string[] } | unknown): string[] | undefined {
  return (item as { alsoSeenIn?: string[] }).alsoSeenIn;
}

function pickPreferred<T extends { score: number; deadline?: string }>(a: T, b: T): T {
  const aHasDeadline = Boolean(a.deadline);
  const bHasDeadline = Boolean(b.deadline);
  if (aHasDeadline !== bHasDeadline) return aHasDeadline ? a : b;
  return b.score > a.score ? b : a;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch((e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function runSource(def: SourceDef, runId: string): Promise<SourceResult> {
  const start = Date.now();
  try {
    const items = await withTimeout(def.run(), PER_SOURCE_TIMEOUT_MS);
    const durationMs = Date.now() - start;
    if (items.length === 0) {
      // A successful fetch that yields nothing is either a genuinely quiet
      // source or a parser that silently stopped matching — worth a WARNING
      // even though it isn't an error, so a run report reviewer can tell the
      // two apart instead of reading "0, ok" as an all-clear either way.
      logger.warn("source returned zero items on a successful fetch", {
        runId,
        source: def.id,
        stage: "collect",
        durationMs,
      });
    } else {
      logger.info("source finished", { runId, source: def.id, stage: "collect", count: items.length, durationMs });
    }
    return { source: def.id, label: def.label, status: "ok", count: items.length, durationMs, items };
  } catch (err) {
    const durationMs = Date.now() - start;
    const timedOut = err instanceof Error && err.message.startsWith("timed out");
    const message = err instanceof Error ? err.message : String(err);
    logger.error("source failed", {
      runId,
      source: def.id,
      stage: "collect",
      durationMs,
      error: message,
      status: timedOut ? "timeout" : "error",
    });
    return {
      source: def.id,
      label: def.label,
      status: timedOut ? "timeout" : "error",
      count: 0,
      durationMs,
      error: message,
      items: [],
    };
  }
}

/**
 * Runs the full digest. `onSource` fires as each collector settles — the
 * live "Refresh" view uses this to stream real per-source progress instead
 * of showing a static spinner, which is what makes a screen recording
 * credible as "running on real data" rather than a canned demo.
 */
export async function runDigest(onSource?: (r: SourceResult) => void): Promise<DigestResult> {
  const runId = newRunId();
  const runStart = Date.now();
  logger.info("run started", { runId, stage: "run", sourceCount: SOURCES.length });

  // Collected by index, not by push order: pushing as each collector settles
  // ordered the array by response time, so two runs of the same week produced
  // samples that would not diff cleanly. `onSource` still fires in whatever
  // order they land — that is the live progress the stream is there to show.
  const sources: SourceResult[] = await Promise.all(
    SOURCES.map(async (def) => {
      const result = await runSource(def, runId);
      onSource?.(result);
      return result;
    }),
  );

  const allItems = sources.flatMap((s) => s.items);
  const totalScanned = allItems.length;

  const freshItems = allItems.filter(isWithinRecencyWindow);

  const ruleScored = scoreItems(freshItems);
  const surfaced = dedupeByAct(ruleScored.filter((i) => i.relevant));
  logger.info("scoring finished", {
    runId,
    stage: "score",
    totalScanned,
    freshCount: freshItems.length,
    surfacedCount: surfaced.length,
    dedupedCount: ruleScored.filter((i) => i.relevant).length - surfaced.length,
  });

  const shortlist: LlmShortlistItem[] = [...surfaced]
    .sort((a, b) => b.score - a.score)
    .slice(0, LLM_SHORTLIST_SIZE)
    .map((i) => ({
      id: i.id,
      title: i.title,
      text: i.text,
      stage: i.stage,
      institution: i.institution,
      date: i.date,
      dateIsApproximate: i.dateIsApproximate,
      deadline: i.deadline,
      sourceLabel: i.sourceLabel,
    }));

  const { scores: llmResults, ok: llmOk, usage } = await scoreWithLlm(shortlist);
  logger.info("llm triage finished", {
    runId,
    stage: "llm",
    llmOk,
    shortlistSize: shortlist.length,
    scoredCount: llmResults.size,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    estimatedCostUsd: usage?.estimatedCostUsd,
  });

  const scored: ScoredItem[] = surfaced
    .map((i): ScoredItem => {
      const llm = llmResults.get(i.id);
      // `relevant` was only ever needed to decide inclusion, above; the final
      // ScoredItem doesn't carry it. `actionable` is untouched by the LLM
      // pass — it only ever supplies prose, never a decision that changes
      // what surfaces or what reads as having a real deadline.
      const { relevant, ...rest } = i;
      void relevant;
      return {
        ...rest,
        whyItMatters: llm?.whyItMatters,
        llmScored: Boolean(llm),
      };
    })
    // A flat, ranked list: highest relevance first. No tier bucketing — the
    // brief asked for a relevance filter, not an urgency taxonomy.
    .sort((a, b) => b.score - a.score);

  const { start, end } = weekBounds();
  const failedSources = sources.filter((s) => s.status !== "ok").map((s) => s.source);
  logger.info("run finished", {
    runId,
    stage: "run",
    durationMs: Date.now() - runStart,
    totalScanned,
    totalSurfaced: scored.length,
    failedSources: failedSources.length ? failedSources : undefined,
  });

  return {
    runId,
    generatedAt: new Date().toISOString(),
    weekStart: start,
    weekEnd: end,
    sources,
    scored,
    totalScanned,
    totalSurfaced: scored.length,
    llmAvailable: llmOk,
    llmUsage: usage
      ? {
          model: LLM_MODEL,
          promptVersion: PROMPT_VERSION,
          itemsSent: usage.itemsSent,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostUsd: usage.estimatedCostUsd,
        }
      : undefined,
  };
}
