import type { Item, ScoredItem, Tier } from "../types";
import { isDeadlineStillOpen, isTodayOrLater } from "../dates";
import {
  ALL_AXES,
  ECOSYSTEM_ENTITIES,
  RESPONSIBLE_INSTITUTION_BOOST,
  READING_STAGE_BOOST,
  CONSULTATION_STAGE,
  isExcluded,
} from "./keywords";

/**
 * Deterministic rules pass. Runs on every scanned item — cheap, explainable,
 * and the only thing that runs at all when no LLM key is configured.
 */
export function scoreItem(item: Item): Omit<ScoredItem, "whyItMatters" | "llmScored"> {
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

  const excluded = isExcluded(haystack);
  const hasStrongOverride = /kolektīv.{0,10}finansēš|jaunuzņēmum|\baltum\b|\bliaa\b/i.test(haystack);

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
        ? "Near-final reading (2nd/3rd) — upcoming"
        : "Near-final reading (2nd/3rd) — already occurred",
    );
    score += 15;
  }
  const deadlineOpen = isDeadlineStillOpen(item.deadline);
  if (deadlineOpen) {
    matchedRules.push("Consultation window open");
    score += 20;
  } else if (item.stage && CONSULTATION_STAGE.test(item.stage)) {
    matchedRules.push("In public consultation");
    score += 10;
  }

  if (excluded && !hasStrongOverride) {
    score = Math.min(score, 10);
  }

  score = Math.min(100, score);

  // Timing is urgency, not relevance. An open submission window says when you
  // could act, never that the subject matters to a startup — without this gate
  // a consultation boost alone (20pts) clears the 15pt surfacing floor, which
  // put juvenile-justice and clinical-trial bills into a startup digest.
  const actionable = deadlineOpen || (readingStageMatch && readingUpcoming);

  let tier: Tier;
  if (excluded && !hasStrongOverride) {
    tier = "excluded";
  } else if (topicalMatches === 0) {
    tier = "excluded";
  } else if (score >= 65 && actionable) {
    tier = "act_now";
  } else if (score >= 45) {
    tier = "watch";
  } else if (score >= 15) {
    tier = "fyi";
  } else {
    tier = "excluded";
  }

  return { ...item, score, tier, matchedRules, actionable };
}

export function scoreItems(items: Item[]): Omit<ScoredItem, "whyItMatters" | "llmScored">[] {
  return items.map(scoreItem);
}
