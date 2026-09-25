import { NextResponse } from "next/server";
import { getFxRates } from "@/app/actions/admin/fx";

export const dynamic = "force-dynamic";

export async function GET() {
  const fx = await getFxRates();
  return NextResponse.json(
    {
      ghsPerUsd: fx.ghsPerUsd,
      ghsPerGbp: fx.ghsPerGbp,
      ghsPerEur: fx.ghsPerEur,
      rateFromGhs: {
        GHS: 1,
        USD: Number((1 / fx.ghsPerUsd).toFixed(5)),
        GBP: Number((1 / fx.ghsPerGbp).toFixed(5)),
        EUR: Number((1 / fx.ghsPerEur).toFixed(5)),
      },
      updatedAt: fx.updatedAt,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
