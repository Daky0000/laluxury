"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { VariantPicker, type PickerOption, type PickerVariant } from "./variant-picker";

export type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
  optionValueId: string | null;
};

/**
 * Gallery and picker are one component because they share selection state:
 * choosing a colour swaps the gallery to that colour's photography.
 */
export function ProductView({
  images,
  options,
  variants,
  title,
}: {
  images: GalleryImage[];
  options: PickerOption[];
  variants: PickerVariant[];
  title: string;
}) {
  const [activeVariantId, setActiveVariantId] = useState<string | null>(
    variants.find((v) => v.available === null || v.available > 0)?.id ?? variants[0]?.id ?? null,
  );
  const [activeIndex, setActiveIndex] = useState(0);

  // Show only the images tied to the selected variant's option values, falling
  // back to the unassigned images so a product without per-colour shots works.
  const visible = useMemo(() => {
    const variant = variants.find((v) => v.id === activeVariantId);
    if (!variant) return images;

    const matching = images.filter(
      (img) => img.optionValueId && variant.optionValueIds.includes(img.optionValueId),
    );
    const generic = images.filter((img) => !img.optionValueId);

    return matching.length > 0 ? [...matching, ...generic] : images;
  }, [activeVariantId, images, variants]);

  const safeIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));
  const hero = visible[safeIndex];

  function selectVariant(variantId: string) {
    setActiveVariantId(variantId);
    setActiveIndex(0);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col-reverse gap-4 sm:flex-row">
        {visible.length > 1 ? (
          <div className="flex gap-3 sm:flex-col" role="tablist" aria-label="Product images">
            {visible.map((image, index) => (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={index === safeIndex}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "lx-media h-20 w-16 shrink-0 rounded-[--radius-card] border transition-colors",
                  index === safeIndex
                    ? "border-[var(--accent)]"
                    : "border-transparent hover:border-[var(--border-subtle)]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" />
                <span className="sr-only">View image {index + 1}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="lx-media flex-1 rounded-[--radius-card]">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.url} alt={hero.alt ?? title} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              No image yet
            </div>
          )}
        </div>
      </div>

      <div>
        <VariantPicker options={options} variants={variants} onVariantChange={selectVariant} />
      </div>
    </div>
  );
}
