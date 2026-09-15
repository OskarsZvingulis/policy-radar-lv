/**
 * Orchestrator: runs all 8 collectors in parallel (bounded by a per-source
 * timeout so one slow gov.lv server can't sink the whole digest), scores
 * every item deterministically, hands the top slice to the LLM for a
 * "why it matters" line, and assembles the final DigestResult.
 */
import type {
  Appearance,
  DigestResult,
  Item,
  NotRelevantItem,
  ScoredItem,
  SourceId,
  SourceResult,
} from "../types";
import { collectTapLegalActs } from "../sources/tap";
import { collectTapConsultations } from "../sources/tap-consultations";
import { collectTapMeetings } from "../sources/tap-meetings";
import { collectSaeimaCommittees } from "../sources/saeima";
import { collectEmNews, collectLiaaNews, collectAltumNews } from "../sources/rss";
import { scoreItems } from "../relevance/score";
import { scoreWithLlm, PROMPT_VERSION, LLM_MODEL, type LlmShortlistItem } from "../relevance/llm";
import { weekBounds } from "./week";
import { SOURCE_REGISTRY } from "./registry";
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
  /** Receives the deadline signal so it can stop early and cancel in-flight requests. */
  run: (signal: AbortSignal) => Promise<Item[]>;
}

/** Labels come from the registry; this only binds each id to its collector. */
const COLLECTORS: Record<SourceId, (signal: AbortSignal) => Promise<Item[]>> = {
  tap_legal_acts: collectTapLegalActs,
  tap_consultations: collectTapConsultations,
  tap_vss: (s) => collectTapMeetings("state_secretaries", s),
  tap_mk: (s) => collectTapMeetings("cabinet_ministers", s),
  saeima_committees: collectSaeimaCommittees,
  em_news: collectEmNews,
  liaa_news: collectLiaaNews,
  altum_news: collectAltumNews,
};

const SOURCES: SourceDef[] = SOURCE_REGISTRY.map(({ id, label }) => ({
  id,
  label,
  run: COLLECTORS[id],
}));

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
 * document, and 26-TA-2087 took two of the five slots at the top of a real
 * digest.
 *
 * The first attempt at this fix picked one copy and discarded the rest, which
 * turned a visible duplicate into an invisible wrong answer. On the committed
 * sample it merged away the public consultation closing that same day and
 * showed the ministry coordination deadline of the next day instead, linking
 * to the wrong page. Worse, because every consultation was absorbed into a
 * legal-act card, the one source a reader can actually submit to reported
 * "0 of 25".
 *
 * So nothing is discarded now. Every copy is kept as an `appearance` carrying
 * its own deadline and URL, and the merged card leads with the appearance a
 * reader can still act on:
 *
 *   1. Among copies whose deadline is still open, a public consultation wins,
 *      because that is a window the public may submit into. A legal-act
 *      "deadline" is inter-ministry coordination, which a founder cannot file
 *      against.
 *   2. Within that, soonest close first.
 *   3. If nothing is open, highest score, then lowest id.
 *
 * The card's deadline and its link come from the same appearance, so it can
 * never say "1 day left" while pointing at a page about a different date.
 * Every tie-break is total, so the merge does not depend on the order the
 * collectors happened to return in.
 */
const TA_CODE = /\b(\d{2}-TA-\d+)\b/;

const CONSULTATION_SOURCE = "tap_consultations";

export function taIdentificator(item: { id: string; title: string }): string | undefined {
  return item.id.match(TA_CODE)?.[1] ?? item.title.match(TA_CODE)?.[1];
}

interface Dedupable {
  id: string;
  title: string;
  source: string;
  sourceLabel: string;
  url: string;
  score: number;
  deadline?: string;
  actionable: boolean;
  matchedRules: string[];
  appearances?: Appearance[];
  alsoSeenIn?: string[];
}

function compareByText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Soonest actionable window first; a public consultation outranks a tie. */
function compareOpenCopies(a: Dedupable, b: Dedupable): number {
  const aConsult = a.source === CONSULTATION_SOURCE ? 0 : 1;
  const bConsult = b.source === CONSULTATION_SOURCE ? 0 : 1;
  if (aConsult !== bConsult) return aConsult - bConsult;
  const at = new Date(a.deadline!).getTime();
  const bt = new Date(b.deadline!).getTime();
  if (at !== bt) return at - bt;
  return compareByText(a.id, b.id);
}

function compareClosedCopies(a: Dedupable, b: Dedupable): number {
  return b.score - a.score || compareByText(a.id, b.id);
}

function mergeGroup<T extends Dedupable>(copies: T[], now: Date): T {
  if (copies.length === 1) return copies[0];

  const open = copies.filter((c) => isDeadlineStillOpen(c.deadline, now));
  const lead =
    open.length > 0
      ? [...open].sort(compareOpenCopies)[0]
      : [...copies].sort(compareClosedCopies)[0];

  const appearances: Appearance[] = copies.map((c) => ({
    source: c.source,
    sourceLabel: c.sourceLabel,
    url: c.url,
    deadline: c.deadline,
    actionable: c.actionable,
  }));

  const others = new Set(appearances.map((a) => a.sourceLabel));
  others.delete(lead.sourceLabel);

  return {
    ...lead,
    score: Math.max(...copies.map((c) => c.score)),
    // Actionable if any listing of this act has an open window, since the
    // reader can act on that listing even if the lead copy is not the one.
    actionable: copies.some((c) => c.actionable),
    matchedRules: [...new Set(copies.flatMap((c) => c.matchedRules))],
    appearances,
    alsoSeenIn: [...others].sort(compareByText),
  };
}

export function dedupeByAct<T extends Dedupable>(items: T[], now: Date = new Date()): T[] {
  // Group first, merge once. The previous version merged pairwise as it went,
  // which made the result depend on arrival order.
  const groups = new Map<string, T[]>();
  const slots: (string | T)[] = [];

  for (const item of items) {
    const code = taIdentificator(item);
    if (!code) {
      slots.push(item); // nothing to key on (news, committee agendas)
      continue;
    }
    const existing = groups.get(code);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(code, [item]);
      slots.push(code); // hold this act's position in the output
    }
  }

  return slots.map((slot) => (typeof slot === "string" ? mergeGroup(groups.get(slot)!, now) : slot));
}

/**
 * Races a collector against its own deadline, and actually cancels it.
 *
 * The previous version only rejected the outer promise. The collector kept
 * running, and so did its in-flight requests against gov.lv: a source that
 * "timed out" carried on making the very calls the timeout existed to stop.
 * Now the timeout aborts a controller the collector has been handed, so the
 * current request is cancelled and the loops stop between pages.
 */
async function runWithDeadline(
  def: SourceDef,
  ms: number,
): Promise<{ items: Item[]; timedOut: boolean }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  try {
    const items = await def.run(controller.signal);
    // A collector that returns what it had when the signal fired is a partial
    // success, not a failure: some agendas beat the clock, and half a digest
    // beats none.
    return { items, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

async function runSource(def: SourceDef, runId: string): Promise<SourceResult> {
  const start = Date.now();
  try {
    const { items, timedOut } = await runWithDeadline(def, PER_SOURCE_TIMEOUT_MS);
    const durationMs = Date.now() - start;

    if (timedOut) {
      logger.warn("source hit its deadline and returned what it had", {
        runId,
        source: def.id,
        stage: "collect",
        count: items.length,
        durationMs,
      });
      return {
        source: def.id,
        label: def.label,
        status: items.length > 0 ? "partial" : "timeout",
        count: items.length,
        durationMs,
        error: `Stopped after ${Math.round(durationMs / 1000)}s`,
        items,
      };
    }

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
    // A collector that throws rather than returning early on abort still
    // reads as a timeout, since the deadline is what stopped it.
    const timedOut = err instanceof Error && /abort/i.test(err.message);
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

  // Scored against every scanned item, not just the fresh ones: the "not
  // relevant" search view is meant to answer "why didn't the rules flag X"
  // for anything the reader remembers seeing, whether it was filtered by
  // relevance or by the recency window.
  const ruleScoredAll = scoreItems(allItems);
  const qualifies = (i: (typeof ruleScoredAll)[number]) => i.relevant && isWithinRecencyWindow(i);

  const surfaced = dedupeByAct(ruleScoredAll.filter(qualifies));
  const notRelevant: NotRelevantItem[] = ruleScoredAll
    .filter((i) => !qualifies(i))
    .map((i) => ({
      id: i.id,
      title: i.title,
      source: i.source,
      sourceLabel: i.sourceLabel,
      url: i.url,
      date: i.date,
      reason: isWithinRecencyWindow(i) ? (i.reason ?? "Not relevant") : "Outside this week's 7-day window",
    }));

  logger.info("scoring finished", {
    runId,
    stage: "score",
    totalScanned,
    qualifiedCount: ruleScoredAll.filter(qualifies).length,
    surfacedCount: surfaced.length,
    dedupedCount: ruleScoredAll.filter(qualifies).length - surfaced.length,
    notRelevantCount: notRelevant.length,
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
    notRelevant,
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
