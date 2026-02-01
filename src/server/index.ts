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
 * Upsert “tolerant” :
 * - Si la section existe déjà: update PARTIEL (on n'oblige pas à envoyer tous les champs)
 * - Sinon: create avec defaults + data partiel
 */
async function upsertPartialSection(params: {
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
    await model.update({
      where: { variantId },
      data: {
        ...data,
        category: data.category ?? existing.category ?? categoryDefault,
      },
    });
  } else {
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
   NORMALIZERS (compat + sécurité Prisma)
========================================================= */

function pickDefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// coutMensuel: UI peut envoyer locationGroupes, DB attend location
function normalizeCoutMensuel(payload: any) {
  const p = payload ?? {};
  const mapped = {
    ...p,
    // compat UI -> DB
    location: p.location ?? p.locationGroupes,
  };
  delete mapped.locationGroupes;
  return pickDefined(mapped);
}

// coutOccasionnel: UI peut envoyer installationCab, DB attend installation
function normalizeCoutOccasionnel(payload: any) {
  const p = payload ?? {};
  const mapped = {
    ...p,
    installation: p.installation ?? p.installationCab,
  };
  delete mapped.installationCab;
  return pickDefined(mapped);
}

// Employes: s'assure que si UI envoie des champs, ils passent,
// et si section n'existe pas, on create avec defaults COMPLETS.
function normalizeEmployes(payload: any) {
  const p = payload ?? {};
  return pickDefined(p);
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

// composition items + resync variants using this formule
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
   VARIANT CRUD + UPDATE
========================================================= */

app.post("/variants", async (req: Request, res: Response) => {
  try {
    const created = await prisma.variant.create({
      data: {
        ...req.body,
        // ✅ création correcte SectionAutresCouts + 1 item par défaut
        autresCouts: {
          create: {
            category: "COUTS_CHARGES",
            items: {
              create: [
                {
                  label: "Frais généraux",
                  unite: "POURCENT_CA",
                  valeur: 0,
                },
              ],
            },
          },
        },
      },
    });
    res.json(created);
  } catch (err: any) {
    console.error("POST /variants failed", err);
    res.status(400).json({ error: err?.message ?? "Bad Request" });
  }
});

// ✅ UPDATE VARIANT : accepte payload partiel + normalise compat
app.put("/variants/:id", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const body = req.body ?? {};

    console.log("PUT /variants/:id", variantId, "keys=", Object.keys(body));

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // TRANSPORT
      if (body.transport) {
        await upsertPartialSection({
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
          model: tx.sectionCoutM3,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: { eau: 0, qualite: 0, dechets: 0 },
          data: body.coutM3,
        });
      }

      // ✅ Coût mensuel (compat: locationGroupes -> location)
      if (body.coutMensuel) {
        const normalized = normalizeCoutMensuel(body.coutMensuel);
        console.log("coutMensuel normalized =", normalized);

        await upsertPartialSection({
          model: tx.sectionCoutMensuel,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          // ✅ defaults complets (évite create incomplet)
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
          data: normalized,
        });
      }

      // ✅ Coût occasionnel (compat: installationCab -> installation)
      if (body.coutOccasionnel) {
        const normalized = normalizeCoutOccasionnel(body.coutOccasionnel);
        console.log("coutOccasionnel normalized =", normalized);

        await upsertPartialSection({
          model: tx.sectionCoutOccasionnel,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          // ✅ defaults complets
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
          data: normalized,
        });
      }

      // ✅ Employés (defaults complets => tous les rôles sauvés si colonnes Prisma existent)
      if (body.employes) {
        const normalized = normalizeEmployes(body.employes);
        console.log("employes normalized =", normalized);

        await upsertPartialSection({
          model: tx.sectionEmployes,
          variantId,
          categoryDefault: "COUTS_CHARGES",
          defaults: {
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
          data: normalized,
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

      // Formules: update volumes/momd (+ sync MP)
      if (body.formules?.items) {
        const items = body.formules.items as Array<{ id: string; volumeM3: number; momd: number; cmpOverride?: number | null }>;

        for (const it of items) {
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

    const updated = await getFullVariant(variantId);
    res.json(updated);
  } catch (err: any) {
    console.error("PUT /variants/:id failed", err);
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

// ✅ Update variant formule (volume, MOMD, CMP override) + sync MP
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

// delete variant
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
