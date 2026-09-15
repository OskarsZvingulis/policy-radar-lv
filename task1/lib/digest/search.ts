/**
 * Diacritic-insensitive matching, so "uznemejdarbiba" finds "uzņēmējdarbība".
 * NFD splits each base letter from its combining diacritic mark; stripping
 * \p{M} (the Unicode "Mark" category) removes the mark and leaves the plain
 * Latin letter, which is what a keyboard without Latvian input produces
 * anyway.
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export interface Searchable {
  /** The scannable title shown on the row. */
  title: string;
  /** The original, untrimmed title. Carries the act number the display title may have dropped. */
  fullTitle?: string;
  institution?: string;
  stage?: string;
  sourceLabel: string;
  /** Topic labels already matched for this item, so "tax" finds it by topic too. */
  topics?: string[];
}

function haystack(item: Searchable): string {
  return normalizeForSearch(
    [item.title, item.fullTitle, item.institution, item.stage, item.sourceLabel, ...(item.topics ?? [])]
      .filter(Boolean)
      .join(" "),
  );
}

export function matchesQuery(item: Searchable, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return haystack(item).includes(q);
}
