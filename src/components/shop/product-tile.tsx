import Link from "next/link";
import { formatPrice } from "@/lib/money";
import type { ProductTileData } from "@/lib/product-view";
import { AddToBag } from "./add-to-bag";
import { Photo } from "./photo";

/**
 * The product tile from the storefront artboards: square image, merchandising
 * badge, an "Add to bag" bar that rises on hover, then name, room, the colours
 * it comes in and the price.
 *
 * Every grid in the shop renders this — home, all products, related — so a
 * product presents itself identically wherever it turns up. It holds no server
 * imports, so client grids (the home tabs) can render it too.
 */
/** Four across on a desktop grid, two on a phone — never a full-width file. */
const TILE_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

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
        className={`@container/tile relative overflow-hidden bg-[var(--surface-media)] ${
          aspect === "square" ? "aspect-square" : "aspect-[4/5]"
        }`}
      >
        {/* `relative`: Photo fills its container by absolute positioning, and
            without it the nearest positioned ancestor is the tile rather than
            the link — which happens to be the same box, but Next warns on
            every image and the contract is only accidentally true. */}
        <Link href={`/product/${product.slug}`} className="relative block h-full w-full">
          {product.imageUrl ? (
            <Photo
              src={product.imageUrl}
              alt={product.imageAlt}
              priority={priority}
              sizes={TILE_SIZES}
              className="transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              No image yet
            </span>
          )}

          {/* The second shot only ever appears on hover, so on a touchscreen it
              is a whole extra photograph downloaded to be seen by nobody. Hidden
              outright there rather than merely transparent, which keeps it out
              of the request queue on exactly the connections that can least
              afford it. */}
          {product.hoverImageUrl ? (
            <Photo
              src={product.hoverImageUrl}
              sizes={TILE_SIZES}
              className="opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-coarse:hidden"
            />
          ) : null}
        </Link>

        {/* Sold-out pieces stay in the grid, veiled rather than removed, so a
            filtered view keeps its rhythm and the shopper can still open them. */}
        {!product.inStock ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(241,240,236,0.62)] text-sm uppercase tracking-[0.2em] text-[var(--text-primary)]">
            Out of stock
          </span>
        ) : null}

        {product.badge ? (
          <span className="lx-badge pointer-events-none absolute left-2 top-2 border border-[var(--border-subtle)] bg-[rgba(253,250,244,0.9)] px-1.5 py-[2px] text-[var(--text-primary)] backdrop-blur sm:left-3 sm:top-3 sm:px-2 sm:py-[3px]">
            {product.badge}
          </span>
        ) : null}

        {product.inStock ? (
          <AddToBag variantId={product.variantId} href={`/product/${product.slug}`} />
        ) : null}
      </div>

      {/* Name and price share a line where there is room for both. In a
          two-across grid on a phone there is not: a name of any length and a
          four-figure cedi price in the same row leaves each of them a couple of
          words wide, so under `sm` the price drops to its own line instead. */}
      <div className="flex flex-col gap-1 pt-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2.5">
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-normal leading-snug tracking-normal">
            <Link href={`/product/${product.slug}`} className="hover:underline">
              {product.title}
            </Link>
          </h3>
          {product.category ? (
            <p className="lx-badge mt-1 font-normal text-[var(--text-muted)]">{product.category}</p>
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

        <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 whitespace-nowrap sm:block sm:text-right">
          {product.hasRange ? (
            <span className="text-sm text-[var(--text-muted)]">from </span>
          ) : null}
          <span className="text-[17px] font-semibold tabular-nums">{formatPrice(product.price)}</span>
          {onSale ? (
            <span className="text-sm text-[var(--text-muted)] line-through sm:mt-0.5 sm:block">
              {formatPrice(product.compareAtPrice!)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
