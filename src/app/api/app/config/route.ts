import { NextResponse } from "next/server";
import { getSettings, announcementItems } from "@/lib/settings";
import { getIntegrations, activePaystack, isReady } from "@/lib/integrations";
import { apiOptionsResponse, getBearerSession } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { isStaff, can } from "@/lib/auth/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

export async function GET() {
  const [settings, integrations, session] = await Promise.all([
    getSettings().catch(() => null),
    getIntegrations().catch(() => null),
    getBearerSession().catch(() => null),
  ]);

  const activeMode = settings?.paymentMode || integrations?.paystack?.mode || "live";
  const paystack = integrations ? activePaystack(integrations) : null;
  const paystackConfigured = integrations ? isReady(integrations, "paystack") : false;

  let managementCapabilities = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, isActive: true },
    }).catch(() => null);

    if (user && user.isActive && isStaff(user.role)) {
      managementCapabilities = {
        role: user.role,
        canManageProducts: can(user.role, "products:write"),
        canReadOrders: can(user.role, "orders:read"),
        canManageOrders: can(user.role, "orders:write"),
        canManageInventory: can(user.role, "inventory:write"),
        canManageSettings: can(user.role, "settings:manage"),
      };

    }
  }

  const announcements = settings ? announcementItems(settings) : [];

  return NextResponse.json(
    {
      ok: true,
      apiVersion: "1.2.2",
      revision: 1,
      storeName: settings?.storeName || "Nobel Enclave",
      tagline: settings?.tagline || "Atelier & Living",
      currency: "GHS",
      paymentMode: activeMode,
      isTestMode: activeMode === "test",
      paystack: {
        ready: paystackConfigured,
        mode: activeMode,
        publicKey: paystack?.publicKey ? `${paystack.publicKey.slice(0, 8)}...` : null,
      },
      supportEmail: settings?.supportEmail || "contact@laluxurys.com",
      supportPhone: settings?.supportPhone || "",
      whatsappNumber: settings?.whatsappNumber || "",
      addressLine: settings?.addressLine || "Accra, Ghana",
      instagramUrl: settings?.instagramUrl || "",
      freeShippingThreshold: settings?.freeShippingThreshold ?? null,
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
        imageUrl: settings?.heroImageUrl || "/catalog/hero-bedroom.webp",
      },
      bundle: settings?.bundleTitle
        ? {
            title: settings.bundleTitle,
            eyebrow: settings.bundleEyebrow,
            body: settings.bundleBody,
            price: settings.bundlePrice,
            compareAtPrice: settings.bundleCompareAtPrice,
            imageUrl: settings.bundleImageUrl,
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
      management: managementCapabilities,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

