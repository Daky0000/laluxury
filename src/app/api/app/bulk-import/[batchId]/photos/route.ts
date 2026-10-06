import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiOptionsResponse, requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { addPhotoToBatch } from "@/lib/bulk-import/create-batch";
import { UploadError } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = apiOptionsResponse;

const photoSchema = z.object({
  /** Raw base64 or a data: URL, as the app's other image uploads send it. */
  base64: z.string().min(16),
  filename: z.string().max(200).default("photo.jpg"),
  mimeType: z.string().max(60).default("image/jpeg"),
});

/**
 * POST /api/app/bulk-import/:batchId/photos — one photo per request, so the
 * app can show progress and a weak connection only retries the one photo.
 * Goes through the same media library and duplicate hashing as the web.
 */
export const POST = withApiAuth(async (request: Request, ctx: { params: Promise<{ batchId: string }> }) => {
  const user = await requireBearerPermission("products:write");
  const { batchId } = await ctx.params;
  const batch = await db.productImportBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (!batch) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  if (["IMPORTING", "COMPLETED", "CANCELLED"].includes(batch.status)) {
    return NextResponse.json({ error: "This import no longer accepts photos." }, { status: 409 });
  }

  const parsed = photoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "No photo received." }, { status: 400 });
  const { filename, mimeType } = parsed.data;
  const bytes = Buffer.from(parsed.data.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!bytes.length) return NextResponse.json({ error: "No photo received." }, { status: 400 });

  try {
    const out = await addPhotoToBatch(batchId, new File([bytes], filename, { type: mimeType }), user.id);
    return NextResponse.json({ ok: true, duplicate: out.duplicate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof UploadError ? error.message : "Could not store this photo." },
      { status: error instanceof UploadError ? 400 : 500 },
    );
  }
});
