"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { VariantPicker, type PickerOption, type PickerVariant } from "./variant-picker";
import { Photo } from "./photo";

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
 * choosing a colour moves the hero shot to that colour's first photograph. The
 * rail itself always lists every photograph the product has, so a shopper can
 * still browse the other colours without changing their choice. The static copy
 * around the picker arrives as slots from the server page, so the description,
 * perks and accordions are not shipped as client JavaScript.
 *
 * The hero follows the option values picked, not the resolved variant: on a
 * product with a colour and a size, picking the colour alone is already enough
 * to know which photograph to lead with.
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
  const [activeIndex, setActiveIndex] = useState(0);

  const safeIndex = Math.min(activeIndex, Math.max(0, images.length - 1));
  const hero = images[safeIndex];

  /** The picture each option value is shown by, for the picker's swatches. */
  const valueImages = useMemo(() => {
    const map: Record<string, string> = {};
    for (const image of images) {
      // The first one wins: it is the same picture the gallery opens on when
      // that value is chosen.
      if (image.optionValueId && !map[image.optionValueId]) {
        map[image.optionValueId] = image.url;
      }
    }
    return map;
  }, [images]);

  function selectValues(valueIds: string[]) {
    // Lead with the chosen value's first photograph. If nothing was assigned to
    // it, the shot on screen is as good an answer as any, so leave it alone.
    const match = images.findIndex(
      (img) => img.optionValueId && valueIds.includes(img.optionValueId),
    );
    if (match >= 0) setActiveIndex(match);
  }

  return (
    // `min-w-0` on both columns: a grid item's automatic minimum size is its
    // min-content, so without this any wide child — a long thumbnail rail, a
    // wide table — stretches the track past the grid box and drags everything
    // in the other column off the screen with it.
    <div className="grid items-start gap-8 sm:gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14 [&>*]:min-w-0">
      {/*
        The rail runs down the side of the hero at every width, not just from
        `sm` up.

        It used to lie on its side and scroll horizontally on a phone. A product
        with a few photographs was fine; this catalogue has one with 31, and a
        horizontal scroller only scrolls once something stops it growing —
        nothing did, so the rail laid all 31 thumbnails out at 2344px, the grid
        track grew to match, and the whole right-hand column, "Add to bag" and
        "Buy it now" included, was pushed off the right of the screen.

        Standing it up fixes the cause rather than the symptom: the rail is a
        fixed-width column, the hero takes whatever is left, and the thumbnails
        scroll vertically inside exactly the hero's height.
      */}
      <div className="flex gap-3 sm:gap-4 lg:sticky lg:top-28">
        {images.length > 1 ? (
          // The wrapper is the only thing here with a width. It stretches to
          // the flex line's height — which is the hero's, since its own
          // content is taken out of flow — and the scroller fills it.
          <div className="relative w-[68px] shrink-0 sm:w-[92px]">
            <div
              role="tablist"
              aria-label="Product images"
              className="lx-scroll-y absolute inset-0 flex flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1.5"
            >
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  role="tab"
                  aria-selected={index === safeIndex}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    // `relative` is load-bearing: Photo fills its container by
                    // absolute positioning, so without it a thumbnail escapes
                    // its button and sizes itself to the scroller instead.
                    "relative aspect-[4/5] w-full shrink-0 overflow-hidden border bg-[var(--surface-media)] transition-colors",
                    index === safeIndex
                      ? "border-[var(--accent)] outline outline-1 -outline-offset-1 outline-[var(--accent)]"
                      : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {/* The first thumbnail shows the same file as the hero, so on
                      a wide screen the browser can pick either as the largest
                      paint. Both are eager; the rest wait their turn. */}
                  <Photo
                    src={image.url}
                    sizes="(min-width: 640px) 92px, 68px"
                    priority={index === 0}
                  />
                  <span className="sr-only">View image {index + 1}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Sized by its own 4:5 crop, not stretched to the rail: otherwise the
            hero changes shape with the number of photographs beside it. */}
        <div className="relative aspect-[4/5] min-w-0 flex-1 self-start overflow-hidden bg-[var(--surface-media)]">
          {hero ? (
            <Photo
              src={hero.url}
              alt={hero.alt ?? title}
              priority
              sizes="(min-width: 1024px) 50vw, (min-width: 640px) 60vw, 74vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              No image yet
            </div>
          )}

          {badge ? (
            <span className="lx-badge pointer-events-none absolute left-4 top-4 border border-[var(--border-subtle)] bg-[rgba(253,250,244,0.92)] px-2.5 py-1 backdrop-blur">
              {badge}
            </span>
          ) : null}

          {images.length > 1 ? (
            <span className="pointer-events-none absolute bottom-4 right-4 bg-[rgba(43,39,36,0.72)] px-2.5 py-1 text-sm tracking-[0.06em] text-[var(--surface)]">
              {safeIndex + 1} / {images.length}
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
          valueImages={valueImages}
          productId={productId}
          isSaved={isSaved}
          description={description}
        />
        {footer}
      </div>
    </div>
  );
}
