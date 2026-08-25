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
  announcementBar: "Free delivery in Accra on orders over GH\u20B5500",
  returnsPolicy: "Unused items may be returned within 14 days of delivery.",
  shippingPolicy: "Accra deliveries arrive in 1-2 business days, nationwide in 3-5.",
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
