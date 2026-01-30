// src/server/index.ts
import express, { type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./db";
import { getPnls } from "./pnl.repo";
import { syncVariantMpsFromFormules } from "./variant.sync";

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

// ======================
// ✅ MP CATALOGUE CRUD
// ======================
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

// ======================
// ✅ FORMULES CATALOGUE CRUD
// ======================
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

    await prisma.$transaction(async (tx) => {
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

      // ✅ IMPORTANT: composition a changé => sync MP de toutes les variantes qui utilisent cette formule
      const variantIds = await tx.variantFormule.findMany({
        where: { formuleId },
        select: { variantId: true },
      });

      for (const row of variantIds) {
        await syncVariantMpsFromFormules(tx as any, String(row.variantId));
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

// ======================
// ✅ PNL CRUD
// ======================
app.post("/pnls", async (req: Request, res: Response) => {
  try {
    const created = await prisma.pnl.create({ data: req.body });
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.put("/pnls/:id", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.pnl.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.delete("/pnls/:id", async (req: Request, res: Response) => {
  try {
    await prisma.pnl.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

// ======================
// ✅ CONTRACT CRUD
// ======================
app.post("/contracts", async (req: Request, res: Response) => {
  try {
    const created = await prisma.contract.create({ data: req.body });
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.put("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.contract.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.delete("/contracts/:id", async (req: Request, res: Response) => {
  try {
    await prisma.contract.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

// ======================
// ✅ VARIANT CRUD
// ======================
app.post("/variants", async (req: Request, res: Response) => {
  try {
    const created = await prisma.variant.create({
      data: {
        ...req.body,
        autresCouts: {
          create: { variantId: undefined, category: "COUTS_CHARGES" }, // juste section vide
        },
      },
    });

    // ✅ sync MP (au cas où des formules sont ajoutées juste après)
    await prisma.$transaction(async (tx) => {
      await syncVariantMpsFromFormules(tx as any, created.id);
    });

    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

// ✅ UPDATE VARIANT = upsert sections + replace autresCouts.items + update variantFormules (volume/momd)
// + sync MP depuis formules (source of truth)
app.put("/variants/:id", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const body = req.body ?? {};

    await prisma.$transaction(async (tx) => {
      // -------- 1) upsert sections (1:1)
      const upsert = async (model: any, data: any, defaultCategory: string) => {
        if (!data) return;
        await model.upsert({
          where: { variantId },
          create: { variantId, category: data.category ?? defaultCategory, ...data },
          update: data,
        });
      };

      await upsert(tx.sectionTransport, body.transport, "LOGISTIQUE_APPRO");
      await upsert(tx.sectionCab, body.cab, "LOGISTIQUE_APPRO");
      await upsert(tx.sectionMaintenance, body.maintenance, "COUTS_CHARGES");
      await upsert(tx.sectionCoutM3, body.coutM3, "COUTS_CHARGES");
      await upsert(tx.sectionCoutMensuel, body.coutMensuel, "COUTS_CHARGES");
      await upsert(tx.sectionCoutOccasionnel, body.coutOccasionnel, "COUTS_CHARGES");
      await upsert(tx.sectionEmployes, body.employes, "COUTS_CHARGES");
      await upsert(tx.sectionDevis, body.devis, "DEVIS");

      // -------- 2) autresCouts items : replace (sauf tu veux gérer item par item)
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

      // -------- 3) update variant formules (volume/momd)
      // ⚠️ CMP ne se stocke pas ici : CMP vient de la composition + prix MP variant
      if (body.formules?.items) {
        const items = body.formules.items as Array<{
          id: string;
          volumeM3: number;
          momd: number;
        }>;

        for (const it of items) {
          await tx.variantFormule.update({
            where: { id: String(it.id) },
            data: {
              volumeM3: Number(it.volumeM3 ?? 0),
              momd: Number(it.momd ?? 0),
            },
          });
        }
      }

      // ✅ 4) sync MP (source of truth = formules)
      await syncVariantMpsFromFormules(tx as any, variantId);
    });

    const updated = await prisma.variant.findUnique({
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
              include: { formule: { include: { items: { include: { mp: true } } } } },
            },
          },
        },
      },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.delete("/variants/:id", async (req: Request, res: Response) => {
  try {
    await prisma.variant.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

// ======================
// ✅ VARIANT MP (override seulement)
// ======================

// ✅ Update override prix/comment sur VariantMp (pas d’ajout/suppression manuelle)
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

    const variant = await prisma.variant.findUnique({
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
              include: { formule: { include: { items: { include: { mp: true } } } } },
            },
          },
        },
      },
    });

    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// ======================
// ✅ VARIANT FORMULES (add/remove + update volume/momd)
// ======================

// ✅ Add formule to variant (puis sync MP auto)
app.post("/variants/:id/formules", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const formuleId = String(req.body?.formuleId ?? "");
    if (!formuleId) return res.status(400).json({ error: "formuleId required" });

    await prisma.$transaction(async (tx) => {
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
        },
      });

      // ✅ sync MP auto (union des MP utilisées)
      await syncVariantMpsFromFormules(tx as any, variantId);
    });

    const variant = await prisma.variant.findUnique({
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

    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// ✅ Update variant formule (volume, MOMD)
app.put("/variants/:id/formules/:variantFormuleId", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const variantFormuleId = String(req.params.variantFormuleId);

    await prisma.variantFormule.update({
      where: { id: variantFormuleId },
      data: {
        volumeM3: req.body?.volumeM3 == null ? undefined : Number(req.body.volumeM3),
        momd: req.body?.momd == null ? undefined : Number(req.body.momd),
      },
    });

    // (pas besoin de sync MP ici: composition n’a pas changé)
    const variant = await prisma.variant.findUnique({
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

    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

// ✅ Remove formule from variant (puis sync MP auto)
app.delete("/variants/:id/formules/:variantFormuleId", async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.id);
    const variantFormuleId = String(req.params.variantFormuleId);

    await prisma.$transaction(async (tx) => {
      await tx.variantFormule.delete({ where: { id: variantFormuleId } });

      // ✅ sync MP auto
      await syncVariantMpsFromFormules(tx as any, variantId);
    });

    const variant = await prisma.variant.findUnique({
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

    res.json({ ok: true, variant });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e?.message ?? "Bad Request" });
  }
});

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});
