import type { Metadata } from "next";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { ProductCatalog } from "@/components/shop/product-catalog";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();

  return {
    title: "All products",
    description:
      "Every LaLuxury piece — bedding, living, windows and student essentials — in one place.",
    // With the catalog chosen as the front page it answers at two addresses.
    // Point search engines at the one the shop links to.
    alternates: settings.landingPage === "shop" ? { canonical: env.siteUrl() } : undefined,
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  return <ProductCatalog params={await searchParams} />;
}
