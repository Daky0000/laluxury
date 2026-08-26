import Link from "next/link";
import { formatPrice } from "@/lib/money";
import type { ProductTileData } from "@/lib/product-view";
import { AddToBag } from "./add-to-bag";

/**
 * The product tile from the storefront artboards: square image, merchandising
 * badge, an "Add to bag" bar that rises on hover, then name, room, the colours
 * it comes in and the price.
 *
 * Every grid in the shop renders this — home, all products, related — so a
 * product presents itself identically wherever it turns up. It holds no server
 * imports, so client grids (the home tabs) can render it too.
 */
export function ProductTile({
  product,
  aspect = "square",
  priority = false,
}: {
  product: ProductTileData;
  /** Portrait suits denser rows such as the student range. */
  aspect?: "square" | "portrait";
  priority?: boolean;
}) {
  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;

  return (
    <article className="group flex flex-col">
      <div
        className={`relative overflow-hidden bg-[var(--surface-media)] ${
          aspect === "square" ? "aspect-square" : "aspect-[4/5]"
        }`}
      >
        <Link href={`/product/${product.slug}`} className="block h-full w-full">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.imageAlt}
              loading={priority ? "eager" : "lazy"}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              No image yet
            </span>
          )}

          {product.hoverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.hoverImageUrl}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          ) : null}
        </Link>

        {/* Sold-out pieces stay in the grid, veiled rather than removed, so a
            filtered view keeps its rhythm and the shopper can still open them. */}
        {!product.inStock ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(241,240,236,0.62)] text-[11px] uppercase tracking-[0.2em] text-[var(--text-primary)]">
            Out of stock
          </span>
        ) : null}

        {product.badge ? (
          <span className="pointer-events-none absolute left-3.5 top-3.5 border border-[var(--border-subtle)] bg-[rgba(253,250,244,0.9)] px-2.5 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.16em] text-[var(--text-primary)] backdrop-blur">
            {product.badge}
          </span>
        ) : null}

        {product.inStock ? (
          <AddToBag variantId={product.variantId} href={`/product/${product.slug}`} />
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-2.5 pt-3.5">
        <div>
          <h3 className="font-sans text-[0.9rem] font-normal leading-snug tracking-normal">
            <Link href={`/product/${product.slug}`} className="hover:underline">
              {product.title}
            </Link>
          </h3>
          {product.category ? (
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {product.category}
            </p>
          ) : null}

          {product.swatches.length > 0 ? (
            <ul className="mt-2.5 flex gap-1.5">
              {product.swatches.map((swatch) => (
                <li
                  key={swatch.name}
                  title={swatch.name}
                  className="h-[13px] w-[13px] rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]"
                  style={{ backgroundColor: swatch.hex }}
                >
                  <span className="sr-only">{swatch.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="whitespace-nowrap text-right">
          {product.hasRange ? (
            <span className="text-[10.5px] text-[var(--text-muted)]">from </span>
          ) : null}
          <span className="font-display text-[19px] tabular-nums">{formatPrice(product.price)}</span>
          {onSale ? (
            <span className="mt-0.5 block text-[11px] text-[var(--text-muted)] line-through">
              {formatPrice(product.compareAtPrice!)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
