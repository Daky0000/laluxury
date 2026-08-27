"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { VariantPicker, type PickerOption, type PickerVariant } from "./variant-picker";

export type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
  optionValueId: string | null;
};

/**
 * The product artboard's two-column body: a scrolling thumbnail rail beside a
 * tall hero shot, and everything you can act on stacked in the right column.
 *
 * Gallery and picker are one component because they share selection state —
 * choosing a colour swaps the gallery to that colour's photography. The static
 * copy around the picker arrives as slots from the server page, so the
 * description, perks and accordions are not shipped as client JavaScript.
 *
 * The gallery follows the option values picked, not the resolved variant: on a
 * product with a colour and a size, picking the colour alone is already enough
 * to know which photographs to show.
 */
export function ProductView({
  images,
  options,
  variants,
  title,
  badge,
  productId,
  isSaved,
  header,
  description,
  footer,
}: {
  images: GalleryImage[];
  options: PickerOption[];
  variants: PickerVariant[];
  title: string;
  badge?: string | null;
  productId: string;
  isSaved: boolean;
  /** Category, title and rating — rendered above the price. */
  header: ReactNode;
  /** The short description, between the stock line and the options. */
  description: ReactNode;
  /** Perks and the detail accordions. */
  footer: ReactNode;
}) {
  const [selectedValueIds, setSelectedValueIds] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  /**
   * Which photographs belong on screen.
   *
   * Nothing chosen shows the whole gallery, primary first. Once a value is
   * chosen the gallery is that value's shots followed by the ones tied to no
   * value in particular — and never another colour's, which was the bug that
   * had one variant showing every picture and the next showing two.
   */
  const visible = useMemo(() => {
    if (selectedValueIds.length === 0) return images;

    const matching = images.filter(
      (img) => img.optionValueId && selectedValueIds.includes(img.optionValueId),
    );
    const generic = images.filter((img) => !img.optionValueId);

    if (matching.length > 0) return [...matching, ...generic];
    // Nothing was assigned to this value: the general shots are the honest
    // answer, and the full gallery only if there are none of those either.
    return generic.length > 0 ? generic : images;
  }, [images, selectedValueIds]);

  const safeIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));
  const hero = visible[safeIndex];

  function selectValues(valueIds: string[]) {
    setSelectedValueIds(valueIds);
    // Back to the first picture of whatever is now on show.
    setActiveIndex(0);
  }

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <div className="flex flex-col-reverse gap-4 sm:flex-row lg:sticky lg:top-28">
        {visible.length > 1 ? (
          <div
            role="tablist"
            aria-label="Product images"
            className="flex gap-3 overflow-x-auto sm:max-h-[600px] sm:w-[92px] sm:shrink-0 sm:flex-col sm:overflow-y-auto sm:pr-1.5"
          >
            {visible.map((image, index) => (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={index === safeIndex}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "aspect-[4/5] w-16 shrink-0 overflow-hidden border bg-[var(--surface-media)] transition-colors sm:w-full",
                  index === safeIndex
                    ? "border-[var(--accent)] outline outline-1 -outline-offset-1 outline-[var(--accent)]"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="h-full w-full object-cover" />
                <span className="sr-only">View image {index + 1}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative aspect-[4/5] flex-1 overflow-hidden bg-[var(--surface-media)]">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero.url}
              alt={hero.alt ?? title}
              className="h-full w-full object-cover"
              fetchPriority="high"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              No image yet
            </div>
          )}

          {badge ? (
            <span className="pointer-events-none absolute left-4 top-4 border border-[var(--border-subtle)] bg-[rgba(253,250,244,0.92)] px-3 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.16em] backdrop-blur">
              {badge}
            </span>
          ) : null}

          {visible.length > 1 ? (
            <span className="pointer-events-none absolute bottom-4 right-4 bg-[rgba(43,39,36,0.72)] px-2.5 py-1 text-[11px] tracking-[0.06em] text-[var(--surface)]">
              {safeIndex + 1} / {visible.length}
            </span>
          ) : null}
        </div>
      </div>

      <div className="pt-1">
        {header}
        <VariantPicker
          options={options}
          variants={variants}
          onSelectionChange={selectValues}
          productId={productId}
          isSaved={isSaved}
          description={description}
        />
        {footer}
      </div>
    </div>
  );
}
