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
    <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <div className="flex flex-col-reverse gap-4 sm:flex-row lg:sticky lg:top-28">
        {images.length > 1 ? (
          <div
            role="tablist"
            aria-label="Product images"
            className="flex gap-3 overflow-x-auto sm:max-h-[600px] sm:w-[92px] sm:shrink-0 sm:flex-col sm:overflow-y-auto sm:pr-1.5"
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
                  // absolute positioning, so without it a thumbnail escapes its
                  // button and sizes itself to the sticky column instead.
                  "relative aspect-[4/5] w-16 shrink-0 overflow-hidden border bg-[var(--surface-media)] transition-colors sm:w-full",
                  index === safeIndex
                    ? "border-[var(--accent)] outline outline-1 -outline-offset-1 outline-[var(--accent)]"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
                )}
              >
                <Photo src={image.url} sizes="96px" />
                <span className="sr-only">View image {index + 1}</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* Sized by its own 4:5 crop, not stretched to the rail: otherwise the
            hero changes shape with the number of photographs beside it. */}
        <div className="relative aspect-[4/5] flex-1 self-start overflow-hidden bg-[var(--surface-media)]">
          {hero ? (
            <Photo
              src={hero.url}
              alt={hero.alt ?? title}
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              No image yet
            </div>
          )}

          {badge ? (
            <span className="pointer-events-none absolute left-4 top-4 border border-[var(--border-subtle)] bg-[rgba(253,250,244,0.92)] px-3 py-1.5 text-sm font-medium uppercase tracking-[0.16em] backdrop-blur">
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
