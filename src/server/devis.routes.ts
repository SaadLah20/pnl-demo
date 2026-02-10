// src/server/devis.routes.ts
import type { Express, Request, Response } from "express";
import { buildDevisWordBuffer } from "./devis.word";
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
  // Export Word (DOCX)
  // ✅ options:
  //   ?useMajorations=1|0
  //   ?useDevisSurcharges=1|0
  app.get("/variants/:id/devis/word", async (req: Request, res: Response) => {
    try {
      const variantId = String(req.params.id);

      // ✅ flags d'export (par défaut TRUE / TRUE)
      const useMajorations = parseBool(req.query.useMajorations, true);
      const useDevisSurcharges = parseBool(req.query.useDevisSurcharges, true);

      // petit fetch pour un nom de fichier propre
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

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${pnlTitle} - Offre de prix - ${yyyy}-${mm}-${dd}.docx"`
      );

      return res.status(200).send(buf);
    } catch (e: any) {
      console.error("[GET /variants/:id/devis/word]", e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }
  });
}
