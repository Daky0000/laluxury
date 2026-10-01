import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOptionalBearerStaff, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { can } from "@/lib/auth/rbac";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

export const GET = withApiAuth(async () => {
  const staff = await getOptionalBearerStaff();
  const isAuthorizedStaff = Boolean(staff && can(staff.role, "products:read"));

  const collections = await db.collection.findMany({
    where: isAuthorizedStaff ? undefined : { isActive: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      isFeatured: true,
      isActive: true,
      position: true,
      _count: {
        select: { products: true },
      },
    },
  });

  return NextResponse.json({ collections });
});
