/**
 * Historical record of how eval/labelled_items.jsonl was built (2026-09-15),
 * kept for provenance — not meant to be re-run as-is, since re-running
 * `npm run collect-eval-set` against live sources next week will return
 * different items than the ones these hand-assigned labels below refer to.
 *
 * The pipeline was: `npm run collect-eval-set` (writes
 * eval/raw-scored-items.json, all ~320 scanned items with their rule score),
 * then a stratified sample of 40 across four score/prediction buckets, then
 * each of those 40 was read and hand-labelled against the rubric in
 * README.md §3, with a one-line rationale for the call.
 *
 * Labels were assigned by Claude applying that rubric consistently across
 * the sample — not independently reviewed by a human at Startin. See
 * README's "Evaluation" section for that caveat.
 */
import { readFileSync, writeFileSync } from "node:fs";

function evenSample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = arr.length / n;
  for (let k = 0; k < n; k++) out.push(arr[Math.floor(k * step)]);
  return out;
}

interface RawItem {
  id: string;
  [key: string]: unknown;
}

const LABELS: Record<string, { relevant: boolean; note: string }> = {
  "tap_legal_acts:26-TA-2150": {
    relevant: false,
    note: "Internal state ICT resource-planning procedure — no plausible cost/funding/market effect on a private company.",
  },
  "tap_legal_acts:26-TA-2115": {
    relevant: true,
    note: "EU cohesion funds for business-support infrastructure — funding category, even if indirect.",
  },
  "tap_legal_acts:26-TA-2109": {
    relevant: false,
    note: "Municipal shared-services digital platform — 'platform' keyword collision, not a tech/business platform rule.",
  },
  "tap_legal_acts:26-TA-2079": {
    relevant: false,
    note: "Procedural MK reply to a Saeima subcommittee's correspondence — no substantive rule change.",
  },
  "saeima_committees:E13809A828576BE2C2258E6E003AE597:2": {
    relevant: true,
    note: "Personal income tax law amendment — direct taxation change.",
  },
  "saeima_committees:6F7C1AA20FEA7CBCC2258E6600492A62:5": {
    relevant: true,
    note: "Crowdfunding Services Law, 3rd reading — direct capital-access law.",
  },
  "liaa_news:https://www.liaa.gov.lv/lv/jaunums/no-prototipa-lidz-eksporta-tirgum-liaa-atver-rudens-uznemsanu-biznesa-inkubacijas-programma": {
    relevant: true,
    note: "LIAA incubation programme application round — direct funding/support programme.",
  },
  "tap_legal_acts:26-TA-2216": {
    relevant: true,
    note: "Administrative burden reduction strategy — horizontal business-rule category the brief names explicitly.",
  },
  "tap_legal_acts:26-TA-2151": {
    relevant: false,
    note: "One state real-estate company's authority to acquire equity stakes — narrow, not general company law.",
  },
  "tap_legal_acts:26-TA-2087": {
    relevant: true,
    note: "Industrial Property institutions/procedures law — direct IP category.",
  },
  "tap_vss:26-TA-2216:/meetings/state_secretaries/0af02db6-1ed3-4cac-af5c-20608e3fc500": {
    relevant: true,
    note: "Same admin-burden-reduction item surfaced via the VSS agenda.",
  },
  "tap_mk:26-TA-971:/meetings/cabinet_ministers/470933a7-f0c2-4835-a4cc-dd1c9c25fddb": {
    relevant: true,
    note: "EU-funded social-entrepreneurship support implementation rules — funding category.",
  },
  "tap_mk:26-TA-1913:/meetings/cabinet_ministers/0af5da1a-a1cb-476e-beab-c5b09ea633a3": {
    relevant: false,
    note: "Patent Office's own annual budget approval — routine internal agency admin, not an IP policy change.",
  },
  "tap_mk:26-TA-2113:/meetings/cabinet_ministers/0af5da1a-a1cb-476e-beab-c5b09ea633a3": {
    relevant: false,
    note: "About fuel price caps; 'Taxation' only matched because the addressee committee's name contains 'nodokļu'.",
  },
  "saeima_committees:6F7C1AA20FEA7CBCC2258E6600492A62:1": {
    relevant: true,
    note: "Advertising Law amendment — horizontal marketing-compliance obligation for any company.",
  },
  "saeima_committees:6F7C1AA20FEA7CBCC2258E6600492A62:6": {
    relevant: false,
    note: "Generic cross-agency budget reallocation with no substantive policy content.",
  },
  "saeima_committees:6F7C1AA20FEA7CBCC2258E6600492A62:10": {
    relevant: true,
    note: "Credit Institutions Law, 2nd reading — fintech/banking-adjacent regulation.",
  },
  "em_news:https://www.em.gov.lv/lv/jaunums/latvijas-uznemeji-berline-stiprinas-sadarbibu-ar-vacijas-tehnologiju-un-rupniecibas-lideriem": {
    relevant: false,
    note: "Trade-mission travel announcement, no funding/rule mechanism — 'LIAA instrument' matched only an incidental name mention.",
  },
  "liaa_news:https://www.liaa.gov.lv/lv/jaunums/liaa-piedava-riku-kas-palidz-uznemejiem-atrast-piemerotako-atbalstu": {
    relevant: true,
    note: "A tool for finding applicable support programmes — direct market-access/support-programme awareness value.",
  },
  "liaa_news:https://www.liaa.gov.lv/lv/jaunums/liaa-procesa-paredzamiba-un-tiesiska-vide-ir-izskirosas-nakamo-investoru-piesaistei": {
    relevant: true,
    note: "Ecosystem stakeholders (LIAA/LTRK/LDDK) commenting on investment-climate predictability.",
  },
  "tap_legal_acts:26-TA-2275": {
    relevant: true,
    note: "MISS: de minimis state-aid threshold directly gates how much Altum/LIAA grant support a startup can take before triggering full state-aid rules. Keyword pattern added.",
  },
  "tap_legal_acts:26-TA-2228": { relevant: false, note: "Child protective-measures law — unrelated." },
  "tap_legal_acts:26-TA-2209": { relevant: false, note: "Generic contingency-fund budget reallocation, Interior Ministry — unrelated." },
  "tap_legal_acts:26-TA-2183": { relevant: false, note: "Generic contingency-fund budget reallocation, Agriculture Ministry — unrelated." },
  "tap_legal_acts:26-TA-2139": { relevant: false, note: "Ukraine donation implementation report — unrelated." },
  "tap_legal_acts:26-TA-2117": { relevant: false, note: "NATO Iraq mission troop extension — unrelated." },
  "tap_legal_acts:26-TA-2095": {
    relevant: false,
    note: "Critical Raw Materials Law — industrial/mining policy, not general tech/startup relevant.",
  },
  "tap_legal_acts:26-TA-2080": { relevant: false, note: "EU health co-financing programme — health infrastructure, unrelated." },
  "tap_legal_acts:26-TA-2068": { relevant: false, note: "Ukraine civilian-support budget reallocation — unrelated." },
  "tap_consultations:26-TA-2095": {
    relevant: false,
    note: "Same Critical Raw Materials Law consultation surface — consistent with the legal_acts call above.",
  },
  "tap_consultations:26-TA-2002": { relevant: false, note: "Fishing quota regulation — brief's own fisheries exclusion." },
  "tap_consultations:26-TA-1974": { relevant: false, note: "State housing-purchase assistance — consumer programme, unrelated to startups." },
  "tap_consultations:26-TA-1893": {
    relevant: true,
    note: "MISS: State Social Insurance Law amendment changes employer social-contribution obligations. Keyword pattern broadened.",
  },
  "tap_legal_acts:26-TA-2276": { relevant: false, note: "EU joint statement on humanitarian action — foreign policy, unrelated." },
  "tap_legal_acts:26-TA-2165": { relevant: false, note: "Grain transit logistics — unrelated." },
  "tap_mk:26-TA-991:/meetings/cabinet_ministers/470933a7-f0c2-4835-a4cc-dd1c9c25fddb": {
    relevant: false,
    note: "Individual real-estate transfer to a municipality — brief's own exclusion category.",
  },
  "tap_mk:26-TA-2250:/meetings/cabinet_ministers/470933a7-f0c2-4835-a4cc-dd1c9c25fddb": {
    relevant: false,
    note: "Routine EU General Affairs Council coordination agenda — unrelated.",
  },
  "tap_mk:25-TA-592:/meetings/cabinet_ministers/0af5da1a-a1cb-476e-beab-c5b09ea633a3": {
    relevant: false,
    note: "Port-formalities regulation — niche maritime/logistics administration, not general enough.",
  },
  "saeima_committees:132CCFDAD620C00DC2258E6E004E371D": {
    relevant: false,
    note: "Human Rights and Public Affairs committee sitting, no agenda text captured — nothing substantive to key on.",
  },
  "em_news:https://www.em.gov.lv/lv/jaunums/nestai-latvija-investes-10-miljonus-eiro-aizsardzibas-maksliga-intelekta-attistiba": {
    relevant: true,
    note: "MISS: EUR 10M AI investment announcement — genuine AI/ecosystem signal; regex only covered two of four Latvian case-inflected forms of 'mākslīgais intelekts'. Pattern broadened.",
  },
};

const allScored: (RawItem & { score: number; predictedRelevant: boolean })[] = JSON.parse(
  readFileSync("eval/raw-scored-items.json", "utf8"),
);
function bucket(i: { predictedRelevant: boolean; score: number }): string {
  if (i.predictedRelevant) return i.score >= 50 ? "rel_high" : "rel_low";
  return i.score > 0 ? "notrel_score>0" : "notrel_score0";
}
const groups: Record<string, typeof allScored> = {};
for (const i of allScored) (groups[bucket(i)] ??= []).push(i);
const raw: RawItem[] = [
  ...evenSample(groups["rel_high"] ?? [], 7),
  ...evenSample(groups["rel_low"] ?? [], 13),
  ...evenSample(groups["notrel_score>0"] ?? [], 13),
  ...evenSample(groups["notrel_score0"] ?? [], 7),
];

const missing = raw.filter((r) => !(r.id in LABELS));
if (missing.length > 0) {
  console.error("Missing labels for:", missing.map((m) => m.id));
  process.exit(1);
}

const lines = raw.map((r) => {
  const label = LABELS[r.id];
  return JSON.stringify({ ...r, humanRelevant: label.relevant, note: label.note });
});
writeFileSync("eval/labelled_items.jsonl", lines.join("\n") + "\n");
console.log(`Wrote ${lines.length} labelled items to eval/labelled_items.jsonl`);
