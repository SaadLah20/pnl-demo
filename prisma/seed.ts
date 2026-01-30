// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function rand(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}
function randi(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function resetBusinessDataOnly() {
  // enfants -> parents
  await prisma.variantFormule.deleteMany();
  await prisma.variantMp.deleteMany();

  await prisma.formuleCatalogueItem.deleteMany(); // ❌ non (si tu veux garder le catalogue)
  // ✅ on ne touche PAS aux catalogues => donc on ne delete PAS FormuleCatalogueItem !
  // ==> Cette ligne doit rester commentée/supprimée.

  await prisma.autreCoutItem.deleteMany();
  await prisma.sectionAutresCouts.deleteMany();

  await prisma.sectionDevis.deleteMany();
  await prisma.sectionMajorations.deleteMany();
  await prisma.sectionFormules.deleteMany();
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
}

async function ensureCataloguesExist() {
  const mpCount = await prisma.mpCatalogue.count();
  const fCount = await prisma.formuleCatalogue.count();
  const compCount = await prisma.formuleCatalogueItem.count();

  if (mpCount === 0 || fCount === 0 || compCount === 0) {
    throw new Error(
      "Catalogues MP/Formules vides (ou composition vide). Lance d'abord ton seed catalogues."
    );
  }
}

async function pickCatalogueRefs() {
  const mps = await prisma.mpCatalogue.findMany({ orderBy: { categorie: "asc" } });
  const forms = await prisma.formuleCatalogue.findMany({ orderBy: { label: "asc" } });

  const findMp = (q: string) =>
    mps.find((x) => (x.label ?? "").toLowerCase().includes(q.toLowerCase())) ?? mps[0];

  const findForm = (q: string) =>
    forms.find((x) => (x.label ?? "").toLowerCase().includes(q.toLowerCase())) ?? forms[0];

  // essayer de matcher tes libellés
  const mpCiment = findMp("ciment");
  const mpSable = findMp("sable");
  const mpG1 = findMp("g1");
  const mpG2 = findMp("g2");
  const mpSp = findMp("super");

  const f1 = findForm("b25");
  const f2 = findForm("b30");
  const f3 = findForm("b35");

  return { mpCiment, mpSable, mpG1, mpG2, mpSp, f1, f2, f3 };
}

type ContractSeed = {
  dureeMois: number;
  cab: string;
  installation: string;
  genieCivil: string;
  transport: string;
  terrain: string;
  matierePremiere: string;
  maintenance: string;
  chargeuse: string;
  branchementEau: string;
  consoEau: string;
  branchementElec: string;
  consoElec: string;

  postes: number;
  sundayPrice: number;
  delayPenalty: number;
  chillerRent: number;
};

type VariantConfig = {
  title: string;
  description?: string;
  status?: string;

  transportPrixMoyen: number; // ✅ obligatoire
  volumePompePct: number;
  prixAchatPompe: number;
  prixVentePompe: number;

  cabEtat: string;
  cabMode: string;
  cabCapacite: number;
  cabAmortMois: number;

  maintenance: {
    cab: number;
    elec: number;
    chargeur: number;
    generale: number;
    bassins: number;
    preventive: number;
  };

  coutM3: { eau: number; qualite: number; dechets: number };
  coutMensuel: { electricite: number; gasoil: number; location: number; securite: number };
  coutOccasionnel: { genieCivil: number; installation: number; transport: number };

  employes: {
    responsableNb: number;
    responsableCout: number;
    centralistesNb: number;
    centralistesCout: number;
  };

  autresCouts: Array<{ label: string; unite: string; valeur: number }>;

  devisSurcharge: number;
  withMajorations: boolean;

  // formules variant
  formules: Array<{ formuleId: string; volumeM3: number; momd: number }>;
};

async function createFullVariant(variantId: string, cfg: VariantConfig) {
  const CAT_LOG = "LOGISTIQUE_APPRO";
  const CAT_FORM = "FORMULES";
  const CAT_COST = "COUTS_CHARGES";
  const CAT_DEVIS = "DEVIS";

  // 1) sections 1:1
  await prisma.sectionTransport.create({
    data: {
      variantId,
      category: CAT_LOG,
      type: "MOYENNE",
      prixMoyen: cfg.transportPrixMoyen,
      volumePompePct: cfg.volumePompePct,
      prixAchatPompe: cfg.prixAchatPompe,
      prixVentePompe: cfg.prixVentePompe,
    },
  });

  await prisma.sectionCab.create({
    data: {
      variantId,
      category: CAT_LOG,
      etat: cfg.cabEtat,
      mode: cfg.cabMode,
      capaciteM3: cfg.cabCapacite,
      amortMois: cfg.cabAmortMois,
    },
  });

  await prisma.sectionMaintenance.create({ data: { variantId, category: CAT_COST, ...cfg.maintenance } });
  await prisma.sectionCoutM3.create({ data: { variantId, category: CAT_COST, ...cfg.coutM3 } });
  await prisma.sectionCoutMensuel.create({ data: { variantId, category: CAT_COST, ...cfg.coutMensuel } });
  await prisma.sectionCoutOccasionnel.create({ data: { variantId, category: CAT_COST, ...cfg.coutOccasionnel } });
  await prisma.sectionEmployes.create({ data: { variantId, category: CAT_COST, ...cfg.employes } });

  const autres = await prisma.sectionAutresCouts.create({ data: { variantId, category: CAT_COST } });
  if (cfg.autresCouts.length) {
    await prisma.autreCoutItem.createMany({
      data: cfg.autresCouts.map((it) => ({
        sectionId: autres.id,
        variantId,
        label: it.label,
        unite: it.unite,
        valeur: it.valeur,
      })),
    });
  }

  const secFor = await prisma.sectionFormules.create({ data: { variantId, category: CAT_FORM } });

  if (cfg.withMajorations) {
    await prisma.sectionMajorations.create({ data: { variantId, category: CAT_COST } });
  }

  await prisma.sectionDevis.create({
    data: { variantId, category: CAT_DEVIS, surcharge: cfg.devisSurcharge },
  });

  // 2) listes Formules (VariantFormule)
  if (cfg.formules.length) {
    await prisma.variantFormule.createMany({
      data: cfg.formules.map((f) => ({
        variantId,
        sectionId: secFor.id,
        formuleId: f.formuleId,
        volumeM3: f.volumeM3,
        momd: f.momd,
      })),
    });
  }

  // ✅ 3) IMPORTANT : ne pas créer VariantMp ici !
  // VariantMp sera auto générée via syncVariantMpsFromFormules (backend),
  // donc on laisse propre.
}

async function seed() {
  await ensureCataloguesExist();
  await resetBusinessDataOnly();

  const refs = await pickCatalogueRefs();

  const baseContracts: ContractSeed[] = [
    {
      dureeMois: 15,
      cab: "LHM",
      installation: "LHM",
      genieCivil: "CLIENT",
      transport: "LHM",
      terrain: "CLIENT",
      matierePremiere: "LHM",
      maintenance: "PARTAGE",
      chargeuse: "LHM",
      branchementEau: "CLIENT",
      consoEau: "LHM",
      branchementElec: "CLIENT",
      consoElec: "LHM",
      postes: 2,
      sundayPrice: 0,
      delayPenalty: 15000,
      chillerRent: 0,
    },
    {
      dureeMois: 12,
      cab: "LHM",
      installation: "LHM",
      genieCivil: "PARTAGE",
      transport: "LHM",
      terrain: "PARTAGE",
      matierePremiere: "LHM",
      maintenance: "LHM",
      chargeuse: "LHM",
      branchementEau: "LHM",
      consoEau: "LHM",
      branchementElec: "LHM",
      consoElec: "LHM",
      postes: 1,
      sundayPrice: 2500,
      delayPenalty: 20000,
      chillerRent: 12000,
    },
    {
      dureeMois: 18,
      cab: "EXISTANTE",
      installation: "EXISTANTE",
      genieCivil: "CLIENT",
      transport: "LHM",
      terrain: "CLIENT",
      matierePremiere: "LHM",
      maintenance: "PARTAGE",
      chargeuse: "LHM",
      branchementEau: "CLIENT",
      consoEau: "LHM",
      branchementElec: "CLIENT",
      consoElec: "LHM",
      postes: 2,
      sundayPrice: 0,
      delayPenalty: 12000,
      chillerRent: 0,
    },
    {
      dureeMois: 24,
      cab: "CLIENT",
      installation: "CLIENT",
      genieCivil: "CLIENT",
      transport: "CLIENT",
      terrain: "CLIENT",
      matierePremiere: "PRESTATAIRE",
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
    },
  ];

  // ✅ 3 PNL
  const pnl1 = await prisma.pnl.create({
    data: {
      title: "PNL Dessalement Nador - CAB dédiée",
      model: "CAB_FIXE_NOUVELLE",
      client: "Projet Dessalement (Nador)",
      status: "ENCOURS",
      startDate: new Date("2026-02-01"),
      city: "Nador",
      region: "ORIENTAL",
      contracts: { create: [baseContracts[0], baseContracts[2]] }, // 2 contrats
    },
    include: { contracts: true },
  });

  const pnl2 = await prisma.pnl.create({
    data: {
      title: "PNL Extension Industrielle - Ain Sebaâ",
      model: "CAB_FIXE_EXISTANT",
      client: "Industriel Y",
      status: "ENCOURS",
      startDate: new Date("2026-04-15"),
      city: "Casablanca",
      region: "CASA",
      contracts: { create: [baseContracts[1], baseContracts[0], baseContracts[2]] }, // 3 contrats
    },
    include: { contracts: true },
  });

  const pnl3 = await prisma.pnl.create({
    data: {
      title: "PNL Centrale Mobile - Projet Z",
      model: "CAB_MOBILE_CLIENT",
      client: "Client Z",
      status: "ENCOURS",
      startDate: new Date("2026-03-10"),
      city: "Marrakech",
      region: "MARRAKECH-SAFI",
      contracts: { create: [baseContracts[3], baseContracts[0], baseContracts[2], baseContracts[1]] }, // 4 contrats
    },
    include: { contracts: true },
  });

  const pnls = [pnl1, pnl2, pnl3];

  // ✅ variants 1..3 / contrat
  for (const p of pnls) {
    for (const c of p.contracts) {
      const vCount = randi(1, 3);

      for (let i = 0; i < vCount; i++) {
        const v = await prisma.variant.create({
          data: {
            title: i === 0 ? "Variante Base" : i === 1 ? "Variante Optim" : "Variante Prudente",
            description: "Seed réaliste + transport moyen obligatoire",
            status: "INITIALISEE",
            contractId: c.id,
          },
        });

        const volBase = randi(15000, 90000);
        const v1 = Math.round(volBase * 0.45);
        const v2 = Math.round(volBase * 0.35);
        const v3 = Math.round(volBase * 0.20);

        const cfg: VariantConfig = {
          title: v.title,
          transportPrixMoyen: 55 + i * 5, // ✅ prix moyen obligatoire
          volumePompePct: 20 + i * 5,
          prixAchatPompe: 110 + i * 3,
          prixVentePompe: 165 + i * 5,

          cabEtat: "NEUVE",
          cabMode: i === 2 ? "LOCATION" : "ACHAT",
          cabCapacite: rand(1.0, 2.5),
          cabAmortMois: rand(18000, 50000),

          maintenance: {
            cab: rand(3000, 7000),
            elec: rand(2000, 6500),
            chargeur: rand(1500, 3000),
            generale: rand(1500, 5000),
            bassins: rand(500, 2000),
            preventive: rand(1200, 4500),
          },

          coutM3: { eau: rand(1.2, 2.2), qualite: rand(0.4, 0.9), dechets: rand(0.2, 0.6) },
          coutMensuel: {
            electricite: rand(9000, 24000),
            gasoil: rand(8000, 20000),
            location: i === 2 ? rand(6000, 18000) : 0,
            securite: rand(3000, 8000),
          },
          coutOccasionnel: {
            genieCivil: rand(60000, 280000),
            installation: rand(30000, 140000),
            transport: rand(30000, 90000),
          },

          employes: {
            responsableNb: 1,
            responsableCout: rand(9000, 14000),
            centralistesNb: rand(1, 3),
            centralistesCout: rand(6500, 9500),
          },

          autresCouts: [
            { label: "Frais généraux", unite: "POURCENT_CA", valeur: rand(5, 8) },
            { label: "Marketing", unite: "MOIS", valeur: rand(2500, 8000) },
          ],

          devisSurcharge: i === 1 ? 3 : 0,
          withMajorations: true,

          formules: [
            { formuleId: refs.f1.id, volumeM3: v1, momd: 180 + i * 10 },
            { formuleId: refs.f2.id, volumeM3: v2, momd: 220 + i * 12 },
            { formuleId: refs.f3.id, volumeM3: v3, momd: 260 + i * 15 },
          ],
        };

        await createFullVariant(v.id, cfg);

        // ✅ IMPORTANT : on NE crée PAS VariantMp ici
        // VariantMp doit être auto-générée par les routes backend (syncVariantMpsFromFormules)
        // => après le seed, dès que tu modifies/ajoutes/supprimes une formule, ça se mettra à jour.
      }
    }
  }

  console.log("✅ Seed business OK (sans toucher catalogues, sans créer VariantMp)");
}

seed()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
