// src/types/kpis.types.ts
export type VariantStatus = "INITIALISEE" | "ENCOURS" | "ANNULEE" | "CLOTUREE";

export interface HeaderKPIs {
  // infos (header)
  client: string | null;
  status: VariantStatus | string;
  dureeJours: number | null;

  // base
  volumeTotalM3: number;

  // ASP (CA)
  caTotal: number;
  prixMoyenM3: number;

  // CMP (matières premières)
  coutMpTotal: number;
  coutMpMoyenM3: number;

  // Marge brute (optionnelle, utile)
  margeBrute: number;
  margeBrutePct: number | null;

  // MOMD
  momdTotal: number;
  momdMoyenM3: number;

  // Transport (hors pompage)
  transportTotal: number;
  transportMoyenM3: number;

  // Production (hors frais généraux)
  productionTotal: number;

  // Frais généraux (% CA)
  fraisGenerauxPct: number;
  fraisGenerauxTotal: number;

  // Pompage
  volumePompePct: number;
  volumePompeM3: number;
  margePompageTotal: number;

  // Amortissements
  amortissementMensuel: number;
  amortissementTotal: number;

  // Résultats
  ebitdaTotal: number;
  ebitTotal: number;

  // % (facultatifs mais pratiques UI)
  ebitdaPct: number;
  ebitPct: number;
}
