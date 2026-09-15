/**
 * Pagination as pure functions, so it is testable without rendering anything
 * and so a filter change can never strand the reader on an empty page 3.
 */

export interface Page<T> {
  rows: T[];
  page: number;
  pageCount: number;
  /** 1-indexed position of the first and last row shown, for "1 to 25 of 46". */
  from: number;
  to: number;
  total: number;
}

/** Clamps out-of-range pages instead of returning an empty result for them. */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const start = (clamped - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return {
    rows: items.slice(start, end),
    page: clamped,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: end,
    total,
  };
}

export interface RowGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

export interface PagedSection<T> {
  key: string;
  label: string;
  /** True when this group already had rows before this page started, so the
   *  header should read "(continued)" instead of restating the full count. */
  continued: boolean;
  rows: T[];
}

export interface GroupedPage<T> {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  sections: PagedSection<T>[];
}

/**
 * Paginates a list made of several labelled groups (e.g. "Closes this week",
 * "Closes later", "No submission window") as one continuous run, so a group
 * that spans a page boundary shows "(continued)" on the next page rather than
 * restarting or disappearing.
 */
export function paginateGroups<T>(groups: RowGroup<T>[], page: number, pageSize: number): GroupedPage<T> {
  const flat = groups.flatMap((g) => g.rows.map((row) => ({ key: g.key, row })));
  const { page: clamped, pageCount, from, to, total } = paginate(flat, page, pageSize);
  const start = from === 0 ? 0 : from - 1;

  const sections: PagedSection<T>[] = [];
  for (const g of groups) {
    const rowsOnPage = flat
      .slice(start, to)
      .filter((x) => x.key === g.key)
      .map((x) => x.row);
    if (rowsOnPage.length === 0) continue;
    const firstIndexOfGroup = flat.findIndex((x) => x.key === g.key);
    sections.push({ key: g.key, label: g.label, continued: firstIndexOfGroup < start, rows: rowsOnPage });
  }

  return { page: clamped, pageCount, from, to, total, sections };
}

/** Which page an item lands on, for a `?item=` deep link to open the right page. */
export function pageContaining<T>(groups: RowGroup<T>[], pageSize: number, predicate: (item: T) => boolean): number | undefined {
  const flat = groups.flatMap((g) => g.rows);
  const index = flat.findIndex(predicate);
  if (index === -1) return undefined;
  return Math.floor(index / pageSize) + 1;
}
