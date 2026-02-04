-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SectionAutresCouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "majorations" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "SectionAutresCouts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionAutresCouts" ("category", "id", "variantId") SELECT "category", "id", "variantId" FROM "SectionAutresCouts";
DROP TABLE "SectionAutresCouts";
ALTER TABLE "new_SectionAutresCouts" RENAME TO "SectionAutresCouts";
CREATE UNIQUE INDEX "SectionAutresCouts_variantId_key" ON "SectionAutresCouts"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
