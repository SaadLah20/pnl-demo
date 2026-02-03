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

app.post("/variants", async (req: Request, res: Response) => {
  try {
    const created = await prisma.variant.create({
      data: {
        ...req.body,
        autresCouts: {
          create: {
            category: "COUTS_CHARGES",
            label: "Frais généraux",
            unite: "POURCENT_CA",
            valeur: 0,
          },
        },
      },
    });
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
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
