import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { isInStock, type ProductCard as ProductCardData } from "@/lib/catalog";
import { Badge } from "@/components/ui";
import { QuickBuy } from "./quick-buy";

/**
 * Grid tile. Shows the second image on hover where one exists, and surfaces a
 * Quick buy control for single-variant products so a shopper can add straight
 * from the grid without a detour through the product page.
 */
export function ProductCard({ product }: { product: ProductCardData }) {
  const inStock = isInStock(product);
  const onSale =
    product.compareAtPrice !== null && product.compareAtPrice > product.minPrice;
  const hasRange = product.minPrice !== product.maxPrice;

  const [primary, secondary] = product.images;
  const singleVariant = product.variants.length === 1 ? product.variants[0] : null;

  return (
    <article className="group relative flex flex-col">
      <Link href={`/product/${product.slug}`} className="lx-media block">
        {primary ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primary.url}
            alt={primary.alt ?? product.title}
            className="transition-opacity duration-300 group-hover:opacity-0"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
            No image yet
          </div>
        )}

        {secondary ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={secondary.url}
            alt=""
            aria-hidden
            className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            loading="lazy"
          />
        ) : null}

        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {!inStock ? <Badge tone="neutral">Sold out</Badge> : null}
          {onSale && inStock ? <Badge tone="accent">Sale</Badge> : null}
        </div>
      </Link>

      {inStock && singleVariant ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[4.75rem] z-10 flex justify-center opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          <QuickBuy variantId={singleVariant.id} />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-1 pt-3">
        <h3 className="font-display text-lg leading-snug">
          <Link href={`/product/${product.slug}`} className="hover:underline">
            {product.title}
          </Link>
        </h3>

        {product.shortDescription ? (
          <p className="line-clamp-1 text-xs text-[var(--text-secondary)]">
            {product.shortDescription}
          </p>
        ) : null}

        <p className="mt-auto pt-1 text-sm tabular-nums">
          {hasRange ? (
            <>
              {formatMoney(product.minPrice)}
              <span className="text-[var(--text-muted)]"> – {formatMoney(product.maxPrice)}</span>
            </>
          ) : (
            formatMoney(product.minPrice)
          )}
          {onSale ? (
            <span className="ml-2 text-xs text-[var(--text-muted)] line-through">
              {formatMoney(product.compareAtPrice!)}
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
}
