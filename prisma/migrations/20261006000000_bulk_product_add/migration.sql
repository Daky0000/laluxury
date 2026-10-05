-- CreateEnum
CREATE TYPE "ProductImportSourceKind" AS ENUM ('PHOTOS', 'SPREADSHEET', 'PHOTOS_SPREADSHEET', 'FEED');

-- CreateEnum
CREATE TYPE "ProductImportBatchStatus" AS ENUM ('DRAFT', 'UPLOADING', 'PARSING', 'NORMALIZING', 'MATCHING', 'ENRICHING', 'VALIDATING', 'READY_FOR_REVIEW', 'IMPORTING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductImportItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'BLOCKED', 'IMPORTING', 'IMPORTED', 'UPDATED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProductImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProductImportBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceKind" "ProductImportSourceKind" NOT NULL,
    "status" "ProductImportBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "setup" JSONB NOT NULL DEFAULT '{}',
    "recipeId" TEXT,
    "sourceId" TEXT,
    "profileId" TEXT,
    "fileName" TEXT,
    "fileData" BYTEA,
    "fileHeaders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "columnMapping" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "aiFailures" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "ProductImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "groupKey" TEXT NOT NULL,
    "externalKey" TEXT,
    "rowNumber" INTEGER,
    "raw" JSONB,
    "data" JSONB NOT NULL DEFAULT '{}',
    "overrides" JSONB,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "issueCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action" TEXT NOT NULL DEFAULT 'CREATE',
    "matchProductId" TEXT,
    "matchMethod" TEXT,
    "productId" TEXT,
    "aiStatus" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImportMedia" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "itemId" TEXT,
    "mediaId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT,
    "phash" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "optionName" TEXT,
    "optionValue" TEXT,
    "optionSource" TEXT,
    "duplicateOfId" TEXT,
    "duplicateKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImportMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOptionDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogOptionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOptionValueDefinition" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "hexColor" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatalogOptionValueDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SUPPLIER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSourceProfile" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSourceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSourceProduct" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "productId" TEXT,
    "lastData" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogSourceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogNormalizationRule" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogNormalizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImportJob" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "type" TEXT NOT NULL,
    "status" "ProductImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImportAiAttempt" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "itemId" TEXT,
    "task" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImportAiAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkAiCache" (
    "key" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkAiCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ProductImportBatch_createdAt_idx" ON "ProductImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ProductImportBatch_status_idx" ON "ProductImportBatch"("status");

-- CreateIndex
CREATE INDEX "ProductImportItem_batchId_status_idx" ON "ProductImportItem"("batchId", "status");

-- CreateIndex
CREATE INDEX "ProductImportItem_batchId_rowNumber_idx" ON "ProductImportItem"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImportItem_batchId_groupKey_key" ON "ProductImportItem"("batchId", "groupKey");

-- CreateIndex
CREATE INDEX "ProductImportMedia_batchId_itemId_idx" ON "ProductImportMedia"("batchId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImportMedia_batchId_mediaId_key" ON "ProductImportMedia"("batchId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipe_name_key" ON "ProductRecipe"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogOptionDefinition_name_key" ON "CatalogOptionDefinition"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogOptionValueDefinition_optionId_value_key" ON "CatalogOptionValueDefinition"("optionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSource_name_key" ON "CatalogSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSourceProfile_sourceId_name_key" ON "CatalogSourceProfile"("sourceId", "name");

-- CreateIndex
CREATE INDEX "CatalogSourceProduct_productId_idx" ON "CatalogSourceProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSourceProduct_sourceId_externalKey_key" ON "CatalogSourceProduct"("sourceId", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogNormalizationRule_field_fromValue_sourceKey_key" ON "CatalogNormalizationRule"("field", "fromValue", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImportJob_dedupeKey_key" ON "ProductImportJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "ProductImportJob_status_runAfter_idx" ON "ProductImportJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "ProductImportJob_batchId_status_idx" ON "ProductImportJob"("batchId", "status");

-- CreateIndex
CREATE INDEX "ProductImportAiAttempt_batchId_createdAt_idx" ON "ProductImportAiAttempt"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductImportAiAttempt_createdAt_idx" ON "ProductImportAiAttempt"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductImportItem" ADD CONSTRAINT "ProductImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImportMedia" ADD CONSTRAINT "ProductImportMedia_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImportMedia" ADD CONSTRAINT "ProductImportMedia_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProductImportItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOptionValueDefinition" ADD CONSTRAINT "CatalogOptionValueDefinition_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CatalogOptionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSourceProfile" ADD CONSTRAINT "CatalogSourceProfile_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CatalogSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSourceProduct" ADD CONSTRAINT "CatalogSourceProduct_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CatalogSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImportJob" ADD CONSTRAINT "ProductImportJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImportAiAttempt" ADD CONSTRAINT "ProductImportAiAttempt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

