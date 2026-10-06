import Link from "next/link";

/**
 * Numbered pagination with gaps — ‹ 1 … 4 5 6 … 20 › — and a "Go to page"
 * box. Plain links and a GET form, so it works without client JavaScript.
 * The mobile app's Pager (mobile/src/components/Pager.tsx) mirrors it.
 */

type Query = Record<string, string | number | string[] | null | undefined>;

export function pageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export function PageNav({
  basePath,
  query,
  page,
  totalPages,
  total,
  perPage,
  scroll,
}: {
  basePath: string;
  /** The current filters; `page` is replaced. */
  query: Query;
  page: number;
  totalPages: number;
  total?: number;
  perPage?: number;
  scroll?: boolean;
}) {
  if (totalPages <= 1) return null;
  // Arrays (multi-select filters) become repeated parameters.
  const kept: [string, string][] = Object.entries(query).flatMap(([k, v]) =>
    k === "page" || v === null || v === undefined || v === ""
      ? []
      : Array.isArray(v)
        ? v.filter(Boolean).map((x) => [k, x] as [string, string])
        : [[k, String(v)] as [string, string]],
  );
  const href = (p: number) => {
    const qs = new URLSearchParams(kept);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const cell = "inline-flex h-9 min-w-9 items-center justify-center rounded-(--radius-card) border px-2 text-sm tabular-nums";
  const idle = `${cell} border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]`;
  const from = total != null && perPage ? (page - 1) * perPage + 1 : null;
  const to = total != null && perPage ? Math.min(total, page * perPage) : null;

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center gap-3 py-4">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link prefetch={false} scroll={scroll} href={href(page - 1)} className={idle} aria-label="Previous page">‹</Link>
        ) : (
          <span className={`${cell} border-[var(--border-subtle)] opacity-40`} aria-hidden>‹</span>
        )}
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-[var(--text-secondary)]">…</span>
          ) : p === page ? (
            <span key={p} aria-current="page" className={`${cell} border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast,#fff)]`}>{p}</span>
          ) : (
            <Link key={p} prefetch={false} scroll={scroll} href={href(p)} className={idle}>{p}</Link>
          ),
        )}
        {page < totalPages ? (
          <Link prefetch={false} scroll={scroll} href={href(page + 1)} className={idle} aria-label="Next page">›</Link>
        ) : (
          <span className={`${cell} border-[var(--border-subtle)] opacity-40`} aria-hidden>›</span>
        )}
      </div>
      <form method="get" action={basePath} className="flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
        {from != null && <span className="tabular-nums">{from}–{to} of {total}</span>}
        {kept.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}
        <label className="flex items-center gap-2">
          Go to page
          <input
            type="number"
            name="page"
            min={1}
            max={totalPages}
            defaultValue={page}
            className="h-9 w-16 rounded-(--radius-card) border border-[var(--border-subtle)] bg-transparent px-2 text-center tabular-nums"
          />
          <span className="tabular-nums">/ {totalPages}</span>
        </label>
        <button type="submit" className="h-9 rounded-(--radius-card) border border-[var(--border-subtle)] px-3 hover:bg-[var(--surface-sunken)]">
          Go
        </button>
      </form>
    </nav>
  );
}
