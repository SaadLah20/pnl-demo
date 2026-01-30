// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function rand(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100; // 2 décimales
}

async function resetDb() {
  // enfants -> parents (ordre important)
  await prisma.variantFormule.deleteMany();
  await prisma.variantMp.deleteMany();
  await prisma.formuleCatalogueItem.deleteMany();

  // ✅ autres coûts : items d'abord
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

  await prisma.formuleCatalogue.deleteMany();
  await prisma.mpCatalogue.deleteMany();
}

async function seedCatalogues() {
  // ---------- MP Catalogue (réaliste)
  await prisma.mpCatalogue.createMany({
    data: [
      // CIMENT
      {
        categorie: "CIMENT",
        label: "CPJ 55 - Bouskoura",
        unite: "kg",
        prix: 1.45,
        fournisseur: "LafargeHolcim",
        city: "Casablanca",
        region: "CASA",
        comment: "Livré chantier",
      },
      {
        categorie: "CIMENT",
        label: "CEM II/A-L 42.5",
        unite: "kg",
        prix: 1.32,
        fournisseur: "Ciments du Maroc",
        city: "Rabat",
        region: "RABAT-SALE",
        comment: "Livré chantier",
      },

      // GRANULATS
      {
        categorie: "GRANULATS",
        label: "Sable de dune - Kenitra 0/3",
        unite: "kg",
        prix: 0.18,
        fournisseur: "Carrière Kenitra",
        city: "Kénitra",
        region: "RABAT-SALE",
        comment: "",
      },
      {
        categorie: "GRANULATS",
        label: "Granulats G1 3/8",
        unite: "kg",
        prix: 0.2,
        fournisseur: "Carrière locale",
        city: "Rabat",
        region: "RABAT-SALE",
        comment: "",
      },
      {
        categorie: "GRANULATS",
        label: "Granulats G2 8/16",
        unite: "kg",
        prix: 0.19,
        fournisseur: "Carrière locale",
        city: "Rabat",
        region: "RABAT-SALE",
        comment: "",
      },

      // ADJUVANTS
      {
        categorie: "ADJUVANT",
        label: "Superplastifiant SP (polycarboxylate)",
        unite: "kg",
        prix: 11.5,
        fournisseur: "Sika",
        city: "Casablanca",
        region: "CASA",
        comment: "",
      },
      {
        categorie: "ADJUVANT",
        label: "Plastifiant P1",
        unite: "kg",
        prix: 7.5,
        fournisseur: "Mapei",
        city: "Casablanca",
        region: "CASA",
        comment: "",
      },

      // FIBRE / COLORANT
      { categorie: "FIBRE", label: "Fibre PP 12mm", unite: "kg", prix: 22.0, fournisseur: "Fournisseur", city: "Casablanca", region: "CASA", comment: "" },
      { categorie: "COLORANT", label: "Oxyde rouge", unite: "kg", prix: 16.0, fournisseur: "Fournisseur", city: "Casablanca", region: "CASA", comment: "" },
    ],
  });

  // ---------- Formules Catalogue
  await prisma.formuleCatalogue.createMany({
    data: [
      { label: "B25 XCA1", resistance: "C25/30", city: "Rabat", region: "RABAT-SALE", comment: "Courante" },
      { label: "B30 XCA1", resistance: "C30/37", city: "Rabat", region: "RABAT-SALE", comment: "Structure" },
      { label: "B35 XCA2", resistance: "C35/45", city: "Casablanca", region: "CASA", comment: "Exposition plus sévère" },
    ],
  });

  // ---------- Récupérer IDs MP
  const mp = await prisma.mpCatalogue.findMany();
  const findMp = (contains: string) => mp.find((x) => x.label.toLowerCase().includes(contains.toLowerCase()))!;

  const cpj55 = findMp("cpj 55");
  const cem42 = findMp("42.5");
  const sable = findMp("sable");
  const g38 = findMp("3/8");
  const g816 = findMp("8/16");
  const sp = findMp("superplastifiant");
  const p1 = findMp("plastifiant");

  // ---------- Récupérer IDs Formules
  const f = await prisma.formuleCatalogue.findMany();
  const fB25 = f.find((x) => x.label.includes("B25"))!;
  const fB30 = f.find((x) => x.label.includes("B30"))!;
  const fB35 = f.find((x) => x.label.includes("B35"))!;

  // ---------- Composition (qty par m3) : UPSERT (pas de doublons)
  async function upsertItem(formuleId: string, mpId: string, qty: number) {
    await prisma.formuleCatalogueItem.upsert({
      where: { formuleId_mpId: { formuleId, mpId } }, // nécessite @@unique([formuleId, mpId])
      create: { formuleId, mpId, qty },
      update: { qty },
    });
  }

  // B25 XCA1
  await upsertItem(fB25.id, cpj55.id, 300);
  await upsertItem(fB25.id, sable.id, 750);
  await upsertItem(fB25.id, g38.id, 450);
  await upsertItem(fB25.id, g816.id, 500);
  await upsertItem(fB25.id, sp.id, 3.5);

  // B30 XCA1
  await upsertItem(fB30.id, cpj55.id, 340);
  await upsertItem(fB30.id, sable.id, 720);
  await upsertItem(fB30.id, g38.id, 460);
  await upsertItem(fB30.id, g816.id, 520);
  await upsertItem(fB30.id, sp.id, 4.0);

  // B35 XCA2
  await upsertItem(fB35.id, cem42.id, 380);
  await upsertItem(fB35.id, sable.id, 700);
  await upsertItem(fB35.id, g38.id, 480);
  await upsertItem(fB35.id, g816.id, 540);
  await upsertItem(fB35.id, p1.id, 3.0);
  await upsertItem(fB35.id, sp.id, 2.0);

  return { cpj55, cem42, sable, g38, g816, sp, p1, fB25, fB30, fB35 };
}

async function seedPnls() {
  const pnl1 = await prisma.pnl.create({
    data: {
      title: "PNL Résidence Al Amal (Salé)",
      model: "CAB_FIXE_EXISTANT",
      client: "Promo Immobilier X",
      status: "ENCOURS",
      startDate: new Date("2026-03-01"),
      city: "Salé",
      region: "RABAT-SALE",
      contracts: {
        create: [
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
            delayPenalty: 15000,
            chillerRent: 0,
            variants: {
              create: [
                { title: "Variante Base", status: "INITIALISEE", description: "Hypothèses standard" },
                { title: "Variante Optim Transport", status: "INITIALISEE", description: "Pompe + optimisation logistique" },
              ],
            },
          },
        ],
      },
    },
    include: { contracts: { include: { variants: true } } },
  });

  const pnl2 = await prisma.pnl.create({
    data: {
      title: "PNL Extension Industrielle Aïn Sebaâ",
      model: "CAB_FIXE_NOUVELLE",
      client: "Industriel Y",
      status: "ENCOURS",
      startDate: new Date("2026-04-15"),
      city: "Casablanca",
      region: "CASA",
      contracts: {
        create: [
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
            variants: {
              create: [
                { title: "Variante Achat CAB", status: "INITIALISEE", description: "CAB neuve achat" },
                { title: "Variante Location CAB", status: "INITIALISEE", description: "CAB neuve location" },
              ],
            },
          },
        ],
      },
    },
    include: { contracts: { include: { variants: true } } },
  });

  const pnl3 = await prisma.pnl.create({
    data: {
      title: "PNL Centrale Mobile - Projet Z",
      model: "CAB_MOBILE_CLIENT",
      client: "Client Z",
      status: "PERDU",
      startDate: new Date("2026-02-01"),
      city: "Marrakech",
      region: "MARRAKECH-SAFI",
      contracts: {
        create: [
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
            variants: {
              create: [{ title: "Variante Base", status: "INITIALISEE", description: "Cas standard (mobile)" }],
            },
          },
        ],
      },
    },
    include: { contracts: { include: { variants: true } } },
  });

  return [pnl1, pnl2, pnl3];
}

type VariantSeedConfig = {
  transport: {
    type: "MOYENNE" | "PAR_ZONE";
    prixMoyen: number | null;
    volumePompePct: number | null; // %
    prixAchatPompe: number | null; // DH/m3 pompé
    prixVentePompe: number | null; // DH/m3 pompé
  };
  cab: {
    etat: string;
    mode: string;
    capaciteM3: number;
    amortMois: number; // DH/mois
  };
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
  employes: { responsableNb: number; responsableCout: number; centralistesNb: number; centralistesCout: number };

  // ✅ autresCouts items
  fgPct: number; // 5-7%
  marketingMensuel: number; // DH/mois (exemple)

  devis: { surcharge: number };
  majorations: boolean;

  withMp: boolean;
  withFormules: boolean;

  // volumes / momd de la variante
  volumes: { b25: number; b30: number; b35: number };
  momd: { b25: number; b30: number; b35: number };
};

async function seedSectionsForVariant(variantId: string, cfg: VariantSeedConfig) {
  const CAT_LOG = "LOGISTIQUE_APPRO";
  const CAT_FORM = "FORMULES";
  const CAT_COST = "COUTS_CHARGES";
  const CAT_DEVIS = "DEVIS";

  await prisma.sectionMatierePremiere.create({ data: { variantId, category: CAT_LOG } });

  await prisma.sectionTransport.create({
    data: {
      variantId,
      category: CAT_LOG,
      type: cfg.transport.type,
      prixMoyen: cfg.transport.prixMoyen,
      volumePompePct: cfg.transport.volumePompePct,
      prixAchatPompe: cfg.transport.prixAchatPompe,
      prixVentePompe: cfg.transport.prixVentePompe,
    },
  });

  await prisma.sectionCab.create({
    data: {
      variantId,
      category: CAT_LOG,
      etat: cfg.cab.etat,
      mode: cfg.cab.mode,
      capaciteM3: cfg.cab.capaciteM3,
      amortMois: cfg.cab.amortMois,
    },
  });

  await prisma.sectionMaintenance.create({ data: { variantId, category: CAT_COST, ...cfg.maintenance } });
  await prisma.sectionCoutM3.create({ data: { variantId, category: CAT_COST, ...cfg.coutM3 } });
  await prisma.sectionCoutMensuel.create({ data: { variantId, category: CAT_COST, ...cfg.coutMensuel } });
  await prisma.sectionCoutOccasionnel.create({ data: { variantId, category: CAT_COST, ...cfg.coutOccasionnel } });
  await prisma.sectionEmployes.create({ data: { variantId, category: CAT_COST, ...cfg.employes } });

  // ✅ Section AutresCouts (vide structurellement, mais items créés dans table dédiée)
  const autres = await prisma.sectionAutresCouts.create({
    data: { variantId, category: CAT_COST },
  });

  await prisma.autreCoutItem.createMany({
    data: [
      {
        sectionId: autres.id,
        variantId,
        label: "Frais généraux",
        unite: "POURCENT_CA",
        valeur: cfg.fgPct,
      },
      {
        sectionId: autres.id,
        variantId,
        label: "Marketing",
        unite: "MOIS",
        valeur: cfg.marketingMensuel,
      },
    ],
  });

  await prisma.sectionFormules.create({ data: { variantId, category: CAT_FORM } });

  if (cfg.majorations) {
    await prisma.sectionMajorations.create({ data: { variantId, category: CAT_COST } });
  }

  await prisma.sectionDevis.create({ data: { variantId, category: CAT_DEVIS, surcharge: cfg.devis.surcharge } });
}

async function seedVariantLists(pnls: any[], refs: any) {
  const configByTitle: Record<string, VariantSeedConfig> = {
    "Variante Base": {
      transport: { type: "MOYENNE", prixMoyen: 68, volumePompePct: 20, prixAchatPompe: 110, prixVentePompe: 160 },
      cab: { etat: "NEUVE", mode: "ACHAT", capaciteM3: 1.5, amortMois: 19000 },
      maintenance: { cab: 4500, elec: 2500, chargeur: 1800, generale: 2200, bassins: 1200, preventive: 1600 },
      coutM3: { eau: 1.8, qualite: 0.6, dechets: 0.4 },
      coutMensuel: { electricite: 12000, gasoil: 9000, location: 6500, securite: 4800 },
      coutOccasionnel: { genieCivil: 180000, installation: 90000, transport: 65000 },
      employes: { responsableNb: 1, responsableCout: 9500, centralistesNb: 2, centralistesCout: 7200 },
      fgPct: rand(5, 7),
      marketingMensuel: rand(3000, 6000),
      devis: { surcharge: 0 },
      majorations: true,
      withMp: true,
      withFormules: true,
      volumes: { b25: 7000, b30: 3500, b35: 1500 },
      momd: { b25: 40, b30: 46, b35: 58 },
    },

    "Variante Optim Transport": {
      transport: { type: "PAR_ZONE", prixMoyen: null, volumePompePct: 45, prixAchatPompe: 115, prixVentePompe: 185 },
      cab: { etat: "NEUVE", mode: "ACHAT", capaciteM3: 1.5, amortMois: 19000 },
      maintenance: { cab: 4300, elec: 2400, chargeur: 1700, generale: 2100, bassins: 1100, preventive: 1500 },
      coutM3: { eau: 1.7, qualite: 0.6, dechets: 0.35 },
      coutMensuel: { electricite: 11500, gasoil: 8200, location: 6500, securite: 4800 },
      coutOccasionnel: { genieCivil: 175000, installation: 85000, transport: 60000 },
      employes: { responsableNb: 1, responsableCout: 9500, centralistesNb: 2, centralistesCout: 7200 },
      fgPct: rand(5, 7),
      marketingMensuel: rand(3500, 6500),
      devis: { surcharge: 5 },
      majorations: true,
      withMp: true,
      withFormules: true,
      volumes: { b25: 9000, b30: 3500, b35: 1500 },
      momd: { b25: 38, b30: 44, b35: 56 },
    },

    "Variante Achat CAB": {
      transport: { type: "MOYENNE", prixMoyen: 72, volumePompePct: 30, prixAchatPompe: 120, prixVentePompe: 175 },
      cab: { etat: "NEUVE", mode: "ACHAT", capaciteM3: 2.0, amortMois: 26000 },
      maintenance: { cab: 5200, elec: 3200, chargeur: 2100, generale: 2800, bassins: 1400, preventive: 1900 },
      coutM3: { eau: 2.0, qualite: 0.7, dechets: 0.45 },
      coutMensuel: { electricite: 16500, gasoil: 11500, location: 0, securite: 6200 },
      coutOccasionnel: { genieCivil: 260000, installation: 120000, transport: 78000 },
      employes: { responsableNb: 1, responsableCout: 11000, centralistesNb: 2, centralistesCout: 8200 },
      fgPct: rand(5, 7),
      marketingMensuel: rand(4000, 7000),
      devis: { surcharge: 0 },
      majorations: true,
      withMp: true,
      withFormules: true,
      volumes: { b25: 8000, b30: 4200, b35: 1800 },
      momd: { b25: 45, b30: 52, b35: 65 },
    },

    "Variante Location CAB": {
      transport: { type: "MOYENNE", prixMoyen: 72, volumePompePct: 30, prixAchatPompe: 120, prixVentePompe: 175 },
      cab: { etat: "NEUVE", mode: "LOCATION", capaciteM3: 2.0, amortMois: 34000 },
      maintenance: { cab: 5000, elec: 3100, chargeur: 2050, generale: 2700, bassins: 1400, preventive: 1850 },
      coutM3: { eau: 2.0, qualite: 0.7, dechets: 0.45 },
      coutMensuel: { electricite: 16500, gasoil: 11500, location: 15000, securite: 6200 },
      coutOccasionnel: { genieCivil: 230000, installation: 110000, transport: 78000 },
      employes: { responsableNb: 1, responsableCout: 11000, centralistesNb: 2, centralistesCout: 8200 },
      fgPct: rand(5, 7),
      marketingMensuel: rand(4000, 7000),
      devis: { surcharge: 0 },
      majorations: true,
      withMp: true,
      withFormules: true,
      volumes: { b25: 7800, b30: 4100, b35: 1700 },
      momd: { b25: 45, b30: 52, b35: 65 },
    },
  };

  for (const p of pnls) {
    for (const c of p.contracts ?? []) {
      for (const v of c.variants ?? []) {
        // fallback : si titre inconnu => Variante Base
        const cfg = configByTitle[v.title] ?? configByTitle["Variante Base"];

        await seedSectionsForVariant(v.id, cfg);

        const secMp = await prisma.sectionMatierePremiere.findUnique({ where: { variantId: v.id } });
        const secFor = await prisma.sectionFormules.findUnique({ where: { variantId: v.id } });

        // ---------- MP sélectionnées (prix = catalogue, avec override “réaliste”)
        if (cfg.withMp) {
          await prisma.variantMp.createMany({
            data: [
              { variantId: v.id, sectionId: secMp?.id, mpId: refs.cpj55.id, prix: refs.cpj55.prix },
              { variantId: v.id, sectionId: secMp?.id, mpId: refs.sable.id, prix: refs.sable.prix },
              { variantId: v.id, sectionId: secMp?.id, mpId: refs.g38.id, prix: refs.g38.prix },
              { variantId: v.id, sectionId: secMp?.id, mpId: refs.g816.id, prix: refs.g816.prix },
              { variantId: v.id, sectionId: secMp?.id, mpId: refs.sp.id, prix: refs.sp.prix },
            ],
          });

          // petit écart pour la variante Optim
          if (v.title === "Variante Optim Transport") {
            await prisma.variantMp.update({
              where: { variantId_mpId: { variantId: v.id, mpId: refs.sable.id } },
              data: { prix: refs.sable.prix + 0.03, comment: "Source différente" },
            });
            await prisma.variantMp.update({
              where: { variantId_mpId: { variantId: v.id, mpId: refs.sp.id } },
              data: { prix: refs.sp.prix + 0.5, comment: "Contrat fournisseur" },
            });
          }
        }

        // ---------- Formules + volumes + MOMD
        if (cfg.withFormules) {
          await prisma.variantFormule.createMany({
            data: [
              { variantId: v.id, sectionId: secFor?.id, formuleId: refs.fB25.id, volumeM3: cfg.volumes.b25, momd: cfg.momd.b25 },
              { variantId: v.id, sectionId: secFor?.id, formuleId: refs.fB30.id, volumeM3: cfg.volumes.b30, momd: cfg.momd.b30 },
              { variantId: v.id, sectionId: secFor?.id, formuleId: refs.fB35.id, volumeM3: cfg.volumes.b35, momd: cfg.momd.b35 },
            ],
          });
        }
      }
    }
  }
}

async function main() {
  await resetDb();
  const refs = await seedCatalogues();
  const pnls = await seedPnls();
  await seedVariantLists(pnls, refs);
  console.log("✅ Seed complet (catalogues + composition + PnL + sections + listes + autres coûts items)");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
