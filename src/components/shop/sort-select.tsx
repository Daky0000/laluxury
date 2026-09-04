"use client";

/**
 * The sort control from the all-products artboard.
 *
 * It lives in a plain GET form carrying the current filters, so choosing a sort
 * is an ordinary navigation. With JavaScript the choice applies immediately;
 * without it, the form's own Apply button submits. The options arrive as props
 * rather than from the catalog module, which is server-only.
 */
export function SortSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <>
      <label
        htmlFor="sort"
        className="text-sm uppercase tracking-[0.14em] text-[var(--text-muted)]"
      >
        Sort
      </label>
      <select
        id="sort"
        name="sort"
        defaultValue={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="cursor-pointer border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <noscript>
        <button
          type="submit"
          className="border border-[var(--border-strong)] px-3 py-2 text-sm uppercase tracking-[0.12em]"
        >
          Apply
        </button>
      </noscript>
    </>
  );
}
