"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import {
  UploadError,
  clearBrokenUploadLinks,
  deleteMedia,
  listMedia,
  registerExternalUrl,
  storeUpload,
  type MediaListItem,
} from "@/lib/media";
import type { AdminState } from "./products";

/**
 * The media library, from the console.
 *
 * Uploading and attaching are two separate steps now: a file goes into the
 * library once and can then be used by any number of products, rather than
 * being re-uploaded every time it is wanted.
 */

function reason(error: unknown): string {
  if (error instanceof UploadError || error instanceof Error) return error.message;
  return "failed";
}

function revalidateMedia(productId?: string) {
  revalidatePath("/admin/media");
  if (productId) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
  revalidatePath("/product/[slug]", "page");
}

/** Files chosen in a form, minus the empty entry a file input sends when idle. */
function filesFrom(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type MediaUploadState = AdminState & { uploaded?: MediaListItem[] };

export async function uploadMediaAction(
  _prev: MediaUploadState | null,
  formData: FormData,
): Promise<MediaUploadState> {
  const user = await requirePermission("products:write");

  const chosen = filesFrom(formData);
  if (chosen.length === 0) return { ok: false, message: "Choose at least one image." };

  const folder = String(formData.get("folder") || "products").trim() || "products";
  const alt = String(formData.get("alt") || "").trim() || null;

  const failures: string[] = [];
  let added = 0;

  for (const file of chosen) {
    try {
      await storeUpload(file, { folder, alt, uploadedById: user.id });
      added += 1;
    } catch (error) {
      // One bad file should not lose the others that uploaded fine.
      failures.push(`${file.name}: ${reason(error)}`);
    }
  }

  revalidateMedia();

  if (added === 0) {
    return { ok: false, message: failures.join(" · ") || "Nothing uploaded." };
  }

  return {
    ok: true,
    message:
      failures.length > 0
        ? `Added ${added}. ${failures.length} failed — ${failures.join(" · ")}`
        : `Added ${added} image${added === 1 ? "" : "s"} to the library.`,
  };
}

export async function importMediaUrlAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("products:write");

  const url = String(formData.get("url") || "").trim();
  if (!url) return { ok: false, message: "Paste an image URL." };

  const folder = String(formData.get("folder") || "products").trim() || "products";
  const alt = String(formData.get("alt") || "").trim() || null;

  try {
    await registerExternalUrl(url, { folder, alt, uploadedById: user.id });
  } catch (error) {
    return { ok: false, message: reason(error) };
  }

  revalidateMedia();
  return { ok: true, message: "Added to the library." };
}

export async function updateMediaAction(
  id: string,
  values: { alt?: string; folder?: string },
): Promise<AdminState> {
  await requirePermission("products:write");

  const alt = values.alt?.trim() ?? "";
  await db.mediaAsset.update({
    where: { id },
    data: {
      alt: alt || null,
      ...(values.folder ? { folder: values.folder } : {}),
    },
  });

  // Gallery rows carry their own alt text; only the ones that never had any
  // follow the library, so a caption written on a product is not overwritten.
  if (alt) {
    await db.productImage.updateMany({ where: { mediaId: id, alt: null }, data: { alt } });
  }

  revalidateMedia();
  return { ok: true, message: "Saved." };
}

export async function deleteMediaAction(id: string): Promise<AdminState> {
  await requirePermission("products:write");

  // The galleries go with it: leaving them behind would only paint a broken
  // box on the storefront.
  await db.productImage.deleteMany({ where: { mediaId: id } });
  await deleteMedia(id);

  revalidateMedia();
  return { ok: true, message: "Deleted." };
}

/** Backs the picker in the product editor. */
export async function searchMediaAction(options: {
  query?: string;
  folder?: string;
}): Promise<MediaListItem[]> {
  await requirePermission("products:write");
  const { items } = await listMedia({ ...options, take: 60 });
  return items;
}

export async function clearBrokenUploadsAction(): Promise<AdminState> {
  await requirePermission("products:write");

  const removed = await clearBrokenUploadLinks();
  revalidateMedia();

  return {
    ok: true,
    message: removed === 0 ? "Nothing to clear." : `Cleared ${removed} dead image link${removed === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** Adds library assets to a product's gallery, in the order they were picked. */
async function attach(
  productId: string,
  assets: { id: string; url: string; alt: string | null }[],
  optionValueId: string | null,
): Promise<number> {
  let position = await db.productImage.count({ where: { productId } });

  for (const asset of assets) {
    await db.productImage.create({
      data: {
        productId,
        mediaId: asset.id,
        url: asset.url,
        alt: asset.alt,
        position,
        optionValueId,
      },
    });
    position += 1;
  }

  return assets.length;
}

export async function uploadProductImagesAction(
  productId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("products:write");

  const chosen = filesFrom(formData);
  if (chosen.length === 0) return { ok: false, message: "Choose at least one image." };

  const optionValueId = String(formData.get("optionValueId") || "").trim() || null;
  const alt = String(formData.get("alt") || "").trim() || null;

  const failures: string[] = [];
  const stored: { id: string; url: string; alt: string | null }[] = [];

  for (const file of chosen) {
    try {
      const asset = await storeUpload(file, {
        folder: "products",
        alt,
        uploadedById: user.id,
      });
      stored.push({ id: asset.id, url: asset.url, alt: alt ?? asset.alt });
    } catch (error) {
      failures.push(`${file.name}: ${reason(error)}`);
    }
  }

  const added = await attach(productId, stored, optionValueId);
  revalidateMedia(productId);

  if (added === 0) {
    return { ok: false, message: failures.join(" · ") || "Nothing uploaded." };
  }

  return {
    ok: true,
    message:
      failures.length > 0
        ? `Uploaded ${added}. ${failures.length} failed — ${failures.join(" · ")}`
        : `Uploaded ${added} image${added === 1 ? "" : "s"}.`,
  };
}

/** Puts pictures already in the library onto a product. */
export async function attachMediaAction(
  productId: string,
  mediaIds: string[],
  optionValueId: string | null,
): Promise<AdminState> {
  await requirePermission("products:write");

  if (mediaIds.length === 0) return { ok: false, message: "Pick at least one image." };

  const assets = await db.mediaAsset.findMany({
    where: { id: { in: mediaIds } },
    select: { id: true, url: true, alt: true },
  });

  // Whatever order the picker handed over is the order they go in.
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const ordered = mediaIds.map((id) => byId.get(id)).filter((asset) => asset !== undefined);

  const added = await attach(productId, ordered, optionValueId);
  revalidateMedia(productId);

  return { ok: true, message: `Added ${added} image${added === 1 ? "" : "s"}.` };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Same upload path, used for the store's own imagery in settings. */
export async function uploadSettingImageAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState & { url?: string }> {
  const user = await requirePermission("settings:manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image." };
  }

  try {
    const asset = await storeUpload(file, { folder: "store", uploadedById: user.id });
    revalidateMedia();
    return { ok: true, message: "Uploaded.", url: asset.url };
  } catch (error) {
    return { ok: false, message: reason(error) };
  }
}
