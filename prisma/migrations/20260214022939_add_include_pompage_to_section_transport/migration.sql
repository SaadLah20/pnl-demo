-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SectionTransport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prixMoyen" REAL NOT NULL DEFAULT 0,
    "includePompage" BOOLEAN NOT NULL DEFAULT false,
    "volumePompePct" REAL,
    "prixAchatPompe" REAL,
    "prixVentePompe" REAL,
    CONSTRAINT "SectionTransport_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionTransport" ("category", "id", "prixAchatPompe", "prixMoyen", "prixVentePompe", "type", "variantId", "volumePompePct") SELECT "category", "id", "prixAchatPompe", "prixMoyen", "prixVentePompe", "type", "variantId", "volumePompePct" FROM "SectionTransport";
DROP TABLE "SectionTransport";
ALTER TABLE "new_SectionTransport" RENAME TO "SectionTransport";
CREATE UNIQUE INDEX "SectionTransport_variantId_key" ON "SectionTransport"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
