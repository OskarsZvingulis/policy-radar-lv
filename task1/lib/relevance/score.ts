import type { Item, ScoredItem } from "../types";
import { isDeadlineStillOpen, isTodayOrLater } from "../dates";
import {
  ALL_AXES,
  ECOSYSTEM_ENTITIES,
  RESPONSIBLE_INSTITUTION_BOOST,
  READING_STAGE_BOOST,
  CONSULTATION_STAGE,
  matchedExclusion,
} from "./keywords";

export type RuleScoreResult = Omit<ScoredItem, "whyItMatters" | "llmScored"> & {
  relevant: boolean;
  /**
   * Plain-language reason the item did not surface. Only meaningful when
   * `relevant` is false: it exists for the "not relevant" search view, so a
   * reader who remembers an act the rules didn't flag can see why rather than
   * just seeing it missing.
   */
  reason?: string;
};

/**
 * Deterministic rules pass. Runs on every scanned item — cheap, explainable,
 * and the only thing that runs at all when no LLM key is configured.
 */
export function scoreItem(item: Item): RuleScoreResult {
  const haystack = [item.title, item.text, item.stage].filter(Boolean).join(" \n ");
  const matchedRules: string[] = [];
  let score = 0;

  // A source mentioning its own name in its own press release is not a
  // signal — it is guaranteed. "Altum instrument" / "LIAA instrument" only
  // count when the mention comes from somewhere else (a Saeima agenda, a
  // TAP item, EM news) referencing that org as relevant to the topic.
  const applicableAxes = ALL_AXES.filter((rule) => {
    if (rule.id === "capital.altum" && item.source === "altum_news") return false;
    if (rule.id === "capital.liaa" && item.source === "liaa_news") return false;
    return true;
  });

  let topicalMatches = 0;
  for (const rule of applicableAxes) {
    if (rule.pattern.test(haystack)) {
      matchedRules.push(rule.label);
      score += rule.weight;
      topicalMatches++;
    }
  }

  const exclusionLabel = matchedExclusion(haystack);
  const excluded = exclusionLabel !== undefined;
  // Must use the same inflection-tolerant forms as capital.altum/capital.liaa
  // above: with a trailing \b, an item mentioning "Altuma programma" failed
  // to escape an exclusion it should have escaped.
  const hasStrongOverride = /kolektīv.{0,10}finansēš|jaunuzņēmum|\baltum|\bliaa/i.test(haystack);

  if (ECOSYSTEM_ENTITIES.test(haystack)) {
    matchedRules.push("Ecosystem stakeholder named");
    score += 15;
    topicalMatches++;
  }
  if (item.institution && RESPONSIBLE_INSTITUTION_BOOST.test(item.institution)) {
    matchedRules.push("Startup-relevant ministry");
    score += 10;
  }
  const readingStageMatch =
    READING_STAGE_BOOST.test(haystack) || Boolean(item.stage && READING_STAGE_BOOST.test(item.stage));
  // A synthetic scrape-time date is not evidence that a vote is still ahead.
  const readingUpcoming = !item.dateIsApproximate && isTodayOrLater(item.date);
  if (readingStageMatch) {
    matchedRules.push(
      readingUpcoming
        ? "Near-final reading (2nd/3rd), upcoming"
        : "Near-final reading (2nd/3rd), already occurred",
    );
    score += 15;
  }
  const deadlineOpen = isDeadlineStillOpen(item.deadline);
  if (deadlineOpen) {
    // Same underlying signal (a real, open deadline), but the label must
    // match what it actually is — a submission window on a news feed reads
    // nothing like a government consultation.
    matchedRules.push(
      item.source === "em_news" || item.source === "liaa_news" || item.source === "altum_news"
        ? "Application window open"
        : "Consultation window open",
    );
    score += 20;
  } else if (item.stage && CONSULTATION_STAGE.test(item.stage)) {
    matchedRules.push("In public consultation");
    score += 10;
  }

  if (excluded && !hasStrongOverride) {
    score = Math.min(score, 10);
  }

  score = Math.min(100, score);

  // Actionable means a reader can genuinely do something — a real, open
  // deadline. A reading stage being "upcoming" is not that: nobody can act on
  // a vote they have no part in, only be aware of it before it happens. Using
  // reading-stage timing to grant actionability was the mistake behind the
  // whole earlier tier system; it is not repeated here.
  const actionable = deadlineOpen;

  // Surfacing is a flat relevance floor, not a tier: excluded topics, and
  // items with a real topical hit only from timing/context boosts (no axis or
  // ecosystem match) never overcome an unrelated deadline alone.
  const relevant = !(excluded && !hasStrongOverride) && topicalMatches > 0 && score >= 15;

  // Only computed for items that didn't make it. A reason on a relevant item
  // would never be read and would just be one more thing to keep truthful.
  let reason: string | undefined;
  if (!relevant) {
    if (excluded && !hasStrongOverride) reason = `Excluded: ${exclusionLabel}`;
    else if (topicalMatches === 0) reason = "No topic keywords matched";
    else reason = `Only timing/context signals matched (score ${score}, floor is 15)`;
  }

  return { ...item, score, matchedRules, actionable, relevant, reason };
}

export function scoreItems(items: Item[]): RuleScoreResult[] {
  return items.map(scoreItem);
}
