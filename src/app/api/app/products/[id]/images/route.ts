import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerPermission, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { storeUpload } from "@/lib/media";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const jsonImageSchema = z.object({
  url: z.string().url().optional(),
  base64: z.string().optional(),
  filename: z.string().optional().default("image.jpg"),
  mimeType: z.string().optional().default("image/jpeg"),
  alt: z.string().trim().nullable().optional(),
  optionValueId: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/app/products/[id]/images
// ---------------------------------------------------------------------------

export const GET = withApiAuth(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireBearerPermission("products:read");
    const { id: productId } = await ctx.params;

    const images = await db.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      include: {
        optionValue: {
          select: { id: true, value: true, hexColor: true },
        },
      },
    });

    return NextResponse.json({ images });
  },
);

// ---------------------------------------------------------------------------
// POST /api/app/products/[id]/images
// ---------------------------------------------------------------------------

export const POST = withApiAuth(
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireBearerPermission("products:write");
    const { id: productId } = await ctx.params;

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";
    const currentCount = await db.productImage.count({ where: { productId } });

    // 1. Multipart Form Data (Native file upload from phone camera / library)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData
        .getAll("files")
        .concat(formData.getAll("file"))
        .filter((entry): entry is File => entry instanceof File && entry.size > 0);

      if (files.length === 0) {
        return NextResponse.json({ error: "No image file provided." }, { status: 400 });
      }

      const alt = String(formData.get("alt") || "").trim() || null;
      const optionValueId = String(formData.get("optionValueId") || "").trim() || null;

      const createdImages = [];
      let position = currentCount;

      for (const file of files) {
        try {
          const asset = await storeUpload(file, {
            folder: "products",
            alt,
            uploadedById: actor.id,
          });

          const img = await db.productImage.create({
            data: {
              productId,
              mediaId: asset.id,
              url: asset.url,
              alt: alt ?? asset.alt,
              position,
              optionValueId,
            },
          });
          createdImages.push(img);
          position += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to store image.";
          return NextResponse.json({ error: message }, { status: 400 });
        }
      }

      revalidateProductCatalog(productId);
      return NextResponse.json({ ok: true, images: createdImages }, { status: 201 });
    }

    // 2. JSON Body (URL or Base64)
    const json = await request.json().catch(() => null);
    const parsed = jsonImageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid image payload." },
        { status: 400 },
      );
    }

    const { url, base64, filename, mimeType, alt, optionValueId } = parsed.data;

    // Case A: Base64 upload
    if (base64) {
      const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const file = new File([buffer], filename, { type: mimeType });

      try {
        const asset = await storeUpload(file, {
          folder: "products",
          alt: alt ?? null,
          uploadedById: actor.id,
        });

        const image = await db.productImage.create({
          data: {
            productId,
            mediaId: asset.id,
            url: asset.url,
            alt: alt ?? asset.alt,
            position: currentCount,
            optionValueId: optionValueId || null,
          },
        });

        revalidateProductCatalog(productId);
        return NextResponse.json({ ok: true, image }, { status: 201 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to upload image.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    // Case B: Direct URL
    if (url) {
      const image = await db.productImage.create({
        data: {
          productId,
          url,
          alt: alt ?? null,
          position: currentCount,
          optionValueId: optionValueId || null,
        },
      });

      revalidateProductCatalog(productId);
      return NextResponse.json({ ok: true, image }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Provide either a 'file' (form-data), 'base64', or 'url'." },
      { status: 400 },
    );
  },
);
