/*
  Warnings:

  - You are about to drop the column `label` on the `SectionAutresCouts` table. All the data in the column will be lost.
  - You are about to drop the column `unite` on the `SectionAutresCouts` table. All the data in the column will be lost.
  - You are about to drop the column `valeur` on the `SectionAutresCouts` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "AutreCoutItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "valeur" REAL NOT NULL,
    CONSTRAINT "AutreCoutItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionAutresCouts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutreCoutItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SectionAutresCouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "SectionAutresCouts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionAutresCouts" ("category", "id", "variantId") SELECT "category", "id", "variantId" FROM "SectionAutresCouts";
DROP TABLE "SectionAutresCouts";
ALTER TABLE "new_SectionAutresCouts" RENAME TO "SectionAutresCouts";
CREATE UNIQUE INDEX "SectionAutresCouts_variantId_key" ON "SectionAutresCouts"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AutreCoutItem_variantId_idx" ON "AutreCoutItem"("variantId");

-- CreateIndex
CREATE INDEX "AutreCoutItem_sectionId_idx" ON "AutreCoutItem"("sectionId");
