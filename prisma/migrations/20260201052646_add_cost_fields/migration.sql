-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SectionCoutMensuel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "electricite" REAL NOT NULL,
    "gasoil" REAL NOT NULL,
    "location" REAL NOT NULL,
    "securite" REAL NOT NULL,
    "hebergements" REAL NOT NULL DEFAULT 0,
    "locationTerrain" REAL NOT NULL DEFAULT 0,
    "telephone" REAL NOT NULL DEFAULT 0,
    "troisG" REAL NOT NULL DEFAULT 0,
    "taxeProfessionnelle" REAL NOT NULL DEFAULT 0,
    "locationVehicule" REAL NOT NULL DEFAULT 0,
    "locationAmbulance" REAL NOT NULL DEFAULT 0,
    "locationBungalows" REAL NOT NULL DEFAULT 0,
    "epi" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionCoutMensuel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionCoutMensuel" ("category", "electricite", "gasoil", "id", "location", "securite", "variantId") SELECT "category", "electricite", "gasoil", "id", "location", "securite", "variantId" FROM "SectionCoutMensuel";
DROP TABLE "SectionCoutMensuel";
ALTER TABLE "new_SectionCoutMensuel" RENAME TO "SectionCoutMensuel";
CREATE UNIQUE INDEX "SectionCoutMensuel_variantId_key" ON "SectionCoutMensuel"("variantId");
CREATE TABLE "new_SectionCoutOccasionnel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "genieCivil" REAL NOT NULL,
    "installation" REAL NOT NULL,
    "transport" REAL NOT NULL,
    "demontage" REAL NOT NULL DEFAULT 0,
    "remisePointCentrale" REAL NOT NULL DEFAULT 0,
    "silots" REAL NOT NULL DEFAULT 0,
    "localAdjuvant" REAL NOT NULL DEFAULT 0,
    "bungalows" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionCoutOccasionnel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionCoutOccasionnel" ("category", "genieCivil", "id", "installation", "transport", "variantId") SELECT "category", "genieCivil", "id", "installation", "transport", "variantId" FROM "SectionCoutOccasionnel";
DROP TABLE "SectionCoutOccasionnel";
ALTER TABLE "new_SectionCoutOccasionnel" RENAME TO "SectionCoutOccasionnel";
CREATE UNIQUE INDEX "SectionCoutOccasionnel_variantId_key" ON "SectionCoutOccasionnel"("variantId");
CREATE TABLE "new_SectionEmployes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "responsableNb" REAL NOT NULL,
    "responsableCout" REAL NOT NULL,
    "centralistesNb" REAL NOT NULL,
    "centralistesCout" REAL NOT NULL,
    "manoeuvreNb" REAL NOT NULL DEFAULT 0,
    "manoeuvreCout" REAL NOT NULL DEFAULT 0,
    "coordinateurExploitationNb" REAL NOT NULL DEFAULT 0,
    "coordinateurExploitationCout" REAL NOT NULL DEFAULT 0,
    "technicienLaboNb" REAL NOT NULL DEFAULT 0,
    "technicienLaboCout" REAL NOT NULL DEFAULT 0,
    "femmeMenageNb" REAL NOT NULL DEFAULT 0,
    "femmeMenageCout" REAL NOT NULL DEFAULT 0,
    "gardienNb" REAL NOT NULL DEFAULT 0,
    "gardienCout" REAL NOT NULL DEFAULT 0,
    "maintenancierNb" REAL NOT NULL DEFAULT 0,
    "maintenancierCout" REAL NOT NULL DEFAULT 0,
    "panierRepasNb" REAL NOT NULL DEFAULT 0,
    "panierRepasCout" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionEmployes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionEmployes" ("category", "centralistesCout", "centralistesNb", "id", "responsableCout", "responsableNb", "variantId") SELECT "category", "centralistesCout", "centralistesNb", "id", "responsableCout", "responsableNb", "variantId" FROM "SectionEmployes";
DROP TABLE "SectionEmployes";
ALTER TABLE "new_SectionEmployes" RENAME TO "SectionEmployes";
CREATE UNIQUE INDEX "SectionEmployes_variantId_key" ON "SectionEmployes"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
