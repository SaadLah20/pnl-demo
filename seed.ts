import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();



async function main() {
  console.log("Début du seed...");

  // Création d'un P&L
  const pl = await prisma.pL.create({
    data: {
      title: "P&L Test",
      model: "CAB Fixe existant",
      client: "Entreprise X",
      status: "Initial",
    },
  });

  console.log("P&L créé :", pl);

  // Création d'une variante liée
  const variant = await prisma.variant.create({
    data: {
      title: "Variante 1",
      volume: 1000,
      model: "CAB Fixe existant",
      type: "Initiale",
      status: "En cours",
      plId: pl.id,
    },
  });

  console.log("Variante créée :", variant);

  // Création d'un contrat lié
  const contract = await prisma.contract.create({
    data: {
      ref: "CTR-001",
      plId: pl.id,
      cab: "A la charge LHM",
      installation: "A la charge client",
      transport: "Existante",
      geniecivil: "Partagé",
      terrain: "A la charge client",
    },
  });

  console.log("Contrat créé :", contract);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
