-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_status_paidAt_idx" ON "Order"("status", "paidAt");

-- The few orders waiting for a refund, which the admin dashboard counts and the order list filters by.
CREATE INDEX "Order_refund_needed" ON "Order"("refundStatus") WHERE "refundStatus" = 'NEEDED';
