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
};

export const DEFAULT_SETTINGS: StoreSettings = {
  // The shop opens on the catalog: the owner would rather visitors see every
  // piece straight away than the built home page. Switch it back under
  // /admin/settings → Front page.
  landingPage: "shop",
  storeName: "LaLuxury",
  tagline: "Considered pieces for the modern Ghanaian home",
  supportEmail: "hello@laluxury.com",
  supportPhone: "",
  whatsappNumber: "",
  addressLine: "Accra, Ghana",
  instagramUrl: "",
  freeShippingThreshold: 50000,
  lowStockThreshold: 5,
  announcementBar:
    "Complimentary delivery over \u20B5300 \u00B7 Cash on delivery nationwide \u00B7 New arrivals in stock",
  returnsPolicy: "Unused items may be returned within 14 days of delivery.",
  shippingPolicy: "Accra deliveries arrive in 1-2 business days, nationwide in 3-5.",

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
  newsletterTitle: "Join the LALUXURY list",
  newsletterBody:
    "Private access to restocks and a ₵20 welcome credit on your first order.",
  homeSections: DEFAULT_HOME_SECTIONS,
  agentRequiresApproval: true,
};

const SETTINGS_KEY = "store";

export async function getSettings(): Promise<StoreSettings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;

  const stored = row.value as Partial<StoreSettings>;
  return {
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
  };
}

export async function updateSettings(patch: Partial<StoreSettings>): Promise<StoreSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };

  await db.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });

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
