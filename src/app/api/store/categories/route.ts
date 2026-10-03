import { db } from "@/lib/db";
import { publicAssetUrl } from "@/lib/media-url";
import { storeOptions, storeResponse } from "@/lib/store-api";
export const OPTIONS = storeOptions;
export async function GET() {
  const rows = await db.category.findMany({
    where: { isActive: true }, orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, imageUrl: true },
  });
  return storeResponse({ categories: rows.map((row) => ({ ...row, imageUrl: row.imageUrl ? publicAssetUrl(row.imageUrl) : null })) });
}
