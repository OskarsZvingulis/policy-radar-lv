/**
 * The single normalised shape every source collector produces.
 * The relevance engine, UI, and markdown export all operate on this only —
 * no source-specific fields leak past normalise.ts.
 */
export type SourceId =
  | "tap_legal_acts"
  | "tap_consultations"
  | "tap_vss"
  | "tap_mk"
  | "saeima_committees"
  | "em_news"
  | "liaa_news"
  | "altum_news";

export interface Item {
  /** Stable id: `${source}:${sourceLocalId}` */
  id: string;
  source: SourceId;
  sourceLabel: string;
  title: string;
  /** Link back to the original page — required so the recording can click through. */
  url: string;
  /** ISO date this item was published / submitted / happened. */
  date: string;
  /**
   * True when `date` is a scrape-time placeholder rather than a real source
   * date (some TAP listing rows carry no date). Relevance logic must not read
   * a placeholder as evidence that something is still upcoming.
   */
  dateIsApproximate?: boolean;
  /** ISO date this item requires action by, if any (consultation close, vote date). */
  deadline?: string;
  institution?: string;
  /** e.g. "3.lasījums", "Saskaņošana", "Iesniegts" */
  stage?: string;
  /** Extra plain-text body used for relevance scoring (annotation text, agenda item text). */
  text?: string;
}

export interface ScoredItem extends Item {
  score: number;
  /** Which keyword/taxonomy rules fired — shown for transparency. */
  matchedRules: string[];
  /**
   * True only when there is a real, structured deadline still open (a
   * consultation close date, a coordination-comment deadline). Never set
   * from a reading stage or a vote being "imminent" — being about to happen
   * is not something a reader can act on; only a genuine submission window
   * is. Governs whether the UI uses action language ("feedback due") versus
   * plain informational dates ("meeting: ...").
   */
  actionable: boolean;
  /**
   * Other sources that listed the same act, when copies were merged on the TA
   * identificator. Shown on expand so a reader can tell "one document, three
   * listings" from "three documents".
   */
  alsoSeenIn?: string[];
  /** LLM-written explanation, 1-2 sentences. Absent when running rules-only. */
  whyItMatters?: string;
  llmScored: boolean;
}

export interface SourceResult {
  source: SourceId;
  label: string;
  status: "ok" | "error" | "timeout";
  count: number;
  durationMs: number;
  error?: string;
  items: Item[];
}

export interface LlmUsage {
  model: string;
  promptVersion: string;
  itemsSent: number;
  inputTokens: number;
  outputTokens: number;
  /** USD, computed from published per-token pricing at the time this ran. */
  estimatedCostUsd: number;
}

export interface DigestResult {
  runId: string;
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  sources: SourceResult[];
  scored: ScoredItem[];
  totalScanned: number;
  totalSurfaced: number;
  llmAvailable: boolean;
  llmUsage?: LlmUsage;
}
