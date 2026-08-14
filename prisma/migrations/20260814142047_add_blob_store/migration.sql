-- CreateTable
CREATE TABLE "Blob" (
    "hash" VARCHAR(64) NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blob_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "BlobRef" (
    "blobHash" VARCHAR(64) NOT NULL,
    "documentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlobRef_pkey" PRIMARY KEY ("blobHash","documentId")
);

-- CreateIndex
CREATE INDEX "BlobRef_documentId_idx" ON "BlobRef"("documentId");

-- AddForeignKey
ALTER TABLE "BlobRef" ADD CONSTRAINT "BlobRef_blobHash_fkey" FOREIGN KEY ("blobHash") REFERENCES "Blob"("hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlobRef" ADD CONSTRAINT "BlobRef_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
