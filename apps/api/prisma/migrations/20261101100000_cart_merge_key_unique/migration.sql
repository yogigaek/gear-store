-- Instances still serving during the deploy cannot write a key between the clean-up and the new primary key
LOCK TABLE "CartMerge" IN SHARE ROW EXCLUSIVE MODE;

-- A key could be merged into two accounts (the bug this closes): keep its earliest merge before the key becomes unique
DELETE FROM "CartMerge" AS later
USING "CartMerge" AS earlier
WHERE later."key" = earlier."key"
  AND (later."createdAt", later."userId") > (earlier."createdAt", earlier."userId");

-- AlterTable
ALTER TABLE "CartMerge" DROP CONSTRAINT "CartMerge_pkey",
ADD CONSTRAINT "CartMerge_pkey" PRIMARY KEY ("key");

-- CreateIndex
CREATE INDEX "CartMerge_userId_createdAt_idx" ON "CartMerge"("userId", "createdAt");
