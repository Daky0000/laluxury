-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "balancePaidAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "preorderStage" TEXT NOT NULL DEFAULT 'DEPOSIT_CONFIRMED',
ADD COLUMN IF NOT EXISTS "preorderNote" TEXT;

-- AlterTable
ALTER TABLE "PreorderRequest" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
ADD COLUMN IF NOT EXISTS "swatchRequest" TEXT,
ADD COLUMN IF NOT EXISTS "convertedOrderId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradeApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "portfolioUrl" TEXT,
    "projectScope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "discountCode" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradeApplication_status_createdAt_idx" ON "TradeApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradeApplication_email_idx" ON "TradeApplication"("email");
