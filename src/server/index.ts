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
 * - Crée VariantMp manquants (prix = prix catalogue)
 * - Supprime VariantMp non utilisés (si MP utilisée par aucune formule)
 * - Garde les overrides prix existants pour ceux qui restent
 */
async function syncVariantMpsFromFormules(tx: Prisma.TransactionClient, variantId: string) {
  // section MP
  const sec = await tx.sectionMatierePremiere.upsert({
    where: { variantId },
    create: { variantId, category: "LOGISTIQUE_APPRO" },
    update: {},
  });

  // récupérer toutes les MP utilisées par toutes les formules de la variante
  const vfs = await tx.variantFormule.findMany({
    where: { variantId },
    include: {
      formule: { include: { items: true } }, // items: { mpId, qty }
    },
  });

  const usedMpIds = new Set<string>();
  for (const vf of vfs) {
    for (const it of vf.formule?.items ?? []) usedMpIds.add(String(it.mpId));
  }

  // existants dans la variante
  const existing = await tx.variantMp.findMany({ where: { variantId } });
  const existingByMp = new Map(existing.map((x) => [x.mpId, x]));

  // créer manquants
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

  // supprimer non utilisés
  const toDeleteIds = existing.filter((x) => !usedMpIds.has(x.mpId)).map((x) => x.id);
  if (toDeleteIds.length) {
    await tx.variantMp.deleteMany({ where: { id: { in: toDeleteIds } } });
  }

  // si plus aucune formule => vider MP variante
  if (usedMpIds.size === 0) {
    await tx.variantMp.deleteMany({ where: { variantId } });
  }
}

/**
 * Upsert “tolerant” :
 * - Si la section existe déjà: update PARTIEL (on n'oblige pas à envoyer tous les champs)
 * - Sinon: create avec defaults + data partiel
 */
async function upsertPartialSection(params: {
  tx: Prisma.TransactionClient;
  model: any; // tx.sectionTransport, etc.
  variantId: string;
  categoryDefault: string;
  defaults: Record<string, any>;
  data: Record<string, any>;
}) {
const { model, variantId, categoryDefault, defaults, data } = params;
  if (!data) return;

  const existing = await model.findUnique({ where: { variantId } });
  if (existing) {
    // update partiel
    await model.update({
      where: { variantId },
      data: {
        ...data,
        category: data.category ?? existing.category ?? categoryDefault,
      },
    });
  } else {
    // create avec defaults + ce qu'on reçoit
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
  try {
    await prisma.mpCatalogue.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
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
  try {
    await prisma.formuleCatalogue.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

// composition items
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
    });

    const updated = await prisma.formuleCatalogue.findUnique({
      where: { id: formuleId },
      include: { items: true },
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Bad Request" });
  }
});

/* =========================================================
   VARIANT MP (override prix/comment)
   (tu peux les garder même si tu n'affiches pas d'actions sur MP)
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
   VARIANT CRUD + UPDATE (FIX partial payload) + FORMULES routes
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

// ✅ UPDATE VARIANT : accepte payload partiel (transport prixMoyen seul, etc.)
app.put("/variants/:id", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const body = req.body ?? {};

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // TRANSPORT
      if (body.transport) {
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
          data: body.transport,
        });
      }

      // CAB
      if (body.cab) {
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
          data: body.cab,
        });
      }

      // Maintenance
      if (body.maintenance) {
        await upsertPartialSection({
          tx,
          model: tx.sectionMaintenance,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { cab: 0, elec: 0, chargeur: 0, generale: 0, bassins: 0, preventive: 0 },
          data: body.maintenance,
        });
      }

      // Coût / m3
      if (body.coutM3) {
        await upsertPartialSection({
          tx,
          model: tx.sectionCoutM3,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { eau: 0, qualite: 0, dechets: 0 },
          data: body.coutM3,
        });
      }

      // Coût mensuel
      if (body.coutMensuel) {
        await upsertPartialSection({
          tx,
          model: tx.sectionCoutMensuel,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { electricite: 0, gasoil: 0, location: 0, securite: 0 },
          data: body.coutMensuel,
        });
      }

      // Coût occasionnel
      if (body.coutOccasionnel) {
        await upsertPartialSection({
          tx,
          model: tx.sectionCoutOccasionnel,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { genieCivil: 0, installation: 0, transport: 0 },
          data: body.coutOccasionnel,
        });
      }

      // Employés
      if (body.employes) {
        await upsertPartialSection({
          tx,
          model: tx.sectionEmployes,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { responsableNb: 0, responsableCout: 0, centralistesNb: 0, centralistesCout: 0 },
          data: body.employes,
        });
      }

      // Autres coûts: replace items
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

      // Formules: update volumes/momd
      if (body.formules?.items) {
        const items = body.formules.items as Array<{ id: string; volumeM3: number; momd: number; cmpOverride?: number | null }>;
        for (const it of items) {
          await tx.variantFormule.update({
            where: { id: String(it.id) },
            data: {
              volumeM3: Number(it.volumeM3 ?? 0),
              momd: Number(it.momd ?? 0),
              // on ignore cmpOverride si ton schema ne l'a pas
              ...(it.cmpOverride !== undefined ? { cmpOverride: it.cmpOverride } : {}),
            } as any,
          });
        }

        // 🔥 Sync MP après modif formules (utile si tu changes catalogue + resync plus tard)
        await syncVariantMpsFromFormules(tx, variantId);
      }
    });

    const updated = await getFullVariant(variantId);
    res.json(updated);
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err?.message ?? "Bad Request" });
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

// ✅ Update variant formule (volume, MOMD, CMP override) + sync MP (au cas où)
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

// ✅ Remove formule from variant (sync MP)
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

// (optionnel) delete variant
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
