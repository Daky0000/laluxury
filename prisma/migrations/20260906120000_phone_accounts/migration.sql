-- Phone-first accounts.
--
-- Customers now register with a phone number and verify it by SMS, so `email`
-- stops being the identity column and becomes optional. `phone` takes its place
-- and gains a unique index — which means the existing rows have to be brought
-- to one canonical spelling first, and any collision that survives that has to
-- be resolved, or the index cannot be created and the deploy fails.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "phoneVerified" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);

-- Existing accounts that already opted in are recorded as having consented when
-- the account was made. It is the only evidence we have, and it is truthful.
UPDATE "User" SET "marketingConsentAt" = "createdAt" WHERE "acceptsMarketing" = true;

-- Normalise stored numbers to 233XXXXXXXXX. "024 000 0000", "+233 24 000 0000"
-- and "233240000000" are the same number and must not become three accounts.
-- The class is written `[^0-9]` rather than `\D`, which is unambiguous whatever
-- the server does with a backslash inside a string literal.
UPDATE "User"
SET "phone" = '233' || substring(regexp_replace("phone", '[^0-9]', '', 'g') from 2)
WHERE "phone" IS NOT NULL
  AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^0[0-9]{9}$';

UPDATE "User"
SET "phone" = regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "phone" IS NOT NULL
  AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^233[0-9]{9}$';

-- Anything left that is not a Ghanaian mobile number cannot be an identity, and
-- would only block the index. It is cleared rather than guessed at.
UPDATE "User" SET "phone" = NULL
WHERE "phone" IS NOT NULL AND "phone" !~ '^233[0-9]{9}$';

-- Duplicates after normalising: the oldest account keeps the number, the rest
-- give it up. They can still sign in by email, and can re-verify the number.
UPDATE "User" u SET "phone" = NULL
WHERE u."phone" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "User" o
    WHERE o."phone" = u."phone"
      AND (o."createdAt" < u."createdAt" OR (o."createdAt" = u."createdAt" AND o."id" < u."id"))
  );

-- Every account that predates this migration was created and used by email, so
-- its number was never verified by us and must not be treated as if it were.

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
