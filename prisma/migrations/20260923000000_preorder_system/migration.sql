-- Pre-Order System & Flexible Payment Schema Upgrade

CREATE TYPE "PreorderRequestStatus" AS ENUM ('NEW', 'QUOTED', 'SOURCING', 'ARRIVED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "isPreorder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preorderLeadTime" TEXT,
  ADD COLUMN IF NOT EXISTS "preorderDepositPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "preorderNote" TEXT;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "hasPreorderItems" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS "depositAmount" INTEGER;

CREATE INDEX IF NOT EXISTS "Order_hasPreorderItems_idx" ON "Order"("hasPreorderItems");

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "isPreorder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preorderLeadTime" TEXT;

CREATE TABLE IF NOT EXISTS "PreorderRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  "productId" TEXT,
  "variantTitle" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "targetBudget" INTEGER,
  "notes" TEXT,
  "status" "PreorderRequestStatus" NOT NULL DEFAULT 'NEW',
  "staffNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreorderRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PreorderRequest_status_createdAt_idx" ON "PreorderRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PreorderRequest_email_idx" ON "PreorderRequest"("email");
