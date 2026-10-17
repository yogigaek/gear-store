-- CreateTable
CREATE TABLE "CartMerge" (
    "userId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartMerge_pkey" PRIMARY KEY ("userId","key")
);

-- AddForeignKey
ALTER TABLE "CartMerge" ADD CONSTRAINT "CartMerge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
