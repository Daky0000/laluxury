import { cache } from "react";
import { db } from "./db";
import {
  DEFAULT_HOME_SECTIONS,
  normaliseSections,
  type HomeSection,
} from "./home-sections";
import { isLandingPage, type LandingPage } from "./landing";

/**
 * Store settings live in a key/value table so the owner can change copy,
 * policies and thresholds without a redeploy.
 */

export type StoreSettings = {
  /** Which storefront page visitors land on at `/`. */
  landingPage: LandingPage;
  storeName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  addressLine: string;
  instagramUrl: string;
  freeShippingThreshold: number | null;
  lowStockThreshold: number;
  announcementBar: string;
  returnsPolicy: string;
  shippingPolicy: string;

  // --- Home page ----------------------------------------------------------
  // Everything the storefront home page reads, so the owner can restyle the
  // page from /admin/settings without a deploy.
  heroEyebrow: string;
  heroTitle: string;
  /** Second line of the hero headline, set in italic. */
  heroTitleAccent: string;
  heroBody: string;
  heroImageUrl: string;
  bundleEyebrow: string;
  bundleTitle: string;
  bundleBody: string;
  /** Minor units. Null hides the bundle section entirely. */
  bundlePrice: number | null;
  bundleCompareAtPrice: number | null;
  bundleImageUrl: string;
  bundleHref: string;
  newsletterTitle: string;
  newsletterBody: string;
  /**
   * The home page, section by section, in the order they are rendered. Edited
   * at /admin/settings/home.
   */
  homeSections: HomeSection[];
  /** Ask the agent to confirm before it changes anything on the live store. */
  agentRequiresApproval: boolean;
  /** Hide category navigation links in storefront header by default. */
  hideStorefrontNav: boolean;
  /** Hide admin console sidebar rail by default. */
  hideAdminNav: boolean;
  /** Specific admin nav item hrefs that are hidden from the menu. */
  hiddenAdminNavItems: string[];
  /** Specific storefront nav item keys that are hidden from the menu. */
  hiddenStorefrontNavItems: string[];
  /** Checkout and payment processing mode: "live" (real money) or "test" (simulated orders). */
  paymentMode: "live" | "test";
};

export {
  ADMIN_NAV_MENU_ITEMS,
  STOREFRONT_NAV_MENU_ITEMS,
  type AdminNavMenuItem,
  type StorefrontNavMenuItem,
} from "./nav-config";

export const DEFAULT_HIDDEN_ADMIN_NAV_ITEMS: string[] = [
  "/admin/orders/new",
  "/admin/preorders",
  "/admin/shipments",
  "/admin/products/bulk",
  "/admin/media",
  "/admin/discounts",
  "/admin/agent",
  "/admin/users",
  "/admin/activity",
  "/admin/settings",
];

export const DEFAULT_SETTINGS: StoreSettings = {
  // The shop opens on the catalog: the owner would rather visitors see every
  // piece straight away than the built home page. Switch it back under
  // /admin/settings → Front page.
  landingPage: "shop",
  storeName: "Nobel Enclave",
  tagline: "Considered pieces for the modern Ghanaian home",
  supportEmail: "hello@nobleenclave.com",
  supportPhone: "",
  whatsappNumber: "",
  addressLine: "Accra, Ghana",
  instagramUrl: "",
  freeShippingThreshold: 1000000,
  lowStockThreshold: 5,
  announcementBar:
    "Free delivery to your station over \u20B510,000 \u00B7 Nationwide delivery \u00B7 New arrivals in stock",
  returnsPolicy:
    "All sales are final: we do not accept returns and we do not give refunds. Check the piece over at delivery, and tell the rider there and then if anything arrived damaged.",
  shippingPolicy:
    "Accra deliveries arrive in 1-2 business days, nationwide in 3-5. Outside Accra we send to your nearest station.",

  heroEyebrow: "The 2026 Collection",
  heroTitle: "Quiet luxury for",
  heroTitleAccent: "the modern home",
  heroBody:
    "Considered textiles and furnishings — bedding, carpets, curtains and more — for Ghanaian homes that value calm and craft.",
  heroImageUrl: "/catalog/hero-bedroom.webp",
  // The bundle banner ships off. It used to advertise a duvet, a bedsheet, two
  // pillows and a topper for one price — three of which were never stocked, and
  // have since been retired. An empty title hides the section, so the home page
  // does not offer something nobody can buy; fill these in from
  // /admin/settings → Home page when there is a real bundle to sell.
  bundleEyebrow: "",
  bundleTitle: "",
  bundleBody: "",
  bundlePrice: null,
  bundleCompareAtPrice: null,
  bundleImageUrl: "/catalog/bundle-bed-set.webp",
  bundleHref: "",
  newsletterTitle: "Join the NOBEL ENCLAVE list",
  newsletterBody:
    "Private access to restocks and a ₵20 welcome credit on your first order.",
  homeSections: DEFAULT_HOME_SECTIONS,
  agentRequiresApproval: true,
  hideStorefrontNav: false,
  hideAdminNav: false,
  hiddenAdminNavItems: DEFAULT_HIDDEN_ADMIN_NAV_ITEMS,
  hiddenStorefrontNavItems: ["pre-order"],
  paymentMode: "live",
};

const SETTINGS_KEY = "store";

let cachedSettings: { data: StoreSettings; expiresAt: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 60 * 1000;

export function invalidateSettingsCache(): void {
  cachedSettings = null;
}

import { isDbTemporarilyDown, checkDbConnection, recordDbFailure } from "@/lib/db-health";
const DB_COOLDOWN_MS = 30_000;

async function fetchSettings(): Promise<StoreSettings> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.expiresAt > now) {
    return cachedSettings.data;
  }

  if (isDbTemporarilyDown() || !(await checkDbConnection())) {
    return DEFAULT_SETTINGS;
  }

  let row;
  try {
    row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
  } catch {
    recordDbFailure();
    cachedSettings = { data: DEFAULT_SETTINGS, expiresAt: now + DB_COOLDOWN_MS };
    return DEFAULT_SETTINGS;
  }
  if (!row) {
    cachedSettings = { data: DEFAULT_SETTINGS, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return DEFAULT_SETTINGS;
  }

  const stored = row.value as Partial<StoreSettings>;
  const resolved: StoreSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    // The section list is the one setting written as free-form JSON, so it is
    // checked on the way out rather than trusted.
    homeSections: normaliseSections(stored.homeSections),
    // A landing page that no longer exists falls back to the built home page
    // rather than leaving the front door blank.
    landingPage: isLandingPage(stored.landingPage)
      ? stored.landingPage
      : DEFAULT_SETTINGS.landingPage,
    hiddenAdminNavItems: Array.isArray(stored.hiddenAdminNavItems)
      ? stored.hiddenAdminNavItems
      : DEFAULT_SETTINGS.hiddenAdminNavItems,
    hiddenStorefrontNavItems: Array.isArray(stored.hiddenStorefrontNavItems)
      ? stored.hiddenStorefrontNavItems
      : DEFAULT_SETTINGS.hiddenStorefrontNavItems,
  };

  cachedSettings = { data: resolved, expiresAt: now + SETTINGS_CACHE_TTL_MS };
  return resolved;
}

export const getSettings = cache(fetchSettings);

export async function updateSettings(patch: Partial<StoreSettings>): Promise<StoreSettings> {
  invalidateSettingsCache();
  const current = await fetchSettings();
  const next = { ...current, ...patch };

  await db.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });

  cachedSettings = { data: next, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return next;
}

/**
 * The announcement bar is one editable string; the storefront shows it as a
 * marquee, so it is split on the middot into separate runs.
 */
export function announcementItems(settings: StoreSettings): string[] {
  return settings.announcementBar
    .split(/\s*[·|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}
