-- CreateTable
CREATE TABLE "PL" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "client" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "volume" REAL NOT NULL,
    "description" TEXT,
    "model" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "plId" INTEGER NOT NULL,
    CONSTRAINT "Variant_plId_fkey" FOREIGN KEY ("plId") REFERENCES "PL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ref" TEXT NOT NULL,
    "plId" INTEGER NOT NULL,
    "cab" TEXT NOT NULL,
    "installation" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "geniecivil" TEXT NOT NULL,
    "terrain" TEXT NOT NULL,
    CONSTRAINT "Contract_plId_fkey" FOREIGN KEY ("plId") REFERENCES "PL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
