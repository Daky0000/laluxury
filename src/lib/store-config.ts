import { getSettings, announcementItems } from "./settings";
import { getIntegrations, activePaystack, isReady } from "./integrations";
import { publicAssetUrl } from "./media-url";
import { GHANA_REGIONS } from "./constants";

/** Public store configuration. No session, cookies, secrets, or staff capabilities. */
export async function getPublicStoreConfig() {
  const [settings, integrations] = await Promise.all([getSettings(), getIntegrations()]);
  const activeMode = integrations?.paystack?.mode || settings?.paymentMode || "live";
  const paystack = integrations ? activePaystack(integrations) : null;
  const paystackConfigured = integrations ? isReady(integrations, "paystack") : false;

  const announcements = announcementItems(settings);
  return {
      ok: true,
      apiVersion: "1.3.2",
      revision: 2,
      storeName: settings?.storeName || "Noble Enclave",
      tagline: settings?.tagline || "Living & Decor",
      currency: "GHS",
      paymentMode: activeMode,
      isTestMode: activeMode === "test",
      paystack: {
        ready: paystackConfigured,
        mode: activeMode,
        publicKey: paystack?.publicKey ? `${paystack.publicKey.slice(0, 8)}...` : null,
      },
      supportEmail: settings?.supportEmail || "contact@nobleenclave.com",
      supportPhone: settings?.supportPhone || "",
      whatsappNumber: settings?.whatsappNumber || "",
      addressLine: settings?.addressLine || "Accra, Ghana",
      instagramUrl: settings?.instagramUrl || "",
      freeShippingThreshold: settings?.freeShippingThreshold ?? null,
      regions: GHANA_REGIONS,
      lowStockThreshold: settings?.lowStockThreshold ?? 5,
      announcementBar: settings?.announcementBar || "",
      announcements,
      hero: {
        eyebrow: settings?.heroEyebrow || "The 2026 Collection",
        title: settings?.heroTitle || "Quiet luxury for",
        titleAccent: settings?.heroTitleAccent || "the modern home",
        body:
          settings?.heroBody ||
          "Considered textiles and furnishings for Ghanaian homes that value calm and craft.",
        imageUrl: publicAssetUrl(settings.heroImageUrl || "/catalog/hero-bedroom.webp"),
      },
      bundle: settings?.bundleTitle
        ? {
            title: settings.bundleTitle,
            eyebrow: settings.bundleEyebrow,
            body: settings.bundleBody,
            price: settings.bundlePrice,
            compareAtPrice: settings.bundleCompareAtPrice,
            imageUrl: publicAssetUrl(settings.bundleImageUrl),
            href: settings.bundleHref,
          }
        : null,
      policies: {
        returnsPolicy: settings?.returnsPolicy || "",
        shippingPolicy: settings?.shippingPolicy || "",
      },
      navigation: {
        hideStorefrontNav: Boolean(settings?.hideStorefrontNav),
        hiddenStorefrontNavItems: settings?.hiddenStorefrontNavItems || [],
      },
      management: null,
    };
}
