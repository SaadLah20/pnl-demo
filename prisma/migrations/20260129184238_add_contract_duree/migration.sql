-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pnlId" TEXT NOT NULL,
    "dureeMois" INTEGER NOT NULL DEFAULT 0,
    "cab" TEXT NOT NULL,
    "installation" TEXT NOT NULL,
    "genieCivil" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "terrain" TEXT NOT NULL,
    "matierePremiere" TEXT NOT NULL,
    "maintenance" TEXT NOT NULL,
    "chargeuse" TEXT NOT NULL,
    "branchementEau" TEXT NOT NULL,
    "consoEau" TEXT NOT NULL,
    "branchementElec" TEXT NOT NULL,
    "consoElec" TEXT NOT NULL,
    "postes" INTEGER NOT NULL,
    "sundayPrice" REAL NOT NULL,
    "delayPenalty" REAL NOT NULL,
    "chillerRent" REAL NOT NULL,
    CONSTRAINT "Contract_pnlId_fkey" FOREIGN KEY ("pnlId") REFERENCES "Pnl" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("branchementEau", "branchementElec", "cab", "chargeuse", "chillerRent", "consoEau", "consoElec", "delayPenalty", "genieCivil", "id", "installation", "maintenance", "matierePremiere", "pnlId", "postes", "sundayPrice", "terrain", "transport") SELECT "branchementEau", "branchementElec", "cab", "chargeuse", "chillerRent", "consoEau", "consoElec", "delayPenalty", "genieCivil", "id", "installation", "maintenance", "matierePremiere", "pnlId", "postes", "sundayPrice", "terrain", "transport" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
