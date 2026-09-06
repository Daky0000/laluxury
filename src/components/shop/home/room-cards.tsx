import Link from "next/link";
import type { RoomCard } from "@/lib/home";
import type { HomeSection } from "@/lib/home-sections";
import { Photo } from "@/components/shop/photo";

/**
 * A row of picture cards, one per room, each opening the shop already filtered.
 *
 * Which cards appear, and in what order, is the section's `categorySlugs` — so
 * removing a card from the home page is removing a room from that list, not
 * deactivating the room itself.
 */
export function RoomCards({
  section,
  cards,
  anchor,
}: {
  section: HomeSection;
  cards: RoomCard[];
  /** The first room section owns #rooms, the target of the hero's second button. */
  anchor?: string;
}) {
  if (cards.length === 0) return null;

  return (
    <section id={anchor} className="lx-container scroll-mt-24 pb-8 pt-12 sm:pb-10 sm:pt-16 md:pt-22">
      {section.eyebrow || section.title ? (
        <div className="mb-8 text-center sm:mb-12">
          {section.eyebrow ? (
            <p className="lx-eyebrow tracking-[0.2em] sm:tracking-[0.32em]">{section.eyebrow}</p>
          ) : null}
          {section.title ? (
            <h2 className="mt-3 text-[clamp(1.875rem,6vw,2.875rem)] leading-tight">
              {section.title}
            </h2>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:gap-5 md:grid-cols-4">
        {cards.map((room) => (
          <Link key={room.slug} href={`/shop?category=${room.slug}`} className="group block">
            <div className="relative aspect-[3/4] overflow-hidden bg-[var(--surface-media)]">
              {room.imageUrl ? (
                <Photo
                  src={room.imageUrl}
                  sizes="(min-width: 768px) 25vw, 50vw"
                  className="transition-transform duration-700 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-4xl text-[var(--text-muted)]">
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

            <div className="px-1 pt-3.5 sm:pt-4">
              <p className="text-lg leading-snug sm:text-xl">{room.name}</p>
              <p className="mt-1 text-sm uppercase tracking-[0.12em] text-[var(--text-muted)] sm:tracking-[0.16em]">
                {room.count} {room.count === 1 ? "piece" : "pieces"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
