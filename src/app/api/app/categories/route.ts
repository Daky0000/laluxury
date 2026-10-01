import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOptionalBearerStaff, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { can } from "@/lib/auth/rbac";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

export const GET = withApiAuth(async () => {
  const staff = await getOptionalBearerStaff();
  const isAuthorizedStaff = Boolean(staff && can(staff.role, "products:read"));

  const categories = await db.category.findMany({
    where: isAuthorizedStaff ? undefined : { isActive: true },
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
