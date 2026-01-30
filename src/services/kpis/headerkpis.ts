// src/services/kpis/headerkpis.ts
import type { HeaderKPIs } from "@/types/kpis.types";

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function sum(arr: any[], fn: (x: any) => number) {
  return (arr ?? []).reduce((s, x) => s + fn(x), 0);
}

// arrondi affichage / stockage (sécurise les décimales “infinies”)
function round2(x: number) {
  return Math.round(x * 100) / 100;
}

export function computeHeaderKpis(variant: any, dureeMois: number): HeaderKPIs {
  const formulesItems = variant?.formules?.items ?? [];
  const mpItems = variant?.mp?.items ?? [];

  const duree = n(dureeMois);
  const dureeJours = duree > 0 ? Math.round(duree * 30) : null;

  // ------------------------------
  // 1) Volume total
  // ------------------------------
  const volumeTotalM3 = sum(formulesItems, (f) => n(f?.volumeM3));

  // ------------------------------
  // 2) Transport
  // transport.prixMoyen = DH/m3 (sans pompage)
  // ------------------------------
  const transportMoyenM3 = n(variant?.transport?.prixMoyen);
  const transportTotal = transportMoyenM3 * volumeTotalM3;

  // ------------------------------
  // 3) CMP d'une formule (DH/m3)
  // basé sur composition formuleCatalogueItem.qty * prix MP (variantMp.prix)
  // ------------------------------
  function cmpFormuleM3(formule: any): number {
    const compo = formule?.items ?? [];
    return sum(compo, (it: any) => {
      const mpId = it?.mpId;
      const qty = n(it?.qty);
      const prix = n(mpItems.find((x: any) => x.mpId === mpId)?.prix);
      return qty * prix;
    });
  }

  // ------------------------------
  // 4) Totaux pondérés par volumes
  // ------------------------------
  const coutMpTotal = sum(formulesItems, (f: any) => {
    const vol = n(f?.volumeM3);
    const cmp = cmpFormuleM3(f?.formule);
    return cmp * vol;
  });

  const momdTotal = sum(formulesItems, (f: any) => n(f?.momd) * n(f?.volumeM3));

  // CA total (ASP total) = Σ (PVformule * vol)
  // PVformule = CMP + Transport + MOMD
  const caTotal = sum(formulesItems, (f: any) => {
    const vol = n(f?.volumeM3);
    const momd = n(f?.momd);
    const cmp = cmpFormuleM3(f?.formule);
    const pv = cmp + transportMoyenM3 + momd;
    return pv * vol;
  });

  // Moyennes /m3
  const prixMoyenM3 = volumeTotalM3 > 0 ? caTotal / volumeTotalM3 : 0;
  const coutMpMoyenM3 = volumeTotalM3 > 0 ? coutMpTotal / volumeTotalM3 : 0;
  const momdMoyenM3 = volumeTotalM3 > 0 ? momdTotal / volumeTotalM3 : 0;

  // Marge brute (béton) = CA - MP
  const margeBrute = caTotal - coutMpTotal;
  const margeBrutePct = caTotal > 0 ? (margeBrute / caTotal) * 100 : null;

  // ------------------------------
  // 5) Production (hors frais généraux)
  // Production = coutM3*vol + coutMensuel*duree + maintenance*duree + employes*duree + occasionnel + autresCouts (sauf %CA)
  // ------------------------------
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

  const maintenanceMensuel = n(maintenance?.cab) + n(maintenance?.elec) + n(maintenance?.chargeur) +
    n(maintenance?.generale) + n(maintenance?.bassins) + n(maintenance?.preventive);
  const maintenanceTotal = maintenanceMensuel * duree;

  const employesMensuel =
    n(employes?.responsableNb) * n(employes?.responsableCout) +
    n(employes?.centralistesNb) * n(employes?.centralistesCout);
  const employesTotal = employesMensuel * duree;

  const coutOccasionnelTotal =
    n(coutOcc?.genieCivil) + n(coutOcc?.installation) + n(coutOcc?.transport);

  // Autres coûts: on sépare %CA (frais généraux) du reste
  const fraisGenPct =
    n(autresItems.find((x: any) => (x?.unite ?? "").includes("POURCENT"))?.valeur);

  const autresCoutsHorsPctTotal = sum(autresItems, (x: any) => {
    const unite = String(x?.unite ?? "");
    const val = n(x?.valeur);

    if (unite.includes("POURCENT")) return 0; // exclu (frais généraux)

    if (unite === "MOIS") return val * duree;
    if (unite === "M3") return val * volumeTotalM3;

    // FORFAIT ou autre => total direct
    return val;
  });

  const productionTotal =
    coutM3Total +
    coutMensuelTotal +
    maintenanceTotal +
    employesTotal +
    coutOccasionnelTotal +
    autresCoutsHorsPctTotal;

  // ------------------------------
  // 6) Pompage (marge de pompage)
  // margePompage = (PVpompe - PAchatPompe) * volumePompe
  // volumePompe = volumeTotal * (volumePompePct/100)
  // ------------------------------
  const volumePompePct = n(variant?.transport?.volumePompePct);
  const prixAchatPompe = n(variant?.transport?.prixAchatPompe);
  const prixVentePompe = n(variant?.transport?.prixVentePompe);

  const volumePompeM3 = volumeTotalM3 * (volumePompePct / 100);
  const margePompageTotal = (prixVentePompe - prixAchatPompe) * volumePompeM3;

  // ------------------------------
  // 7) Frais généraux
  // fraisGenerauxTotal = %CA * CA
  // ------------------------------
  const fraisGenerauxTotal = (fraisGenPct / 100) * caTotal;

  // ------------------------------
  // 8) EBITDA & EBIT
  // EBITDA = MOMD total + margePompage - production - frais généraux
  // EBIT = EBITDA - amortissements
  // ------------------------------
  const amortissementMensuel = n(variant?.cab?.amortMois); // DH/mois
  const amortissementTotal = amortissementMensuel * duree;

  const ebitdaTotal = momdTotal + margePompageTotal - productionTotal - fraisGenerauxTotal;
  const ebitTotal = ebitdaTotal - amortissementTotal;

  // % par rapport CA (ASP total)
  const pct = (x: number) => (caTotal > 0 ? (x / caTotal) * 100 : 0);

  return {
    // infos header
    client: null,
    status: variant?.status ?? "—",
    dureeJours,

    // volumes
    volumeTotalM3: round2(volumeTotalM3),

    // ASP
    caTotal: round2(caTotal),
    prixMoyenM3: round2(prixMoyenM3),

    // CMP
    coutMpTotal: round2(coutMpTotal),
    coutMpMoyenM3: round2(coutMpMoyenM3),

    // Marge brute (optionnel / actuel)
    margeBrute: round2(margeBrute),
    margeBrutePct: margeBrutePct == null ? null : round2(margeBrutePct),

    // MOMD
    momdTotal: round2(momdTotal),
    momdMoyenM3: round2(momdMoyenM3),

    // Transport
    transportTotal: round2(transportTotal),
    transportMoyenM3: round2(transportMoyenM3),

    // Production
    productionTotal: round2(productionTotal),

    // Frais généraux
    fraisGenerauxPct: round2(fraisGenPct),
    fraisGenerauxTotal: round2(fraisGenerauxTotal),

    // Pompage
    volumePompePct: round2(volumePompePct),
    volumePompeM3: round2(volumePompeM3),
    margePompageTotal: round2(margePompageTotal),

    // Amortissements
    amortissementMensuel: round2(amortissementMensuel),
    amortissementTotal: round2(amortissementTotal),

    // EBITDA / EBIT
    ebitdaTotal: round2(ebitdaTotal),
    ebitTotal: round2(ebitTotal),

    // % utiles (si ton interface les prévoit)
    ebitdaPct: round2(pct(ebitdaTotal)),
    ebitPct: round2(pct(ebitTotal)),
  };
}
