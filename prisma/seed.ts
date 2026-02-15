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

  coutMensuel: {
    electricite: number;
    gasoil: number;

    // ancien champ conservé
    location: number;

    // nouveaux champs
    hebergements: number;
    locationTerrain: number;
    telephone: number;
    troisG: number;
    taxeProfessionnelle: number;
    securite: number;
    locationVehicule: number;
    locationAmbulance: number;
    locationBungalows: number;
    epi: number;
  };

  coutOccasionnel: {
    genieCivil: number;
    installation: number;
    demontage: number;
    remisePointCentrale: number;
    transport: number;
    silots: number;
    localAdjuvant: number;
    bungalows: number;
  };

  employes: {
    responsableNb: number;
    responsableCout: number;
    centralistesNb: number;
    centralistesCout: number;

    manoeuvreNb: number;
    manoeuvreCout: number;

    coordinateurExploitationNb: number;
    coordinateurExploitationCout: number;

    technicienLaboNb: number;
    technicienLaboCout: number;

    femmeMenageNb: number;
    femmeMenageCout: number;

    gardienNb: number;
    gardienCout: number;

    maintenancierNb: number;
    maintenancierCout: number;

    panierRepasNb: number;
    panierRepasCout: number;
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

  // reset catalogues
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

  const forms = await prisma.formuleCatalogue.findMany({ orderBy: { label: "asc" } });
  const byLabel = (label: string) => {
    const x = forms.find((z) => z.label === label);
    if (!x) throw new Error(`Formule catalogue introuvable: ${label}`);
    return x;
  };

  const comp: Array<{ formuleLabel: string; mpLabel: keyof typeof mpByLabel; qtyKg: number }> = [
    // C40/50
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 400 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 458 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 552 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 580 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 245 },
    { formuleLabel: "BPS NM EN 206 C40/50  XS1-XC4 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 4 },

    // C35/45
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 380 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 400 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 540 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 730 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 195 },
    { formuleLabel: "BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 4.94 },

    // C30/37
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 350 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 468 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 564 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 593 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 250 },
    { formuleLabel: "BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 4.2 },

    // BSS
    { formuleLabel: "BSS", mpLabel: "Ciment normal CPJ55", qtyKg: 300 },
    { formuleLabel: "BSS", mpLabel: "G1 – 4/10", qtyKg: 479 },
    { formuleLabel: "BSS", mpLabel: "G2 – 10/20", qtyKg: 558 },
    { formuleLabel: "BSS", mpLabel: "Sable concassée – 0/5", qtyKg: 620 },
    { formuleLabel: "BSS", mpLabel: "Sable de dune", qtyKg: 261 },
    { formuleLabel: "BSS", mpLabel: "TEMPO 10", qtyKg: 1.5 },

    // C25/30
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 315 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 476 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 573 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 602 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 254 },
    { formuleLabel: "BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 3.5 },

    // GBA/DBA
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "Ciment normal CPJ55", qtyKg: 400 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "G1 – 4/10", qtyKg: 410 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "G2 – 10/20", qtyKg: 580 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "Sable concassée – 0/5", qtyKg: 655 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "Sable de dune", qtyKg: 230 },
    { formuleLabel: "GBA/DBA C30/37", mpLabel: "TEMPO 10", qtyKg: 4 },

    // C20/25
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "Ciment normal CPJ55", qtyKg: 280 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "G1 – 4/10", qtyKg: 484 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "G2 – 10/20", qtyKg: 564 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "Sable concassée – 0/5", qtyKg: 620 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "Sable de dune", qtyKg: 264 },
    { formuleLabel: "BPS NM EN 206 C20/25 D20 CL0.4 S3", mpLabel: "TEMPO 10", qtyKg: 2.8 },

    // BPE
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
      qty: x.qtyKg,
    })),
  });

  return { formsByLabel: byLabel };
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

  await prisma.sectionCoutMensuel.create({
    data: { variantId, category: CAT_COST, ...cfg.coutMensuel },
  });

  await prisma.sectionCoutOccasionnel.create({
    data: { variantId, category: CAT_COST, ...cfg.coutOccasionnel },
  });

  await prisma.sectionEmployes.create({
    data: { variantId, category: CAT_COST, ...cfg.employes },
  });

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
}

// helper 0-values
function z0() {
  return {
    coutMensuel: {
      electricite: 0,
      gasoil: 0,
      location: 0,
      hebergements: 0,
      locationTerrain: 0,
      telephone: 0,
      troisG: 0,
      taxeProfessionnelle: 0,
      securite: 0,
      locationVehicule: 0,
      locationAmbulance: 0,
      locationBungalows: 0,
      epi: 0,
    },
    coutOccasionnel: {
      genieCivil: 0,
      installation: 0,
      demontage: 0,
      remisePointCentrale: 0,
      transport: 0,
      silots: 0,
      localAdjuvant: 0,
      bungalows: 0,
    },
    employes: {
      responsableNb: 0,
      responsableCout: 0,
      centralistesNb: 0,
      centralistesCout: 0,
      manoeuvreNb: 0,
      manoeuvreCout: 0,
      coordinateurExploitationNb: 0,
      coordinateurExploitationCout: 0,
      technicienLaboNb: 0,
      technicienLaboCout: 0,
      femmeMenageNb: 0,
      femmeMenageCout: 0,
      gardienNb: 0,
      gardienCout: 0,
      maintenancierNb: 0,
      maintenancierCout: 0,
      panierRepasNb: 0,
      panierRepasCout: 0,
    },
  };
}

async function seed() {
  await resetAll();
  const { formsByLabel } = await upsertFixedCatalogues();

  // =========================
  // P&L #1 (ADM Guercif-Nador / Terrain AFSOU => identique)
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
      status: "ENCOURS",
      contractId: c1.id,
    },
  });

  const b1 = z0();

  await createFullVariant(v1.id, {
    title: v1.title,
    description: v1.description ?? "",
    status: "ENCOURS",
    transportPrixMoyen: 79.6,
    volumePompePct: 0,
    prixAchatPompe: 0,
    prixVentePompe: 0,
    cabEtat: "NEUVE",
    cabMode: "ACHAT",
    cabCapacite: 2.0,
    cabAmortMois: 30000,
    maintenance: { cab: 3000, elec: 2500, chargeur: 1500, generale: 2000, bassins: 1000, preventive: 2000 },
    coutM3: { eau: 3, qualite: 2, dechets: 1.75 },
    coutMensuel: {
      ...b1.coutMensuel,
      electricite: 42000,
      gasoil: 15000,
      location: 12000, // compat ancien champ
      securite: 5370,
    },
    coutOccasionnel: {
      ...b1.coutOccasionnel,
      genieCivil: 1200000,
      installation: 580000,
      transport: 0,
    },
    employes: {
      ...b1.employes,
      responsableNb: 1,
      responsableCout: 25000,
      centralistesNb: 4,
      centralistesCout: 13140,
    },
    autresCouts: [
      { label: "Frais généraux", unite: "POURCENT_CA", valeur: 6 },
      { label: "Location chargeuse", unite: "MOIS", valeur: 22000 },
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
  });

  // =========================
  // P&L #2 (2 contrats / 3 variantes)
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
          {
            dureeMois: 18,
            cab: "LHM",
            installation: "LHM",
            genieCivil: "LHM",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "LHM",
            maintenance: "LHM",
            chargeuse: "CLIENT",
            branchementEau: "CLIENT",
            consoEau: "LHM",
            branchementElec: "CLIENT",
            consoElec: "LHM",
            postes: 2,
            sundayPrice: 2500,
            delayPenalty: 50000,
            chillerRent: 60000,
          },
        ],
      },
    },
    include: { contracts: true },
  });

  const c2a = pnl2.contracts[0];
  const v2a = await prisma.variant.create({
    data: { title: "Variante Base", description: "Seed test", status: "ENCOURS", contractId: c2a.id },
  });

  const b2a = z0();
  await createFullVariant(v2a.id, {
    title: v2a.title,
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
    coutMensuel: {
      ...b2a.coutMensuel,
      electricite: 30000,
      gasoil: 9000,
      securite: 4000,
      telephone: 350,
      troisG: 250,
      locationVehicule: 4500,
      epi: 600,
    },
    coutOccasionnel: {
      ...b2a.coutOccasionnel,
      genieCivil: 250000,
      installation: 120000,
      transport: 0,
      silots: 65000,
      localAdjuvant: 30000,
      bungalows: 80000,
    },
    employes: {
      ...b2a.employes,
      responsableNb: 1,
      responsableCout: 18000,
      centralistesNb: 2,
      centralistesCout: 9000,
      manoeuvreNb: 6,
      manoeuvreCout: 4500,
      gardienNb: 2,
      gardienCout: 4000,
      femmeMenageNb: 1,
      femmeMenageCout: 3200,
      panierRepasNb: 10,
      panierRepasCout: 35,
    },
    autresCouts: [{ label: "Frais généraux", unite: "POURCENT_CA", valeur: 6 }],
    devisSurcharge: 0,
    withMajorations: false,
    formules: [
      { formuleId: formsByLabel("BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3").id, volumeM3: 8000, momd: 220 },
      { formuleId: formsByLabel("BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3").id, volumeM3: 4000, momd: 210 },
    ],
  });

  const c2b = pnl2.contracts[1];

  const v2b1 = await prisma.variant.create({
    data: { title: "Variante Optimisée", description: "CAB achat + volume", status: "ENCOURS", contractId: c2b.id },
  });

  const b2b1 = z0();
  await createFullVariant(v2b1.id, {
    title: v2b1.title,
    transportPrixMoyen: 58,
    volumePompePct: 0.25,
    prixAchatPompe: 180,
    prixVentePompe: 260,
    cabEtat: "NEUVE",
    cabMode: "ACHAT",
    cabCapacite: 2.5,
    cabAmortMois: 28000,
    maintenance: { cab: 2500, elec: 1800, chargeur: 1200, generale: 1600, bassins: 900, preventive: 1500 },
    coutM3: { eau: 2.5, qualite: 1.5, dechets: 1.0 },
    coutMensuel: {
      ...b2b1.coutMensuel,
      electricite: 36000,
      gasoil: 11000,
      location: 8000,
      locationTerrain: 6000,
      securite: 4500,
      telephone: 400,
      troisG: 300,
      taxeProfessionnelle: 1200,
      hebergements: 9000,
      locationVehicule: 6000,
      locationBungalows: 2500,
      epi: 900,
    },
    coutOccasionnel: {
      ...b2b1.coutOccasionnel,
      genieCivil: 450000,
      installation: 220000,
      transport: 90000,
      demontage: 65000,
      remisePointCentrale: 30000,
      silots: 90000,
      localAdjuvant: 40000,
      bungalows: 120000,
    },
    employes: {
      ...b2b1.employes,
      responsableNb: 1,
      responsableCout: 22000,
      centralistesNb: 3,
      centralistesCout: 9500,
      manoeuvreNb: 8,
      manoeuvreCout: 5000,
      coordinateurExploitationNb: 1,
      coordinateurExploitationCout: 14000,
      technicienLaboNb: 1.5,
      technicienLaboCout: 9000,
      gardienNb: 3,
      gardienCout: 4200,
      maintenancierNb: 1,
      maintenancierCout: 11000,
      panierRepasNb: 20,
      panierRepasCout: 35,
    },
    autresCouts: [
      { label: "Frais généraux", unite: "POURCENT_CA", valeur: 5.5 },
      { label: "Location chargeuse", unite: "MOIS", valeur: 18000 },
    ],
    devisSurcharge: 0,
    withMajorations: false,
    formules: [
      { formuleId: formsByLabel("BPS NM EN 206 C35/45  XS1-XC4 D20  CL0.4 S3").id, volumeM3: 6500, momd: 215 },
      { formuleId: formsByLabel("BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3").id, volumeM3: 12000, momd: 210 },
      { formuleId: formsByLabel("BSS").id, volumeM3: 1500, momd: 205 },
    ],
  });

  const v2b2 = await prisma.variant.create({
    data: { title: "Variante Location", description: "CAB location + coûts récurrents", status: "ENCOURS", contractId: c2b.id },
  });

  const b2b2 = z0();
  await createFullVariant(v2b2.id, {
    title: v2b2.title,
    transportPrixMoyen: 62,
    volumePompePct: 0.1,
    prixAchatPompe: 190,
    prixVentePompe: 250,
    cabEtat: "EXISTANTE",
    cabMode: "LOCATION",
    cabCapacite: 2.0,
    cabAmortMois: 0,
    maintenance: { cab: 2200, elec: 1600, chargeur: 1000, generale: 1400, bassins: 850, preventive: 1300 },
    coutM3: { eau: 2.6, qualite: 1.4, dechets: 0.95 },
    coutMensuel: {
      ...b2b2.coutMensuel,
      electricite: 33000,
      gasoil: 10500,
      location: 25000,
      hebergements: 12000,
      locationTerrain: 7500,
      securite: 5200,
      telephone: 500,
      troisG: 400,
      taxeProfessionnelle: 1500,
      locationVehicule: 8000,
      locationAmbulance: 6500,
      locationBungalows: 4500,
      epi: 1200,
    },
    coutOccasionnel: {
      ...b2b2.coutOccasionnel,
      genieCivil: 200000,
      installation: 80000,
      transport: 50000,
      demontage: 25000,
      remisePointCentrale: 15000,
      localAdjuvant: 20000,
    },
    employes: {
      ...b2b2.employes,
      responsableNb: 1,
      responsableCout: 20000,
      centralistesNb: 2,
      centralistesCout: 9500,
      manoeuvreNb: 5,
      manoeuvreCout: 4800,
      technicienLaboNb: 1,
      technicienLaboCout: 8500,
      femmeMenageNb: 1,
      femmeMenageCout: 3200,
      gardienNb: 2,
      gardienCout: 4200,
      maintenancierNb: 1,
      maintenancierCout: 10500,
      panierRepasNb: 12,
      panierRepasCout: 35,
    },
    autresCouts: [{ label: "Frais généraux", unite: "POURCENT_CA", valeur: 6 }],
    devisSurcharge: 0,
    withMajorations: false,
    formules: [
      { formuleId: formsByLabel("BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3").id, volumeM3: 9000, momd: 205 },
      { formuleId: formsByLabel("BPS NM EN 206 C20/25 D20 CL0.4 S3").id, volumeM3: 6000, momd: 198 },
      { formuleId: formsByLabel("BPE Béton de remplissage").id, volumeM3: 1800, momd: 185 },
    ],
  });

  // =========================
  // P&L #3 (1 contrat / 2 variantes)
  // =========================
  const pnl3 = await prisma.pnl.create({
    data: {
      title: "PNL Test Rabat-Salé",
      model: "CAB_FIXE_NOUVELLE",
      client: "Client Public",
      status: "ENCOURS",
      startDate: new Date("2026-04-01"),
      city: "Rabat",
      region: "RABAT_SALE",
      contracts: {
        create: [
          {
            dureeMois: 9,
            cab: "LHM",
            installation: "LHM",
            genieCivil: "CLIENT",
            transport: "CLIENT",
            terrain: "CLIENT",
            matierePremiere: "LHM",
            maintenance: "LHM",
            chargeuse: "CLIENT",
            branchementEau: "CLIENT",
            consoEau: "CLIENT",
            branchementElec: "CLIENT",
            consoElec: "CLIENT",
            postes: 1,
            sundayPrice: 0,
            delayPenalty: 10000,
            chillerRent: 0,
          },
        ],
      },
    },
    include: { contracts: true },
  });

  const c3 = pnl3.contracts[0];

  const v3a = await prisma.variant.create({
    data: { title: "Variante Compact", description: "Petit chantier", status: "ENCOURS", contractId: c3.id },
  });

  const b3a = z0();
  await createFullVariant(v3a.id, {
    title: v3a.title,
    transportPrixMoyen: 70,
    volumePompePct: 0,
    prixAchatPompe: 0,
    prixVentePompe: 0,
    cabEtat: "NEUVE",
    cabMode: "ACHAT",
    cabCapacite: 1.5,
    cabAmortMois: 18000,
    maintenance: { cab: 1500, elec: 1200, chargeur: 800, generale: 1000, bassins: 700, preventive: 900 },
    coutM3: { eau: 2.8, qualite: 1.3, dechets: 0.9 },
    coutMensuel: { ...b3a.coutMensuel, electricite: 18000, gasoil: 7000, securite: 2500, telephone: 300, troisG: 200, epi: 500 },
    coutOccasionnel: { ...b3a.coutOccasionnel, genieCivil: 120000, installation: 60000, transport: 30000, localAdjuvant: 10000 },
    employes: { ...b3a.employes, responsableNb: 1, responsableCout: 16000, centralistesNb: 1, centralistesCout: 9000, manoeuvreNb: 4, manoeuvreCout: 4200, gardienNb: 1, gardienCout: 3800, panierRepasNb: 6, panierRepasCout: 35 },
    autresCouts: [{ label: "Frais généraux", unite: "POURCENT_CA", valeur: 5 }],
    devisSurcharge: 0,
    withMajorations: false,
    formules: [
      { formuleId: formsByLabel("BPS NM EN 206 C30/37 XS1 D20 CL0.4 S3").id, volumeM3: 2500, momd: 210 },
      { formuleId: formsByLabel("BPS NM EN 206 C25/30 XS1 D20 CL0.4 S3").id, volumeM3: 1800, momd: 205 },
    ],
  });

  const v3b = await prisma.variant.create({
    data: { title: "Variante Pompage", description: "Pompage + hébergement", status: "ENCOURS", contractId: c3.id },
  });

  const b3b = z0();
  await createFullVariant(v3b.id, {
    title: v3b.title,
    transportPrixMoyen: 72,
    volumePompePct: 0.35,
    prixAchatPompe: 180,
    prixVentePompe: 260,
    cabEtat: "NEUVE",
    cabMode: "ACHAT",
    cabCapacite: 1.8,
    cabAmortMois: 20000,
    maintenance: { cab: 1700, elec: 1300, chargeur: 900, generale: 1100, bassins: 750, preventive: 950 },
    coutM3: { eau: 3.0, qualite: 1.4, dechets: 1.0 },
    coutMensuel: { ...b3b.coutMensuel, electricite: 19500, gasoil: 7800, securite: 2800, telephone: 350, troisG: 250, hebergements: 8000, locationVehicule: 3500, epi: 650 },
    coutOccasionnel: { ...b3b.coutOccasionnel, genieCivil: 140000, installation: 70000, transport: 35000, demontage: 12000, remisePointCentrale: 8000, localAdjuvant: 12000 },
    employes: { ...b3b.employes, responsableNb: 1, responsableCout: 16500, centralistesNb: 1, centralistesCout: 9200, manoeuvreNb: 5, manoeuvreCout: 4300, technicienLaboNb: 1, technicienLaboCout: 8000, femmeMenageNb: 1, femmeMenageCout: 3000, gardienNb: 1, gardienCout: 3800, panierRepasNb: 8, panierRepasCout: 35 },
    autresCouts: [{ label: "Frais généraux", unite: "POURCENT_CA", valeur: 5 }],
    devisSurcharge: 0,
    withMajorations: false,
    formules: [
      { formuleId: formsByLabel("BSS").id, volumeM3: 2000, momd: 200 },
      { formuleId: formsByLabel("BPE Béton de remplissage").id, volumeM3: 900, momd: 185 },
    ],
  });

  console.log("✅ Seed OK: 3 P&L min, contrats/variantes OK, nouveaux champs OK");
}

seed()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
