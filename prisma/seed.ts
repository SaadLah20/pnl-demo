// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  transportPrixMoyen: number;
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

  formules: Array<{ formuleId: string; volumeM3: number; momd: number }>;
};

async function resetAll() {
  // enfants -> parents
  await prisma.variantFormule.deleteMany();
  await prisma.variantMp.deleteMany();

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

  // ✅ reset catalogues aussi
  await prisma.formuleCatalogueItem.deleteMany();
  await prisma.formuleCatalogue.deleteMany();
  await prisma.mpCatalogue.deleteMany();
}

async function upsertFixedCatalogues() {
  // =========================
  // 1) MP CATALOGUE (prix en DH/tonne)
  // =========================
  const city = "Nador";
  const region = "ORIENTALE";

  const mpCiment = await prisma.mpCatalogue.create({
    data: {
      categorie: "CIMENT",
      label: "Ciment normal CPJ55",
      unite: "t",
      prix: 1280,
      fournisseur: "LH FES",
      city,
      region,
      comment: "LH FES",
    },
  });

  const mpG1 = await prisma.mpCatalogue.create({
    data: {
      categorie: "GRANULAS",
      label: "G1 – 4/10",
      unite: "t",
      prix: 80,
      fournisseur: "Achghal ACHARK",
      city,
      region,
      comment: "Achghal ACHARK",
    },
  });

  const mpG2 = await prisma.mpCatalogue.create({
    data: {
      categorie: "GRANULAS",
      label: "G2 – 10/20",
      unite: "t",
      prix: 80,
      fournisseur: "Achghal ACHARK",
      city,
      region,
      comment: "Achghal ACHARK",
    },
  });

  const mpSableConc = await prisma.mpCatalogue.create({
    data: {
      categorie: "GRANULAS",
      label: "Sable concassée – 0/5",
      unite: "t",
      prix: 95,
      fournisseur: "Achghal ACHARK",
      city,
      region,
      comment: "Achghal ACHARK",
    },
  });

  const mpSableDune = await prisma.mpCatalogue.create({
    data: {
      categorie: "GRANULAS",
      label: "Sable de dune",
      unite: "t",
      prix: 125,
      fournisseur: "Achghal ACHARK",
      city,
      region,
      comment: "Achghal ACHARK",
    },
  });

  const mpTempo10 = await prisma.mpCatalogue.create({
    data: {
      categorie: "ADJUVANT",
      label: "TEMPO 10",
      unite: "t",
      prix: 13000,
      fournisseur: "SIKA",
      city,
      region,
      comment: "SIKA",
    },
  });

  const mpByLabel = {
    "Ciment normal CPJ55": mpCiment,
    "G1 – 4/10": mpG1,
    "G2 – 10/20": mpG2,
    "Sable concassée – 0/5": mpSableConc,
    "Sable de dune": mpSableDune,
    "TEMPO 10": mpTempo10,
  } as const;

  // =========================
  // 2) FORMULES CATALOGUE + COMPOSITION (qty en Kg / m³)
  // =========================
  await prisma.formuleCatalogue.createMany({
    data: [
      {
        label: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3",
        resistance: "C40/50",
        city,
        region,
        comment: "",
      },
      {
        label: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3",
        resistance: "C35/45",
        city,
        region,
        comment: "",
      },
      {
        label: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3",
        resistance: "C30/37",
        city,
        region,
        comment: "",
      },
      { label: "BSS", resistance: "BSS", city, region, comment: "" },
      {
        label: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3",
        resistance: "C25/30",
        city,
        region,
        comment: "",
      },
      { label: "GBA/DBA C30/37", resistance: "C30/37", city, region, comment: "" },
      { label: "BPS NM EN 206 C20/25 D20 CL0.4 S3", resistance: "C20/25", city, region, comment: "" },
      { label: "BPE Béton de remplissage", resistance: "BPE", city, region, comment: "" },
    ],
  });

  // re-fetch ids in one shot
  const forms = await prisma.formuleCatalogue.findMany({ orderBy: { label: "asc" } });
  const byLabel = (label: string) => {
    const x = forms.find((z) => z.label === label);
    if (!x) throw new Error(`Formule catalogue introuvable: ${label}`);
    return x;
  };

  const comp: Array<{ formuleLabel: string; mpLabel: keyof typeof mpByLabel; qtyKg: number }> = [
    // a) C40/50
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 400 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 458 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 552 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 580 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 245 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 4 },

    // b) C35/45
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 380 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 400 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 540 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 730 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 195 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 4.94 },

    // c) C30/37 XS1
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 350 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 468 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 564 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 593 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 250 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 4.2 },

    // d) BSS
    { formuleLabel: "BSS", mpLabel: "Ciment normal CPJ55", qtyKg: 300 },
    { formuleLabel: "BSS", mpLabel: "G1 – 4/10", qtyKg: 479 },
    { formuleLabel: "BSS", mpLabel: "G2 – 10/20", qtyKg: 558 },
    { formuleLabel: "BSS", mpLabel: "Sable concassée – 0/5", qtyKg: 620 },
    { formuleLabel: "BSS", mpLabel: "Sable de dune", qtyKg: 261 },
    { formuleLabel: "BSS", mpLabel: "TEMPO 10", qtyKg: 1.5 },

    // e) C25/30
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 315 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 476 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 573 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 602 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 254 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 3.5 },

    // f) GBA/DBA
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "Ciment normal CPJ55", qtyKg: 400 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "G1 – 4/10", qtyKg: 410 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "G2 – 10/20", qtyKg: 580 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "Sable concassée – 0/5", qtyKg: 655 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "Sable de dune", qtyKg: 230 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "TEMPO 10", qtyKg: 4 },

    // g) C20/25
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 280 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 484 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 564 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 620 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 264 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 2.8 },

    // h) BPE
    { formuleLabel: "BPE Béton de remplissage", mpLabel: "Ciment normal CPJ55", qtyKg: 250 },
    { formuleLabel: "BPE Béton de remplissage", mpLabel: "G1 – 4/10", qtyKg: 490 },
    { formuleLabel: "BPE Béton de remplissage", mpLabel: "G2 – 10/20", qtyKg: 571 },
    { formuleLabel: "BPE Béton de remplissage", mpLabel: "Sable concassée – 0/5", qtyKg: 634 },
    { formuleLabel: "BPE Béton de remplissage", mpLabel: "Sable de dune", qtyKg: 268 },
    { formuleLabel: "BPE Béton de remplissage", mpLabel: "TEMPO 10", qtyKg: 2.8 },
  ];

  await prisma.formuleCatalogueItem.createMany({
    data: comp.map((x) => ({
      formuleId: byLabel(x.formuleLabel).id,
      mpId: mpByLabel[x.mpLabel].id,
      qty: x.qtyKg, // ✅ Kg / m³
    })),
  });

  return {
    mps: mpByLabel,
    formsByLabel: byLabel,
  };
}

async function createFullVariant(variantId: string, cfg: VariantConfig) {
  const CAT_LOG = "LOGISTIQUE_APPRO";
  const CAT_FORM = "FORMULES";
  const CAT_COST = "COUTS_CHARGES";
  const CAT_DEVIS = "DEVIS";

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

  // ✅ IMPORTANT : ne pas créer VariantMp ici (auto-sync via backend)
}

async function seed() {
  await resetAll();

  // ✅ catalogues fixes
  const { formsByLabel } = await upsertFixedCatalogues();

  // =========================
  // P&L #1 EXACT (données fournies)
  // =========================
  const contract1: ContractSeed = {
    dureeMois: 24,
    cab: "LHM",
    installation: "LHM",
    genieCivil: "LHM",
    transport: "LHM",
    terrain: "CLIENT",
    matierePremiere: "LHM",
    maintenance: "LHM",
    chargeuse: "LHM",
    branchementEau: "CLIENT",
    consoEau: "LHM",
    branchementElec: "LHM",
    consoElec: "CLIENT",
    postes: 1,
    sundayPrice: 5000,
    delayPenalty: 150000,
    chillerRent: 150000,
  };

  const pnl1 = await prisma.pnl.create({
    data: {
      title: "ADM Autoroute Guercif-Nador LOTS 2-2 et 2-3",
      model: "CAB_FIXE_NOUVELLE",
      client: "SBTX",
      status: "ENCOURS",
      startDate: new Date("2026-02-01"),
      city: "Nador",
      region: "ORIENTAL",
      contracts: { create: [contract1] },
    },
    include: { contracts: true },
  });

  const c1 = pnl1.contracts[0];

  const v1 = await prisma.variant.create({
    data: {
      title: "Terrain d’AFSOU",
      description: "Centrale LHM et Terrain Client",
      status: "INITIALISEE",
      contractId: c1.id,
    },
  });

  const cfg1: VariantConfig = {
    title: v1.title,
    description: v1.description ?? "",
    status: "INITIALISEE",

    transportPrixMoyen: 79.6,
    volumePompePct: 0,
    prixAchatPompe: 0,
    prixVentePompe: 0,

    cabEtat: "NEUVE",
    cabMode: "ACHAT",
    cabCapacite: 2.0,
    cabAmortMois: 30000,

    // total maintenance = 12000
    maintenance: { cab: 3000, elec: 2500, chargeur: 1500, generale: 2000, bassins: 1000, preventive: 2000 },

    coutM3: { eau: 3, qualite: 2, dechets: 1.75 },

    // total cout mensuel = 74370
    coutMensuel: { electricite: 42000, gasoil: 15000, location: 12000, securite: 5370 },

    coutOccasionnel: { genieCivil: 1200000, installation: 580000, transport: 0 },

    // total employes mensuel = 77560 (1*25000 + 4*13140)
    employes: { responsableNb: 1, responsableCout: 25000, centralistesNb: 4, centralistesCout: 13140 },

    autresCouts: [
      { label: "Frais généraux", unite: "POURCENT_CA", valeur: 6 },
      { label: "Location chargeurse", unite: "MOIS", valeur: 22000 },
    ],

    devisSurcharge: 0,
    withMajorations: false,

    formules: [
      { formuleId: formsByLabel("BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3").id, volumeM3: 3200, momd: 244 },
      { formuleId: formsByLabel("BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3").id, volumeM3: 3600, momd: 220 },
      { formuleId: formsByLabel("BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3").id, volumeM3: 18500, momd: 222 },
      { formuleId: formsByLabel("BSS").id, volumeM3: 2500, momd: 222 },
      { formuleId: formsByLabel("BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3").id, volumeM3: 2000, momd: 224 },
      { formuleId: formsByLabel("GBA/DBA C30/37").id, volumeM3: 10000, momd: 280 },
      { formuleId: formsByLabel("BPS NM EN 206 C20/25 D20 CL0.4 S3").id, volumeM3: 11300, momd: 239 },
      { formuleId: formsByLabel("BPE Béton de remplissage").id, volumeM3: 3200, momd: 201 },
    ],
  };

  await createFullVariant(v1.id, cfg1);

  // =========================
  // P&L #2 / #3 (optionnels, minimalistes pour tests)
  // =========================
  const pnl2 = await prisma.pnl.create({
    data: {
      title: "PNL Test Casablanca",
      model: "CAB_FIXE_EXISTANT",
      client: "Client Test",
      status: "ENCOURS",
      startDate: new Date("2026-03-01"),
      city: "Casablanca",
      region: "CASA",
      contracts: {
        create: [
          {
            dureeMois: 12,
            cab: "LHM",
            installation: "LHM",
            genieCivil: "CLIENT",
            transport: "LHM",
            terrain: "CLIENT",
            matierePremiere: "LHM",
            maintenance: "LHM",
            chargeuse: "LHM",
            branchementEau: "CLIENT",
            consoEau: "LHM",
            branchementElec: "CLIENT",
            consoElec: "LHM",
            postes: 1,
            sundayPrice: 0,
            delayPenalty: 20000,
            chillerRent: 0,
          },
        ],
      },
    },
    include: { contracts: true },
  });

  const v2 = await prisma.variant.create({
    data: {
      title: "Variante Base",
      description: "Seed test",
      status: "INITIALISEE",
      contractId: pnl2.contracts[0].id,
    },
  });

  await createFullVariant(v2.id, {
    title: v2.title,
    transportPrixMoyen: 65,
    volumePompePct: 0,
    prixAchatPompe: 0,
    prixVentePompe: 0,
    cabEtat: "NEUVE",
    cabMode: "ACHAT",
    cabCapacite: 2.0,
    cabAmortMois: 25000,
    maintenance: { cab: 2000, elec: 1500, chargeur: 1000, generale: 1500, bassins: 800, preventive: 1200 },
    coutM3: { eau: 2.2, qualite: 1.2, dechets: 0.8 },
    coutMensuel: { electricite: 30000, gasoil: 9000, location: 0, securite: 4000 },
    coutOccasionnel: { genieCivil: 250000, installation: 120000, transport: 0 },
    employes: { responsableNb: 1, responsableCout: 18000, centralistesNb: 2, centralistesCout: 9000 },
    autresCouts: [{ label: "Frais généraux", unite: "POURCENT_CA", valeur: 6 }],
    devisSurcharge: 0,
    withMajorations: false,
    formules: [
      { formuleId: formsByLabel("BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3").id, volumeM3: 8000, momd: 220 },
      { formuleId: formsByLabel("BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3").id, volumeM3: 4000, momd: 210 },
    ],
  });

  console.log("✅ Seed OK: catalogues fixes + P&L #1 (SBTX) alimenté");
}

seed()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
