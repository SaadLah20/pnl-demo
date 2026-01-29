import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function sectionsAll() {
  return {
    mp: { create: { category: "LOGISTIQUE_APPRO" } },
    transport: {
      create: {
        category: "LOGISTIQUE_APPRO",
        type: "CAMION_TOURNEE",
        prixMoyen: 120,
      },
    },
    cab: {
      create: {
        category: "COUTS_CHARGES",
        etat: "NEUVE",
        mode: "ACHAT",
        capaciteM3: 60,
        amortMois: 60,
      },
    },
    maintenance: {
      create: {
        category: "COUTS_CHARGES",
        cab: 20,
        elec: 10,
        chargeur: 12,
        generale: 15,
        bassins: 5,
        preventive: 8,
      },
    },
    coutM3: {
      create: {
        category: "COUTS_CHARGES",
        eau: 2.5,
        qualite: 1.2,
        dechets: 0.8,
      },
    },
    coutMensuel: {
      create: {
        category: "COUTS_CHARGES",
        electricite: 12000,
        gasoil: 8000,
        location: 0,
        securite: 2500,
      },
    },
    coutOccasionnel: {
      create: {
        category: "COUTS_CHARGES",
        genieCivil: 200000,
        installation: 35000,
        transport: 15000,
      },
    },
    employes: {
      create: {
        category: "COUTS_CHARGES",
        responsableNb: 1,
        responsableCout: 12000,
        centralistesNb: 2,
        centralistesCout: 18000,
      },
    },
    autresCouts: {
      create: {
        category: "COUTS_CHARGES",
        label: "Assurance",
        unite: "MOIS",
        valeur: 1500,
      },
    },
    formules: { create: { category: "FORMULES" } },
    majorations: { create: { category: "DEVIS" } },
    devis: { create: { category: "DEVIS", surcharge: 0 } },
  };
}

async function resetDb() {
  // Enfants -> parents (SQLite + FK)
  await prisma.sectionDevis.deleteMany();
  await prisma.sectionMajorations.deleteMany();
  await prisma.sectionFormules.deleteMany();
  await prisma.sectionAutresCouts.deleteMany();
  await prisma.sectionEmployes.deleteMany();
  await prisma.sectionCoutOccasionnel.deleteMany();
  await prisma.sectionCoutMensuel.deleteMany();
  await prisma.sectionCoutM3.deleteMany();
  await prisma.sectionMaintenance.deleteMany();
  await prisma.sectionCab.deleteMany();
  await prisma.sectionTransport.deleteMany();
  await prisma.sectionMatierePremiere.deleteMany();

  await prisma.variant.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.pnl.deleteMany();

  // Optionnel : catalogues
  await prisma.mpCatalogue.deleteMany();
  await prisma.formuleCatalogue.deleteMany();
}

async function seedCatalogues() {
  await prisma.mpCatalogue.createMany({
    data: [
      {
        categorie: "Ciment",
        label: "CPJ 45",
        unite: "T",
        prix: 1250,
        fournisseur: "Fournisseur A",
        city: "Salé",
        region: "Rabat-Salé-Kénitra",
        comment: "Prix indicatif",
      },
      {
        categorie: "Granulat",
        label: "G 8/16",
        unite: "T",
        prix: 180,
        fournisseur: "Carrière B",
        city: "Témara",
        region: "Rabat-Salé-Kénitra",
        comment: null,
      },
    ],
  });

  await prisma.formuleCatalogue.createMany({
    data: [
      {
        label: "B25",
        resistance: "25 MPa",
        city: "Salé",
        region: "Rabat-Salé-Kénitra",
        comment: "Formule standard",
      },
      {
        label: "B30",
        resistance: "30 MPa",
        city: "Salé",
        region: "Rabat-Salé-Kénitra",
        comment: null,
      },
    ],
  });
}

async function seedPnls() {
  // PnL 1 : CAB_FIXE_NOUVELLE (2 contrats)
  await prisma.pnl.create({
    data: {
      title: "P&L — CAB fixe nouvelle (Salé)",
      model: "CAB_FIXE_NOUVELLE",
      client: "Client A",
      status: "ENCOURS",
      city: "Salé",
      region: "Rabat-Salé-Kénitra",
      contracts: {
        create: [
          {
            cab: "LHM",
            installation: "PRESTATAIRE",
            genieCivil: "CLIENT",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "CLIENT",
            maintenance: "LHM",
            chargeuse: "LOCATION",
            branchementEau: "CLIENT",
            consoEau: "CLIENT",
            branchementElec: "CLIENT",
            consoElec: "CLIENT",

            postes: 2,
            sundayPrice: 0,
            delayPenalty: 5000,
            chillerRent: 2500,

            variants: {
              create: [
                {
                  title: "Variante 1 — Baseline",
                  description: "Hypothèses standard",
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
                {
                  title: "Variante 2 — Optimisation coûts",
                  description: "Optimisation énergie/transport",
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
              ],
            },
          },
          {
            cab: "LHM",
            installation: "PRESTATAIRE",
            genieCivil: "CLIENT",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "CLIENT",
            maintenance: "LHM",
            chargeuse: "LOCATION",
            branchementEau: "CLIENT",
            consoEau: "CLIENT",
            branchementElec: "CLIENT",
            consoElec: "CLIENT",

            postes: 3,
            sundayPrice: 0,
            delayPenalty: 8000,
            chillerRent: 3000,

            variants: {
              create: [
                {
                  title: "Variante 1 — Production élevée",
                  description: "Plus de postes / volume",
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
              ],
            },
          },
        ],
      },
    },
  });

  // PnL 2 : CAB_MOBILE_CLIENT (1 contrat, 3 variantes)
  await prisma.pnl.create({
    data: {
      title: "P&L — CAB mobile (Client B)",
      model: "CAB_MOBILE_CLIENT",
      client: "Client B",
      status: "ENCOURS",
      city: "Kénitra",
      region: "Rabat-Salé-Kénitra",
      contracts: {
        create: [
          {
            cab: "CLIENT",
            installation: "CLIENT",
            genieCivil: "CLIENT",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "CLIENT",
            maintenance: "CLIENT",
            chargeuse: "CLIENT",
            branchementEau: "CLIENT",
            consoEau: "CLIENT",
            branchementElec: "CLIENT",
            consoElec: "CLIENT",

            postes: 1,
            sundayPrice: 0,
            delayPenalty: 0,
            chillerRent: 0,

            variants: {
              create: [
                {
                  title: "Variante 1 — Standard",
                  description: null,
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
                {
                  title: "Variante 2 — Avec majorations",
                  description: "Inclut majorations devis",
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
                {
                  title: "Variante 3 — Scénario conservateur",
                  description: "Marge sécurité",
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
              ],
            },
          },
        ],
      },
    },
  });

  // PnL 3 : CAB_MOBILE_CLIENT (2 contrats)
  await prisma.pnl.create({
    data: {
      title: "P&L — CAB mobile (Client C)",
      model: "CAB_MOBILE_CLIENT",
      client: "Client C",
      status: "ENCOURS",
      city: "Rabat",
      region: "Rabat-Salé-Kénitra",
      contracts: {
        create: [
          {
            cab: "CLIENT",
            installation: "PRESTATAIRE",
            genieCivil: "CLIENT",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "CLIENT",
            maintenance: "CLIENT",
            chargeuse: "CLIENT",
            branchementEau: "CLIENT",
            consoEau: "CLIENT",
            branchementElec: "CLIENT",
            consoElec: "CLIENT",

            postes: 1,
            sundayPrice: 0,
            delayPenalty: 0,
            chillerRent: 0,

            variants: {
              create: [
                {
                  title: "Variante 1 — Démarrage rapide",
                  description: "Installation prestataire",
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
              ],
            },
          },
          {
            cab: "CLIENT",
            installation: "CLIENT",
            genieCivil: "CLIENT",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "CLIENT",
            maintenance: "CLIENT",
            chargeuse: "CLIENT",
            branchementEau: "CLIENT",
            consoEau: "CLIENT",
            branchementElec: "CLIENT",
            consoElec: "CLIENT",

            postes: 2,
            sundayPrice: 0,
            delayPenalty: 0,
            chillerRent: 0,

            variants: {
              create: [
                {
                  title: "Variante 1 — 2 postes",
                  description: null,
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
                {
                  title: "Variante 2 — 2 postes + coûts renforcés",
                  description: null,
                  status: "INITIALISEE",
                  ...sectionsAll(),
                },
              ],
            },
          },
        ],
      },
    },
  });
}

async function main() {
  await resetDb();
  await seedCatalogues();
  await seedPnls();
  console.log("✅ Seed terminé : 3 PnL + contrats + variantes + sections.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
