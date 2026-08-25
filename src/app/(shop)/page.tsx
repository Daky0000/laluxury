import Link from "next/link";
import { CreditCard, MessageCircle, Sparkles, Truck } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { editProducts, roomCategories, studentProducts } from "@/lib/home";
import { formatPrice } from "@/lib/money";
import { EditGrid } from "@/components/shop/home/edit-grid";
import { AddToBagIcon } from "@/components/shop/add-to-bag";
import { NewsletterForm } from "@/components/shop/newsletter-form";

export const revalidate = 300;

export default async function HomePage() {
  const [settings, rooms, products, students] = await Promise.all([
    getSettings(),
    roomCategories(4),
    editProducts(20),
    studentProducts(4),
  ]);

  const freeOver = settings.freeShippingThreshold;
  const whatsapp = settings.whatsappNumber.replace(/[^\d]/g, "");

  const perks = [
    {
      icon: Truck,
      title: "Nationwide delivery",
      sub: freeOver ? `Complimentary over ${formatPrice(freeOver)}` : "Accra and nationwide",
      href: "/shop",
    },
    {
      icon: CreditCard,
      title: "Cash on delivery",
      sub: "Pay when it arrives",
      href: "/contact",
    },
    {
      icon: Sparkles,
      title: "Considered quality",
      sub: "Fabrics you can feel",
      href: "/shop",
    },
    {
      icon: MessageCircle,
      title: "Order on WhatsApp",
      sub: "We reply fast",
      href: whatsapp ? `https://wa.me/${whatsapp}` : "/contact",
    },
  ];

  // The tabs mirror the rooms, minus the student range which has its own section.
  const tabs = rooms
    .filter((room) => room.slug !== "student")
    .map((room) => ({ label: room.name, slug: room.slug }));

  const bundleSaving =
    settings.bundlePrice !== null && settings.bundleCompareAtPrice !== null
      ? settings.bundleCompareAtPrice - settings.bundlePrice
      : 0;

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="relative h-[88vh] min-h-[560px] overflow-hidden md:min-h-[640px]">
        {settings.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--surface-media)]" />
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(43,39,36,.5) 0%, rgba(43,39,36,.12) 40%, rgba(43,39,36,.78) 100%)",
          }}
        />

        <div className="lx-container relative flex h-full flex-col justify-end pb-16">
          {settings.heroEyebrow ? (
            <p className="mb-5 text-[11px] uppercase tracking-[0.34em] text-[#EDEAE3]">
              {settings.heroEyebrow}
            </p>
          ) : null}

          <h1 className="max-w-[760px] text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.98] text-[#FBFAF6]">
            {settings.heroTitle}
            {settings.heroTitleAccent ? (
              <>
                <br />
                <em className="font-medium">{settings.heroTitleAccent}</em>
              </>
            ) : null}
          </h1>

          {settings.heroBody ? (
            <p className="mt-6 max-w-[440px] text-base leading-relaxed font-light text-[#E4E1D9]">
              {settings.heroBody}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/shop" className="lx-cta">
              Explore the collection
            </Link>
            <a href="#rooms" className="lx-cta-ghost">
              Shop by room
            </a>
          </div>
        </div>
      </section>

      {/* Promise strip ---------------------------------------------------- */}
      <section className="border-b border-[var(--border-subtle)]">
        <div className="lx-container grid grid-cols-2 md:grid-cols-4">
          {perks.map(({ icon: Icon, ...perk }) => (
            <Link
              key={perk.title}
              href={perk.href}
              className="flex items-center gap-3.5 border-l border-[var(--border-subtle)] px-5 py-7 [&:nth-child(odd)]:border-l-0 md:[&:nth-child(odd)]:border-l"
            >
              <Icon className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
              <span>
                <span className="block text-[13px]">{perk.title}</span>
                <span className="mt-0.5 block text-[11.5px] font-light text-[var(--text-muted)]">
                  {perk.sub}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Shop by room ----------------------------------------------------- */}
      {rooms.length > 0 ? (
        <section id="rooms" className="lx-container scroll-mt-24 pb-10 pt-20 md:pt-22">
          <div className="mb-12 text-center">
            <p className="lx-eyebrow">Curated spaces</p>
            <h2 className="mt-3 text-4xl md:text-[2.875rem]">Shop by room</h2>
          </div>

          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {rooms.map((room) => (
              <Link key={room.slug} href={`/shop?category=${room.slug}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden bg-[var(--surface-media)]">
                  {room.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={room.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center font-display text-4xl text-[var(--text-muted)]">
                      {room.name.charAt(0)}
                    </span>
                  )}
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(0deg, rgba(43,39,36,.55), rgba(43,39,36,0) 55%)",
                    }}
                  />
                </div>

                <div className="px-1 pt-4">
                  <p className="font-display text-2xl">{room.name}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {room.count} {room.count === 1 ? "piece" : "pieces"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* The edit --------------------------------------------------------- */}
      <section id="shop" className="lx-container scroll-mt-24 pb-10 pt-16">
        <EditGrid products={products} tabs={tabs} />
      </section>

      {/* Bundle ----------------------------------------------------------- */}
      {settings.bundleTitle ? (
        <section className="relative mt-16 min-h-[600px] overflow-hidden">
          {settings.bundleImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.bundleImageUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[var(--surface-media)]" />
          )}

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(43,39,36,.86) 0%, rgba(43,39,36,.45) 50%, rgba(43,39,36,.12) 100%)",
            }}
          />

          <div className="lx-container relative flex min-h-[600px] flex-col justify-center py-24">
            {settings.bundleEyebrow ? (
              <p className="text-[11px] uppercase tracking-[0.32em] text-[#EDEAE3]">
                {settings.bundleEyebrow}
              </p>
            ) : null}

            <h2 className="my-5 max-w-[520px] text-[clamp(2.25rem,5vw,3.625rem)] leading-[1.02] text-[#FBFAF6]">
              {settings.bundleTitle}
            </h2>

            {settings.bundleBody ? (
              <p className="max-w-[400px] text-base font-light leading-relaxed text-[#E4E1D9]">
                {settings.bundleBody}
              </p>
            ) : null}

            {settings.bundlePrice !== null ? (
              <div className="my-8 flex flex-wrap items-baseline gap-4">
                <span className="font-display text-[2.75rem] text-[#FBFAF6]">
                  {formatPrice(settings.bundlePrice)}
                </span>
                {settings.bundleCompareAtPrice !== null ? (
                  <span className="text-lg text-[#A9A6A0] line-through">
                    {formatPrice(settings.bundleCompareAtPrice)}
                  </span>
                ) : null}
                {bundleSaving > 0 ? (
                  <span className="border border-[rgba(253,250,244,.4)] px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-[#EDEAE3]">
                    Save {formatPrice(bundleSaving)}
                  </span>
                ) : null}
              </div>
            ) : null}

            <Link href={settings.bundleHref || "/shop"} className="lx-cta self-start">
              Shop the set
            </Link>
          </div>
        </section>
      ) : null}

      {/* Student essentials ----------------------------------------------- */}
      {students.length > 0 ? (
        <section id="students" className="scroll-mt-24 bg-sage-100">
          <div className="lx-container py-20">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-sage-600">
                  {settings.studentEyebrow}
                </p>
                <h2 className="mt-2.5 text-4xl md:text-[2.875rem]">{settings.studentTitle}</h2>
              </div>
              <Link
                href="/shop?category=student"
                className="text-xs uppercase tracking-[0.1em] text-sage-700 hover:underline"
              >
                Shop all →
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              {students.map((product) => (
                <article key={product.id} className="group flex flex-col">
                  <Link
                    href={`/product/${product.slug}`}
                    className="relative block aspect-[4/5] overflow-hidden bg-sage-200"
                  >
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt={product.imageAlt}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    ) : null}
                  </Link>

                  <div className="flex items-center justify-between gap-3 pt-3.5">
                    <Link href={`/product/${product.slug}`} className="text-sm hover:underline">
                      {product.title}
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-lg tabular-nums">
                        {formatPrice(product.price)}
                      </span>
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
      ) : null}

      {/* Newsletter ------------------------------------------------------- */}
      <section className="border-t border-[var(--border-subtle)]">
        <div className="mx-auto max-w-[640px] px-5 py-20 text-center md:px-10">
          <h2 className="text-[2.5rem] leading-tight">{settings.newsletterTitle}</h2>
          <p className="mb-8 mt-3.5 text-[14.5px] font-light text-[var(--text-muted)]">
            {settings.newsletterBody}
          </p>
          <NewsletterForm variant="inline" />
        </div>
      </section>
    </>
  );
}
