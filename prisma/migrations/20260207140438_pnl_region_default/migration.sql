-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pnl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "client" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENCOURS',
    "startDate" DATETIME,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Pnl" ("city", "client", "createdAt", "id", "model", "region", "startDate", "status", "title") SELECT "city", "client", "createdAt", "id", "model", "region", "startDate", "status", "title" FROM "Pnl";
DROP TABLE "Pnl";
ALTER TABLE "new_Pnl" RENAME TO "Pnl";
CREATE TABLE "new_SectionEmployes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "responsableNb" INTEGER NOT NULL DEFAULT 0,
    "responsableCout" REAL NOT NULL DEFAULT 0,
    "centralistesNb" INTEGER NOT NULL DEFAULT 0,
    "centralistesCout" REAL NOT NULL DEFAULT 0,
    "manoeuvreNb" INTEGER NOT NULL DEFAULT 0,
    "manoeuvreCout" REAL NOT NULL DEFAULT 0,
    "coordinateurExploitationNb" INTEGER NOT NULL DEFAULT 0,
    "coordinateurExploitationCout" REAL NOT NULL DEFAULT 0,
    "technicienLaboNb" INTEGER NOT NULL DEFAULT 0,
    "technicienLaboCout" REAL NOT NULL DEFAULT 0,
    "femmeMenageNb" INTEGER NOT NULL DEFAULT 0,
    "femmeMenageCout" REAL NOT NULL DEFAULT 0,
    "gardienNb" INTEGER NOT NULL DEFAULT 0,
    "gardienCout" REAL NOT NULL DEFAULT 0,
    "maintenancierNb" INTEGER NOT NULL DEFAULT 0,
    "maintenancierCout" REAL NOT NULL DEFAULT 0,
    "panierRepasNb" INTEGER NOT NULL DEFAULT 0,
    "panierRepasCout" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionEmployes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionEmployes" ("category", "id", "variantId") SELECT "category", "id", "variantId" FROM "SectionEmployes";
DROP TABLE "SectionEmployes";
ALTER TABLE "new_SectionEmployes" RENAME TO "SectionEmployes";
CREATE UNIQUE INDEX "SectionEmployes_variantId_key" ON "SectionEmployes"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
