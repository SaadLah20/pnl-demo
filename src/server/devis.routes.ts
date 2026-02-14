// src/server/devis.routes.ts (FICHIER COMPLET)
import type { Express, Request, Response } from "express";
import { buildDevisWordBuffer } from "./devis.word";
import { buildDevisMultiWordBuffer } from "./devis.multi.word";
import { prisma } from "./db";

function safeFileName(input: string) {
  return String(input ?? "Devis")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBool(v: any, def: boolean) {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}

export function registerDevisRoutes(app: Express) {
  // =========================================================
  // Export Word (DOCX) - mono variante
  //   ?useMajorations=1|0
  //   ?useDevisSurcharges=1|0
  // =========================================================
  app.get("/variants/:id/devis/word", async (req: Request, res: Response) => {
    try {
      const variantId = String(req.params.id);

      const useMajorations = parseBool(req.query.useMajorations, true);
      const useDevisSurcharges = parseBool(req.query.useDevisSurcharges, true);

      const v: any = await prisma.variant.findUnique({
        where: { id: variantId },
        include: { contract: { include: { pnl: true } } },
      });

      const pnlTitle = safeFileName(v?.contract?.pnl?.title ?? v?.title ?? "Devis");

      const dt = new Date();
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");

      const buf = await buildDevisWordBuffer(variantId, {
        useMajorations,
        useDevisSurcharges,
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${pnlTitle} - Offre de prix - ${yyyy}-${mm}-${dd}.docx"`);

      return res.status(200).send(buf);
    } catch (e: any) {
      console.error("[GET /variants/:id/devis/word]", e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }
  });

  // =========================================================
  // ✅ Export Word (DOCX) - MULTI variantes
  // POST /devis/multi/word
  // body: { variantIds: string[], useMajorations?: boolean, useDevisSurcharges?: boolean, meta?: {...} }
  // =========================================================
  app.post("/devis/multi/word", async (req: Request, res: Response) => {
    try {
      const variantIds = Array.isArray(req.body?.variantIds) ? req.body.variantIds.map(String).filter(Boolean) : [];
      if (!variantIds.length) return res.status(400).json({ error: "variantIds manquant." });

      const useMajorations = parseBool(req.body?.useMajorations, true);
      const useDevisSurcharges = parseBool(req.body?.useDevisSurcharges, true);
      const meta = req.body?.meta ?? null;

      // nom de fichier propre: basé sur pnl du 1er id (si cohérent)
      const first: any = await prisma.variant.findUnique({
        where: { id: String(variantIds[0]) },
        include: { contract: { include: { pnl: true } } },
      });

      const baseTitle = safeFileName(meta?.titreProjet ?? first?.contract?.pnl?.title ?? "Devis multi");

      const dt = new Date();
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");

      const buf = await buildDevisMultiWordBuffer(variantIds, {
        useMajorations,
        useDevisSurcharges,
        meta,
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${baseTitle} - Propositions de prix - ${yyyy}-${mm}-${dd}.docx"`
      );

      return res.status(200).send(buf);
    } catch (e: any) {
      console.error("[POST /devis/multi/word]", e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }
  });
}
