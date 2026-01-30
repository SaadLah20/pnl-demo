// src/services/kpis/headerkpis.ts
import type { HeaderKPIs } from "@/types/kpis.types";

type UniteAutreCout = "M3" | "MOIS" | "FORFAIT" | "POURCENT_CA" | string;

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function sumObjNumbers(obj: any, exclude: string[] = []): number {
  if (!obj) return 0;
  let s = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (exclude.includes(k)) continue;
    if (typeof v === "number") s += v;
  }
  return s;
}

export function computeHeaderKpis(variant: any, dureeMois: number): HeaderKPIs {
  // -----------------------------
  // INPUTS (depuis ton JSON)
  // -----------------------------
  const formuleLines = variant?.formules?.items ?? []; // VariantFormule[]
  const mpLines = variant?.mp?.items ?? [];            // VariantMp[]
  const transport = variant?.transport ?? null;
  const cab = variant?.cab ?? null;

  const maintenance = variant?.maintenance ?? null;
  const coutM3 = variant?.coutM3 ?? null;
  const coutMensuel = variant?.coutMensuel ?? null;
  const coutOccasionnel = variant?.coutOccasionnel ?? null;
  const employes = variant?.employes ?? null;

  const autresItems = variant?.autresCouts?.items ?? []; // AutreCoutItem[]

  // -----------------------------
  // BASE : volume total
  // -----------------------------
  const volumeTotalM3 = formuleLines.reduce((s: number, f: any) => s + n(f?.volumeM3), 0);

  // durée (le HeaderDashboard la lit déjà depuis contract.dureeMois)
  // ici on ne l’a pas, donc on laisse null (ou tu peux la passer en param plus tard)
  const dureeJours: number | null = null;

  // -----------------------------
  // MP price map (override)
  // -----------------------------
  const mpPriceById = new Map<string, number>();
  for (const l of mpLines) {
    if (l?.mpId) mpPriceById.set(String(l.mpId), n(l.prix));
  }

  // -----------------------------
  // Transport moyen (hors pompage)
  // -----------------------------
  const transportMoyenM3 = transport ? n(transport.prixMoyen) : 0; // peut être 0 si départ
  const transportTotal = transportMoyenM3 * volumeTotalM3;

  // -----------------------------
  // Calcul par formule: CMP, PV, CA
  // PV = CMP + TransportMoyen + MOMD
  // CMP(formule) = sum(qty * prixMp)
  // -----------------------------
  let caTotal = 0;
  let coutMpTotal = 0;
  let momdTotal = 0;

  for (const line of formuleLines) {
    const vol = n(line?.volumeM3);
    if (vol <= 0) continue;

    const momd = n(line?.momd);

    // composition MP de la formule
    const comp = line?.formule?.items ?? []; // formuleCatalogueItem[]
    let cmpM3 = 0;
    for (const it of comp) {
      const mpId = String(it?.mpId ?? "");
      const qty = n(it?.qty); // qty / m3
      // prix prioritaire: variant.mp override, sinon catalogue (it.mp.prix), sinon 0
      const prixMp =
        mpPriceById.get(mpId) ??
        n(it?.mp?.prix) ??
        0;

      cmpM3 += qty * prixMp;
    }

    const pvM3 = cmpM3 + transportMoyenM3 + momd;

    caTotal += vol * pvM3;
    coutMpTotal += vol * cmpM3;
    momdTotal += vol * momd;
  }

  const prixMoyenM3 = volumeTotalM3 > 0 ? caTotal / volumeTotalM3 : 0;
  const coutMpMoyenM3 = volumeTotalM3 > 0 ? coutMpTotal / volumeTotalM3 : 0;
  const momdMoyenM3 = volumeTotalM3 > 0 ? momdTotal / volumeTotalM3 : 0;

  // Marge brute (CA - MP)
  const margeBrute = caTotal - coutMpTotal;
  const margeBrutePct = caTotal > 0 ? (margeBrute / caTotal) * 100 : null;

  // -----------------------------
  // Production (hors frais généraux)
  // - couts au m3 * volume
  // - couts mensuels * duréeMois (si on ne l’a pas ici, on considère 0 => production partielle)
  // - maintenance total * duréeMois
  // - employés * duréeMois
  // - occasionnels (forfait)
  // - autresCouts : M3 / MOIS / FORFAIT (POURCENT_CA => frais généraux)
  // -----------------------------
  // ⚠️ Ici on ne connaît pas dureeMois dans ce module (car tu n’as passé que variant).
  // Donc:
  // - Les postes "MOIS" ne pourront être exacts que si tu passes dureeMois en param plus tard
  // - Pour l’instant: on met dureeMois = 0 => production mensuelle = 0
  const dureeEnMois = 0;

  const coutM3Total =
    (sumObjNumbers(coutM3, ["id", "variantId", "category"]) || 0) * volumeTotalM3;

  const coutMensuelTotal =
    (sumObjNumbers(coutMensuel, ["id", "variantId", "category"]) || 0) * dureeMois;

  const maintenanceMensuelle = sumObjNumbers(maintenance, ["id", "variantId", "category"]) || 0;
  const maintenanceTotal = maintenanceMensuelle * dureeMois;

  const employesMensuel =
    n(employes?.responsableNb) * n(employes?.responsableCout) +
    n(employes?.centralistesNb) * n(employes?.centralistesCout);
  const employesTotal = employesMensuel * dureeMois;

  const coutOccasionnelTotal = sumObjNumbers(coutOccasionnel, ["id", "variantId", "category"]) || 0;

  let autresM3Total = 0;
  let autresMoisTotal = 0;
  let autresForfaitTotal = 0;

  let fraisGenerauxPct: number | null = null;
  let fraisGenerauxTotal = 0;

  for (const it of autresItems) {
    const unite = String(it?.unite ?? "") as UniteAutreCout;
    const val = n(it?.valeur);

    if (unite === "POURCENT_CA") {
      // frais généraux
      if (fraisGenerauxPct === null) fraisGenerauxPct = 0;
      fraisGenerauxPct += val;
      continue;
    }

    if (unite === "M3") autresM3Total += val * volumeTotalM3;
    else if (unite === "MOIS") autresMoisTotal += val * dureeMois;
    else if (unite === "FORFAIT") autresForfaitTotal += val;
    else {
      // si inconnu, on le traite comme forfait pour éviter de perdre le coût
      autresForfaitTotal += val;
    }
  }

  if (fraisGenerauxPct !== null) {
    fraisGenerauxTotal = caTotal * (fraisGenerauxPct / 100);
  }

  const productionTotal =
    coutM3Total +
    coutMensuelTotal +
    maintenanceTotal +
    employesTotal +
    coutOccasionnelTotal +
    autresM3Total +
    autresMoisTotal +
    autresForfaitTotal;

  const productionMoyenM3 = volumeTotalM3 > 0 ? productionTotal / volumeTotalM3 : 0;

  // -----------------------------
  // Pompage (marge)
  // -----------------------------
  const volPompePct = transport ? n(transport.volumePompePct) : 0;
  const volPompeM3 = volumeTotalM3 * (volPompePct / 100);

  const prixAchatPompe = transport ? n(transport.prixAchatPompe) : 0;
  const prixVentePompe = transport ? n(transport.prixVentePompe) : 0;

  const margePompageTotal = (prixVentePompe - prixAchatPompe) * volPompeM3;

  // -----------------------------
  // EBITDA / EBIT / Amort
  // EBITDA = MOMD total + margePompage - production - fraisGeneraux
  // EBIT = EBITDA - amort
  // amort = cab.amortMois * dureeMois (idem: dureeMois inconnu ici => 0)
  // -----------------------------
  const amortissementTotal = n(cab?.amortMois) * dureeMois;

  const ebitdaTotal = momdTotal + margePompageTotal - productionTotal - fraisGenerauxTotal;
  const ebitTotal = ebitdaTotal - amortissementTotal;

  return {
    client: null,
    status: variant?.status ?? "—",
    dureeJours,

    volumeTotalM3,

    caTotal,
    prixMoyenM3,

    coutMpTotal,
    coutMpMoyenM3,

    momdTotal,
    momdMoyenM3,

    transportTotal,
    transportMoyenM3,

    productionTotal,
    productionMoyenM3,

    fraisGenerauxTotal,
    fraisGenerauxPct,

    margePompageTotal,

    ebitdaTotal,
    ebitTotal,
    amortissementTotal,

    margeBrute,
    margeBrutePct,
  };
}
