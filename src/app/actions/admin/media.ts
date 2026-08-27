"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { uploadImage, UploadError } from "@/lib/cdn";
import type { AdminState } from "./products";

/**
 * Uploading product photos from the console, rather than pasting a URL.
 *
 * The file goes straight to the CDN and only its delivered URL is stored, so
 * nothing depends on the container's disk — which does not survive a deploy.
 */

export async function uploadProductImagesAction(
  productId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("products:write");

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const chosen = files.filter((file) => file.size > 0);

  if (chosen.length === 0) return { ok: false, message: "Choose at least one image." };

  const optionValueId = String(formData.get("optionValueId") || "").trim() || null;
  const alt = String(formData.get("alt") || "").trim() || null;

  let position = await db.productImage.count({ where: { productId } });
  const failures: string[] = [];
  let added = 0;

  for (const file of chosen) {
    try {
      const uploaded = await uploadImage(file, { folder: `laluxury/products/${productId}` });
      await db.productImage.create({
        data: { productId, url: uploaded.url, alt, position, optionValueId },
      });
      position += 1;
      added += 1;
    } catch (error) {
      // One bad file should not lose the others that uploaded fine.
      failures.push(
        `${file.name}: ${error instanceof UploadError || error instanceof Error ? error.message : "failed"}`,
      );
    }
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/shop");

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

/** Same upload path, used for the store's own imagery in settings. */
export async function uploadSettingImageAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState & { url?: string }> {
  await requirePermission("settings:manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image." };
  }

  try {
    const uploaded = await uploadImage(file, { folder: "laluxury/store" });
    return { ok: true, message: "Uploaded.", url: uploaded.url };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The upload failed.",
    };
  }
}
