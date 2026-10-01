import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getIntegrations, activePaystack, isReady } from "@/lib/integrations";
import { apiOptionsResponse } from "@/lib/auth/bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

export async function GET() {
  const [settings, integrations] = await Promise.all([
    getSettings().catch(() => null),
    getIntegrations().catch(() => null),
  ]);

  const activeMode = settings?.paymentMode || integrations?.paystack?.mode || "live";
  const paystack = integrations ? activePaystack(integrations) : null;
  const paystackConfigured = integrations ? isReady(integrations, "paystack") : false;

  return NextResponse.json(
    {
      ok: true,
      storeName: settings?.storeName || "LaLuxury",
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
      freeShippingThreshold: settings?.freeShippingThreshold ?? null,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
