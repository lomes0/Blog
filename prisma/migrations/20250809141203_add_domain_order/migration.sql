-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "order" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Domain_userId_order_idx" ON "Domain"("userId", "order");
