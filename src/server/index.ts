// src/server/index.ts
import express, { type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./db";
import { getPnls } from "./pnl.repo";

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

// -------- PNL CRUD
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
      where: { id: req.params.id as string },
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
    await prisma.pnl.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

// -------- CONTRACT CRUD
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
      where: { id: req.params.id as string },
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
    await prisma.contract.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

// -------- VARIANT CRUD
// ✅ crée aussi automatiquement AutresCouts (Frais généraux = 0%)
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

app.put("/variants/:id", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.variant.update({
      where: { id: req.params.id as string },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.delete("/variants/:id", async (req: Request, res: Response) => {
  try {
    await prisma.variant.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});
