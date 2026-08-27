-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('DATABASE', 'CDN', 'EXTERNAL');

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "mediaId" TEXT;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "source" "MediaSource" NOT NULL DEFAULT 'DATABASE',
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "alt" TEXT,
    "folder" TEXT NOT NULL DEFAULT 'products',
    "size" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA,
    "publicId" TEXT,
    "checksum" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_checksum_key" ON "MediaAsset"("checksum");

-- CreateIndex
CREATE INDEX "MediaAsset_folder_createdAt_idx" ON "MediaAsset"("folder", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "ProductImage_mediaId_idx" ON "ProductImage"("mediaId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every picture the catalog already points at becomes a library
-- entry, so the library opens with the store's existing imagery instead of
-- empty. The id is derived from the URL, which keeps the insert idempotent.
-- Links under /uploads/ are skipped: those files were written to a container
-- filesystem that no longer exists, so there is nothing behind them.
INSERT INTO "MediaAsset" ("id", "source", "url", "filename", "mimeType", "folder", "createdAt", "updatedAt")
SELECT
    'ext_' || md5(src.url),
    'EXTERNAL',
    src.url,
    COALESCE(NULLIF(regexp_replace(split_part(src.url, '?', 1), '^.*/', ''), ''), 'image'),
    CASE
        WHEN lower(split_part(src.url, '?', 1)) LIKE '%.png' THEN 'image/png'
        WHEN lower(split_part(src.url, '?', 1)) LIKE '%.webp' THEN 'image/webp'
        WHEN lower(split_part(src.url, '?', 1)) LIKE '%.avif' THEN 'image/avif'
        WHEN lower(split_part(src.url, '?', 1)) LIKE '%.gif' THEN 'image/gif'
        WHEN lower(split_part(src.url, '?', 1)) LIKE '%.svg' THEN 'image/svg+xml'
        ELSE 'image/jpeg'
    END,
    min(src.folder),
    now(),
    now()
FROM (
    SELECT "url" AS url, 'products' AS folder
    FROM "ProductImage"
    WHERE "url" <> '' AND "url" NOT LIKE '/uploads/%'
    UNION
    SELECT "imageUrl", 'categories'
    FROM "Category"
    WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '' AND "imageUrl" NOT LIKE '/uploads/%'
    UNION
    SELECT "imageUrl", 'collections'
    FROM "Collection"
    WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '' AND "imageUrl" NOT LIKE '/uploads/%'
) AS src
GROUP BY src.url
ON CONFLICT ("id") DO NOTHING;

-- Point the product gallery rows at the library entries just created.
UPDATE "ProductImage" AS pi
SET "mediaId" = m."id"
FROM "MediaAsset" AS m
WHERE m."url" = pi."url" AND pi."mediaId" IS NULL;
