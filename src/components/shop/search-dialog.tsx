"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";

type Hit = {
  id: string;
  title: string;
  slug: string;
  minPrice: number;
  images: { url: string }[];
};

/**
 * Type-ahead search. Opens on click or Cmd/Ctrl+K, debounces to avoid a
 * request per keystroke, and always leaves a route to the full results page
 * so a shopper is never trapped in the dropdown.
 */
export function SearchDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const query = term.trim();
    // Below the threshold there is nothing to fetch. `visibleHits` derives the
    // empty list, so the effect never has to clear state synchronously.
    if (query.length < 2) return;

    const controller = new AbortController();
    // Everything, including the spinner, happens after the debounce, so a fast
    // typist never sees it flicker on and off between keystrokes.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { results: Hit[] };
        setHits(data.results ?? []);
      } catch {
        // Aborted or offline; leave the previous hits in place.
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Derived rather than stored, so a shrinking query clears results for free.
  const query = term.trim();
  const visibleHits = query.length >= 2 ? hits : [];
  const isSearching = loading && query.length >= 2;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim()) return;
    setOpen(false);
    router.push(`/shop?q=${encodeURIComponent(term.trim())}`);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search">
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/40 px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search products"
            className="w-full max-w-xl overflow-hidden rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={submit} className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <input
                ref={inputRef}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search lamps, throws, baskets..."
                className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Close search</span>
              </button>
            </form>

            {visibleHits.length > 0 ? (
              <ul className="max-h-80 overflow-y-auto py-2">
                {visibleHits.map((hit) => (
                  <li key={hit.id}>
                    <Link
                      href={`/product/${hit.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="h-12 w-10 shrink-0 overflow-hidden bg-[var(--surface-sunken)]">
                        {hit.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.images[0].url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="flex-1 text-sm">{hit.title}</span>
                      <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                        {formatMoney(hit.minPrice)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : query.length >= 2 && !isSearching ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                Nothing matched “{query}”.
              </p>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Start typing to search the shop.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
