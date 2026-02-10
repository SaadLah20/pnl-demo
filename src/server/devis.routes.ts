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

export function registerDevisRoutes(app: Express) {
  app.get("/variants/:id/devis/word", async (req: Request, res: Response) => {
    try {
      const variantId = String(req.params.id);

      const v: any = await prisma.variant.findUnique({
        where: { id: variantId },
        include: { contract: { include: { pnl: true } } },
      });

      const pnlTitle = safeFileName(v?.contract?.pnl?.title ?? v?.title ?? "Devis");

      const dt = new Date();
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");

      const buf = await buildDevisWordBuffer(variantId);

      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${pnlTitle} - Offre de prix - ${yyyy}-${mm}-${dd}.docx"`
      );

      return res.status(200).send(Buffer.from(buf));
    } catch (e: any) {
      console.error("[GET /variants/:id/devis/word]", e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }
  });
}
