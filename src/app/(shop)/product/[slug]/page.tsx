import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Truck, Wallet, RotateCcw, MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getProductBySlug, ratingFor, relatedProducts } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { availableOf } from "@/lib/inventory";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { formatPrice } from "@/lib/money";
import { ProductView } from "@/components/shop/product-view";
import { ProductTile } from "@/components/shop/product-tile";
import { Divider } from "@/components/ui";

export const revalidate = 120;

/** Merchandising badges are ordinary tags, matching the grid tiles. */
const BADGES: Record<string, string> = {
  bestseller: "Bestseller",
  new: "New",
  luxe: "Luxe",
  deal: "Deal",
  sale: "Sale",
};

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

  const [rating, related, settings, user] = await Promise.all([
    ratingFor(product.id),
    relatedProducts(product, 4),
    getSettings(),
    currentUser(),
  ]);

  // Only ask about the wishlist once we know who is asking.
  const saved = user
    ? Boolean(
        await db.wishlistItem.findUnique({
          where: { userId_productId: { userId: user.id, productId: product.id } },
          select: { id: true },
        }),
      )
    : false;

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
    compareAtPrice: variant.compareAtPrice ?? product.compareAtPrice,
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
  const badgeTag = product.tags.find((tag) => BADGES[tag.toLowerCase()]);
  const badge = badgeTag ? BADGES[badgeTag.toLowerCase()] : null;

  const perks = [
    settings.freeShippingThreshold
      ? { icon: Truck, label: `Free delivery over ${formatPrice(settings.freeShippingThreshold)}` }
      : { icon: Truck, label: "Nationwide delivery" },
    { icon: Wallet, label: "Cash on delivery" },
    { icon: RotateCcw, label: "Easy returns" },
    settings.whatsappNumber ? { icon: MessageCircle, label: "Order on WhatsApp" } : null,
  ].filter((perk) => perk !== null);

  const sections = [
    {
      title: "Details",
      body: product.description ?? product.shortDescription ?? "",
    },
    {
      title: "Delivery & returns",
      body: `${settings.shippingPolicy} ${settings.returnsPolicy}`,
    },
    {
      title: "Materials & care",
      body: [product.material, product.care].filter(Boolean).join(" "),
    },
  ].filter((section) => section.body.trim().length > 0);

  return (
    <div className="lx-container py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 text-xs tracking-[0.04em] text-[var(--text-muted)]">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-[var(--text-primary)]">
              Home
            </Link>
          </li>
          {category ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link
                  href={`/shop?category=${category.slug}`}
                  className="hover:text-[var(--text-primary)]"
                >
                  {category.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li className="text-[var(--text-secondary)]">{product.title}</li>
        </ol>
      </nav>

      <ProductView
        images={images}
        options={options}
        variants={variants}
        title={product.title}
        badge={badge}
        productId={product.id}
        isSaved={saved}
        header={
          <>
            {category ? (
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
                {category.name}
              </p>
            ) : null}

            <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.02]">
              {product.title}
            </h1>

            {rating.count > 0 ? (
              <p className="mt-3.5 flex items-center gap-2.5 text-[13px]">
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
                <span className="text-[12.5px] text-[var(--text-muted)]">
                  {rating.average.toFixed(1)} · {rating.count}{" "}
                  {rating.count === 1 ? "review" : "reviews"}
                </span>
              </p>
            ) : null}
          </>
        }
        description={
          product.shortDescription ? (
            <p className="mt-6 max-w-[460px] text-[15px] font-light leading-relaxed text-[var(--text-secondary)]">
              {product.shortDescription}
            </p>
          ) : null
        }
        footer={
          <>
            {/* Perks */}
            <ul className="mt-7 grid gap-3.5 sm:grid-cols-2">
              {perks.map((perk) => {
                const Icon = perk.icon;
                return (
                  <li
                    key={perk.label}
                    className="flex items-center gap-2.5 text-[13px] text-[var(--text-secondary)]"
                  >
                    <Icon
                      className="h-[19px] w-[19px] shrink-0 text-[var(--accent)]"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    {perk.label}
                  </li>
                );
              })}
            </ul>

            {/* Detail accordions */}
            <div className="mt-8 border-t border-[var(--border-subtle)]">
              {sections.map((section, index) => (
                <details
                  key={section.title}
                  open={index === 0}
                  className="group border-b border-[var(--border-subtle)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4.5 text-[13.5px] tracking-[0.04em] marker:hidden [&::-webkit-details-marker]:hidden">
                    {section.title}
                    <span aria-hidden className="text-lg leading-none text-[var(--accent-hover)]">
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:inline">&minus;</span>
                    </span>
                  </summary>
                  <div className="max-w-[480px] space-y-2.5 pb-5 text-[13.5px] font-light leading-relaxed text-[var(--text-secondary)]">
                    {section.body
                      .split("\n")
                      .filter(Boolean)
                      .map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                  </div>
                </details>
              ))}
            </div>
          </>
        }
      />

      {/* Reviews */}
      {product.reviews.length > 0 ? (
        <section className="mt-20">
          <h2 className="mb-8 border-b border-[var(--border-subtle)] pb-6 text-[clamp(1.75rem,4vw,2.5rem)]">
            What people say
          </h2>
          <ul className="grid gap-6 md:grid-cols-2">
            {product.reviews.map((review) => (
              <li key={review.id} className="border border-[var(--border-subtle)] p-5">
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
      ) : null}

      {/* Related */}
      {related.length > 0 ? (
        <section className="mt-20">
          <div className="mb-8 flex items-end justify-between gap-6 border-b border-[var(--border-subtle)] pb-6">
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)]">You may also like</h2>
            <Link href="/shop" className="lx-caps text-[var(--accent-hover)]">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
            {related.map((item) => (
              <ProductTile key={item.id} product={toTile(item)} />
            ))}
          </div>
        </section>
      ) : null}

      <Divider className="mt-20" />

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
