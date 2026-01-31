// src/services/kpis/headerkpis.ts
import type { HeaderKPIs } from "@/types/kpis.types";



function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function sum(arr: any[], fn: (x: any) => number) {
  return (arr ?? []).reduce((s, x) => s + fn(x), 0);
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/**
 * Hypothèses actuelles (à stabiliser plus tard via un champ "priceUnit"):
 * - qty des compositions est en KG / m3
 * - prix MP est généralement en DH / TONNE (ex: 900, 1050, 1200...)
 *
 * Heuristique:
 * - si prix > 50 => DH/tonne => prixKg = prix/1000
 * - sinon => DH/kg
 */
function pricePerKg(prix: number): number {
  const p = n(prix);
  if (p <= 0) return 0;
  return p > 50 ? p / 1000 : p;
}

export function computeHeaderKpis(variant: any, dureeMois: number): HeaderKPIs {
  const formulesItems = variant?.formules?.items ?? [];
  const mpItems = variant?.mp?.items ?? [];

  const duree = n(dureeMois);
  const dureeJours = duree > 0 ? Math.round(duree * 30) : null;

  // 1) Volume total
  const volumeTotalM3 = sum(formulesItems, (f) => n(f?.volumeM3));

  // 2) Transport (DH/m3)
  const transportMoyenM3 = n(variant?.transport?.prixMoyen);
  const transportTotal = transportMoyenM3 * volumeTotalM3;

  // Prix MP utilisé: override -> catalogue
  function mpPrixUsed(mpId: string): number {
    const vmp = mpItems.find((x: any) => String(x.mpId) === String(mpId));
    if (!vmp) return 0;

    const prix =
      vmp?.prixOverride != null ? n(vmp.prixOverride) : n(vmp?.mp?.prix);

    return prix;
  }

  // 3) CMP formule (DH/m3)
  // CMP = Σ (qtyKg * prixKg)
  function cmpFormuleM3(formule: any): number {
    const compo = formule?.items ?? [];
    return sum(compo, (it: any) => {
      const mpId = String(it?.mpId ?? "");
      const qtyKg = n(it?.qty); // KG/m3
      const prix = mpPrixUsed(mpId); // DH/tonne (souvent)
      const prixKg = pricePerKg(prix);
      return qtyKg * prixKg;
    });
  }

  // 4) Totaux pondérés
  const coutMpTotal = sum(formulesItems, (f: any) => {
    const vol = n(f?.volumeM3);
    const cmp = cmpFormuleM3(f?.formule);
    return cmp * vol;
  });

  const momdTotal = sum(formulesItems, (f: any) => n(f?.momd) * n(f?.volumeM3));

  const caTotal = sum(formulesItems, (f: any) => {
    const vol = n(f?.volumeM3);
    const momd = n(f?.momd);
    const cmp = cmpFormuleM3(f?.formule);
    const pv = cmp + transportMoyenM3 + momd; // DH/m3
    return pv * vol;
  });

  const prixMoyenM3 = volumeTotalM3 > 0 ? caTotal / volumeTotalM3 : 0;
  const coutMpMoyenM3 = volumeTotalM3 > 0 ? coutMpTotal / volumeTotalM3 : 0;
  const momdMoyenM3 = volumeTotalM3 > 0 ? momdTotal / volumeTotalM3 : 0;

  const margeBrute = caTotal - coutMpTotal;
  const margeBrutePct = caTotal > 0 ? (margeBrute / caTotal) * 100 : null;

  // 5) Production
  const coutM3 = variant?.coutM3;
  const coutMensuel = variant?.coutMensuel;
  const maintenance = variant?.maintenance;
  const employes = variant?.employes;
  const coutOcc = variant?.coutOccasionnel;
  const autresItems = variant?.autresCouts?.items ?? [];


  const coutM3Total =
    (n(coutM3?.eau) + n(coutM3?.qualite) + n(coutM3?.dechets)) * volumeTotalM3;

  const coutMensuelTotal =
    (n(coutMensuel?.electricite) +
      n(coutMensuel?.gasoil) +
      n(coutMensuel?.location) +
      n(coutMensuel?.securite)) *
    duree;

  const maintenanceMensuel =
    n(maintenance?.cab) +
    n(maintenance?.elec) +
    n(maintenance?.chargeur) +
    n(maintenance?.generale) +
    n(maintenance?.bassins) +
    n(maintenance?.preventive);

  const maintenanceTotal = maintenanceMensuel * duree;

  const employesMensuel =
    n(employes?.responsableNb) * n(employes?.responsableCout) +
    n(employes?.centralistesNb) * n(employes?.centralistesCout);

  const employesTotal = employesMensuel * duree;

  const coutOccasionnelTotal =
    n(coutOcc?.genieCivil) + n(coutOcc?.installation) + n(coutOcc?.transport);

  const fraisGenPct = n(
    autresItems.find((x: any) => String(x?.unite ?? "").includes("POURCENT"))?.valeur
  );

  const autresCoutsHorsPctTotal = sum(autresItems, (x: any) => {
    const unite = String(x?.unite ?? "");
    const val = n(x?.valeur);
    if (unite.includes("POURCENT")) return 0;
    if (unite === "MOIS") return val * duree;
    if (unite === "M3") return val * volumeTotalM3;
    return val;
  });

  const productionTotal =
    coutM3Total +
    coutMensuelTotal +
    maintenanceTotal +
    employesTotal +
    coutOccasionnelTotal +
    autresCoutsHorsPctTotal;

  // 6) Pompage
  //const volumePompePct = n(variant?.transport?.volumePompePct);
 // const prixAchatPompe = n(variant?.transport?.prixAchatPompe);
 // const prixVentePompe = n(variant?.transport?.prixVentePompe);

 // const volumePompeM3 = volumeTotalM3 * (volumePompePct / 100);
 // const margePompageTotal = (prixVentePompe - prixAchatPompe) * volumePompeM3;

  // ------------------------------
// 6) Pompage (désactivé)
// ------------------------------
const volumePompePct = 0;
const volumePompeM3 = 0;
const margePompageTotal = 0;

  // 7) Frais généraux
  const fraisGenerauxTotal = (fraisGenPct / 100) * caTotal;

  // 8) EBITDA & EBIT
  const amortissementMensuel = n(variant?.cab?.amortMois);
  const amortissementTotal = amortissementMensuel * duree;

  const ebitdaTotal = momdTotal + margePompageTotal - productionTotal - fraisGenerauxTotal;
  const ebitTotal = ebitdaTotal - amortissementTotal;

  const pct = (x: number) => (caTotal > 0 ? (x / caTotal) * 100 : 0);

  return {
    client: null,
    status: variant?.status ?? "—",
    dureeJours,

    volumeTotalM3: round2(volumeTotalM3),

    caTotal: round2(caTotal),
    prixMoyenM3: round2(prixMoyenM3),

    coutMpTotal: round2(coutMpTotal),
    coutMpMoyenM3: round2(coutMpMoyenM3),

    margeBrute: round2(margeBrute),
    margeBrutePct: margeBrutePct == null ? null : round2(margeBrutePct),

    momdTotal: round2(momdTotal),
    momdMoyenM3: round2(momdMoyenM3),

    transportTotal: round2(transportTotal),
    transportMoyenM3: round2(transportMoyenM3),

    productionTotal: round2(productionTotal),

    fraisGenerauxPct: round2(fraisGenPct),
    fraisGenerauxTotal: round2(fraisGenerauxTotal),

    volumePompePct: round2(volumePompePct),
    volumePompeM3: round2(volumePompeM3),
    margePompageTotal: round2(margePompageTotal),

    amortissementMensuel: round2(amortissementMensuel),
    amortissementTotal: round2(amortissementTotal),

    ebitdaTotal: round2(ebitdaTotal),
    ebitTotal: round2(ebitTotal),

    ebitdaPct: round2(pct(ebitdaTotal)),
    ebitPct: round2(pct(ebitTotal)),
  };
}
