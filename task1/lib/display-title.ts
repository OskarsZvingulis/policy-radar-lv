/**
 * Turns a Latvian legal title into something a founder can scan.
 *
 * The product promise is that nobody has to open long documents to decide
 * whether they matter — but the digest was rendering titles like:
 *
 *   26-TA-2115: Grozījumi Ministru kabineta 2024. gada 16. janvāra
 *   noteikumos Nr. 55 "Eiropas Savienības kohēzijas politikas programmas
 *   2021.–2027. gadam 5.1.1. specifiskā atbalsta mērķa "Vietējās teritorijas
 *   ..." 5.1.1.1. pasākuma "Infrastruktūra uzņēmējdarbības atbalstam"
 *   īstenošanas noteikumi"
 *
 * five lines of amendment boilerplate wrapped around the one fragment that
 * says what it actually is. Latvian drafting convention puts the real subject
 * in a quoted programme or act name, so that's what this pulls out
 * ("Infrastruktūra uzņēmējdarbības atbalstam"). The full title is never
 * discarded — the UI keeps it one expand away.
 *
 * Note on why this splits rather than parses nesting: these titles mix
 * symmetric ASCII quotes with curly ones, and with a symmetric quote there is
 * no way to tell an opening from a closing one. Pairing them off in order
 * produces confidently wrong spans (it returned "5.1.1.1. pasākuma" for the
 * title above). Splitting on quote characters and scoring the resulting
 * segments avoids guessing at structure that isn't recoverable.
 *
 * Deliberately rule-based, no LLM: this has to work in rules-only mode, which
 * is the default the app actually runs in.
 */

const QUOTE_CHARS = /["“”„«»]/;
const MAX_LEN = 90;
const MIN_USEFUL = 10;

/** Strips a leading "26-TA-2115: " style identifier. */
export function stripActCode(title: string): string {
  return title.replace(/^\s*\d{2}-TA-\d+\s*(?:\([^)]*\)\s*)?[:—-]?\s*/, "");
}

/** Segments delimited by quote characters, trimmed, empties dropped. */
export function quotedSegments(text: string): string[] {
  return text
    .split(QUOTE_CHARS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Document-type words that are technically the quoted segment but tell a
 * reader nothing: a card reading just "Likumprojekts" ("Bill") is worse than
 * a truncated real name. Seen for real — a title with a stray space after the
 * opening quote pushed the actual subject out of range and left this behind.
 */
const GENERIC_DOC_TYPES =
  /^(likumprojekts|noteikumu projekts|rīkojuma projekts|informatīvais ziņojums|konceptuālais ziņojums|esvis projekts|protokollēmuma projekts|tiesā iesniedzamā dokumenta projekts)$/i;

/**
 * A segment is a plausible name if it reads like a title rather than a
 * section number ("5.1.1.1. pasākuma"), a trailing boilerplate clause
 * ("īstenošanas noteikumi", which begins lowercase), or a bare document type.
 * Length is checked separately so an over-long real name can still be
 * truncated rather than losing to a useless short one.
 */
function isNameLike(segment: string): boolean {
  if (segment.length < MIN_USEFUL) return false;
  if (/^\d/.test(segment)) return false;
  if (GENERIC_DOC_TYPES.test(segment)) return false;
  const first = segment[0];
  return first === first.toLocaleUpperCase("lv") && first !== first.toLocaleLowerCase("lv");
}

/** Trailing punctuation left behind by slicing mid-sentence, e.g. " ." or " -". */
function tidyTail(text: string): string {
  return text.replace(/[\s.,;:–—-]+$/u, "");
}

function truncateAtWord(text: string, max: number): string {
  const tidied = tidyTail(text.trim());
  if (tidied.length <= max) return tidied;
  const cut = tidied.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return tidyTail(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

export interface DisplayTitle {
  /** Short, scannable label for the card. */
  text: string;
  /** True when it differs from the original, so the UI offers the full title. */
  shortened: boolean;
}

export function displayTitle(fullTitle: string): DisplayTitle {
  const original = fullTitle.trim();
  const stripped = stripActCode(original).trim();
  if (stripped.length === 0) return { text: original, shortened: false };

  // Committee agendas read as "<committee> sēde: <agenda item>" — the agenda
  // item is the informative half.
  const colon = stripped.indexOf(": ");
  const afterColon = colon >= 0 ? stripped.slice(colon + 2).trim() : stripped;
  const candidate = afterColon.length >= MIN_USEFUL ? afterColon : stripped;

  // When the title quotes something, the text *before* the first quote is the
  // amendment boilerplate ("Grozījumi Ministru kabineta ... noteikumos Nr. 55")
  // — never the subject. Drop it, so only quoted names compete.
  const segments = quotedSegments(candidate);
  const quoted = QUOTE_CHARS.test(candidate) ? segments.slice(1) : segments;

  const named = quoted.filter(isNameLike);
  if (named.length > 0) {
    // Prefer the longest name that already fits. If none fit, the longest
    // name truncated still beats falling through to boilerplate — the subject
    // is in there somewhere, and the full title stays one expand away.
    const fits = named.filter((s) => s.length <= MAX_LEN);
    const pool = fits.length > 0 ? fits : named;
    const best = pool.reduce((a, b) => (b.length > a.length ? b : a));
    const text = truncateAtWord(best, MAX_LEN);
    return { text, shortened: text !== original };
  }

  // No usable quoted name: fall back to the text before the first quote,
  // then a word-boundary truncation.
  const firstQuote = candidate.search(QUOTE_CHARS);
  const head = firstQuote > MIN_USEFUL ? candidate.slice(0, firstQuote) : candidate;
  const text = truncateAtWord(head.trim().replace(/[\s,;:–—-]+$/, ""), MAX_LEN);
  return { text, shortened: text !== original };
}
