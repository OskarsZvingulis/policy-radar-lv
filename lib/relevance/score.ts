import type { Item, ScoredItem, Tier } from "../types";
import {
  ALL_AXES,
  ECOSYSTEM_ENTITIES,
  RESPONSIBLE_INSTITUTION_BOOST,
  READING_STAGE_BOOST,
  CONSULTATION_STAGE,
  isExcluded,
} from "./keywords";

function isDeadlineOpen(item: Item): boolean {
  if (!item.deadline) return false;
  return new Date(item.deadline).getTime() >= Date.now();
}

/**
 * Deterministic rules pass. Runs on every scanned item — cheap, explainable,
 * and the only thing that runs at all when no LLM key is configured.
 */
export function scoreItem(item: Item): Omit<ScoredItem, "whyItMatters" | "llmScored"> {
  const haystack = [item.title, item.text, item.stage].filter(Boolean).join(" \n ");
  const matchedRules: string[] = [];
  let score = 0;

  for (const rule of ALL_AXES) {
    if (rule.pattern.test(haystack)) {
      matchedRules.push(rule.label);
      score += rule.weight;
    }
  }

  const excluded = isExcluded(haystack);
  const hasStrongOverride = /kolektīv.{0,10}finansēš|jaunuzņēmum|\baltum\b|\bliaa\b/i.test(haystack);

  if (ECOSYSTEM_ENTITIES.test(haystack)) {
    matchedRules.push("Ecosystem stakeholder named");
    score += 15;
  }
  if (item.institution && RESPONSIBLE_INSTITUTION_BOOST.test(item.institution)) {
    matchedRules.push("Startup-relevant ministry");
    score += 10;
  }
  if (READING_STAGE_BOOST.test(haystack) || (item.stage && READING_STAGE_BOOST.test(item.stage))) {
    matchedRules.push("Near-final reading (2nd/3rd)");
    score += 15;
  }
  const deadlineOpen = isDeadlineOpen(item);
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

  let tier: Tier;
  if (excluded && !hasStrongOverride) {
    tier = "excluded";
  } else if (score >= 65 && (deadlineOpen || READING_STAGE_BOOST.test(haystack))) {
    tier = "act_now";
  } else if (score >= 45) {
    tier = "watch";
  } else if (score >= 15) {
    tier = "fyi";
  } else {
    tier = "excluded";
  }

  return { ...item, score, tier, matchedRules };
}

export function scoreItems(items: Item[]): Omit<ScoredItem, "whyItMatters" | "llmScored">[] {
  return items.map(scoreItem);
}
