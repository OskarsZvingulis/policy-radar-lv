export type SortBy = "deadline" | "relevance";

/** Only shown above the relevant-items views: "Not relevant" has no
 * deadlines worth sorting by and is already ordered newest first. */
export function SortControl({ value, onChange }: { value: SortBy; onChange: (v: SortBy) => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-1.5 text-xs">
      <label htmlFor="sort-by" className="text-muted-foreground">
        Sort by
      </label>
      <select
        id="sort-by"
        value={value}
        onChange={(e) => onChange(e.target.value as SortBy)}
        className="h-11 rounded border border-border bg-background px-1.5 text-base xl:h-auto xl:py-0.5 xl:text-xs"
      >
        <option value="deadline">deadline</option>
        <option value="relevance">relevance</option>
      </select>
    </div>
  );
}
