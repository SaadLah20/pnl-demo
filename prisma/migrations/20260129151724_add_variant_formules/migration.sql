-- CreateTable
CREATE TABLE "FormuleCatalogueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formuleId" TEXT NOT NULL,
    "mpId" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    CONSTRAINT "FormuleCatalogueItem_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "FormuleCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FormuleCatalogueItem_mpId_fkey" FOREIGN KEY ("mpId") REFERENCES "MpCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VariantMp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "sectionId" TEXT,
    "mpId" TEXT NOT NULL,
    "prix" REAL NOT NULL,
    "comment" TEXT,
    CONSTRAINT "VariantMp_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VariantMp_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionMatierePremiere" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VariantMp_mpId_fkey" FOREIGN KEY ("mpId") REFERENCES "MpCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VariantFormule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "sectionId" TEXT,
    "formuleId" TEXT NOT NULL,
    "volumeM3" REAL NOT NULL,
    "momd" REAL NOT NULL,
    CONSTRAINT "VariantFormule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VariantFormule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SectionFormules" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VariantFormule_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "FormuleCatalogue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FormuleCatalogueItem_formuleId_mpId_key" ON "FormuleCatalogueItem"("formuleId", "mpId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantMp_variantId_mpId_key" ON "VariantMp"("variantId", "mpId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantFormule_variantId_formuleId_key" ON "VariantFormule"("variantId", "formuleId");
