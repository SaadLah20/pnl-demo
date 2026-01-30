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
  caTotal: number;          // ASP total (CA total)
  prixMoyenM3: number;      // ASP/m3

  // CMP (MP)
  coutMpTotal: number;
  coutMpMoyenM3: number;

  // MOMD
  momdTotal: number;
  momdMoyenM3: number;

  // Transport (hors pompage)
  transportTotal: number;
  transportMoyenM3: number;

  // Production (hors frais généraux)
  productionTotal: number;
  productionMoyenM3: number;

  // Frais généraux (% CA) - toujours exclus de production
  fraisGenerauxTotal: number;
  fraisGenerauxPct: number | null;

  // Pompage (marge)
  margePompageTotal: number;

  // EBITDA / EBIT / Amort
  ebitdaTotal: number;
  ebitTotal: number;
  amortissementTotal: number;

  // (optionnel mais utile)
  margeBrute: number;       // CA - MP
  margeBrutePct: number | null;
}
