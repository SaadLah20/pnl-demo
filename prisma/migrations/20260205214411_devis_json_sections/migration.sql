/*
  Warnings:

  - You are about to alter the column `amortMois` on the `SectionCab` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to drop the column `centralistesCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `centralistesNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `coordinateurExploitationCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `coordinateurExploitationNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `femmeMenageCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `femmeMenageNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `gardienCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `gardienNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `maintenancierCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `maintenancierNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `manoeuvreCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `manoeuvreNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `panierRepasCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `panierRepasNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `responsableCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `responsableNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `technicienLaboCout` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `technicienLaboNb` on the `SectionEmployes` table. All the data in the column will be lost.
  - You are about to drop the column `prixOverride` on the `VariantMp` table. All the data in the column will be lost.
  - Made the column `sectionId` on table `VariantFormule` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sectionId` on table `VariantMp` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutreCoutItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "valeur" REAL NOT NULL,
    CONSTRAINT "AutreCoutItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AutreCoutItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionAutresCouts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AutreCoutItem" ("id", "label", "sectionId", "unite", "valeur", "variantId") SELECT "id", "label", "sectionId", "unite", "valeur", "variantId" FROM "AutreCoutItem";
DROP TABLE "AutreCoutItem";
ALTER TABLE "new_AutreCoutItem" RENAME TO "AutreCoutItem";
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
    "branchementEau" TEXT,
    "consoEau" TEXT,
    "branchementElec" TEXT,
    "consoElec" TEXT,
    "postes" INTEGER,
    "sundayPrice" REAL,
    "delayPenalty" REAL,
    "chillerRent" REAL,
    CONSTRAINT "Contract_pnlId_fkey" FOREIGN KEY ("pnlId") REFERENCES "Pnl" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("branchementEau", "branchementElec", "cab", "chargeuse", "chillerRent", "consoEau", "consoElec", "delayPenalty", "dureeMois", "genieCivil", "id", "installation", "maintenance", "matierePremiere", "pnlId", "postes", "sundayPrice", "terrain", "transport") SELECT "branchementEau", "branchementElec", "cab", "chargeuse", "chillerRent", "consoEau", "consoElec", "delayPenalty", "dureeMois", "genieCivil", "id", "installation", "maintenance", "matierePremiere", "pnlId", "postes", "sundayPrice", "terrain", "transport" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE TABLE "new_FormuleCatalogueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formuleId" TEXT NOT NULL,
    "mpId" TEXT NOT NULL,
    "qty" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "FormuleCatalogueItem_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "FormuleCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FormuleCatalogueItem_mpId_fkey" FOREIGN KEY ("mpId") REFERENCES "MpCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FormuleCatalogueItem" ("formuleId", "id", "mpId", "qty") SELECT "formuleId", "id", "mpId", "qty" FROM "FormuleCatalogueItem";
DROP TABLE "FormuleCatalogueItem";
ALTER TABLE "new_FormuleCatalogueItem" RENAME TO "FormuleCatalogueItem";
CREATE TABLE "new_MpCatalogue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categorie" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "prix" REAL NOT NULL DEFAULT 0,
    "fournisseur" TEXT,
    "city" TEXT,
    "region" TEXT,
    "comment" TEXT
);
INSERT INTO "new_MpCatalogue" ("categorie", "city", "comment", "fournisseur", "id", "label", "prix", "region", "unite") SELECT "categorie", "city", "comment", "fournisseur", "id", "label", "prix", "region", "unite" FROM "MpCatalogue";
DROP TABLE "MpCatalogue";
ALTER TABLE "new_MpCatalogue" RENAME TO "MpCatalogue";
CREATE TABLE "new_SectionCab" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "etat" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "capaciteM3" REAL NOT NULL DEFAULT 0,
    "amortMois" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SectionCab_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionCab" ("amortMois", "capaciteM3", "category", "etat", "id", "mode", "variantId") SELECT "amortMois", "capaciteM3", "category", "etat", "id", "mode", "variantId" FROM "SectionCab";
DROP TABLE "SectionCab";
ALTER TABLE "new_SectionCab" RENAME TO "SectionCab";
CREATE UNIQUE INDEX "SectionCab_variantId_key" ON "SectionCab"("variantId");
CREATE TABLE "new_SectionCoutM3" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eau" REAL NOT NULL DEFAULT 0,
    "qualite" REAL NOT NULL DEFAULT 0,
    "dechets" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionCoutM3_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionCoutM3" ("category", "dechets", "eau", "id", "qualite", "variantId") SELECT "category", "dechets", "eau", "id", "qualite", "variantId" FROM "SectionCoutM3";
DROP TABLE "SectionCoutM3";
ALTER TABLE "new_SectionCoutM3" RENAME TO "SectionCoutM3";
CREATE UNIQUE INDEX "SectionCoutM3_variantId_key" ON "SectionCoutM3"("variantId");
CREATE TABLE "new_SectionCoutMensuel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "electricite" REAL NOT NULL DEFAULT 0,
    "gasoil" REAL NOT NULL DEFAULT 0,
    "location" REAL NOT NULL DEFAULT 0,
    "securite" REAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_SectionCoutMensuel" ("category", "electricite", "epi", "gasoil", "hebergements", "id", "location", "locationAmbulance", "locationBungalows", "locationTerrain", "locationVehicule", "securite", "taxeProfessionnelle", "telephone", "troisG", "variantId") SELECT "category", "electricite", "epi", "gasoil", "hebergements", "id", "location", "locationAmbulance", "locationBungalows", "locationTerrain", "locationVehicule", "securite", "taxeProfessionnelle", "telephone", "troisG", "variantId" FROM "SectionCoutMensuel";
DROP TABLE "SectionCoutMensuel";
ALTER TABLE "new_SectionCoutMensuel" RENAME TO "SectionCoutMensuel";
CREATE UNIQUE INDEX "SectionCoutMensuel_variantId_key" ON "SectionCoutMensuel"("variantId");
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
    CONSTRAINT "SectionCoutOccasionnel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionCoutOccasionnel" ("bungalows", "category", "demontage", "genieCivil", "id", "installation", "localAdjuvant", "remisePointCentrale", "silots", "transport", "variantId") SELECT "bungalows", "category", "demontage", "genieCivil", "id", "installation", "localAdjuvant", "remisePointCentrale", "silots", "transport", "variantId" FROM "SectionCoutOccasionnel";
DROP TABLE "SectionCoutOccasionnel";
ALTER TABLE "new_SectionCoutOccasionnel" RENAME TO "SectionCoutOccasionnel";
CREATE UNIQUE INDEX "SectionCoutOccasionnel_variantId_key" ON "SectionCoutOccasionnel"("variantId");
CREATE TABLE "new_SectionDevis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "surcharge" REAL NOT NULL DEFAULT 0,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "intro" TEXT NOT NULL DEFAULT '',
    "rappel" TEXT NOT NULL DEFAULT '{}',
    "chargeFournisseur" TEXT NOT NULL DEFAULT '[]',
    "chargeClient" TEXT NOT NULL DEFAULT '[]',
    "prixComplementaires" TEXT NOT NULL DEFAULT '[]',
    "validiteTexte" TEXT NOT NULL DEFAULT '',
    "signature" TEXT NOT NULL DEFAULT '{}',
    "surcharges" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "SectionDevis_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionDevis" ("category", "id", "surcharge", "variantId") SELECT "category", "id", "surcharge", "variantId" FROM "SectionDevis";
DROP TABLE "SectionDevis";
ALTER TABLE "new_SectionDevis" RENAME TO "SectionDevis";
CREATE UNIQUE INDEX "SectionDevis_variantId_key" ON "SectionDevis"("variantId");
CREATE TABLE "new_SectionEmployes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "SectionEmployes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionEmployes" ("category", "id", "variantId") SELECT "category", "id", "variantId" FROM "SectionEmployes";
DROP TABLE "SectionEmployes";
ALTER TABLE "new_SectionEmployes" RENAME TO "SectionEmployes";
CREATE UNIQUE INDEX "SectionEmployes_variantId_key" ON "SectionEmployes"("variantId");
CREATE TABLE "new_SectionMaintenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cab" REAL NOT NULL DEFAULT 0,
    "elec" REAL NOT NULL DEFAULT 0,
    "chargeur" REAL NOT NULL DEFAULT 0,
    "generale" REAL NOT NULL DEFAULT 0,
    "bassins" REAL NOT NULL DEFAULT 0,
    "preventive" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionMaintenance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionMaintenance" ("bassins", "cab", "category", "chargeur", "elec", "generale", "id", "preventive", "variantId") SELECT "bassins", "cab", "category", "chargeur", "elec", "generale", "id", "preventive", "variantId" FROM "SectionMaintenance";
DROP TABLE "SectionMaintenance";
ALTER TABLE "new_SectionMaintenance" RENAME TO "SectionMaintenance";
CREATE UNIQUE INDEX "SectionMaintenance_variantId_key" ON "SectionMaintenance"("variantId");
CREATE TABLE "new_SectionTransport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prixMoyen" REAL NOT NULL DEFAULT 0,
    "volumePompePct" REAL,
    "prixAchatPompe" REAL,
    "prixVentePompe" REAL,
    CONSTRAINT "SectionTransport_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SectionTransport" ("category", "id", "prixAchatPompe", "prixMoyen", "prixVentePompe", "type", "variantId", "volumePompePct") SELECT "category", "id", "prixAchatPompe", coalesce("prixMoyen", 0) AS "prixMoyen", "prixVentePompe", "type", "variantId", "volumePompePct" FROM "SectionTransport";
DROP TABLE "SectionTransport";
ALTER TABLE "new_SectionTransport" RENAME TO "SectionTransport";
CREATE UNIQUE INDEX "SectionTransport_variantId_key" ON "SectionTransport"("variantId");
CREATE TABLE "new_VariantFormule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "formuleId" TEXT NOT NULL,
    "volumeM3" REAL NOT NULL DEFAULT 0,
    "momd" REAL NOT NULL DEFAULT 0,
    "cmpOverride" REAL,
    CONSTRAINT "VariantFormule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VariantFormule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionFormules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VariantFormule_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "FormuleCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VariantFormule" ("cmpOverride", "formuleId", "id", "momd", "sectionId", "variantId", "volumeM3") SELECT "cmpOverride", "formuleId", "id", "momd", "sectionId", "variantId", "volumeM3" FROM "VariantFormule";
DROP TABLE "VariantFormule";
ALTER TABLE "new_VariantFormule" RENAME TO "VariantFormule";
CREATE TABLE "new_VariantMp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "mpId" TEXT NOT NULL,
    "prix" REAL,
    "comment" TEXT,
    CONSTRAINT "VariantMp_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VariantMp_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionMatierePremiere" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VariantMp_mpId_fkey" FOREIGN KEY ("mpId") REFERENCES "MpCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VariantMp" ("comment", "id", "mpId", "prix", "sectionId", "variantId") SELECT "comment", "id", "mpId", "prix", "sectionId", "variantId" FROM "VariantMp";
DROP TABLE "VariantMp";
ALTER TABLE "new_VariantMp" RENAME TO "VariantMp";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
