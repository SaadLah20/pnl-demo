-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SectionCoutOccasionnel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "genieCivil" REAL NOT NULL DEFAULT 0,
    "installation" REAL NOT NULL DEFAULT 0,
    "transport" REAL NOT NULL DEFAULT 0,
    "demontage" REAL NOT NULL DEFAULT 0,
    "remisePointCentrale" REAL NOT NULL DEFAULT 0,
    "silots" REAL NOT NULL DEFAULT 0,
    "localAdjuvant" REAL NOT NULL DEFAULT 0,
    "bungalows" REAL NOT NULL DEFAULT 0,
    "branchementElectricite" REAL NOT NULL DEFAULT 0,
    "branchementEau" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionCoutOccasionnel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionCoutOccasionnel" ("bungalows", "category", "demontage", "genieCivil", "id", "installation", "localAdjuvant", "remisePointCentrale", "silots", "transport", "variantId") SELECT "bungalows", "category", "demontage", "genieCivil", "id", "installation", "localAdjuvant", "remisePointCentrale", "silots", "transport", "variantId" FROM "SectionCoutOccasionnel";
DROP TABLE "SectionCoutOccasionnel";
ALTER TABLE "new_SectionCoutOccasionnel" RENAME TO "SectionCoutOccasionnel";
CREATE UNIQUE INDEX "SectionCoutOccasionnel_variantId_key" ON "SectionCoutOccasionnel"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
