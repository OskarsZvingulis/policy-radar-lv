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
  // Broadened after the eval set (eval/labelled_items.jsonl) surfaced a
  // missed item: a "Grozījumi likumā Par valsts sociālo apdrošināšanu" title
  // never matches "sociāl.{0,10}iemaksas" — the law's own name says
  // "apdrošināšanu" (insurance), not "iemaksas" (contributions).
  { id: "cost.payroll", label: "Payroll / social contributions", pattern: /darba samaks|algas nodok|sociāl.{0,15}(iemaksas|apdrošināš)|VSAOI/i, weight: 25 },
  { id: "cost.accounting", label: "Accounting/reporting burden", pattern: /grāmatvedīb|gada pārskat|revīzij/i, weight: 20 },
  { id: "cost.insolvency", label: "Insolvency", pattern: /maksātnespēj|likvidācij/i, weight: 20 },
  { id: "cost.licensing", label: "Licensing/permits", pattern: /licenc|atļauj.{0,10}izsniegš|saskaņoš.{0,10}atļauj/i, weight: 20 },
  { id: "cost.admin_burden", label: "Administrative burden reduction", pattern: /administratīv.{0,10}slog|birokrātij|vienkārsoš/i, weight: 25 },
];

// Axis 2 — access to capital & talent.
const AXIS_CAPITAL: KeywordRule[] = [
  { id: "capital.vc", label: "Venture capital", pattern: /riska kapitāl|ventūras fond|investīciju fond/i, weight: 35 },
  { id: "capital.crowdfunding", label: "Crowdfunding", pattern: /kolektīv.{0,10}finansēš/i, weight: 40 },
  // No trailing \b: Latvian declines these names — "Altuma programma",
  // "Altumam", "Altumu", "LIAAīs" are the forms that actually occur in
  // prose, and a trailing word boundary matched only the nominative. Same
  // root cause as the mākslīgā intelekta miss. A leading \b is kept, so
  // this still won't fire inside an unrelated longer word.
  { id: "capital.altum", label: "Altum instrument", pattern: /\baltum/i, weight: 25 },
  { id: "capital.liaa", label: "LIAA instrument", pattern: /\bliaa/i, weight: 25 },
  // "de minimis" added after the eval set caught a miss: a de minimis aid
  // threshold change directly gates how much Altum/LIAA grant support a
  // startup can receive before triggering full state-aid rules, but never
  // mentions "valsts atbalsts" by name.
  { id: "capital.state_aid", label: "State aid / grants", pattern: /valsts atbalst|atbalsta programm|atbalsta instrument|grant[su]?\b|dotācij|subsīdij|de minimis/i, weight: 25 },
  { id: "capital.eu_funds", label: "EU funds", pattern: /ES fond|Eiropas Savienības fond|Atveseļošan.{0,15}fond|kohēzij/i, weight: 20 },
  { id: "capital.startup_law", label: "Startup Law", pattern: /jaunuzņēmum/i, weight: 45 },
  { id: "capital.talent", label: "Immigration / work permits for talent", pattern: /darba atļauj|imigrāc|starta vīz|augsti kvalificēt.{0,15}(darbiniek|nodarbināt)/i, weight: 30 },
  // Substantive programme signals. These are what should carry an incubator or
  // funding-round announcement, rather than the publishing agency's own name —
  // suppressing self-mentions on an agency's own feed otherwise left a real
  // LIAA incubator call (applications open 9–24 Sept) scoring zero.
  { id: "capital.incubation", label: "Incubator / accelerator programme", pattern: /inkubācij|inkubator|akcelerat|starta programm/i, weight: 35 },
  { id: "capital.application_round", label: "Open application round", pattern: /pieteikt\w{0,5}\s+\w{0,12}\s*(?:programm|atlas|konkurs)|uzņemšan\w{0,3}\s+\w{0,12}\s*programm|izsludina\s+\w{0,15}\s*atlas|projektu iesniegum\w{0,3}\s+atlas|aicina\s+\w{0,15}\s*pieteikties/i, weight: 25 },
  { id: "capital.young_companies", label: "Young companies addressed", pattern: /jaun\w{0,4}\s+uzņēmum|topoš\w{0,4}\s+uzņēm/i, weight: 20 },
  { id: "capital.employment", label: "Employment law", pattern: /darba likum|darba attiecīb|attālināt.{0,10}darb/i, weight: 15 },
];

// Axis 3 — market & regulatory access for tech business models.
const AXIS_MARKET: KeywordRule[] = [
  { id: "market.digital", label: "Digital services", pattern: /digitāl|e-pārvald|e-komercij/i, weight: 20 },
  // Latvian adjective agreement means "artificial intelligence" surfaces as
  // mākslīgais/mākslīgā/mākslīgo/mākslīgu intelekts depending on grammatical
  // case — the eval set caught a real news item using the genitive
  // "mākslīgā intelekta" slipping past a pattern that only covered two of
  // the four forms. JS's `\w` doesn't match diacritics at all (excludes even
  // the base "mākslīg" stem's own ī), so `\S*` — any non-whitespace — is
  // used instead of a word-character class to cover every inflected form.
  // Deliberately NOT /i: with the flag, \bAI\b also matched the Latvian
  // interjection "ai" ("Ai, cik skaisti"). But dropping the flag made the
  // spelled-out form miss ALL-CAPS headlines, which RSS titles and agenda
  // headings do use, so the real casings are listed instead. The all-caps
  // branch cannot leak into \bAI\b: in "MĀKSLĪGAIS" the diacritics are
  // non-word characters to JS, so the embedded "AI" has no word boundary.
  {
    id: "market.ai",
    label: "AI",
    pattern: /[Mm]ākslīg\S*\s+[Ii]ntelekt|MĀKSLĪG\S*\s+INTELEKT|\bAI\b/,
    weight: 30,
  },
  { id: "market.data", label: "Data", pattern: /datu aizsardzīb|personas datu|datu apstrād/i, weight: 20 },
  { id: "market.fintech", label: "Fintech / payments", pattern: /fintech|maksājum.{0,10}pakalpojum|elektronisk.{0,10}nauda/i, weight: 30 },
  { id: "market.platform", label: "Platform rules", pattern: /platform|digitālo pakalpojumu akt/i, weight: 20 },
  { id: "market.cyber", label: "Cybersecurity", pattern: /kiberdrošīb|informācij.{0,10}tehnoloģij.{0,10}drošīb/i, weight: 25 },
  { id: "market.ip", label: "IP", pattern: /intelektuāl.{0,10}īpašum|rūpniecisk.{0,10}īpašum|patent|preču zīm/i, weight: 20 },
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

// Saeima's Domino export is inconsistent about spacing: real agendas contain
// both “3.lasījums” and “3 .lasījums”. Eight items in one sampled week used
// the spaced form and silently lost this boost.
export const READING_STAGE_BOOST: RegExp = /[23]\s*\.\s*lasījum|galīgais\s+lasījum/i;

export const CONSULTATION_STAGE = /sabiedrīb.{0,10}(apspriešan|līdzdalīb)|publiskā apspriešan/i;

// Exclusions — matching one of these suppresses the item regardless of axis
// score, unless a strong capital/market signal (crowdfunding, startup law,
// Altum/LIAA) is also present.
export const EXCLUSION_PATTERNS: RegExp[] = [
  /iecelšan.{0,10}amat|apstiprināšan.{0,10}amat/i, // appointments
  /apbalvojum|goda rakst|jubilej/i, // ceremonial
  /aizsardzīb.{0,15}iepirkum|Nacionālo bruņoto spēku/i, // defence procurement
  /zvejniecīb|zivsaimniecīb/i, // fisheries
  // Agriculture with no funding angle.
  //
  // `[\s\S]` rather than `.` because the haystack joins title, body and stage
  // with newlines: with `.`, the lookaheads stopped at the first newline, so a
  // "valsts atbalsts" mentioned in the body was invisible to them and the item
  // was excluded anyway. (`.` plus the `s` flag would read better but needs an
  // ES2018 target, which this project does not set.) Stating it as
  // "agriculture appears somewhere, support/fund/grant appears nowhere" also
  // drops the arbitrary 200-character window, which only ever saw the title.
  /^(?![\s\S]*atbalst)(?![\s\S]*fond)(?![\s\S]*grant)(?=[\s\S]*lauksaimniecīb)/i,
  /pašvaldīb.{0,10}(teritorij|robež|administratīvi)/i, // pure municipal boundary matters
];

export function isExcluded(text: string): boolean {
  return EXCLUSION_PATTERNS.some((p) => p.test(text));
}
