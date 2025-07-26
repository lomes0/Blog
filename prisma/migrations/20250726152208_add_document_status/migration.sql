-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NEUTRAL', 'ACTIVE', 'DONE');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'NEUTRAL';
