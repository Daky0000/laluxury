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

  const asset = await db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, data: true, mimeType: true, url: true, updatedAt: true },
  });

  if (!asset) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A CDN or pasted asset only ever had an address; send the caller there.
  // Some of those addresses are site-relative, hence resolving against this
  // request rather than handing Response.redirect a path it cannot parse.
  if (!asset.data) {
    if (!asset.url) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(new URL(asset.url, request.url), 302);
  }

  const etag = `"${asset.id}-${asset.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const body = new Uint8Array(asset.data);

  return new NextResponse(body, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    },
  });
}
