import { NextResponse } from "next/server";
import { addPhotoToBatch } from "@/lib/bulk-import/create-batch";
import { guardBatchRoute } from "@/lib/bulk-import/route-auth";
import { UploadError } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bulk-import/:batchId/photos — a few photos per request.
 * The browser sends large selections in small groups so no single request is
 * huge and progress can be shown.
 */
export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const guard = await guardBatchRoute(batchId, "products:write");
  if ("error" in guard) return guard.error;
  if (["IMPORTING", "COMPLETED", "CANCELLED"].includes(guard.batch.status)) {
    return NextResponse.json({ ok: false, message: "This import no longer accepts photos." }, { status: 409 });
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ ok: false, message: "No photos received." }, { status: 400 });
  if (files.length > 20) return NextResponse.json({ ok: false, message: "Send at most 20 photos at a time." }, { status: 400 });

  const results: { name: string; ok: boolean; duplicate?: boolean; message?: string }[] = [];
  for (const file of files) {
    try {
      const out = await addPhotoToBatch(batchId, file, guard.user.id);
      results.push({ name: file.name, ok: true, duplicate: out.duplicate });
    } catch (error) {
      results.push({
        name: file.name,
        ok: false,
        message: error instanceof UploadError ? error.message : "Could not store this photo.",
      });
    }
  }
  return NextResponse.json({ ok: true, results });
}
