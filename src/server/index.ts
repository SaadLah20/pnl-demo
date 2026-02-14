// src/server/index.ts
import express, { type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./db";
import { getPnls } from "./pnl.repo";
import { Prisma } from "@prisma/client";
import { registerDevisRoutes } from "./devis.routes";

const app = express();

app.use(cors());
app.use(express.json());
registerDevisRoutes(app);

// Root
app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "pnl-creator-api" });
});

// Health
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// -------- READ (hierarchy)
app.get("/pnls", async (_req: Request, res: Response) => {
  try {
    const data = await getPnls();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ include exact selon ton schema.prisma
const variantInclude = Prisma.validator<Prisma.VariantInclude>()({
  variantFormules: {
    include: {
      formule: {
        include: {
          items: { include: { mp: true } },
        },
      },
    },
  },
});

// ✅ GET variant deep (utilisé par store.loadVariantDeep)
app.get("/variants/:id", async (req: Request, res: Response) => {
  const variantId = String(req.params.id);

  try {
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      include: variantInclude,
    });

    return res.json({ variant });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/* =========================================================
   HELPERS
========================================================= */

function pick<T extends Record<string, any>>(obj: any, allowed: string[]): Partial<T> {
  const out: any = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of allowed) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function numOr0(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function intOr0(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Normalise createMode tolérant (accents / casse / espaces) -> "ZERO" | "INITIEE" | "COMPOSEE" */
function normalizeCreateMode(v: any): "ZERO" | "INITIEE" | "COMPOSEE" {
  const raw = String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");

  if (raw === "INITIEE" || raw === "INITIE" || raw === "INIT") return "INITIEE";
  if (raw === "COMPOSEE" || raw === "COMPOSE" || raw === "COMP") return "COMPOSEE";
  return "ZERO";
}

async function getFullVariant(variantId: string) {
  return prisma.variant.findUnique({
    where: { id: variantId },
    include: {
      transport: true,
      cab: true,
      maintenance: true,
      coutM3: true,
      coutMensuel: true,
      coutOccasionnel: true,
      employes: true,
      autresCouts: { include: { items: true } },
      devis: true,
      majorations: true,
      mp: { include: { items: { include: { mp: true } } } },
      formules: {
        include: {
          items: {
            include: {
              formule: { include: { items: { include: { mp: true } } } },
            },
          },
        },
      },
      variantFormules: {
        include: {
          formule: { include: { items: { include: { mp: true } } } },
        },
      },
    },
  });
}

/**
 * 🔥 Sync MP variante depuis les formules de la variante
 */
async function syncVariantMpsFromFormules(tx: Prisma.TransactionClient, variantId: string) {
  const sec = await tx.sectionMatierePremiere.upsert({
    where: { variantId },
    create: { variantId, category: "LOGISTIQUE_APPRO" },
    update: {},
  });

  const vfs = await tx.variantFormule.findMany({
    where: { variantId },
    include: { formule: { include: { items: true } } },
  });

  const usedMpIds = new Set<string>();
  for (const vf of vfs) {
    for (const it of vf.formule?.items ?? []) usedMpIds.add(String(it.mpId));
  }

  const existing = await tx.variantMp.findMany({ where: { variantId } });
  const existingByMp = new Map(existing.map((x) => [x.mpId, x]));

  const toCreateMpIds = Array.from(usedMpIds).filter((mpId) => !existingByMp.has(mpId));
  if (toCreateMpIds.length) {
    const mps = await tx.mpCatalogue.findMany({ where: { id: { in: toCreateMpIds } } });
    const prixById = new Map(mps.map((m) => [m.id, m.prix ?? 0]));

    await tx.variantMp.createMany({
      data: toCreateMpIds.map((mpId) => ({
        variantId,
        sectionId: sec.id,
        mpId,
        prix: Number(prixById.get(mpId) ?? 0),
      })),
    });
  }

  const toDeleteIds = existing.filter((x) => !usedMpIds.has(x.mpId)).map((x) => x.id);
  if (toDeleteIds.length) {
    await tx.variantMp.deleteMany({ where: { id: { in: toDeleteIds } } });
  }

  if (usedMpIds.size === 0) {
    await tx.variantMp.deleteMany({ where: { variantId } });
  }
}

/**
 * Upsert tolerant: update partiel si existe, sinon create defaults+data.
 * ⚠️ IMPORTANT: `data` doit contenir UNIQUEMENT des colonnes Prisma valides.
 */
async function upsertPartialSection(params: {
  tx: Prisma.TransactionClient;
  model: any;
  variantId: string;
  categoryDefault: string;
  defaults: Record<string, any>;
  data: Record<string, any>;
  logLabel?: string;
}) {
  const { model, variantId, categoryDefault, defaults, data, logLabel } = params;
  if (!data) return;

  const existing = await model.findUnique({ where: { variantId } });
  if (existing) {
    if (logLabel) console.log(`[UPDATE ${logLabel}]`, { variantId, data });
    await model.update({
      where: { variantId },
      data: {
        ...data,
        category: data.category ?? existing.category ?? categoryDefault,
      },
    });
  } else {
    if (logLabel) console.log(`[CREATE ${logLabel}]`, { variantId, data: { ...defaults, ...data } });
    await model.create({
      data: {
        variantId,
        category: data.category ?? categoryDefault,
        ...defaults,
        ...data,
      },
    });
  }
}

/** Crée toutes les sections nécessaires avec valeurs à 0 (squelette) */
async function ensureVariantSkeleton(tx: Prisma.TransactionClient, variantId: string) {
  await tx.sectionTransport.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "LOGISTIQUE_APPRO",
      type: "MOYENNE",
      prixMoyen: 0,
      volumePompePct: null,
      prixAchatPompe: null,
      prixVentePompe: null,
    },
    update: {},
  });

  await tx.sectionCab.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "LOGISTIQUE_APPRO",
      etat: "NEUVE",
      mode: "ACHAT",
      capaciteM3: 0,
      amortMois: 0,
    },
    update: {},
  });

  await tx.sectionMaintenance.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "COUTS_CHARGES",
      cab: 0,
      elec: 0,
      chargeur: 0,
      generale: 0,
      bassins: 0,
      preventive: 0,
    },
    update: {},
  });

  await tx.sectionCoutM3.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "COUTS_CHARGES",
      eau: 0,
      qualite: 0,
      dechets: 0,
    },
    update: {},
  });

  await tx.sectionCoutMensuel.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "COUTS_CHARGES",
      electricite: 0,
      gasoil: 0,
      location: 0,
      securite: 0,
      hebergements: 0,
      locationTerrain: 0,
      telephone: 0,
      troisG: 0,
      taxeProfessionnelle: 0,
      locationVehicule: 0,
      locationAmbulance: 0,
      locationBungalows: 0,
      epi: 0,
    },
    update: {},
  });

  await tx.sectionCoutOccasionnel.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "COUTS_CHARGES",
      genieCivil: 0,
      installation: 0,
      transport: 0,
      demontage: 0,
      remisePointCentrale: 0,
      silots: 0,
      localAdjuvant: 0,
      bungalows: 0,
    },
    update: {},
  });

  await tx.sectionEmployes.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "COUTS_CHARGES",

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
    } as any,
    update: {},
  });

  const autres = await tx.sectionAutresCouts.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "COUTS_CHARGES",
      majorations: JSON.stringify({}),
    } as any,
    update: {},
  });

  // si aucun item -> créer un item par défaut
  const count = await tx.autreCoutItem.count({ where: { variantId } });
  if (count === 0) {
    await tx.autreCoutItem.create({
      data: {
        variantId,
        sectionId: autres.id,
        label: "Frais généraux",
        unite: "POURCENT_CA",
        valeur: 0,
      },
    });
  }

  await tx.sectionFormules.upsert({
    where: { variantId },
    create: { variantId, category: "FORMULES" },
    update: {},
  });

  await tx.sectionDevis.upsert({
    where: { variantId },
    create: {
      variantId,
      category: "DEVIS",
      surcharge: 0,
      meta: JSON.stringify({}),
      intro: "",
      rappel: JSON.stringify({}),
      chargeFournisseur: JSON.stringify([]),
      chargeClient: JSON.stringify([]),
      prixComplementaires: JSON.stringify([]),
      validiteTexte: "",
      signature: JSON.stringify({}),
      surcharges: JSON.stringify({}),
    } as any,
    update: {},
  });

  await tx.sectionMajorations.upsert({
    where: { variantId },
    create: { variantId, category: "COUTS_CHARGES" },
    update: {},
  });
}

function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isChargeClient(v: any): boolean {
  const t = norm(v);
  // tolérant aux libellés: "client", "a la charge du client", "charge client", etc.
  return t.includes("client");
}

/**
 * ✅ SANITIZE: force à 0 les champs interdits par contrat (sécurité DB).
 * (Le verrouillage UI sera fait plus tard côté front.)
 */
async function sanitizeVariantByContract(
  tx: Prisma.TransactionClient,
  variantId: string,
  contract: any | null
) {
  if (!contract) return;

  // CAB
  if (isChargeClient(contract.cab)) {
    await tx.sectionCab.updateMany({
      where: { variantId },
      data: { amortMois: 0 },
    });
  }

  // Cout mensuel (⚠️ consoElec = consommation)
  if (isChargeClient(contract.consoElec)) {
    await tx.sectionCoutMensuel.updateMany({
      where: { variantId },
      data: { electricite: 0, location: 0 },
    });
  }

  if (isChargeClient(contract.terrain)) {
    await tx.sectionCoutMensuel.updateMany({
      where: { variantId },
      data: { locationTerrain: 0 },
    });
  }

  // Cout occasionnel
  if (isChargeClient(contract.installation)) {
    await tx.sectionCoutOccasionnel.updateMany({
      where: { variantId },
      data: { installation: 0 },
    });
  }

  if (isChargeClient(contract.genieCivil)) {
    await tx.sectionCoutOccasionnel.updateMany({
      where: { variantId },
      data: { genieCivil: 0 },
    });
  }

  if (isChargeClient(contract.transport)) {
    await tx.sectionCoutOccasionnel.updateMany({
      where: { variantId },
      data: { transport: 0 },
    });
  }
}

/* =========================================================
   INITIÉE → Calcul MOMD pour atteindre un EBIT cible (%)
========================================================= */

function sumNums(obj: any, keys: string[]): number {
  let s = 0;
  for (const k of keys) s += numOr0(obj?.[k]);
  return s;
}

async function computeInitieeMomdPerM3(
  tx: Prisma.TransactionClient,
  params: {
    variantId: string;
    contractId: string;
    ebitCiblePct: number;
  }
): Promise<number> {
  const { variantId, contractId } = params;

  const t = numOr0(params.ebitCiblePct) / 100; // cible EBIT% (ex: 8.3% => 0.083)

  // Contract (durée)
  const contract = await tx.contract.findUnique({ where: { id: contractId } });
  const duree = intOr0(contract?.dureeMois);
  if (duree <= 0) return 0;

  // Sections nécessaires
  const transport = await tx.sectionTransport.findUnique({ where: { variantId } });
  const coutM3 = await tx.sectionCoutM3.findUnique({ where: { variantId } });
  const coutMensuel = await tx.sectionCoutMensuel.findUnique({ where: { variantId } });
  const maintenance = await tx.sectionMaintenance.findUnique({ where: { variantId } });
  const employes = await tx.sectionEmployes.findUnique({ where: { variantId } });
  const coutOcc = await tx.sectionCoutOccasionnel.findUnique({ where: { variantId } });
  const cab = await tx.sectionCab.findUnique({ where: { variantId } });

  // Formules (volumes) + items MP (pour CMP)
  const links = await tx.variantFormule.findMany({
    where: { variantId },
    include: { formule: { include: { items: true } } },
  });
  if (!links.length) return 0;

  const V = links.reduce((s, l) => s + numOr0(l.volumeM3), 0);
  if (V <= 0) return 0;

  // Prix MP (variantMp.prix override sinon mpCatalogue.prix)
  const mps = await tx.variantMp.findMany({
    where: { variantId },
    include: { mp: true },
  });
  const prixTonneByMp = new Map<string, number>();
  for (const vmp of mps) {
    const p = vmp.prix != null ? vmp.prix : (vmp.mp?.prix ?? 0);
    prixTonneByMp.set(String(vmp.mpId), numOr0(p));
  }

  // CMP moyen pondéré (MAD/m3)
  const cmpTotal = links.reduce((sum, l) => {
    const vol = numOr0(l.volumeM3);
    const cmpM3 = (l.formule?.items ?? []).reduce((s2, it: any) => {
      const prixTonne = prixTonneByMp.get(String(it.mpId)) ?? 0;
      const prixKg = prixTonne / 1000;
      return s2 + numOr0(it.qty) * prixKg;
    }, 0);
    return sum + cmpM3 * vol;
  }, 0);
  const cmpAvg = cmpTotal / V;

  // Transport (MAD/m3)
  const transportM3 = numOr0(transport?.prixMoyen);

  // Surcharge devis (pour INITIEE, souvent 0)
  const surchargeM3 = 0;

  const B = cmpAvg + transportM3 + surchargeM3; // base ASP sans MOMD

  const coutM3M3 = sumNums(coutM3, ["eau", "qualite", "dechets"]);
  const coutM3Total = coutM3M3 * V;

  const coutMensuelMois = sumNums(coutMensuel, [
    "electricite",
    "gasoil",
    "location",
    "securite",
    "hebergements",
    "locationTerrain",
    "telephone",
    "troisG",
    "taxeProfessionnelle",
    "locationVehicule",
    "locationAmbulance",
    "locationBungalows",
    "epi",
  ]);
  const coutMensuelTotal = coutMensuelMois * duree;

  const maintenanceMois = sumNums(maintenance, ["cab", "elec", "chargeur", "generale", "bassins", "preventive"]);
  const maintenanceTotal = maintenanceMois * duree;

  function employesMensuelFromSection(employes: any): number {
    if (!employes) return 0;
    let total = 0;
    for (const [k, v] of Object.entries(employes)) {
      const key = String(k);
      if (!key.endsWith("Nb")) continue;
      const base = key.slice(0, -2);
      const nb = numOr0(v);
      const cout = numOr0((employes as any)[`${base}Cout`]);
      total += nb * cout;
    }
    return total;
  }

  const employesMois = employesMensuelFromSection(employes);
  const employesTotal = employesMois * duree;

  const coutOccasionnelTotal = sumNums(coutOcc, [
    "genieCivil",
    "installation",
    "transport",
    "demontage",
    "remisePointCentrale",
    "silots",
    "localAdjuvant",
    "bungalows",
  ]);

  const autresItems = await tx.autreCoutItem.findMany({ where: { variantId } });

  const fraisGenPct = autresItems
    .filter((it: any) => String(it.unite) === "POURCENT_CA")
    .reduce((s, it: any) => s + numOr0(it.valeur), 0);

  const autresCoutsHorsPctTotal = autresItems
    .filter((it: any) => String(it.unite) !== "POURCENT_CA")
    .reduce((s, it: any) => {
      const unite = String(it.unite ?? "").toUpperCase();
      const val = numOr0(it.valeur);
      if (unite === "MOIS") return s + val * duree;
      if (unite === "M3") return s + val * V;
      return s + val;
    }, 0);

  const productionTotal =
    coutM3Total +
    coutMensuelTotal +
    maintenanceTotal +
    employesTotal +
    coutOccasionnelTotal +
    autresCoutsHorsPctTotal;

  const amortissementMensuel = numOr0(cab?.amortMois);
  const amortissementTotal = amortissementMensuel * duree;

  const fg = numOr0(fraisGenPct) / 100;

  const denom = 1 - fg - t;
  if (denom <= 0) return 0;

  const C = (productionTotal + amortissementTotal) / V;
  const m = (B * (t + fg) + C) / denom;

  return Number.isFinite(m) && m > 0 ? m : 0;
}

async function applyInitiee(
  tx: Prisma.TransactionClient,
  params: {
    variantId: string;
    contractId: string;
    initiee: {
      volumeEstimeM3: number;
      resistances: string[];
      ebitCiblePct: number;
      etatCentrale: "EXISTANTE" | "NEUVE";
    };
  }
) {
  const { variantId, contractId, initiee } = params;

  await ensureVariantSkeleton(tx, variantId);

  // Baseline non-zéro
  await tx.sectionTransport.update({
    where: { variantId },
    data: {
      type: "MOYENNE",
      prixMoyen: 79.6,
      volumePompePct: 0,
      prixAchatPompe: 0,
      prixVentePompe: 0,
    },
  });

  await tx.sectionCab.update({
    where: { variantId },
    data: {
      etat: initiee.etatCentrale === "EXISTANTE" ? "EXISTANTE" : "NEUVE",
      mode: "ACHAT",
      capaciteM3: 2.0,
      amortMois: 30000,
    },
  });

  await tx.sectionMaintenance.update({
    where: { variantId },
    data: { cab: 3000, elec: 2500, chargeur: 1500, generale: 2000, bassins: 1000, preventive: 2000 },
  });

  await tx.sectionCoutM3.update({
    where: { variantId },
    data: { eau: 3, qualite: 2, dechets: 1.75 },
  });

  await tx.sectionCoutMensuel.update({
    where: { variantId },
    data: { electricite: 42000, gasoil: 15000, location: 12000, securite: 5370 },
  });

  await tx.sectionCoutOccasionnel.update({
    where: { variantId },
    data: { genieCivil: 1200000, installation: 580000, transport: 0 },
  });

  await tx.sectionEmployes.update({
    where: { variantId },
    data: { responsableNb: 1, responsableCout: 25000, centralistesNb: 4, centralistesCout: 13140 } as any,
  });

  // Autres coûts baseline
  const autres = await tx.sectionAutresCouts.findUnique({ where: { variantId } });
  if (autres) {
    await tx.autreCoutItem.deleteMany({ where: { variantId } });
    await tx.autreCoutItem.createMany({
      data: [
        { variantId, sectionId: autres.id, label: "Frais généraux", unite: "POURCENT_CA", valeur: 6 },
        { variantId, sectionId: autres.id, label: "Location chargeuse", unite: "MOIS", valeur: 22000 },
      ],
    });
  }

  // -------- formules catalogue selon ville + résistances
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: { pnl: true },
  });
  const city = String(contract?.pnl?.city ?? "");

  const requested = (initiee.resistances ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  const uniqueRequested = [...new Set(requested)].slice(0, 5);

  const allCityFormules = await tx.formuleCatalogue.findMany({
    where: city ? { city } : undefined,
    orderBy: { label: "asc" },
  });

  const basePool =
    allCityFormules.length > 0
      ? allCityFormules
      : await tx.formuleCatalogue.findMany({ orderBy: { label: "asc" } });

  if (basePool.length === 0) {
    return;
  }

  const pickRandom = () => {
    const idx = Math.floor(Math.random() * basePool.length);
    return basePool[idx]!;
  };

  const picked: Array<{ formuleId: string; resistance: string }> = [];

  for (const r of uniqueRequested) {
    const matches = basePool.filter((f) => String(f.resistance ?? "").trim() === r);
    const chosen = matches.length > 0 ? matches[0]! : pickRandom();
    picked.push({ formuleId: chosen.id, resistance: String(chosen.resistance ?? "") });
  }

  if (picked.length === 0) {
    const rnd = pickRandom();
    picked.push({ formuleId: rnd.id, resistance: String(rnd.resistance ?? "") });
  }

  const uniqueById = new Map<string, { formuleId: string; resistance: string }>();
  for (const p of picked) uniqueById.set(p.formuleId, p);
  const finalFormules = [...uniqueById.values()];

  const secFormules = await tx.sectionFormules.upsert({
    where: { variantId },
    create: { variantId, category: "FORMULES" },
    update: {},
  });

  await tx.variantFormule.deleteMany({ where: { variantId } });

  const totalVol = numOr0(initiee.volumeEstimeM3);
  const n = finalFormules.length;
  const per = n > 0 ? totalVol / n : 0;

  for (const f of finalFormules) {
    await tx.variantFormule.create({
      data: {
        variantId,
        sectionId: secFormules.id,
        formuleId: f.formuleId,
        volumeM3: per,
        momd: 0,
        cmpOverride: null,
      },
    });
  }

  await syncVariantMpsFromFormules(tx, variantId);

  // ✅ Calcul MOMD
  const momdTarget = await computeInitieeMomdPerM3(tx, {
    variantId,
    contractId,
    ebitCiblePct: initiee.ebitCiblePct,
  });

  await tx.variantFormule.updateMany({
    where: { variantId },
    data: { momd: momdTarget },
  });
}

type ComposeSectionKey =
  | "transport"
  | "cab"
  | "maintenance"
  | "coutM3"
  | "coutMensuel"
  | "coutOccasionnel"
  | "employes"
  | "autresCouts"
  | "formules"
  | "majorations"
  | "devis";

/**
 * ✅ Respect strict de bySection:
 * - null / "ZERO" / "" => ZERO (ne copie pas)
 * - string => copie depuis cette variante
 * - {fromVariantId} => copie depuis cette variante
 * - undefined => si importAll=true => baseVariantId, sinon ZERO
 */
function pickComposeSourceStrict(bySection: any, key: ComposeSectionKey): string | null {
  const raw = bySection?.[key];

  if (raw === null) return null;
  if (raw === undefined) return null;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    if (s.toUpperCase() === "ZERO") return null;
    return s;
  }

  if (raw && typeof raw === "object") {
    const id = String(raw.fromVariantId ?? "").trim();
    if (!id) return null;
    if (id.toUpperCase() === "ZERO") return null;
    return id;
  }

  return null;
}

async function applyComposee(
  tx: Prisma.TransactionClient,
  params: {
    variantId: string;
    composee: {
      baseVariantId?: string;
      importAll?: boolean;
      bySection: Record<ComposeSectionKey, any>;
    };
  }
) {
  const { variantId, composee } = params;

  await ensureVariantSkeleton(tx, variantId);

  const copyTransport = async (fromId: string) => {
    const src = await tx.sectionTransport.findUnique({ where: { variantId: fromId } });
    if (!src) return;
    await tx.sectionTransport.update({
      where: { variantId },
      data: {
        category: src.category,
        type: src.type,
        prixMoyen: src.prixMoyen,
        volumePompePct: src.volumePompePct,
        prixAchatPompe: src.prixAchatPompe,
        prixVentePompe: src.prixVentePompe,
      },
    });
  };

  const copyCab = async (fromId: string) => {
    const src = await tx.sectionCab.findUnique({ where: { variantId: fromId } });
    if (!src) return;
    await tx.sectionCab.update({
      where: { variantId },
      data: {
        category: src.category,
        etat: src.etat,
        mode: src.mode,
        capaciteM3: src.capaciteM3,
        amortMois: src.amortMois,
      },
    });
  };

  const copyMaintenance = async (fromId: string) => {
    const src = await tx.sectionMaintenance.findUnique({ where: { variantId: fromId } });
    if (!src) return;
    await tx.sectionMaintenance.update({
      where: { variantId },
      data: {
        category: src.category,
        cab: src.cab,
        elec: src.elec,
        chargeur: src.chargeur,
        generale: src.generale,
        bassins: src.bassins,
        preventive: src.preventive,
      },
    });
  };

  const copyCoutM3 = async (fromId: string) => {
    const src = await tx.sectionCoutM3.findUnique({ where: { variantId: fromId } });
    if (!src) return;
    await tx.sectionCoutM3.update({
      where: { variantId },
      data: { category: src.category, eau: src.eau, qualite: src.qualite, dechets: src.dechets },
    });
  };

  const copyCoutMensuel = async (fromId: string) => {
    const src = await tx.sectionCoutMensuel.findUnique({ where: { variantId: fromId } });
    if (!src) return;

    await tx.sectionCoutMensuel.update({
      where: { variantId },
      data: {
        category: src.category,
        electricite: src.electricite,
        gasoil: src.gasoil,
        location: src.location,
        securite: src.securite,
        hebergements: src.hebergements,
        locationTerrain: src.locationTerrain,
        telephone: src.telephone,
        troisG: src.troisG,
        taxeProfessionnelle: src.taxeProfessionnelle,
        locationVehicule: src.locationVehicule,
        locationAmbulance: src.locationAmbulance,
        locationBungalows: src.locationBungalows,
        epi: src.epi,
      } as any,
    });
  };

  const copyCoutOcc = async (fromId: string) => {
    const src = await tx.sectionCoutOccasionnel.findUnique({ where: { variantId: fromId } });
    if (!src) return;

    await tx.sectionCoutOccasionnel.update({
      where: { variantId },
      data: {
        category: src.category,
        genieCivil: src.genieCivil,
        installation: src.installation,
        transport: src.transport,
        demontage: src.demontage,
        remisePointCentrale: src.remisePointCentrale,
        silots: src.silots,
        localAdjuvant: src.localAdjuvant,
        bungalows: src.bungalows,
      } as any,
    });
  };

  const copyEmployes = async (fromId: string) => {
    const src = await tx.sectionEmployes.findUnique({ where: { variantId: fromId } });
    if (!src) return;

    const data: any = { ...src };
    delete data.id;
    delete data.variantId;

    await tx.sectionEmployes.update({ where: { variantId }, data });
  };

  const copyAutresCouts = async (fromId: string) => {
    const srcSec = await tx.sectionAutresCouts.findUnique({ where: { variantId: fromId } });
    const dstSec = await tx.sectionAutresCouts.findUnique({ where: { variantId } });
    if (!dstSec) return;

    await tx.sectionAutresCouts.update({
      where: { variantId },
      data: { majorations: (srcSec as any)?.majorations ?? JSON.stringify({}) } as any,
    });

    const srcItems = await tx.autreCoutItem.findMany({ where: { variantId: fromId } });

    await tx.autreCoutItem.deleteMany({ where: { variantId } });

    if (srcItems.length) {
      await tx.autreCoutItem.createMany({
        data: srcItems.map((it) => ({
          variantId,
          sectionId: dstSec.id,
          label: it.label,
          unite: it.unite,
          valeur: it.valeur,
        })),
      });
    }
  };

  const copyFormules = async (fromId: string) => {
    const dstSec = await tx.sectionFormules.upsert({
      where: { variantId },
      create: { variantId, category: "FORMULES" },
      update: {},
    });

    const srcLinks = await tx.variantFormule.findMany({ where: { variantId: fromId } });

    await tx.variantFormule.deleteMany({ where: { variantId } });

    if (srcLinks.length) {
      await tx.variantFormule.createMany({
        data: srcLinks.map((l) => ({
          variantId,
          sectionId: dstSec.id,
          formuleId: l.formuleId,
          volumeM3: l.volumeM3,
          momd: l.momd,
          cmpOverride: l.cmpOverride,
        })),
      });
    }

    await syncVariantMpsFromFormules(tx, variantId);
  };

  const copyDevis = async (fromId: string) => {
    const src = await tx.sectionDevis.findUnique({ where: { variantId: fromId } });
    if (!src) return;

    await tx.sectionDevis.update({
      where: { variantId },
      data: {
        category: src.category,
        surcharge: src.surcharge,
        meta: src.meta,
        intro: src.intro,
        rappel: src.rappel,
        chargeFournisseur: src.chargeFournisseur,
        chargeClient: src.chargeClient,
        prixComplementaires: src.prixComplementaires,
        validiteTexte: src.validiteTexte,
        signature: src.signature,
        surcharges: src.surcharges,
      } as any,
    });
  };

  const copyMajorations = async (_fromId: string) => {
    return;
  };

  const steps: Array<[ComposeSectionKey, (fromId: string) => Promise<void>]> = [
    ["transport", copyTransport],
    ["cab", copyCab],
    ["maintenance", copyMaintenance],
    ["coutM3", copyCoutM3],
    ["coutMensuel", copyCoutMensuel],
    ["coutOccasionnel", copyCoutOcc],
    ["employes", copyEmployes],
    ["autresCouts", copyAutresCouts],
    ["formules", copyFormules],
    ["devis", copyDevis],
    ["majorations", copyMajorations],
  ];

  for (const [k, fn] of steps) {
    const srcId = pickComposeSourceStrict(composee.bySection, k);
    if (!srcId) continue;
    await fn(srcId);
  }
}

/* =========================================================
   MP CATALOGUE CRUD
========================================================= */
app.get("/mp-catalogue", async (_req: Request, res: Response) => {
  try {
    const data = await prisma.mpCatalogue.findMany({ orderBy: { categorie: "asc" } });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/mp-catalogue", async (req: Request, res: Response) => {
  try {
    const created = await prisma.mpCatalogue.create({ data: req.body });
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.put("/mp-catalogue/:id", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.mpCatalogue.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.delete("/mp-catalogue/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const usedInFormules = await prisma.formuleCatalogueItem.count({ where: { mpId: id } });
    const usedInVariants = await prisma.variantMp.count({ where: { mpId: id } });

    if (usedInFormules > 0 || usedInVariants > 0) {
      return res.status(409).json({
        error: "MP_IN_USE",
        details: { usedInFormules, usedInVariants },
      });
    }

    await prisma.mpCatalogue.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

/* =========================================================
   FORMULES CATALOGUE CRUD
========================================================= */
app.get("/formules-catalogue", async (_req: Request, res: Response) => {
  try {
    const data = await prisma.formuleCatalogue.findMany({
      orderBy: { label: "asc" },
      include: { items: true },
    });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/formules-catalogue", async (req: Request, res: Response) => {
  try {
    const created = await prisma.formuleCatalogue.create({ data: req.body });
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.put("/formules-catalogue/:id", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.formuleCatalogue.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.delete("/formules-catalogue/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const usedInVariants = await prisma.variantFormule.count({ where: { formuleId: id } });
    if (usedInVariants > 0) {
      return res.status(409).json({
        error: "FORMULE_IN_USE",
        details: { usedInVariants },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.formuleCatalogueItem.deleteMany({ where: { formuleId: id } });
      await tx.formuleCatalogue.delete({ where: { id } });
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /formules-catalogue failed", { id, e });

    if (e?.code === "P2025") return res.status(404).json({ error: "NOT_FOUND" });
    if (e?.code === "P2003") return res.status(409).json({ error: "FORMULE_IN_USE" });

    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// composition items + 🔥 resync variants using this formule
app.put("/formules-catalogue/:id/items", async (req: Request, res: Response) => {
  try {
    const formuleId = String(req.params.id);
    const items = (req.body?.items ?? []) as Array<{ mpId: string; qty: number }>;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.formuleCatalogueItem.deleteMany({ where: { formuleId } });

      if (items.length) {
        await tx.formuleCatalogueItem.createMany({
          data: items.map((it) => ({
            formuleId,
            mpId: String(it.mpId),
            qty: Number(it.qty ?? 0),
          })),
        });
      }

      const links = await tx.variantFormule.findMany({
        where: { formuleId },
        select: { variantId: true },
      });

      const variantIds = [...new Set(links.map((x) => String(x.variantId)))];
      for (const variantId of variantIds) {
        await syncVariantMpsFromFormules(tx, variantId);
      }
    });

    const updated = await prisma.formuleCatalogue.findUnique({
      where: { id: formuleId },
      include: { items: true },
    });

    res.json({ ok: true, updated });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

/* =========================================================
   VARIANT MP (override prix/comment)
========================================================= */

app.post("/variants/:id/mps", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const mpId = String(req.body?.mpId ?? "");
    if (!mpId) return res.status(400).json({ error: "mpId required" });

    const sec = await prisma.sectionMatierePremiere.upsert({
      where: { variantId },
      create: { variantId, category: "LOGISTIQUE_APPRO" },
      update: {},
    });

    const mp = await prisma.mpCatalogue.findUnique({ where: { id: mpId } });
    const prix = mp?.prix ?? 0;

    await prisma.variantMp.create({
      data: { variantId, sectionId: sec.id, mpId, prix },
    });

    const variant = await getFullVariant(variantId);
    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

app.put("/variants/:id/mps/:variantMpId", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const variantMpId = String(req.params.variantMpId);

    await prisma.variantMp.update({
      where: { id: variantMpId },
      data: {
        prix: req.body?.prix == null ? undefined : Number(req.body.prix),
        comment: req.body?.comment == null ? undefined : String(req.body.comment),
      },
    });

    const variant = await getFullVariant(variantId);
    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// =========================================================
// PNL CREATE
// =========================================================
app.post("/pnls", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const created = await prisma.pnl.create({
      data: {
        title: String(body.title ?? "Nouveau P&L"),
        client: body.client === undefined ? null : (body.client ?? null),

        city: String(body.city ?? ""),
        // ✅ region obligatoire => jamais null
        region: req.body?.region === undefined ? undefined : String(req.body.region ?? ""),

        status: String(body.status ?? "ENCOURS"),
        model: String(body.model ?? "MODEL"),
        startDate:
          body.startDate === undefined
            ? undefined
            : body.startDate
            ? new Date(String(body.startDate))
            : null,
      } as any,
    });

    return res.json({ ok: true, pnl: created });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// =========================================================
// PNL UPDATE (pour popup edit)
// =========================================================
app.put("/pnls/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const updated = await prisma.pnl.update({
      where: { id },
      data: {
        title: req.body?.title === undefined ? undefined : String(req.body.title),
        client: req.body?.client === undefined ? undefined : (req.body.client ?? null),
        city: req.body?.city === undefined ? undefined : String(req.body.city),

        region: req.body?.region === undefined ? undefined : String(req.body.region ?? ""),

        status: req.body?.status === undefined ? undefined : String(req.body.status),
        startDate:
          req.body?.startDate === undefined
            ? undefined
            : req.body?.startDate
            ? new Date(String(req.body.startDate))
            : null,
      } as any,
    });

    res.json({ ok: true, pnl: updated });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

// =========================================================
// CONTRACT CREATE
// =========================================================

app.post("/contracts", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const pnlId = String(body.pnlId ?? "");
    if (!pnlId) return res.status(400).json({ error: "pnlId required" });

    const allowed = [
      "dureeMois",
      "terrain",
      "installation",

      "cab",
      "genieCivil",
      "transport",
      "matierePremiere",
      "maintenance",
      "chargeuse",
      "branchementEau",
      "consoEau",
      "branchementElec",
      "consoElec",

      "postes",
      "sundayPrice",
      "delayPenalty",
      "chillerRent",
    ];

    const data: any = pick(body, allowed);

    if (data.dureeMois !== undefined) data.dureeMois = intOr0(data.dureeMois);
    if (data.postes !== undefined) data.postes = intOr0(data.postes);

    if (data.sundayPrice !== undefined) data.sundayPrice = Number(data.sundayPrice ?? 0);
    if (data.delayPenalty !== undefined) data.delayPenalty = Number(data.delayPenalty ?? 0);
    if (data.chillerRent !== undefined) data.chillerRent = Number(data.chillerRent ?? 0);

    const created = await prisma.contract.create({
      data: {
        pnlId,
        ...data,
      } as any,
    });

    return res.json({ ok: true, contract: created });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// =========================================================
// CONTRACT UPDATE (pour popup edit)
// ✅ + sanitize toutes les variantes du contrat
// =========================================================
app.put("/contracts/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = req.body ?? {};

  try {
    const allowed = [
      "dureeMois",
      "terrain",
      "installation",

      "cab",
      "genieCivil",
      "transport",
      "matierePremiere",
      "maintenance",
      "chargeuse",
      "branchementEau",
      "consoEau",
      "branchementElec",
      "consoElec",

      "postes",
      "sundayPrice",
      "delayPenalty",
      "chillerRent",
    ];

    const data: any = pick(body, allowed);

    if (data.dureeMois !== undefined) data.dureeMois = intOr0(data.dureeMois);
    if (data.postes !== undefined) data.postes = intOr0(data.postes);

    if (data.sundayPrice !== undefined) data.sundayPrice = Number(data.sundayPrice ?? 0);
    if (data.delayPenalty !== undefined) data.delayPenalty = Number(data.delayPenalty ?? 0);
    if (data.chillerRent !== undefined) data.chillerRent = Number(data.chillerRent ?? 0);

    delete data.status;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.contract.update({ where: { id }, data });

      const variants = await tx.variant.findMany({
        where: { contractId: id },
        select: { id: true },
      });

      const touchedVariantIds = variants.map((v) => v.id);

      // ✅ appliquer règles sur toutes les variantes du contrat
      for (const variantId of touchedVariantIds) {
        await sanitizeVariantByContract(tx, variantId, updated);
      }

      return { updated, touchedVariantIds };
    });

    return res.json({ ok: true, contract: result.updated, touchedVariantIds: result.touchedVariantIds });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

app.delete("/variants/:id/mps/:variantMpId", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const variantMpId = String(req.params.variantMpId);

    await prisma.variantMp.delete({ where: { id: variantMpId } });

    const variant = await getFullVariant(variantId);
    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

/* =========================================================
   VARIANT CRUD + UPDATE (partial payload)
========================================================= */

// ✅ CREATE VARIANT (respecte createMode + initiee/composee)
// ✅ + sanitize selon contrat à la fin (pour couvrir INITIEE/COMPOSEE)
app.post("/variants", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const contractId = String(body.contractId ?? "");
    if (!contractId) return res.status(400).json({ error: "contractId required" });

    const createMode = normalizeCreateMode(body.createMode);

    const createdVariantId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const v = await tx.variant.create({
        data: {
          contractId,
          title: String(body.title ?? "Variante"),
          description: body.description == null ? null : String(body.description),
          status: String(body.status ?? "INITIALISEE"),
        },
      });

      // Toujours créer un squelette complet (ZERO)
      await ensureVariantSkeleton(tx, v.id);

      // Appliquer INITIEE
      if (createMode === "INITIEE") {
        const initiee = body.initiee ?? body.initie ?? body.initiation ?? body.payload ?? null;
        if (initiee && typeof initiee === "object") {
          await applyInitiee(tx, {
            variantId: v.id,
            contractId,
            initiee: {
              volumeEstimeM3: numOr0((initiee as any).volumeEstimeM3),
              resistances: Array.isArray((initiee as any).resistances)
                ? (initiee as any).resistances.map((x: any) => String(x))
                : [],
              ebitCiblePct: numOr0((initiee as any).ebitCiblePct),
              etatCentrale:
                String((initiee as any).etatCentrale ?? "NEUVE") === "EXISTANTE" ? "EXISTANTE" : "NEUVE",
            },
          });
        }
      }

      // Appliquer COMPOSEE
      if (createMode === "COMPOSEE") {
        const composeeRaw = body.composee ?? body.compose ?? null;
        if (composeeRaw && typeof composeeRaw === "object") {
          await applyComposee(tx, {
            variantId: v.id,
            composee: {
              baseVariantId: (composeeRaw as any).baseVariantId ? String((composeeRaw as any).baseVariantId) : undefined,
              importAll: Boolean((composeeRaw as any).importAll ?? false),
              bySection: ((composeeRaw as any).bySection ?? {}) as any,
            },
          });
        }
      }

      // ✅ IMPORTANT: à la fin, on nettoie la variante selon le contrat
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      await sanitizeVariantByContract(tx, v.id, contract);

      return v.id;
    });

    const full = await getFullVariant(createdVariantId);
    return res.json(full ?? { id: createdVariantId });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err?.message ?? "Bad Request" });
  }
});

// ✅ UPDATE VARIANT (ton code complet déjà OK)
app.put("/variants/:id", async (req: Request, res: Response) => {
  const variantId = String(req.params.id);
  const body = req.body ?? {};

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const contract = await tx.contract.findUnique({
        where: {
          id:
            (await tx.variant.findUnique({ where: { id: variantId }, select: { contractId: true } }))?.contractId ?? "",
        },
      });

      /* =========================================================
         VARIANT META (title / status / description)
      ========================================================= */
      if (body.title !== undefined || body.status !== undefined || body.description !== undefined) {
        const data: any = {};
        if (body.title !== undefined) data.title = String(body.title ?? "");
        if (body.status !== undefined) data.status = String(body.status ?? "");
        if (body.description !== undefined) {
          data.description = body.description == null ? null : String(body.description);
        }

        await tx.variant.update({
          where: { id: variantId },
          data,
        });
      }

      /* =========================================================
         TRANSPORT
      ========================================================= */
      if (body.transport) {
const allowed = [
  "category",
  "type",
  "prixMoyen",
  "includePompage",      // ✅ AJOUT
  "volumePompePct",
  "prixAchatPompe",
  "prixVentePompe",
];
const data = pick(body.transport, allowed);


        await upsertPartialSection({
          tx,
          model: tx.sectionTransport,
          variantId,
          categoryDefault: "LOGISTIQUE_APPRO",
          defaults: {
            type: "MOYENNE",
            prixMoyen: 0,
            volumePompePct: null,
            prixAchatPompe: null,
            prixVentePompe: null,
            includePompage: false,   // ✅ AJOUT

          },
          data,
          logLabel: "transport",
        });
      }

      /* =========================================================
         CAB
      ========================================================= */
      if (body.cab) {
        const allowed = ["category", "etat", "mode", "capaciteM3", "amortMois"];
        const data = pick(body.cab, allowed);

        if (contract && isChargeClient((contract as any).cab)) {
          (data as any).amortMois = 0;
        }

        await upsertPartialSection({
          tx,
          model: tx.sectionCab,
          variantId,
          categoryDefault: "LOGISTIQUE_APPRO",
          defaults: {
            etat: "NEUVE",
            mode: "ACHAT",
            capaciteM3: 0,
            amortMois: 0,
          },
          data,
          logLabel: "cab",
        });
      }

      /* =========================================================
         MAINTENANCE
      ========================================================= */
      if (body.maintenance) {
        const allowed = ["category", "cab", "elec", "chargeur", "generale", "bassins", "preventive"];
        const data = pick(body.maintenance, allowed);

        await upsertPartialSection({
          tx,
          model: tx.sectionMaintenance,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: {
            cab: 0,
            elec: 0,
            chargeur: 0,
            generale: 0,
            bassins: 0,
            preventive: 0,
          },
          data,
          logLabel: "maintenance",
        });
      }

      /* =========================================================
         COUT / M3
      ========================================================= */
      if (body.coutM3) {
        const allowed = ["category", "eau", "qualite", "dechets"];
        const data = pick(body.coutM3, allowed);

        await upsertPartialSection({
          tx,
          model: tx.sectionCoutM3,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { eau: 0, qualite: 0, dechets: 0 },
          data,
          logLabel: "coutM3",
        });
      }

      /* =========================================================
         COUT MENSUEL
      ========================================================= */
      if (body.coutMensuel) {
        const incoming = { ...(body.coutMensuel ?? {}) };

        if (incoming.locationGroupes !== undefined && incoming.location === undefined) {
          incoming.location = incoming.locationGroupes;
        }
        delete incoming.locationGroupes;

        const allowed = [
          "category",
          "electricite",
          "gasoil",
          "location",
          "securite",
          "hebergements",
          "locationTerrain",
          "telephone",
          "troisG",
          "taxeProfessionnelle",
          "locationVehicule",
          "locationAmbulance",
          "locationBungalows",
          "epi",
        ];

        const data = pick(incoming, allowed);

        if (contract && isChargeClient((contract as any).consoElec)) {
          (data as any).electricite = 0;
          (data as any).location = 0;
        }
        if (contract && isChargeClient((contract as any).terrain)) {
          (data as any).locationTerrain = 0;
        }

        for (const k of Object.keys(data)) {
          if (k !== "category") (data as any)[k] = numOr0((data as any)[k]);
        }

        await upsertPartialSection({
          tx,
          model: tx.sectionCoutMensuel,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: {
            electricite: 0,
            gasoil: 0,
            location: 0,
            securite: 0,
            hebergements: 0,
            locationTerrain: 0,
            telephone: 0,
            troisG: 0,
            taxeProfessionnelle: 0,
            locationVehicule: 0,
            locationAmbulance: 0,
            locationBungalows: 0,
            epi: 0,
          },
          data,
          logLabel: "coutMensuel",
        });
      }

      /* =========================================================
         COUT OCCASIONNEL
      ========================================================= */
      if (body.coutOccasionnel) {
        const incoming = { ...(body.coutOccasionnel ?? {}) };

        if (incoming.installationCab !== undefined && incoming.installation === undefined) {
          incoming.installation = incoming.installationCab;
        }
        delete incoming.installationCab;

        const allowed = [
          "category",
          "genieCivil",
          "installation",
          "transport",
          "demontage",
          "remisePointCentrale",
          "silots",
          "localAdjuvant",
          "bungalows",
        ];

        const data = pick(incoming, allowed);

        if (contract && isChargeClient((contract as any).installation)) (data as any).installation = 0;
        if (contract && isChargeClient((contract as any).genieCivil)) (data as any).genieCivil = 0;
        if (contract && isChargeClient((contract as any).transport)) (data as any).transport = 0;

        for (const k of Object.keys(data)) {
          if (k !== "category") (data as any)[k] = numOr0((data as any)[k]);
        }

        await upsertPartialSection({
          tx,
          model: tx.sectionCoutOccasionnel,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: {
            genieCivil: 0,
            installation: 0,
            transport: 0,
            demontage: 0,
            remisePointCentrale: 0,
            silots: 0,
            localAdjuvant: 0,
            bungalows: 0,
          },
          data,
          logLabel: "coutOccasionnel",
        });
      }

      /* =========================================================
         EMPLOYES
      ========================================================= */
      if (body.employes) {
        const data = pick(body.employes, Object.keys(body.employes));
        for (const k of Object.keys(data)) {
          if (k !== "category") (data as any)[k] = numOr0((data as any)[k]);
        }

        await upsertPartialSection({
          tx,
          model: tx.sectionEmployes,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: {},
          data,
          logLabel: "employes",
        });
      }

      /* =========================================================
         AUTRES COUTS
      ========================================================= */
      if (body.autresCouts?.items) {
        const sec = await tx.sectionAutresCouts.upsert({
          where: { variantId },
          create: { variantId, category: "COUTS_CHARGES" },
          update: {},
        });

        await tx.autreCoutItem.deleteMany({ where: { variantId } });

        const items = body.autresCouts.items as Array<{ label: string; unite: string; valeur: number }>;

        if (items.length) {
          await tx.autreCoutItem.createMany({
            data: items.map((it) => ({
              sectionId: sec.id,
              variantId,
              label: String(it.label ?? ""),
              unite: String(it.unite ?? "FORFAIT"),
              valeur: Number(it.valeur ?? 0),
            })),
          });
        }
      }

      /* =========================================================
         FORMULES
      ========================================================= */
      if (body.formules?.items) {
        for (const it of body.formules.items) {
          await tx.variantFormule.update({
            where: { id: String(it.id) },
            data: {
              volumeM3: Number(it.volumeM3 ?? 0),
              momd: Number(it.momd ?? 0),
              ...(it.cmpOverride !== undefined ? { cmpOverride: it.cmpOverride } : {}),
            } as any,
          });
        }

        await syncVariantMpsFromFormules(tx, variantId);
      }
    });

    const variant = await getFullVariant(variantId);
    return res.json({ ok: true, variant });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err?.message ?? "Bad Request" });
  }
});

/* =========================================================
   MAJORATIONS (persistées)
========================================================= */
app.put("/variants/:id/majorations", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const incoming = req.body?.majorations;

    const map: Record<string, number> = incoming && typeof incoming === "object" ? incoming : {};

    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      const x = Number(v);
      normalized[k] = Number.isFinite(x) ? x : 0;
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sectionAutresCouts.upsert({
        where: { variantId },
        create: {
          variantId,
          category: "COUTS_CHARGES",
          majorations: JSON.stringify(normalized),
        },
        update: {
          majorations: JSON.stringify(normalized),
        },
      });
    });

    const variant = await getFullVariant(variantId);
    if (!variant) return res.status(404).json({ error: "Variant not found" });

    return res.json(variant);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

/* =========================================================
   DEVIS
========================================================= */
app.put("/variants/:id/devis", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const body = req.body ?? {};

    const toJson = (v: any, fallback: any) => {
      try {
        if (v === undefined) return undefined;
        return JSON.stringify(v ?? fallback);
      } catch {
        return JSON.stringify(fallback);
      }
    };

    const surchargesIn = body?.surcharges;
    let surchargesNorm: Record<string, number> | undefined = undefined;
    if (surchargesIn !== undefined) {
      const map: Record<string, number> =
        surchargesIn && typeof surchargesIn === "object" ? surchargesIn : {};
      const normalized: Record<string, number> = {};
      for (const [k, v] of Object.entries(map)) {
        const x = Number(v);
        normalized[k] = Number.isFinite(x) ? x : 0;
      }
      surchargesNorm = normalized;
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sectionDevis.upsert({
        where: { variantId },
        create: {
          variantId,
          category: "DEVIS",
          surcharge: 0,

          meta: JSON.stringify(body?.meta ?? {}),
          intro: String(body?.intro ?? ""),
          rappel: JSON.stringify(body?.rappel ?? {}),
          chargeFournisseur: JSON.stringify(body?.chargeFournisseur ?? []),
          chargeClient: JSON.stringify(body?.chargeClient ?? []),
          prixComplementaires: JSON.stringify(body?.prixComplementaires ?? []),
          validiteTexte: String(body?.validiteTexte ?? ""),
          signature: JSON.stringify(body?.signature ?? {}),
          surcharges: JSON.stringify(surchargesNorm ?? body?.surcharges ?? {}),
        },
        update: {
          ...(body.meta !== undefined ? { meta: toJson(body.meta, {}) } : {}),
          ...(body.intro !== undefined ? { intro: String(body.intro ?? "") } : {}),
          ...(body.rappel !== undefined ? { rappel: toJson(body.rappel, {}) } : {}),
          ...(body.chargeFournisseur !== undefined ? { chargeFournisseur: toJson(body.chargeFournisseur, []) } : {}),
          ...(body.chargeClient !== undefined ? { chargeClient: toJson(body.chargeClient, []) } : {}),
          ...(body.prixComplementaires !== undefined ? { prixComplementaires: toJson(body.prixComplementaires, []) } : {}),
          ...(body.validiteTexte !== undefined ? { validiteTexte: String(body.validiteTexte ?? "") } : {}),
          ...(body.signature !== undefined ? { signature: toJson(body.signature, {}) } : {}),
          ...(surchargesNorm !== undefined ? { surcharges: JSON.stringify(surchargesNorm) } : {}),
        } as any,
      });
    });

    const variant = await getFullVariant(variantId);
    if (!variant) return res.status(404).json({ error: "Variant not found" });

    return res.json(variant);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// ✅ Add formule to variant (sync MP)
app.post("/variants/:id/formules", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const formuleId = String(req.body?.formuleId ?? "");
    if (!formuleId) return res.status(400).json({ error: "formuleId required" });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sec = await tx.sectionFormules.upsert({
        where: { variantId },
        create: { variantId, category: "FORMULES" },
        update: {},
      });

      await tx.variantFormule.create({
        data: {
          variantId,
          sectionId: sec.id,
          formuleId,
          volumeM3: 0,
          momd: 0,
          cmpOverride: null,
        },
      });

      await syncVariantMpsFromFormules(tx, variantId);
    });

    const variant = await getFullVariant(variantId);
    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

app.put("/variants/:id/formules/:variantFormuleId", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const variantFormuleId = String(req.params.variantFormuleId);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.variantFormule.update({
        where: { id: variantFormuleId },
        data: {
          volumeM3: req.body?.volumeM3 == null ? undefined : Number(req.body.volumeM3),
          momd: req.body?.momd == null ? undefined : Number(req.body.momd),
          cmpOverride:
            req.body?.cmpOverride === undefined
              ? undefined
              : req.body.cmpOverride == null
              ? null
              : Number(req.body.cmpOverride),
        } as any,
      });

      await syncVariantMpsFromFormules(tx, variantId);
    });

    const variant = await getFullVariant(variantId);
    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// =========================================================
// VARIANT DELETE (cascade)
// =========================================================

app.delete("/variants/:variantId/formules/:variantFormuleId", async (req, res) => {
  const variantId = String(req.params.variantId);
  const variantFormuleId = String(req.params.variantFormuleId);

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.variantFormule.deleteMany({
        where: { id: variantFormuleId, variantId },
      });

      await syncVariantMpsFromFormules(tx, variantId);
    });

    const variant = await getFullVariant(variantId);
    if (!variant) return res.status(404).json({ error: "Variant not found" });

    return res.json({ ok: true, variant });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// =========================================================
// CONTRACT DELETE (cascade)
// =========================================================
app.delete("/contracts/:id", async (req: Request, res: Response) => {
  const contractId = String(req.params.id);

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const variants = await tx.variant.findMany({
        where: { contractId },
        select: { id: true },
      });

      const variantIds = variants.map((v) => v.id);

      if (variantIds.length) {
        await tx.variantFormule.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.variantMp.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.autreCoutItem.deleteMany({ where: { variantId: { in: variantIds } } });

        await tx.sectionTransport.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionCab.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionMaintenance.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionCoutM3.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionCoutMensuel.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionCoutOccasionnel.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionEmployes.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionAutresCouts.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionFormules.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionDevis.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.sectionMajorations.deleteMany({ where: { variantId: { in: variantIds } } });

        if ((tx as any).sectionMatierePremiere?.deleteMany) {
          await (tx as any).sectionMatierePremiere.deleteMany({ where: { variantId: { in: variantIds } } });
        }

        await tx.variant.deleteMany({ where: { id: { in: variantIds } } });
      }

      await tx.contract.delete({ where: { id: contractId } });
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// ✅ DELETE VARIANT (avec dépendances)
app.delete("/variants/:id", async (req: Request, res: Response) => {
  const variantId = String(req.params.id);

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const v = await tx.variant.findUnique({ where: { id: variantId }, select: { id: true } });
      if (!v) {
        const err: any = new Error("Variant not found");
        err.status = 404;
        throw err;
      }

      await tx.variantFormule.deleteMany({ where: { variantId } });
      await tx.variantMp.deleteMany({ where: { variantId } });
      await tx.autreCoutItem.deleteMany({ where: { variantId } });

      await tx.sectionTransport.deleteMany({ where: { variantId } });
      await tx.sectionCab.deleteMany({ where: { variantId } });
      await tx.sectionMaintenance.deleteMany({ where: { variantId } });
      await tx.sectionCoutM3.deleteMany({ where: { variantId } });
      await tx.sectionCoutMensuel.deleteMany({ where: { variantId } });
      await tx.sectionCoutOccasionnel.deleteMany({ where: { variantId } });
      await tx.sectionEmployes.deleteMany({ where: { variantId } });
      await tx.sectionAutresCouts.deleteMany({ where: { variantId } });
      await tx.sectionFormules.deleteMany({ where: { variantId } });
      await tx.sectionDevis.deleteMany({ where: { variantId } });
      await tx.sectionMajorations.deleteMany({ where: { variantId } });
      await tx.sectionMatierePremiere.deleteMany({ where: { variantId } });

      await tx.variant.delete({ where: { id: variantId } });
    });

    return res.json({ ok: true });
  } catch (e: any) {
    const status = Number(e?.status) || 400;
    console.error(e);
    return res.status(status).json({ error: e?.message ?? "Bad Request" });
  }
});

// =========================================================
// PNL DELETE (cascade)
// =========================================================
app.delete("/pnls/:id", async (req: Request, res: Response) => {
  const pnlId = String(req.params.id);

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const contracts = await tx.contract.findMany({
        where: { pnlId },
        select: { id: true },
      });

      for (const c of contracts) {
        const variants = await tx.variant.findMany({
          where: { contractId: c.id },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);

        if (variantIds.length) {
          await tx.variantFormule.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.variantMp.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.autreCoutItem.deleteMany({ where: { variantId: { in: variantIds } } });

          await tx.sectionTransport.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionCab.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionMaintenance.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionCoutM3.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionCoutMensuel.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionCoutOccasionnel.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionEmployes.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionAutresCouts.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionFormules.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionDevis.deleteMany({ where: { variantId: { in: variantIds } } });
          await tx.sectionMajorations.deleteMany({ where: { variantId: { in: variantIds } } });

          if ((tx as any).sectionMatierePremiere?.deleteMany) {
            await (tx as any).sectionMatierePremiere.deleteMany({ where: { variantId: { in: variantIds } } });
          }

          await tx.variant.deleteMany({ where: { id: { in: variantIds } } });
        }

        await tx.contract.delete({ where: { id: c.id } });
      }

      await tx.pnl.delete({ where: { id: pnlId } });
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});
