import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { getProductBySlug, ratingFor, relatedProducts } from "@/lib/catalog";
import { availableOf } from "@/lib/inventory";
import { getSettings } from "@/lib/settings";
import { ProductView } from "@/components/shop/product-view";
import { ProductCard } from "@/components/shop/product-card";
import { SectionHeading, Divider } from "@/components/ui";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };

  return {
    title: product.metaTitle ?? product.title,
    description: product.metaDescription ?? product.shortDescription ?? undefined,
    openGraph: {
      title: product.title,
      description: product.shortDescription ?? undefined,
      images: product.images[0]?.url ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [rating, related, settings] = await Promise.all([
    ratingFor(product.id),
    relatedProducts(product, 4),
    getSettings(),
  ]);

  const options = product.options.map((option) => ({
    id: option.id,
    name: option.name,
    values: option.values.map((v) => ({ id: v.id, value: v.value, hexColor: v.hexColor })),
  }));

  const variants = product.variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    optionValueIds: variant.optionValues.map((ov) => ov.optionValueId),
    available:
      variant.inventory && variant.inventory.trackInventory && !variant.inventory.allowBackorder
        ? Math.max(0, availableOf(variant.inventory))
        : null,
  }));

  const images = product.images.map((image) => ({
    id: image.id,
    url: image.url,
    alt: image.alt,
    optionValueId: image.optionValueId,
  }));

  const category = product.categories[0]?.category;

  return (
    <div className="lx-container py-10">
      <nav aria-label="Breadcrumb" className="mb-8 text-xs text-[var(--text-secondary)]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/shop" className="hover:underline">
              Shop
            </Link>
          </li>
          {category ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`/shop?category=${category.slug}`} className="hover:underline">
                  {category.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li className="text-[var(--text-primary)]">{product.title}</li>
        </ol>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl">{product.title}</h1>
        {rating.count > 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <span className="flex" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={
                    n <= Math.round(rating.average)
                      ? "h-3.5 w-3.5 fill-brass text-brass"
                      : "h-3.5 w-3.5 text-[var(--text-muted)]"
                  }
                />
              ))}
            </span>
            {rating.average.toFixed(1)} · {rating.count}{" "}
            {rating.count === 1 ? "review" : "reviews"}
          </p>
        ) : null}
      </div>

      <ProductView
        images={images}
        options={options}
        variants={variants}
        title={product.title}
      />

      {/* Detail */}
      <div className="mt-16 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="lx-eyebrow mb-3">Description</h2>
          <div className="space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            {(product.description ?? product.shortDescription ?? "")
              .split("\n")
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
        </div>

        <dl className="space-y-4 text-sm">
          {product.material ? (
            <div className="flex gap-4 border-b border-[var(--border-subtle)] pb-3">
              <dt className="w-28 shrink-0 text-[var(--text-muted)]">Material</dt>
              <dd>{product.material}</dd>
            </div>
          ) : null}
          {product.care ? (
            <div className="flex gap-4 border-b border-[var(--border-subtle)] pb-3">
              <dt className="w-28 shrink-0 text-[var(--text-muted)]">Care</dt>
              <dd>{product.care}</dd>
            </div>
          ) : null}
          <div className="flex gap-4 border-b border-[var(--border-subtle)] pb-3">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">Delivery</dt>
            <dd>{settings.shippingPolicy}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">Returns</dt>
            <dd>{settings.returnsPolicy}</dd>
          </div>
        </dl>
      </div>

      {/* Reviews */}
      {product.reviews.length > 0 ? (
        <>
          <Divider className="my-16" />
          <section>
            <SectionHeading eyebrow="What people say" title="Reviews" />
            <ul className="mt-8 grid gap-6 md:grid-cols-2">
              {product.reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-[--radius-card] border border-[var(--border-subtle)] p-5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex" aria-label={`${review.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          aria-hidden
                          className={
                            n <= review.rating
                              ? "h-3.5 w-3.5 fill-brass text-brass"
                              : "h-3.5 w-3.5 text-[var(--text-muted)]"
                          }
                        />
                      ))}
                    </span>
                    {review.isVerifiedPurchase ? (
                      <span className="text-[11px] text-success">Verified purchase</span>
                    ) : null}
                  </div>
                  {review.title ? <p className="mt-2 font-medium">{review.title}</p> : null}
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{review.body}</p>
                  <p className="mt-3 text-xs text-[var(--text-muted)]">{review.authorName}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* Related */}
      {related.length > 0 ? (
        <>
          <Divider className="my-16" />
          <section>
            <SectionHeading eyebrow="You might also like" title="Goes well with" />
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* Structured data helps this page surface in Google Shopping. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            description: product.shortDescription ?? product.description ?? undefined,
            image: product.images.map((i) => i.url),
            sku: product.variants[0]?.sku,
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "GHS",
              lowPrice: (product.minPrice / 100).toFixed(2),
              highPrice: (product.maxPrice / 100).toFixed(2),
              offerCount: product.variants.length,
              availability: variants.some((v) => v.available === null || v.available > 0)
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
            ...(rating.count > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: rating.average.toFixed(1),
                    reviewCount: rating.count,
                  },
                }
              : {}),
          }),
        }}
      />
    </div>
  );
}
