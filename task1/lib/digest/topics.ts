/**
 * A founder does not think in the engine's ~30 keyword rules; they think
 * "anything on tax?" or "what's on the Altum programme?". This collapses
 * every matchedRules label into a handful of plain groups a sidebar can
 * actually show.
 *
 * The mapping is a string lookup against the rule labels defined in
 * relevance/keywords.ts, not a shared id: those labels are already the
 * transparency layer shown to a reader (item-detail lists them verbatim), so
 * they are the stable-enough surface to key off. A rule with no entry here
 * simply contributes no topic, which is safe. It only means that axis
 * doesn't group under one of these five buckets.
 */

export interface TopicGroup {
  id: string;
  label: string;
}

export const TOPIC_GROUPS: TopicGroup[] = [
  { id: "funding", label: "Funding" },
  { id: "tax", label: "Tax & company law" },
  { id: "talent", label: "Talent" },
  { id: "tech", label: "Tech regulation" },
  { id: "procurement", label: "Public procurement" },
];

const RULE_TO_TOPIC: Record<string, string> = {
  "Venture capital": "funding",
  Crowdfunding: "funding",
  "Altum instrument": "funding",
  "LIAA instrument": "funding",
  "State aid / grants": "funding",
  "EU funds": "funding",
  "Startup Law": "funding",
  "Incubator / accelerator programme": "funding",
  "Open application round": "funding",

  "Company/commercial law": "tax",
  Taxation: "tax",
  "Employee share options": "tax",
  "Payroll / social contributions": "tax",
  "Accounting/reporting burden": "tax",
  Insolvency: "tax",
  "Licensing/permits": "tax",
  "Administrative burden reduction": "tax",

  "Immigration / work permits for talent": "talent",
  "Employment law": "talent",
  "Young companies addressed": "talent",

  "Digital services": "tech",
  AI: "tech",
  Data: "tech",
  "Fintech / payments": "tech",
  "Platform rules": "tech",
  Cybersecurity: "tech",
  IP: "tech",
  "Regulatory sandbox": "tech",

  "Public procurement": "procurement",
};

/** Topic ids an item belongs to, de-duplicated, in TOPIC_GROUPS order. */
export function matchedTopics(matchedRules: string[]): string[] {
  const ids = new Set<string>();
  for (const rule of matchedRules) {
    const id = RULE_TO_TOPIC[rule];
    if (id) ids.add(id);
  }
  return TOPIC_GROUPS.map((t) => t.id).filter((id) => ids.has(id));
}

export function topicLabel(id: string): string {
  return TOPIC_GROUPS.find((t) => t.id === id)?.label ?? id;
}
