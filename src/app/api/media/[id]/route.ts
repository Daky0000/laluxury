import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Serves a library picture.
 *
 * The path carries a file extension for the sake of browsers and proxies —
 * /api/media/abc123.jpg — so anything after the first dot is dropped before
 * the lookup. An asset id never changes what it points at, which is why the
 * response is immutable and cached for a year.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id: segment } = await ctx.params;
  const id = segment.split(".")[0];

  // 1. Query metadata first WITHOUT reading the large binary blob.
  const meta = await db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, source: true, mimeType: true, url: true, updatedAt: true },
  });

  if (!meta) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A CDN or pasted asset only ever had an address; send the caller there.
  if (meta.source !== "DATABASE") {
    if (!meta.url) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(new URL(meta.url, request.url), 302);
  }

  // 2. Check ETag before pulling megabytes of binary data from Postgres.
  const etag = `"${meta.id}-${meta.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  // 3. Client cache missed; read the binary data now.
  const asset = await db.mediaAsset.findUnique({
    where: { id },
    select: { data: true },
  });

  if (!asset?.data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = new Uint8Array(asset.data);

  return new NextResponse(body, {
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    },
  });
}
