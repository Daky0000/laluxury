import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOptionalBearerStaff, requireBearerPermission, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
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

export const PATCH = withApiAuth(async (req: Request) => {
  const staff = await requireBearerPermission("products:write");

  const body = await req.json().catch(() => ({}));
  const { id, name, imageUrl, description, position, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
  }

  const category = await db.category.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const updated = await db.category.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl ? String(imageUrl).trim() : null } : {}),
      ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
      ...(position !== undefined ? { position: Number(position) || 0 } : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    },
  });

  return NextResponse.json({ ok: true, category: updated });
});

