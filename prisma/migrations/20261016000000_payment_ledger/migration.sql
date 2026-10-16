-- Payment ledger hardening (see docs/PAYMENT_AUDIT_2026-10-16.md).

CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

ALTER TABLE "Payment"
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "domain" TEXT,
  ADD COLUMN "refundedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "heldAt" TIMESTAMP(3),
  ADD COLUMN "heldReason" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'checkout',
  ADD COLUMN "stockReservedAt" TIMESTAMP(3),
  ADD COLUMN "discountId" TEXT,
  ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "disputeStatus" TEXT,
  ADD COLUMN "paidEffects" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "paidEffectsDoneAt" TIMESTAMP(3),
  ADD COLUMN "paidEffectsLockedUntil" TIMESTAMP(3);

ALTER TABLE "OrderItem" ADD COLUMN "quantityRestocked" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "method" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "providerRefundId" TEXT,
  "reason" TEXT NOT NULL,
  "failureReason" TEXT,
  "actorId" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- --- Backfill ---------------------------------------------------------------

-- Where existing orders came from, so staff orders stop expiring after 6 h.
UPDATE "Order" o SET "source" = 'pos'
WHERE o."staffNote" LIKE 'Created via Admin POS%'
   OR EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."message" LIKE 'Showroom / POS Order created%');

UPDATE "Order" o SET "source" = 'quote'
WHERE o."source" = 'checkout'
  AND EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o."id" AND p."reference" LIKE '%-QUOTE');

UPDATE "Order" o SET "source" = 'console'
WHERE o."source" = 'checkout'
  AND EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."message" LIKE 'Created in the console%');

UPDATE "Order" o SET "source" = 'app'
WHERE o."source" = 'checkout'
  AND (o."idempotencyKey" IS NOT NULL
       OR EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."message" LIKE 'Mobile order %'));

-- Checkout orders that still hold their reservation.
UPDATE "Order" SET "stockReservedAt" = "placedAt"
WHERE "source" IN ('checkout', 'app')
  AND "status" NOT IN ('CANCELLED', 'REFUNDED')
  AND "inventoryAppliedAt" IS NULL;

-- Showroom sales paid before this change never took stock off the shelf, and
-- staff may have corrected those counts by hand since. Mark them as applied so
-- the new background sweep does not move stock for them retroactively.
UPDATE "Order" SET "inventoryAppliedAt" = COALESCE("paidAt", "placedAt")
WHERE "source" = 'pos' AND "paidAt" IS NOT NULL AND "inventoryAppliedAt" IS NULL;

-- Staff-recorded money is not Paystack money.
UPDATE "Payment" SET "provider" = 'manual' WHERE "reference" LIKE 'MANUAL-%';

-- Balance attempts already in flight.
UPDATE "Payment" SET "purpose" = 'BALANCE'
WHERE "reference" LIKE '%-BAL-%' OR "channel" = 'balance_payment';

-- The code each order used.
UPDATE "Order" o SET "discountId" = r."discountId"
FROM "DiscountRedemption" r WHERE r."orderId" = o."id";

-- Orders already paid have had their receipts, alerts and counts.
UPDATE "Order" SET "paidEffectsDoneAt" = COALESCE("paidAt", CURRENT_TIMESTAMP) WHERE "paidAt" IS NOT NULL;

-- Card authorization codes can charge a card again; nothing here charges a
-- saved card, so they are not kept.
UPDATE "Payment" SET "authCode" = NULL WHERE "authCode" IS NOT NULL;
UPDATE "Payment" SET "rawResponse" = "rawResponse" #- '{authorization,authorization_code}'
WHERE "rawResponse" IS NOT NULL AND jsonb_typeof("rawResponse") = 'object' AND "rawResponse" ? 'authorization';
