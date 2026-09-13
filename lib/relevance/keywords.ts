/**
 * Deterministic definition of "startup-relevant" — see app/methodology/page.tsx
 * for the prose version shown in the app. This file is the executable form
 * of the same three axes, plus boosters and exclusions.
 *
 * An item qualifies if it plausibly changes the cost, legality, funding, or
 * market access of building and scaling a young technology company in Latvia.
 */

export interface KeywordRule {
  id: string;
  label: string;
  pattern: RegExp;
  weight: number;
}

// Axis 1 — cost & burden of operating a company.
const AXIS_COST: KeywordRule[] = [
  { id: "cost.company_law", label: "Company/commercial law", pattern: /komercdarbīb|komerclikum|kapitālsabiedrīb|sabiedrīb.{0,15}(dibin|reģistr)/i, weight: 30 },
  { id: "cost.tax", label: "Taxation", pattern: /nodok|iedzīvotāj.{0,10}ienākum|uzņēmum.{0,10}ienākum/i, weight: 30 },
  { id: "cost.options", label: "Employee share options", pattern: /kapitāla daļ.{0,20}(darbiniek|nodarbināt)|akciju opcij|līdzdalīb.{0,15}programm/i, weight: 35 },
  { id: "cost.payroll", label: "Payroll / social contributions", pattern: /darba samaks|algas nodok|sociāl.{0,10}iemaksas|VSAOI/i, weight: 25 },
  { id: "cost.accounting", label: "Accounting/reporting burden", pattern: /grāmatvedīb|gada pārskat|revīzij/i, weight: 20 },
  { id: "cost.insolvency", label: "Insolvency", pattern: /maksātnespēj|likvidācij/i, weight: 20 },
  { id: "cost.licensing", label: "Licensing/permits", pattern: /licenc|atļauj.{0,10}izsniegš|saskaņoš.{0,10}atļauj/i, weight: 20 },
  { id: "cost.admin_burden", label: "Administrative burden reduction", pattern: /administratīv.{0,10}slog|birokrātij|vienkārsoš/i, weight: 25 },
];

// Axis 2 — access to capital & talent.
const AXIS_CAPITAL: KeywordRule[] = [
  { id: "capital.vc", label: "Venture capital", pattern: /riska kapitāl|ventūras fond|investīciju fond/i, weight: 35 },
  { id: "capital.crowdfunding", label: "Crowdfunding", pattern: /kolektīv.{0,10}finansēš/i, weight: 40 },
  { id: "capital.altum", label: "Altum instrument", pattern: /\baltum\b/i, weight: 25 },
  { id: "capital.liaa", label: "LIAA instrument", pattern: /\bliaa\b/i, weight: 25 },
  { id: "capital.state_aid", label: "State aid / grants", pattern: /valsts atbalst|grant[su]?\b|dotācij|subsīdij/i, weight: 25 },
  { id: "capital.eu_funds", label: "EU funds", pattern: /ES fond|Eiropas Savienības fond|Atveseļošan.{0,15}fond|kohēzij/i, weight: 20 },
  { id: "capital.startup_law", label: "Startup Law", pattern: /jaunuzņēmum/i, weight: 45 },
  { id: "capital.talent", label: "Immigration / work permits for talent", pattern: /darba atļauj|imigrāc|starta vīz|augsti kvalificēt.{0,15}(darbiniek|nodarbināt)/i, weight: 30 },
  { id: "capital.employment", label: "Employment law", pattern: /darba likum|darba attiecīb|attālināt.{0,10}darb/i, weight: 15 },
];

// Axis 3 — market & regulatory access for tech business models.
const AXIS_MARKET: KeywordRule[] = [
  { id: "market.digital", label: "Digital services", pattern: /digitāl|e-pārvald|e-komercij/i, weight: 20 },
  { id: "market.ai", label: "AI", pattern: /mākslīg(ais|o) intelekt|\bAI\b/i, weight: 30 },
  { id: "market.data", label: "Data", pattern: /datu aizsardzīb|personas datu|datu apstrād/i, weight: 20 },
  { id: "market.fintech", label: "Fintech / payments", pattern: /fintech|maksājum.{0,10}pakalpojum|elektronisk.{0,10}nauda/i, weight: 30 },
  { id: "market.platform", label: "Platform rules", pattern: /platform|digitālo pakalpojumu akt/i, weight: 20 },
  { id: "market.cyber", label: "Cybersecurity", pattern: /kiberdrošīb|informācij.{0,10}tehnoloģij.{0,10}drošīb/i, weight: 25 },
  { id: "market.ip", label: "IP", pattern: /intelektuāl.{0,10}īpašum|patent|preču zīm/i, weight: 20 },
  { id: "market.procurement", label: "Public procurement", pattern: /iepirkum/i, weight: 15 },
  { id: "market.sandbox", label: "Regulatory sandbox", pattern: /regulatīv.{0,15}smilšukast|izmēģinājum.{0,10}vid/i, weight: 30 },
];

export const ALL_AXES = [...AXIS_COST, ...AXIS_CAPITAL, ...AXIS_MARKET];

// Named ecosystem entities — inviting them to a committee, or naming them as
// the responsible actor, is itself a relevance signal.
export const ECOSYSTEM_ENTITIES: RegExp =
  /fintech latvija|latvijas tirdzniecības un rūpniecības kamer|\bLTRK\b|latvijas darba devēju konfederācij|\bLDDK\b|startin\.?lv|latvijas biznesa eņģeļu|LatBAN|Green Tech Cluster/i;

export const RESPONSIBLE_INSTITUTION_BOOST: RegExp =
  /ekonomikas ministrij|finanšu ministrij|klimata un enerģētikas ministrij|viedās administrācijas un reģionālās attīstības ministrij/i;

export const READING_STAGE_BOOST: RegExp = /3\.\s*lasījum|2\.\s*lasījum|galīgais lasījum/i;

export const CONSULTATION_STAGE = /sabiedrīb.{0,10}(apspriešan|līdzdalīb)|publiskā apspriešan/i;

// Exclusions — matching one of these suppresses the item regardless of axis
// score, unless a strong capital/market signal (crowdfunding, startup law,
// Altum/LIAA) is also present.
export const EXCLUSION_PATTERNS: RegExp[] = [
  /iecelšan.{0,10}amat|apstiprināšan.{0,10}amat/i, // appointments
  /apbalvojum|goda rakst|jubilej/i, // ceremonial
  /aizsardzīb.{0,15}iepirkum|Nacionālo bruņoto spēku/i, // defence procurement
  /zvejniecīb|zivsaimniecīb/i, // fisheries
  /^(?!.*atbalst)(?!.*fond)(?!.*grant).{0,200}lauksaimniecīb/i, // agriculture w/o funding angle
  /pašvaldīb.{0,10}(teritorij|robež|administratīvi)/i, // pure municipal boundary matters
];

export function isExcluded(text: string): boolean {
  return EXCLUSION_PATTERNS.some((p) => p.test(text));
}
