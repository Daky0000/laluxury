import Link from "next/link";
import { formatPrice } from "@/lib/money";
import type { ProductTileData } from "@/lib/product-view";
import type { HomeSection } from "@/lib/home-sections";
import { AddToBagIcon } from "@/components/shop/add-to-bag";
import { Photo } from "@/components/shop/photo";

/**
 * A product section rendered as one plain row, with a heading and an optional
 * "shop all" link. The sage tone is the tinted panel the student range uses;
 * paper is the page's own ground.
 */
export function ProductRow({
  section,
  products,
}: {
  section: HomeSection;
  products: ProductTileData[];
}) {
  if (products.length === 0) return null;

  const sage = section.tone === "sage";

  return (
    <section id={section.id} className={`scroll-mt-24 ${sage ? "bg-sage-100" : ""}`}>
      <div className="lx-container py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
          <div>
            {section.eyebrow ? (
              <p
                className={`text-sm uppercase tracking-[0.32em] ${
                  sage ? "text-sage-600" : "text-[var(--accent)]"
                }`}
              >
                {section.eyebrow}
              </p>
            ) : null}
            {section.title ? (
              <h2 className="mt-2.5 text-4xl md:text-[2.875rem]">{section.title}</h2>
            ) : null}
          </div>

          {section.href ? (
            <Link
              href={section.href}
              className={`text-sm uppercase tracking-[0.1em] hover:underline ${
                sage ? "text-sage-700" : "text-[var(--text-secondary)]"
              }`}
            >
              Shop all →
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {products.map((product) => (
            <article key={product.id} className="group flex flex-col">
              <Link
                href={`/product/${product.slug}`}
                className={`relative block aspect-[4/5] overflow-hidden ${
                  sage ? "bg-sage-200" : "bg-[var(--surface-media)]"
                }`}
              >
                {product.imageUrl ? (
                  <Photo
                    src={product.imageUrl}
                    alt={product.imageAlt}
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                ) : null}
              </Link>

              <div className="flex items-center justify-between gap-3 pt-3.5">
                <Link href={`/product/${product.slug}`} className="text-sm hover:underline">
                  {product.title}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-base tabular-nums">{formatPrice(product.price)}</span>
                  <AddToBagIcon
                    variantId={product.inStock ? product.variantId : null}
                    href={`/product/${product.slug}`}
                    soldOut={!product.inStock}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
