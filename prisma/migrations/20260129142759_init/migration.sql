-- CreateTable
CREATE TABLE "Pnl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "client" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENCOURS',
    "startDate" DATETIME,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pnlId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIALISEE',
    "contractId" TEXT NOT NULL,
    CONSTRAINT "Variant_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionMatierePremiere" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "SectionMatierePremiere_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionTransport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prixMoyen" REAL,
    CONSTRAINT "SectionTransport_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionCab" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "etat" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "capaciteM3" REAL NOT NULL,
    "amortMois" REAL NOT NULL,
    CONSTRAINT "SectionCab_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionMaintenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cab" REAL NOT NULL,
    "elec" REAL NOT NULL,
    "chargeur" REAL NOT NULL,
    "generale" REAL NOT NULL,
    "bassins" REAL NOT NULL,
    "preventive" REAL NOT NULL,
    CONSTRAINT "SectionMaintenance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionCoutM3" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eau" REAL NOT NULL,
    "qualite" REAL NOT NULL,
    "dechets" REAL NOT NULL,
    CONSTRAINT "SectionCoutM3_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionCoutMensuel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "electricite" REAL NOT NULL,
    "gasoil" REAL NOT NULL,
    "location" REAL NOT NULL,
    "securite" REAL NOT NULL,
    CONSTRAINT "SectionCoutMensuel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionCoutOccasionnel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "genieCivil" REAL NOT NULL,
    "installation" REAL NOT NULL,
    "transport" REAL NOT NULL,
    CONSTRAINT "SectionCoutOccasionnel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionEmployes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "responsableNb" REAL NOT NULL,
    "responsableCout" REAL NOT NULL,
    "centralistesNb" REAL NOT NULL,
    "centralistesCout" REAL NOT NULL,
    CONSTRAINT "SectionEmployes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionAutresCouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "valeur" REAL NOT NULL,
    CONSTRAINT "SectionAutresCouts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionFormules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "SectionFormules_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionMajorations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "SectionMajorations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionDevis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "surcharge" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "SectionDevis_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MpCatalogue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categorie" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "prix" REAL NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "comment" TEXT
);

-- CreateTable
CREATE TABLE "FormuleCatalogue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "resistance" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "comment" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "SectionMatierePremiere_variantId_key" ON "SectionMatierePremiere"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionTransport_variantId_key" ON "SectionTransport"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionCab_variantId_key" ON "SectionCab"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionMaintenance_variantId_key" ON "SectionMaintenance"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionCoutM3_variantId_key" ON "SectionCoutM3"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionCoutMensuel_variantId_key" ON "SectionCoutMensuel"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionCoutOccasionnel_variantId_key" ON "SectionCoutOccasionnel"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionEmployes_variantId_key" ON "SectionEmployes"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionAutresCouts_variantId_key" ON "SectionAutresCouts"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionFormules_variantId_key" ON "SectionFormules"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionMajorations_variantId_key" ON "SectionMajorations"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionDevis_variantId_key" ON "SectionDevis"("variantId");
