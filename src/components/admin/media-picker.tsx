"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Images, Loader2, Search, X } from "lucide-react";
import { attachMediaAction, searchMediaAction } from "@/app/actions/admin/media";
import { MEDIA_FOLDERS } from "@/lib/media-format";
import type { MediaListItem } from "@/lib/media";
import { MediaUploader } from "@/components/admin/media-library";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Photo } from "@/components/shop/photo";

/**
 * Puts a picture that is already in the library onto a product.
 *
 * The order pictures are ticked in is the order they join the gallery, so a
 * shot chosen first becomes the card image when the product has none.
 */
export function MediaPicker({
  productId,
  optionValues,
}: {
  productId: string;
  optionValues: { id: string; value: string; optionName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [items, setItems] = useState<MediaListItem[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [optionValueId, setOptionValueId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = useCallback(() => {
    startLoading(async () => {
      setItems(await searchMediaAction({ query, folder }));
    });
  }, [query, folder]);

  useEffect(() => {
    if (!open) return;
    // Typing filters the grid without a round trip per keystroke.
    const timer = window.setTimeout(load, items === null ? 0 : 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, folder]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function add() {
    startSaving(async () => {
      const result = await attachMediaAction(productId, chosen, optionValueId || null);
      setMessage(result.message ?? null);

      if (result.ok) {
        setChosen([]);
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <Images className="h-4 w-4" aria-hidden />
        Choose from library
      </button>

      {message && !open ? (
        <div className="mt-3">
          <Alert tone="success">{message}</Alert>
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/50 p-4 sm:p-8"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Media library"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-xl"
          >
            <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
              <h2 className="text-base font-medium">Media library</h2>
              <span className="text-xs text-[var(--text-muted)]">
                {chosen.length > 0 ? `${chosen.length} selected` : "Tick the pictures to add"}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
              <label className="relative min-w-48 flex-1">
                <span className="sr-only">Search the library</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by file name or alt text"
                  className="lx-field pl-9"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="sr-only">Folder</span>
                <select
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  className="lx-field w-36"
                >
                  <option value="all">All folders</option>
                  {MEDIA_FOLDERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              {optionValues.length > 0 ? (
                <label className="flex flex-col gap-1">
                  <span className="sr-only">Shows for</span>
                  <select
                    value={optionValueId}
                    onChange={(event) => setOptionValueId(event.target.value)}
                    className="lx-field w-44"
                  >
                    <option value="">All variants</option>
                    {optionValues.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.optionName}: {value.value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {items === null || (loading && items.length === 0) ? (
                <p className="flex items-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading the library…
                </p>
              ) : items.length === 0 ? (
                <div className="flex flex-col gap-4 py-6">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {query || folder !== "all"
                      ? "Nothing matches that. Try a wider search."
                      : "Nothing here yet — upload a picture below and it lands in the library."}
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {items.map((asset) => {
                    const index = chosen.indexOf(asset.id);
                    const picked = index >= 0;

                    return (
                      <li key={asset.id}>
                        <button
                          type="button"
                          onClick={() => toggle(asset.id)}
                          aria-pressed={picked}
                          className={cn(
                            "group relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-[var(--surface-sunken)] transition-colors",
                            picked
                              ? "border-[var(--accent)]"
                              : "border-transparent hover:border-[var(--border-strong)]",
                          )}
                        >
                          <Photo
                            src={asset.url}
                            alt={asset.alt ?? asset.filename}
                            sizes="160px"
                          />

                          {picked ? (
                            <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-contrast)]">
                              {index + 1}
                            </span>
                          ) : null}

                          <span className="absolute inset-x-0 bottom-0 truncate bg-ink-900/70 px-1.5 py-0.5 text-left text-sm text-white">
                            {asset.filename}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] px-5 py-3.5">
              <div className="min-w-48 flex-1">
                <MediaUploader
                  folder="products"
                  folders={MEDIA_FOLDERS}
                  compact
                  onDone={load}
                />
              </div>

              <button
                type="button"
                onClick={add}
                disabled={saving || chosen.length === 0}
                className="inline-flex items-center gap-2 self-end rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
                {chosen.length > 0 ? `Add ${chosen.length} to product` : "Add to product"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
