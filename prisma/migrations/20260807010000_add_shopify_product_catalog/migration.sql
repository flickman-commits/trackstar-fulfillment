-- CreateTable
CREATE TABLE "ShopifyProduct" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "templateSuffix" TEXT,
    "featuredImage" TEXT,
    "tags" JSONB,
    "raceCanonical" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProduct_productId_key" ON "ShopifyProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProduct_handle_key" ON "ShopifyProduct"("handle");

-- CreateIndex
CREATE INDEX "ShopifyProduct_raceCanonical_idx" ON "ShopifyProduct"("raceCanonical");

-- CreateIndex
CREATE INDEX "ShopifyProduct_status_idx" ON "ShopifyProduct"("status");

