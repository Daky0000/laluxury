import { getSettings } from "@/lib/settings";
import { roomCards, sectionProducts, sectionTabs, type RoomCard } from "@/lib/home";
import type { HomeSection } from "@/lib/home-sections";
import type { ProductTileData } from "@/lib/product-view";
import { Hero } from "@/components/shop/home/hero";
import { Perks } from "@/components/shop/home/perks";
import { RoomCards } from "@/components/shop/home/room-cards";
import { EditGrid } from "@/components/shop/home/edit-grid";
import { ProductRow } from "@/components/shop/home/product-row";
import { BundleBanner } from "@/components/shop/home/bundle-banner";
import { NewsletterBlock } from "@/components/shop/home/newsletter-block";

export const revalidate = 300;

/**
 * The home page is whatever the owner's section list says it is. Each visible
 * section is resolved to its own data in parallel, then rendered in order, so
 * adding a second product row costs one more query and no code.
 */

type Resolved =
  | { section: HomeSection; kind: "rooms"; cards: RoomCard[] }
  | {
      section: HomeSection;
      kind: "products";
      products: ProductTileData[];
      tabs: { label: string; slug: string }[];
    }
  | { section: HomeSection; kind: "static" };

async function resolve(section: HomeSection): Promise<Resolved> {
  if (section.type === "rooms") {
    return { section, kind: "rooms", cards: await roomCards(section) };
  }

  if (section.type === "products") {
    const [products, tabs] = await Promise.all([
      sectionProducts(section),
      section.layout === "tabs" ? sectionTabs(section) : Promise.resolve([]),
    ]);
    return { section, kind: "products", products, tabs };
  }

  return { section, kind: "static" };
}

export default async function HomePage() {
  const settings = await getSettings();
  const visible = settings.homeSections.filter((section) => section.visible);
  const resolved = await Promise.all(visible.map(resolve));

  // The hero's second button jumps to the rooms, so the first room section on
  // the page answers to #rooms however the owner has ordered things.
  const firstRoomsId = resolved.find((entry) => entry.kind === "rooms")?.section.id;

  return (
    <>
      {resolved.map((entry) => {
        const { section } = entry;

        switch (entry.kind) {
          case "rooms":
            return (
              <RoomCards
                key={section.id}
                section={section}
                cards={entry.cards}
                anchor={section.id === firstRoomsId ? "rooms" : undefined}
              />
            );

          case "products":
            return section.layout === "tabs" ? (
              <section key={section.id} id={section.id} className="lx-container scroll-mt-24 py-20">
                <EditGrid
                  eyebrow={section.eyebrow}
                  title={section.title}
                  products={entry.products}
                  tabs={entry.tabs}
                />
              </section>
            ) : (
              <ProductRow key={section.id} section={section} products={entry.products} />
            );

          default:
            if (section.type === "hero") return <Hero key={section.id} settings={settings} />;
            if (section.type === "perks") return <Perks key={section.id} settings={settings} />;
            if (section.type === "bundle")
              return <BundleBanner key={section.id} settings={settings} />;
            return <NewsletterBlock key={section.id} settings={settings} />;
        }
      })}
    </>
  );
}
