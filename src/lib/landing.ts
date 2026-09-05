/**
 * Which storefront page answers at the front door.
 *
 * This lives apart from the rest of store settings because the admin picker is
 * a client component: `settings.ts` reaches for the database, which cannot be
 * bundled for the browser, and this list has to reach both sides.
 */

export const LANDING_PAGES = {
  home: {
    label: "The built home page",
    hint: "The hero, rooms and product rows set under Home page sections.",
  },
  shop: {
    label: "All products",
    hint: "The whole catalog with its filters and sorting, as it reads at /shop.",
  },
} as const;

export type LandingPage = keyof typeof LANDING_PAGES;

export function isLandingPage(value: unknown): value is LandingPage {
  return typeof value === "string" && value in LANDING_PAGES;
}
