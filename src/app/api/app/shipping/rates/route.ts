import { NextRequest, NextResponse } from "next/server";
import { quoteShipping } from "@/lib/shipping";
import { getSettings } from "@/lib/settings";
import { apiOptionsResponse } from "@/lib/auth/bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region") || undefined;
  const subtotal = parseInt(searchParams.get("subtotal") || "0", 10);
  const weightGrams = parseInt(searchParams.get("weight") || "0", 10);

  const [rates, settings] = await Promise.all([
    quoteShipping({
      region,
      subtotal,
      totalWeightGrams: weightGrams,
    }).catch(() => []),
    getSettings().catch(() => null),
  ]);

  // If store-wide free shipping applies
  const storeFreeThreshold = settings?.freeShippingThreshold;
  const storeFreeApplies =
    storeFreeThreshold !== null &&
    storeFreeThreshold !== undefined &&
    subtotal >= storeFreeThreshold;

  let resolvedRates = rates.map((r) => ({
    ...r,
    price: storeFreeApplies ? 0 : r.price,
    isFree: storeFreeApplies ? true : r.isFree,
  }));

  return NextResponse.json(
    {
      ok: true,
      region: region || "Greater Accra",
      subtotal,
      rates: resolvedRates,
      freeShippingThreshold: storeFreeThreshold,
      freeShippingQualified: storeFreeApplies,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const region = body.region || undefined;
    const subtotal = Number(body.subtotal || 0);
    const weightGrams = Number(body.weight || 0);

    const [rates, settings] = await Promise.all([
      quoteShipping({
        region,
        subtotal,
        totalWeightGrams: weightGrams,
      }).catch(() => []),
      getSettings().catch(() => null),
    ]);

    const storeFreeThreshold = settings?.freeShippingThreshold;
    const storeFreeApplies =
      storeFreeThreshold !== null &&
      storeFreeThreshold !== undefined &&
      subtotal >= storeFreeThreshold;

    let resolvedRates = rates.map((r) => ({
      ...r,
      price: storeFreeApplies ? 0 : r.price,
      isFree: storeFreeApplies ? true : r.isFree,
    }));

    return NextResponse.json(
      {
        ok: true,
        rates: resolvedRates,
        freeShippingThreshold: storeFreeThreshold,
        freeShippingQualified: storeFreeApplies,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
