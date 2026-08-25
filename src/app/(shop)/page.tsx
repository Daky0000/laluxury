import Link from "next/link";
import { db } from "@/lib/db";
import { searchProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ProductCard } from "@/components/shop/product-card";
import { LinkButton, SectionHeading } from "@/components/ui";

export const revalidate = 300;

export default async function HomePage() {
  const [settings, featured, newest, categories] = await Promise.all([
    getSettings(),
    searchProducts({ featuredOnly: true, perPage: 4, sort: "featured" }),
    searchProducts({ sort: "newest", perPage: 8 }),
    db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { position: "asc" },
      take: 5,
      select: { name: true, slug: true, imageUrl: true },
    }),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
        <div className="lx-container grid items-center gap-10 py-20 md:grid-cols-2 md:py-28">
          <div>
            <p className="lx-eyebrow mb-4">Made in Ghana</p>
            <h1 className="max-w-lg text-4xl leading-[1.1] md:text-6xl">{settings.tagline}</h1>
            <p className="mt-5 max-w-md text-[var(--text-secondary)]">
              Lighting, textiles and tableware from workshops we know by name — built to be used
              every day, not kept for guests.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/shop" size="lg">
                Shop everything
              </LinkButton>
              <LinkButton href="/shop?sort=newest" variant="secondary" size="lg">
                What&rsquo;s new
              </LinkButton>
            </div>
          </div>

          <div className="lx-media rounded-[--radius-card]">
            {featured.items[0]?.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={featured.items[0].images[0].url}
                alt={featured.items[0].title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                Add a featured product image
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 ? (
        <section className="lx-container py-16">
          <SectionHeading eyebrow="Browse" title="By room and ritual" />
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/shop?category=${category.slug}`}
                className="group flex flex-col gap-3"
              >
                <div className="lx-media aspect-square rounded-[--radius-card]">
                  {category.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={category.imageUrl} alt="" className="transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-3xl text-[var(--text-muted)]">
                      {category.name.charAt(0)}
                    </div>
                  )}
                </div>
                <span className="text-sm group-hover:underline">{category.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Featured */}
      {featured.items.length > 0 ? (
        <section className="lx-container py-10">
          <SectionHeading
            eyebrow="Chosen by us"
            title="Pieces we keep coming back to"
            action={
              <Link href="/shop" className="hidden text-sm underline-offset-4 hover:underline sm:block">
                View all
              </Link>
            }
          />
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {featured.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {/* New in */}
      <section className="lx-container py-16">
        <SectionHeading
          eyebrow="Just arrived"
          title="New in"
          action={
            <Link
              href="/shop?sort=newest"
              className="hidden text-sm underline-offset-4 hover:underline sm:block"
            >
              View all
            </Link>
          }
        />
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
          {newest.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Promise strip */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
        <div className="lx-container grid gap-8 py-12 sm:grid-cols-3">
          {[
            { title: "Made nearby", body: "Every piece comes from a workshop in Ghana we visit in person." },
            { title: "Delivered fast", body: "Same-day across Accra, 3–5 days nationwide by courier." },
            { title: "Pay your way", body: "Mobile Money, card or bank transfer, secured by Paystack." },
          ].map((item) => (
            <div key={item.title}>
              <p className="font-display text-xl">{item.title}</p>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
