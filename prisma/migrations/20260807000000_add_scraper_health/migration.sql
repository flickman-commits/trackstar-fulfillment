-- CreateTable
CREATE TABLE "ScraperHealth" (
    "id" SERIAL NOT NULL,
    "race" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "probeName" TEXT,
    "expectBib" TEXT,
    "actualBib" TEXT,
    "ms" INTEGER,
    "detail" TEXT,
    "platform" TEXT,

    CONSTRAINT "ScraperHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScraperHealth_status_idx" ON "ScraperHealth"("status");

-- CreateIndex
CREATE INDEX "ScraperHealth_checkedAt_idx" ON "ScraperHealth"("checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperHealth_race_year_key" ON "ScraperHealth"("race", "year");
