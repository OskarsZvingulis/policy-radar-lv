/**
 * LLM layer: writes the "why it matters" line and can nudge the tier the
 * rules engine already assigned. Only ever sees the shortlist the rules
 * prefilter already narrowed things down to (bounded, see route.ts) —
 * keeps latency and cost predictable regardless of how many items a given
 * week's scan turns up.
 *
 * Uses the Vercel AI Gateway as the default provider (a plain
 * "provider/model" string, no provider SDK import) per this project's
 * Vercel conventions. Auth for the Gateway comes from either an explicit
 * AI_GATEWAY_API_KEY or — automatically, with no config — the
 * VERCEL_OIDC_TOKEN a Vercel deployment injects for its own project. We
 * check for either before spending a network round trip; if neither is
 * present (plain local dev with no .env) we skip straight to rules-only
 * instead of waiting out a doomed call. If the call itself fails or times
 * out, callers get an empty map back and fall through the same way — the
 * app always renders either way.
 */
import { generateObject } from "ai";
import { z } from "zod";
import type { ScoredItem } from "../types";

const MODEL = "anthropic/claude-sonnet-5";
const TIMEOUT_MS = 25_000;

const ResultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      whyItMatters: z
        .string()
        .describe(
          "1-2 concrete sentences in English naming the actual mechanism (what changes, what it costs/opens up) — never a restatement of the title",
        ),
      tier: z.enum(["act_now", "watch", "fyi"]),
    }),
  ),
});

export type LlmShortlistItem = Pick<
  ScoredItem,
  "id" | "title" | "text" | "stage" | "institution" | "deadline" | "sourceLabel" | "tier"
>;

function hasGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function buildPrompt(items: LlmShortlistItem[]): string {
  const definition =
    "An item is startup-relevant if it plausibly changes the cost, legality, funding, or " +
    "market access of building and scaling a young technology company in Latvia: company " +
    "law & tax, access to capital (VC, crowdfunding, Altum, LIAA, EU funds, the Jaunuzņēmumu " +
    "darbības atbalsta likums / Startup Law) and talent (work permits, employment law), or " +
    "market/regulatory access for tech business models (AI, data, fintech, platforms, " +
    "cybersecurity, IP, procurement, regulatory sandboxes).";

  const list = items
    .map((it, i) => {
      const lines = [
        `${i + 1}. id="${it.id}"`,
        `source: ${it.sourceLabel}`,
        it.stage ? `stage: ${it.stage}` : null,
        it.institution ? `institution: ${it.institution}` : null,
        it.deadline ? `deadline: ${it.deadline}` : null,
        `title: ${it.title}`,
        it.text ? `detail: ${it.text.slice(0, 500)}` : null,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");

  return (
    `${definition}\n\nFor each of the following ${items.length} items from a Latvian policy ` +
    `monitoring digest, write a concrete 1-2 sentence explanation of why it matters to a ` +
    `startup founder — name the actual mechanism, not the title again. Also assign a tier: ` +
    `"act_now" only if there is a real closing deadline or the item is at a near-final vote, ` +
    `"watch" if it is moving through the process but not yet actionable, "fyi" if it is useful ` +
    `context with nothing to do. Return exactly one entry per item id, ids copied verbatim.\n\n` +
    `Items:\n${list}`
  );
}

export interface LlmScore {
  whyItMatters: string;
  tier: ScoredItem["tier"];
}

export interface LlmRunResult {
  scores: Map<string, LlmScore>;
  /** True only if a Gateway call was actually attempted and succeeded —
   * this, not env var presence, is what the UI's "rules-only" banner keys
   * off of, since credential presence doesn't guarantee the call works. */
  ok: boolean;
}

export async function scoreWithLlm(shortlist: LlmShortlistItem[]): Promise<LlmRunResult> {
  const scores = new Map<string, LlmScore>();
  if (shortlist.length === 0) return { scores, ok: true }; // nothing to score isn't a failure
  if (!hasGatewayCredentials()) return { scores, ok: false };

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: ResultSchema,
      prompt: buildPrompt(shortlist),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const validIds = new Set(shortlist.map((i) => i.id));
    for (const r of object.items) {
      if (validIds.has(r.id)) {
        scores.set(r.id, { whyItMatters: r.whyItMatters, tier: r.tier });
      }
    }
    return { scores, ok: true };
  } catch {
    // Network hiccup, timeout, quota, malformed output — any of these fall
    // back to the rule-based tier and matchedRules silently. The digest
    // must always render something.
    return { scores, ok: false };
  }
}
