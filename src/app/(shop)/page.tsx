import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { CuratedHome } from "@/components/shop/home/curated-home";
import { ProductCatalog } from "@/components/shop/product-catalog";

export const revalidate = 300;

/**
 * The shop's front door. Which page it serves is the owner's choice, made at
 * /admin/settings: the built home page of hero, rooms and product rows, or the
 * whole catalog. Both keep their own address either way, so nothing a customer
 * has bookmarked stops working when the choice changes.
 *
 * The catalog is rendered here without search params on purpose: its filters,
 * search and load-more all point at /shop, so a filtered grid has one address
 * rather than two.
 */

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  if (settings.landingPage !== "shop") return {};

  return {
    title: "All products",
    description:
      "Every LaLuxury piece — bedding, living, windows and student essentials — in one place.",
  };
}

export default async function StorefrontLanding() {
  const settings = await getSettings();

  if (settings.landingPage === "shop") return <ProductCatalog params={{}} />;
  return <CuratedHome settings={settings} />;
}
