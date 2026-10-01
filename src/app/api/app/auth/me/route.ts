import { NextResponse } from "next/server";
import { requireBearerUser, withApiAuth } from "@/lib/auth/bearer";
import { permissionsFor } from "@/lib/auth/rbac";

export const runtime = "nodejs";

export const GET = withApiAuth(async () => {
  const user = await requireBearerUser();

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: permissionsFor(user.role),
    },
  });
});
