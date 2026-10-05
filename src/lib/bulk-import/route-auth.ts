import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/auth/rbac";
import { db } from "@/lib/db";

/** Route-handler guard for Bulk Product Add: JSON errors, never redirects. */
export async function guardBatchRoute(batchId: string, permission: Permission) {
  const user = await currentUser();
  if (!user || !can(user.role, permission)) {
    return { error: NextResponse.json({ ok: false, message: "Not allowed." }, { status: 403 }) } as const;
  }
  const batch = await db.productImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { error: NextResponse.json({ ok: false, message: "Import not found." }, { status: 404 }) } as const;
  return { user, batch } as const;
}
