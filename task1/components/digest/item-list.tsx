"use client";

import type { NotRelevantItem, ScoredItem } from "@/lib/types";
import type { GroupedPage, Page } from "@/lib/digest/paginate";
import { ItemRow, NotRelevantRow } from "./item-row";
import { Pagination } from "./pagination";
import { ListSkeleton } from "./list-skeleton";

/**
 * Renders whichever of the two shapes the active view produced. Grouping,
 * filtering and pagination are already decided by the time props reach here
 * this only lays out rows, section headers and the pager.
 */
export function ItemList({
  loading,
  emptyMessage,
  now = new Date(),
  onPageChange,
  relevant,
  notRelevant,
}: {
  loading: boolean;
  emptyMessage: string;
  now?: Date;
  onPageChange: (page: number) => void;
  relevant?: {
    fullGroups: { key: string; label: string; rows: ScoredItem[] }[];
    paged: GroupedPage<ScoredItem>;
    selectedId?: string;
    onSelect: (id: string) => void;
  };
  notRelevant?: {
    paged: Page<NotRelevantItem>;
  };
}) {
  if (loading) return <ListSkeleton />;

  const total = relevant ? relevant.paged.total : (notRelevant?.paged.total ?? 0);
  if (total === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  if (notRelevant) {
    return (
      <div className="flex min-w-0 flex-col">
        <div role="list" className="min-w-0">
          {notRelevant.paged.rows.map((item) => (
            <NotRelevantRow key={item.id} item={item} now={now} />
          ))}
        </div>
        <Pagination
          page={notRelevant.paged.page}
          pageCount={notRelevant.paged.pageCount}
          from={notRelevant.paged.from}
          to={notRelevant.paged.to}
          total={notRelevant.paged.total}
          onPageChange={onPageChange}
        />
      </div>
    );
  }

  if (!relevant) return null;
  const { fullGroups, paged, selectedId, onSelect } = relevant;

  return (
    <div className="flex min-w-0 flex-col">
      {paged.sections.map((section) => {
        const fullCount = fullGroups.find((g) => g.key === section.key)?.rows.length ?? section.rows.length;
        return (
          <section key={section.key} className="min-w-0">
            <h2 className="border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
              {section.continued ? " (continued)" : ` (${fullCount})`}
            </h2>
            <div role="list" className="min-w-0">
              {section.rows.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => onSelect(item.id)}
                  now={now}
                />
              ))}
            </div>
          </section>
        );
      })}
      <Pagination
        page={paged.page}
        pageCount={paged.pageCount}
        from={paged.from}
        to={paged.to}
        total={paged.total}
        onPageChange={onPageChange}
      />
    </div>
  );
}
