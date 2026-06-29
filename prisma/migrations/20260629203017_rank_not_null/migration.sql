/*
  Warnings:

  - Made the column `rank` on table `Document` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rank` on table `Series` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "rank" SET NOT NULL;

-- AlterTable
ALTER TABLE "Series" ALTER COLUMN "rank" SET NOT NULL;
