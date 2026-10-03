import { NextResponse } from "next/server";
import { getPublicStoreConfig } from "@/lib/store-config";
import { apiOptionsResponse, getBearerSession } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { isStaff, can } from "@/lib/auth/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

export async function GET() {
  const [config, session] = await Promise.all([getPublicStoreConfig(), getBearerSession().catch(() => null)]);

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

  return NextResponse.json(
    { ...config, management: managementCapabilities },
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

