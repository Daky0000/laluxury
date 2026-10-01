import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";

export const runtime = "nodejs";

export const GET = withApiAuth(async () => {
  await requireBearerPermission("products:read");

  const categories = await db.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      parentId: true,
      position: true,
      isActive: true,
      _count: {
        select: { products: true },
      },
    },
  });

  return NextResponse.json({ categories });
});
