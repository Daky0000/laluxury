import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { RoomLookbook, type LookbookScene } from "@/components/shop/room-lookbook";

export const metadata: Metadata = {
  title: "Shop the Room Lookbook",
  description:
    "Explore curated luxury interiors in Accra. Click any hotspot to inspect bespoke and in-stock furniture, lighting, and carpets.",
};

export const dynamic = "force-dynamic";

export default async function LookbookPage() {
  const products = await db.product.findMany({
    where: { status: "ACTIVE" },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: { where: { isActive: true }, orderBy: { position: "asc" }, take: 1 },
    },
    orderBy: [{ isPreorder: "desc" }, { isFeatured: "desc" }, { createdAt: "asc" }],
  });

  const validProducts = products.filter((p) => p.variants.length > 0);

  // Group into 3 architectural lookbook rooms
  const livingPieces = validProducts.slice(0, 4);
  const suitePieces = validProducts.slice(4, 8);
  const foyerPieces = validProducts.slice(8, 12);

  const hotspotPositions = [
    { x: 28, y: 62 },
    { x: 54, y: 26 },
    { x: 74, y: 58 },
    { x: 45, y: 80 },
  ];

  const scenes: LookbookScene[] = [
    {
      id: "penthouse-living",
      eyebrow: "Residence I · Living & Entertaining",
      title: "The East Legon Penthouse Salon",
      location: "East Legon, Accra",
      description:
        "Layered Italian bouclé, hand-blown crystal illumination, and veined Calacatta marble anchored for warm contemporary entertaining.",
      heroImage:
        livingPieces[0]?.images[0]?.url ??
        "/catalog/living-sofa-01.jpg",
      spots: livingPieces.map((p, idx) => ({
        id: p.id,
        variantId: p.variants[0]!.id,
        title: p.title,
        slug: p.slug,
        price: p.variants[0]!.price,
        imageUrl: p.images[0]?.url ?? null,
        isPreorder: p.isPreorder,
        preorderLeadTime: p.preorderLeadTime,
        xPercent: hotspotPositions[idx % hotspotPositions.length]!.x,
        yPercent: hotspotPositions[idx % hotspotPositions.length]!.y,
      })),
    },
    {
      id: "cantonments-suite",
      eyebrow: "Residence II · Sanctuary & Rest",
      title: "The Cantonments Master Suite",
      location: "Cantonments, Accra",
      description:
        "Deep channel-tufted velvet upholstery paired with long-staple sateen linens and ambient bedside illumination.",
      heroImage:
        suitePieces[0]?.images[0]?.url ??
        livingPieces[1]?.images[0]?.url ??
        "/catalog/bedroom-bed-01.jpg",
      spots: (suitePieces.length ? suitePieces : livingPieces).map((p, idx) => ({
        id: `${p.id}-suite`,
        variantId: p.variants[0]!.id,
        title: p.title,
        slug: p.slug,
        price: p.variants[0]!.price,
        imageUrl: p.images[0]?.url ?? null,
        isPreorder: p.isPreorder,
        preorderLeadTime: p.preorderLeadTime,
        xPercent: hotspotPositions[(idx + 1) % hotspotPositions.length]!.x,
        yPercent: hotspotPositions[(idx + 1) % hotspotPositions.length]!.y,
      })),
    },
    {
      id: "airport-foyer",
      eyebrow: "Residence III · Architectural Arrival",
      title: "The Airport Residential Gallery",
      location: "Airport Residential, Accra",
      description:
        "Statement sculptural pieces and artisanal textiles designed for double-height entryways and private dining spaces.",
      heroImage:
        foyerPieces[0]?.images[0]?.url ??
        livingPieces[2]?.images[0]?.url ??
        "/catalog/decor-mirror-01.jpg",
      spots: (foyerPieces.length ? foyerPieces : livingPieces).map((p, idx) => ({
        id: `${p.id}-foyer`,
        variantId: p.variants[0]!.id,
        title: p.title,
        slug: p.slug,
        price: p.variants[0]!.price,
        imageUrl: p.images[0]?.url ?? null,
        isPreorder: p.isPreorder,
        preorderLeadTime: p.preorderLeadTime,
        xPercent: hotspotPositions[(idx + 2) % hotspotPositions.length]!.x,
        yPercent: hotspotPositions[(idx + 2) % hotspotPositions.length]!.y,
      })),
    },
  ];

  return (
    <div className="lx-container py-12 sm:py-16">
      <div className="mb-8 sm:mb-12 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="lx-eyebrow">Interactive Architectural Lookbook</p>
          <h1 className="mt-2 text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.06]">
            Shop the Room
          </h1>
          <p className="mt-3 text-sm sm:text-base font-light leading-relaxed text-[var(--text-secondary)]">
            Explore how our in-stock and bespoke pre-order pieces come together inside Accra&apos;s
            finest residences. Click any numbered pin to inspect dimensions, switch currencies, or
            reserve the entire room in a single click.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/pre-order"
            className="border border-[var(--border-strong)] px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Bespoke Pre-Order Hub
          </Link>
          <Link href="/trade" className="lx-cta">
            Interior Designer Trade Portal
          </Link>
        </div>
      </div>

      <RoomLookbook scenes={scenes} />
    </div>
  );
}
