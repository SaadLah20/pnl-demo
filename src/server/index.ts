// src/server/index.ts
import express, { type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./db";
import { getPnls } from "./pnl.repo";
import { Prisma } from "@prisma/client";

const app = express();

app.use(cors());
app.use(express.json());

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
    include: {
      formule: { include: { items: true } },
    },
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
        region: req.body?.region === undefined ? undefined : String(req.body.region),
        status: req.body?.status === undefined ? undefined : String(req.body.status),
        // ⚠️ model non modifiable volontairement
      },
    });

    res.json({ ok: true, pnl: updated });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// =========================================================
// CONTRACT UPDATE (pour popup edit)
// =========================================================
app.put("/contracts/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = req.body ?? {};

  try {
    // ✅ Autoriser UNIQUEMENT les champs réellement existants dans Contract
    // (d'après ton message Prisma)
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

    // casts propres (optionnel mais recommandé)
    if (data.dureeMois !== undefined) data.dureeMois = numOr0(data.dureeMois);
    if (data.postes !== undefined) data.postes = Math.trunc(numOr0(data.postes));

    if (data.sundayPrice !== undefined) data.sundayPrice = Number(data.sundayPrice ?? 0);
    if (data.delayPenalty !== undefined) data.delayPenalty = Number(data.delayPenalty ?? 0);
    if (data.chillerRent !== undefined) data.chillerRent = Number(data.chillerRent ?? 0);

    // 🔥 IMPORTANT : on ignore explicitement "status" si le front l'envoie
    // (ça évite l'erreur Prisma)
    delete data.status;

    const updated = await prisma.contract.update({ where: { id }, data });
    return res.json({ ok: true, contract: updated });
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

type VariantCreateMode = "INITIALISEE" | "ZERO" | "INITIEE" | "COMPOSEE";

function asMode(v: any): VariantCreateMode {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "ZERO") return "ZERO";
  if (s === "INITIEE" || s === "INITIÉE") return "INITIEE";
  if (s === "COMPOSEE" || s === "COMPOSÉE") return "COMPOSEE";
  return "INITIALISEE";
}

async function ensureAutresCoutsDefault(tx: Prisma.TransactionClient, variantId: string) {
  const sec = await tx.sectionAutresCouts.upsert({
    where: { variantId },
    create: { variantId, category: "COUTS_CHARGES" },
    update: {},
  });

  // Ajoute au moins 1 item par défaut (si vide)
  const cnt = await tx.autreCoutItem.count({ where: { variantId } });
  if (cnt === 0) {
    await tx.autreCoutItem.create({
      data: {
        sectionId: sec.id,
        variantId,
        label: "Frais généraux",
        unite: "POURCENT_CA",
        valeur: 0,
      },
    });
  }
}

async function initVariantZero(tx: Prisma.TransactionClient, variantId: string) {
  await tx.sectionTransport.create({
    data: {
      variantId,
      category: "LOGISTIQUE_APPRO",
      type: "MOYENNE",
      prixMoyen: 0,
      volumePompePct: 0,
      prixAchatPompe: 0,
      prixVentePompe: 0,
    },
  });

  await tx.sectionCab.create({
    data: {
      variantId,
      category: "LOGISTIQUE_APPRO",
      etat: "NEUVE",
      mode: "ACHAT",
      capaciteM3: 0,
      amortMois: 0,
    },
  });

  await tx.sectionMaintenance.create({
    data: {
      variantId,
      category: "COUTS_CHARGES",
      cab: 0,
      elec: 0,
      chargeur: 0,
      generale: 0,
      bassins: 0,
      preventive: 0,
    },
  });

  await tx.sectionCoutM3.create({
    data: {
      variantId,
      category: "COUTS_CHARGES",
      eau: 0,
      qualite: 0,
      dechets: 0,
    },
  });

  await tx.sectionCoutMensuel.create({
    data: {
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
  });

  await tx.sectionCoutOccasionnel.create({
    data: {
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
  });

  await tx.sectionEmployes.create({
    data: {
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
    },
  });

  await tx.sectionMatierePremiere.create({
    data: { variantId, category: "LOGISTIQUE_APPRO" },
  });

  await tx.sectionFormules.create({
    data: { variantId, category: "FORMULES" },
  });

  await tx.sectionMajorations.create({
    data: { variantId, category: "MAJORATIONS" },
  });

  await tx.sectionDevis.create({
    data: { variantId, category: "DEVIS" },
  });

  await ensureAutresCoutsDefault(tx, variantId);
}

function rnd(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

async function initVariantInitiee(tx: Prisma.TransactionClient, variantId: string) {
  // base zero
  await initVariantZero(tx, variantId);

  // randomise quelques champs (placeholder)
  await tx.sectionTransport.update({
    where: { variantId },
    data: {
      type: Math.random() > 0.5 ? "MOYENNE" : "PAR_ZONE",
      prixMoyen: rnd(50, 120),
      volumePompePct: rnd(0, 80),
      prixAchatPompe: rnd(0, 150),
      prixVentePompe: rnd(0, 220),
    },
  });

  await tx.sectionMaintenance.update({
    where: { variantId },
    data: {
      cab: rnd(0, 30000),
      elec: rnd(0, 30000),
      chargeur: rnd(0, 30000),
      generale: rnd(0, 15000),
      bassins: rnd(0, 8000),
      preventive: rnd(0, 12000),
    },
  });

  await tx.sectionCoutM3.update({
    where: { variantId },
    data: { eau: rnd(0, 6), qualite: rnd(0, 4), dechets: rnd(0, 4) },
  });

  // random formules (si catalogue présent)
  const secForm = await tx.sectionFormules.findUnique({ where: { variantId } });
  if (secForm) {
    const all = await tx.formuleCatalogue.findMany({ select: { id: true } });
    const pickN = all.sort(() => 0.5 - Math.random()).slice(0, Math.min(2, all.length));
    for (const f of pickN) {
      await tx.variantFormule.create({
        data: {
          variantId,
          sectionId: secForm.id,
          formuleId: f.id,
          volumeM3: rnd(10, 150),
          momd: rnd(0, 25),
          cmpOverride: null,
        },
      });
    }
    await syncVariantMpsFromFormules(tx, variantId);
  }
}

async function cloneVariantFrom(tx: Prisma.TransactionClient, sourceVariantId: string, targetVariantId: string) {
  const src = await tx.variant.findUnique({
    where: { id: sourceVariantId },
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
      mp: true,
      formules: true,
      variantMps: true,
      variantFormules: true,
    },
  });
  if (!src) throw new Error("SOURCE_VARIANT_NOT_FOUND");

  // Sections (copie brute)
  if (src.transport) {
    const { id: _id, variantId: _v, ...data } = src.transport as any;
    await tx.sectionTransport.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.cab) {
    const { id: _id, variantId: _v, ...data } = src.cab as any;
    await tx.sectionCab.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.maintenance) {
    const { id: _id, variantId: _v, ...data } = src.maintenance as any;
    await tx.sectionMaintenance.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.coutM3) {
    const { id: _id, variantId: _v, ...data } = src.coutM3 as any;
    await tx.sectionCoutM3.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.coutMensuel) {
    const { id: _id, variantId: _v, ...data } = src.coutMensuel as any;
    await tx.sectionCoutMensuel.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.coutOccasionnel) {
    const { id: _id, variantId: _v, ...data } = src.coutOccasionnel as any;
    await tx.sectionCoutOccasionnel.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.employes) {
    const { id: _id, variantId: _v, ...data } = src.employes as any;
    await tx.sectionEmployes.create({ data: { variantId: targetVariantId, ...data } });
  }

  // bare sections
  if (src.mp) {
    const { id: _id, variantId: _v, ...data } = src.mp as any;
    await tx.sectionMatierePremiere.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.formules) {
    const { id: _id, variantId: _v, ...data } = src.formules as any;
    await tx.sectionFormules.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.majorations) {
    const { id: _id, variantId: _v, ...data } = src.majorations as any;
    await tx.sectionMajorations.create({ data: { variantId: targetVariantId, ...data } });
  }
  if (src.devis) {
    const { id: _id, variantId: _v, ...data } = src.devis as any;
    await tx.sectionDevis.create({ data: { variantId: targetVariantId, ...data } });
  }

  // Autres couts
  const secAc = await tx.sectionAutresCouts.create({
    data: { variantId: targetVariantId, category: src.autresCouts?.category ?? "COUTS_CHARGES" },
  });
  const items = (src.autresCouts?.items ?? []) as any[];
  if (items.length) {
    await tx.autreCoutItem.createMany({
      data: items.map((it) => ({
        sectionId: secAc.id,
        variantId: targetVariantId,
        label: String(it.label ?? ""),
        unite: String(it.unite ?? "FORFAIT"),
        valeur: Number(it.valeur ?? 0),
      })),
    });
  } else {
    await ensureAutresCoutsDefault(tx, targetVariantId);
  }

  // Variant formules + sync MP
  const secForm = await tx.sectionFormules.findUnique({ where: { variantId: targetVariantId } });
  if (secForm) {
    for (const vf of src.variantFormules ?? []) {
      await tx.variantFormule.create({
        data: {
          variantId: targetVariantId,
          sectionId: secForm.id,
          formuleId: vf.formuleId,
          volumeM3: Number(vf.volumeM3 ?? 0),
          momd: Number(vf.momd ?? 0),
          cmpOverride: vf.cmpOverride ?? null,
        },
      });
    }
  }
  await syncVariantMpsFromFormules(tx, targetVariantId);

  // MP overrides (si existants)
  const secMp = await tx.sectionMatierePremiere.findUnique({ where: { variantId: targetVariantId } });
  if (secMp) {
    for (const vm of src.variantMps ?? []) {
      await tx.variantMp.upsert({
        where: { variantId_mpId: { variantId: targetVariantId, mpId: vm.mpId } },
        create: {
          variantId: targetVariantId,
          sectionId: secMp.id,
          mpId: vm.mpId,
          prix: Number(vm.prix ?? 0),
          comment: vm.comment ?? null,
          prixOverride: vm.prixOverride ?? null,
        },
        update: {
          prix: Number(vm.prix ?? 0),
          comment: vm.comment ?? null,
          prixOverride: vm.prixOverride ?? null,
        },
      });
    }
  }
}

app.post("/variants", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const mode = asMode(body.createMode);
    const contractId = String(body.contractId ?? "");
    if (!contractId) return res.status(400).json({ error: "contractId required" });

    const title = String(body.title ?? "Variante");
    const description = body.description == null ? null : String(body.description);
    const status = body.status === undefined ? undefined : String(body.status);
    const sourceVariantId = body.sourceVariantId ? String(body.sourceVariantId) : "";

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const v = await tx.variant.create({
        data: {
          contractId,
          title,
          description,
          ...(status ? { status } : {}),
        },
      });

      if (mode === "ZERO") {
        await initVariantZero(tx, v.id);
      } else if (mode === "INITIEE") {
        await initVariantInitiee(tx, v.id);
      } else if (mode === "COMPOSEE") {
        if (!sourceVariantId) throw new Error("sourceVariantId required for COMPOSEE");
        await cloneVariantFrom(tx, sourceVariantId, v.id);
      } else {
        // INITIALISEE => on crée juste un squelette "autres couts" pour compat UI
        await ensureAutresCoutsDefault(tx, v.id);
      }

      return v;
    });

    const variant = await getFullVariant(created.id);
    return res.json({ ok: true, variant });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err?.message ?? "Bad Request" });
  }
});

// ✅ UPDATE VARIANT
app.put("/variants/:id", async (req: Request, res: Response) => {
  const variantId = String(req.params.id);
  const body = req.body ?? {};

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

      /* =========================================================
         VARIANT META (title / status / description)
      ========================================================= */
      if (
        body.title !== undefined ||
        body.status !== undefined ||
        body.description !== undefined
      ) {
        const data: any = {};
        if (body.title !== undefined) data.title = String(body.title ?? "");
        if (body.status !== undefined) data.status = String(body.status ?? "");
        if (body.description !== undefined) {
          data.description =
            body.description == null ? null : String(body.description);
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
        const allowed = [
          "category",
          "cab",
          "elec",
          "chargeur",
          "generale",
          "bassins",
          "preventive",
        ];
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

        if (
          incoming.locationGroupes !== undefined &&
          incoming.location === undefined
        ) {
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

        if (
          incoming.installationCab !== undefined &&
          incoming.installation === undefined
        ) {
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

        const items = body.autresCouts.items as Array<{
          label: string;
          unite: string;
          valeur: number;
        }>;

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
              ...(it.cmpOverride !== undefined
                ? { cmpOverride: it.cmpOverride }
                : {}),
            } as any,
          });
        }

        await syncVariantMpsFromFormules(tx, variantId);
      }
    });

    // ✅ UNE SEULE REPONSE, ICI
    const variant = await getFullVariant(variantId);
    return res.json({ ok: true, variant });

  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err?.message ?? "Bad Request" });
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

app.delete("/variants/:id/formules/:variantFormuleId", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const variantFormuleId = String(req.params.variantFormuleId);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.variantFormule.delete({ where: { id: variantFormuleId } });
      await syncVariantMpsFromFormules(tx, variantId);
    });

    const variant = await getFullVariant(variantId);
    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

app.delete("/variants/:id", async (req: Request, res: Response) => {
  try {
    await prisma.variant.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err?.message ?? "Bad Request" });
  }
});

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});
