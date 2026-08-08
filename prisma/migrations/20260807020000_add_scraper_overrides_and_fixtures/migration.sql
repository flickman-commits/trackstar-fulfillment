-- CreateTable
CREATE TABLE "ScraperOverride" (
    "id" SERIAL NOT NULL,
    "race" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "eventIds" JSONB NOT NULL,
    "platform" TEXT,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperFixture" (
    "id" SERIAL NOT NULL,
    "race" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "runnerName" TEXT NOT NULL,
    "bib" TEXT NOT NULL,
    "officialTime" TEXT,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScraperFixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScraperOverride_race_idx" ON "ScraperOverride"("race");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperOverride_race_year_key" ON "ScraperOverride"("race", "year");

-- CreateIndex
CREATE INDEX "ScraperFixture_race_idx" ON "ScraperFixture"("race");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperFixture_race_year_key" ON "ScraperFixture"("race", "year");

