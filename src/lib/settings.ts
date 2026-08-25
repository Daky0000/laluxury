import { db } from "./db";

/**
 * Store settings live in a key/value table so the owner can change copy,
 * policies and thresholds without a redeploy.
 */

export type StoreSettings = {
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
  studentEyebrow: string;
  studentTitle: string;
  newsletterTitle: string;
  newsletterBody: string;
  /** Ask the agent to confirm before it changes anything on the live store. */
  agentRequiresApproval: boolean;
};

export const DEFAULT_SETTINGS: StoreSettings = {
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
  bundleEyebrow: "Bundle & save",
  bundleTitle: "The Complete Bed Set",
  bundleBody:
    "Duvet, king bedsheet, two pillows and a bed topper — hotel-soft, gathered into one composed price.",
  bundlePrice: 82000,
  bundleCompareAtPrice: 97000,
  bundleImageUrl: "/catalog/bundle-bed-set.webp",
  bundleHref: "/shop?collection=bed-set",
  studentEyebrow: "Back to campus",
  studentTitle: "Student essentials from ₵50",
  newsletterTitle: "Join the LALUXURY list",
  newsletterBody:
    "Private access to restocks and a ₵20 welcome credit on your first order.",
  agentRequiresApproval: true,
};

const SETTINGS_KEY = "store";

export async function getSettings(): Promise<StoreSettings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<StoreSettings>) };
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
