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

function pricePerKg(prix: number): number {
  const p = n(prix);
  if (p <= 0) return 0;
  return p / 1000; // DH/tonne -> DH/kg
}

/* =========================
   MAJORATIONS (persisted + preview)
   - Persisted: variant.autresCouts.majorations (JSON string)
   - Preview: 3rd param (store.headerMajorationsPreview)
========================= */
function readPersistedMajorations(variant: any): Record<string, number> {
  try {
    const raw = variant?.autresCouts?.majorations;
    if (!raw) return {};
    if (typeof raw === "object") return raw as Record<string, number>;
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function getMajorationPct(
  key: string,
  persisted: Record<string, number>,
  preview?: Record<string, number> | null
): number {
  if (preview && key in preview) return n((preview as any)[key]);
  return n((persisted as any)[key]);
}

function applyMajoration(value: number, pct: number): number {
  return value * (1 + pct / 100);
}

/* =========================
   DEVIS SURCHARGE (persisted + preview)
   - Persisted: variant.devis.surcharges (JSON string or object)
   - Preview: 4th param (store.headerDevisSurchargesPreview)
   - Applied only when `useDevisSurcharge` is true
========================= */
function readPersistedDevisSurcharges(variant: any): Record<string, number> {
  try {
    // prefer explicit column if exists
    const raw =
      variant?.devis?.surcharges ??
      variant?.devis?.surcharge ??
      variant?.devis?.meta ??
      variant?.devis?.data;

    if (!raw) return {};
    if (typeof raw === "object") {
      // allow nested shape { surcharges: { ... } }
      const maybe = (raw as any).surcharges ?? raw;
      return maybe && typeof maybe === "object" ? (maybe as Record<string, number>) : {};
    }

    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object") return {};
    const maybe = (parsed as any).surcharges ?? parsed;
    return maybe && typeof maybe === "object" ? (maybe as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function getDevisSurchargeM3(
  formuleItem: any,
  persisted: Record<string, number>,
  preview?: Record<string, number> | null
): number {
  const map = (preview && typeof preview === "object" ? preview : persisted) as any;
  if (!map || typeof map !== "object") return 0;

  // try multiple keys to be resilient to schema/UI storage
  const keys = [
    String(formuleItem?.id ?? ""),
    String(formuleItem?.variantFormuleId ?? ""),
    String(formuleItem?.formuleId ?? ""),
    String(formuleItem?.formule?.id ?? ""),
    String(formuleItem?.formule?.label ?? ""),
  ].filter((k) => k && k !== "undefined" && k !== "null");

  for (const k of keys) {
    if (k in map) return n(map[k]);
  }
  return 0;
}

export function computeHeaderKpis(
  variant: any,
  dureeMois: number,
  previewMajorations?: Record<string, number> | null,
  previewDevisSurcharges?: Record<string, number> | null,
  useDevisSurcharge: boolean = false
): HeaderKPIs {
  const formulesItems = variant?.formules?.items ?? [];
  const mpItems = variant?.mp?.items ?? [];

  const persistedMajorations = readPersistedMajorations(variant);
  const persistedDevisSurcharges = readPersistedDevisSurcharges(variant);

  const duree = n(dureeMois);
  const dureeJours = duree > 0 ? Math.round(duree * 30) : null;

  // 1) Volume total
  const volumeTotalM3 = sum(formulesItems, (f) => n(f?.volumeM3));

  // 2) Transport (majorable)
  const transportPct = getMajorationPct(
    "transport.prixMoyen",
    persistedMajorations,
    previewMajorations
  );
  const transportMoyenM3 = applyMajoration(n(variant?.transport?.prixMoyen), transportPct);
  const transportTotal = transportMoyenM3 * volumeTotalM3;

  function mpPrixUsed(mpId: string): number {
    const vmp = mpItems.find((x: any) => String(x.mpId) === String(mpId));
    if (!vmp) return 0;

    // ✅ override (prix variante)
    if (vmp?.prix != null) return n(vmp.prix);

    // fallback catalogue
    return n(vmp?.mp?.prix);
  }

  // 3) CMP formule (DH/m3) — MP majorées par mpId
  function cmpFormuleM3(formule: any): number {
    const compo = formule?.items ?? [];
    return sum(compo, (it: any) => {
      const mpId = String(it?.mpId ?? "");
      const qtyKg = n(it?.qty);

      const prix = mpPrixUsed(mpId); // DH/tonne
      const pctMp = getMajorationPct(`mp:${mpId}`, persistedMajorations, previewMajorations);

      const prixKgBase = pricePerKg(prix);
      const prixKg = applyMajoration(prixKgBase, pctMp);

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

    // PV = CMP + Transport + MOMD (+ surcharge devis optionnelle)
    const surchargeM3 = useDevisSurcharge
      ? getDevisSurchargeM3(f, persistedDevisSurcharges, previewDevisSurcharges)
      : 0;

    const pv = cmp + transportMoyenM3 + momd + surchargeM3;
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

  // 5.1) Coûts / m3 (majorables par ligne)
  const coutM3Eau = applyMajoration(
    n(coutM3?.eau),
    getMajorationPct("coutM3.eau", persistedMajorations, previewMajorations)
  );
  const coutM3Qualite = applyMajoration(
    n(coutM3?.qualite),
    getMajorationPct("coutM3.qualite", persistedMajorations, previewMajorations)
  );
  const coutM3Dechets = applyMajoration(
    n(coutM3?.dechets),
    getMajorationPct("coutM3.dechets", persistedMajorations, previewMajorations)
  );

  const coutM3Total = (coutM3Eau + coutM3Qualite + coutM3Dechets) * volumeTotalM3;

  // 5.2) Coûts mensuels (majorables par champ)
  const cmElectricite = applyMajoration(
    n(coutMensuel?.electricite),
    getMajorationPct("coutMensuel.electricite", persistedMajorations, previewMajorations)
  );
  const cmGasoil = applyMajoration(
    n(coutMensuel?.gasoil),
    getMajorationPct("coutMensuel.gasoil", persistedMajorations, previewMajorations)
  );
  const cmLocation = applyMajoration(
    n(coutMensuel?.location),
    getMajorationPct("coutMensuel.location", persistedMajorations, previewMajorations)
  );
  const cmSecurite = applyMajoration(
    n(coutMensuel?.securite),
    getMajorationPct("coutMensuel.securite", persistedMajorations, previewMajorations)
  );
  const cmHebergements = applyMajoration(
    n(coutMensuel?.hebergements),
    getMajorationPct("coutMensuel.hebergements", persistedMajorations, previewMajorations)
  );
  const cmLocationTerrain = applyMajoration(
    n(coutMensuel?.locationTerrain),
    getMajorationPct("coutMensuel.locationTerrain", persistedMajorations, previewMajorations)
  );
  const cmTelephone = applyMajoration(
    n(coutMensuel?.telephone),
    getMajorationPct("coutMensuel.telephone", persistedMajorations, previewMajorations)
  );
  const cmTroisG = applyMajoration(
    n(coutMensuel?.troisG),
    getMajorationPct("coutMensuel.troisG", persistedMajorations, previewMajorations)
  );
  const cmTaxePro = applyMajoration(
    n(coutMensuel?.taxeProfessionnelle),
    getMajorationPct("coutMensuel.taxeProfessionnelle", persistedMajorations, previewMajorations)
  );
  const cmLocVehicule = applyMajoration(
    n(coutMensuel?.locationVehicule),
    getMajorationPct("coutMensuel.locationVehicule", persistedMajorations, previewMajorations)
  );
  const cmLocAmbulance = applyMajoration(
    n(coutMensuel?.locationAmbulance),
    getMajorationPct("coutMensuel.locationAmbulance", persistedMajorations, previewMajorations)
  );
  const cmLocBungalows = applyMajoration(
    n(coutMensuel?.locationBungalows),
    getMajorationPct("coutMensuel.locationBungalows", persistedMajorations, previewMajorations)
  );
  const cmEpi = applyMajoration(
    n(coutMensuel?.epi),
    getMajorationPct("coutMensuel.epi", persistedMajorations, previewMajorations)
  );

  const coutMensuelMensuel =
    cmElectricite +
    cmGasoil +
    cmLocation +
    cmSecurite +
    cmHebergements +
    cmLocationTerrain +
    cmTelephone +
    cmTroisG +
    cmTaxePro +
    cmLocVehicule +
    cmLocAmbulance +
    cmLocBungalows +
    cmEpi;

  const coutMensuelTotal = coutMensuelMensuel * duree;

  // 5.3) Maintenance (majorables par champ)
  const mCab = applyMajoration(
    n(maintenance?.cab),
    getMajorationPct("maintenance.cab", persistedMajorations, previewMajorations)
  );
  const mElec = applyMajoration(
    n(maintenance?.elec),
    getMajorationPct("maintenance.elec", persistedMajorations, previewMajorations)
  );
  const mChargeur = applyMajoration(
    n(maintenance?.chargeur),
    getMajorationPct("maintenance.chargeur", persistedMajorations, previewMajorations)
  );
  const mGenerale = applyMajoration(
    n(maintenance?.generale),
    getMajorationPct("maintenance.generale", persistedMajorations, previewMajorations)
  );
  const mBassins = applyMajoration(
    n(maintenance?.bassins),
    getMajorationPct("maintenance.bassins", persistedMajorations, previewMajorations)
  );
  const mPreventive = applyMajoration(
    n(maintenance?.preventive),
    getMajorationPct("maintenance.preventive", persistedMajorations, previewMajorations)
  );

  const maintenanceMensuel = mCab + mElec + mChargeur + mGenerale + mBassins + mPreventive;
  const maintenanceTotal = maintenanceMensuel * duree;

  // 5.4) Employés (majoration par poste : employes.<role>)
  const empResponsable = applyMajoration(
    n(employes?.responsableNb) * n(employes?.responsableCout),
    getMajorationPct("employes.responsable", persistedMajorations, previewMajorations)
  );
  const empCentralistes = applyMajoration(
    n(employes?.centralistesNb) * n(employes?.centralistesCout),
    getMajorationPct("employes.centralistes", persistedMajorations, previewMajorations)
  );
  const empManoeuvre = applyMajoration(
    n(employes?.manoeuvreNb) * n(employes?.manoeuvreCout),
    getMajorationPct("employes.manoeuvre", persistedMajorations, previewMajorations)
  );
  const empCoord = applyMajoration(
    n(employes?.coordinateurExploitationNb) * n(employes?.coordinateurExploitationCout),
    getMajorationPct("employes.coordinateurExploitation", persistedMajorations, previewMajorations)
  );
  const empTechLabo = applyMajoration(
    n(employes?.technicienLaboNb) * n(employes?.technicienLaboCout),
    getMajorationPct("employes.technicienLabo", persistedMajorations, previewMajorations)
  );
  const empFemmeMenage = applyMajoration(
    n(employes?.femmeMenageNb) * n(employes?.femmeMenageCout),
    getMajorationPct("employes.femmeMenage", persistedMajorations, previewMajorations)
  );
  const empGardien = applyMajoration(
    n(employes?.gardienNb) * n(employes?.gardienCout),
    getMajorationPct("employes.gardien", persistedMajorations, previewMajorations)
  );
  const empMaintenancier = applyMajoration(
    n(employes?.maintenancierNb) * n(employes?.maintenancierCout),
    getMajorationPct("employes.maintenancier", persistedMajorations, previewMajorations)
  );
  const empPanier = applyMajoration(
    n(employes?.panierRepasNb) * n(employes?.panierRepasCout),
    getMajorationPct("employes.panierRepas", persistedMajorations, previewMajorations)
  );

  const employesMensuel =
    empResponsable +
    empCentralistes +
    empManoeuvre +
    empCoord +
    empTechLabo +
    empFemmeMenage +
    empGardien +
    empMaintenancier +
    empPanier;

  const employesTotal = employesMensuel * duree;

  // 5.5) Occasionnels (majorables par champ)
  const occGenieCivil = applyMajoration(
    n(coutOcc?.genieCivil),
    getMajorationPct("coutOccasionnel.genieCivil", persistedMajorations, previewMajorations)
  );
  const occInstallation = applyMajoration(
    n(coutOcc?.installation),
    getMajorationPct("coutOccasionnel.installation", persistedMajorations, previewMajorations)
  );
  const occTransport = applyMajoration(
    n(coutOcc?.transport),
    getMajorationPct("coutOccasionnel.transport", persistedMajorations, previewMajorations)
  );
  const occDemontage = applyMajoration(
    n(coutOcc?.demontage),
    getMajorationPct("coutOccasionnel.demontage", persistedMajorations, previewMajorations)
  );
  const occRemise = applyMajoration(
    n(coutOcc?.remisePointCentrale),
    getMajorationPct(
      "coutOccasionnel.remisePointCentrale",
      persistedMajorations,
      previewMajorations
    )
  );
  const occSilots = applyMajoration(
    n(coutOcc?.silots),
    getMajorationPct("coutOccasionnel.silots", persistedMajorations, previewMajorations)
  );
  const occLocalAdjuvant = applyMajoration(
    n(coutOcc?.localAdjuvant),
    getMajorationPct("coutOccasionnel.localAdjuvant", persistedMajorations, previewMajorations)
  );
  const occBungalows = applyMajoration(
    n(coutOcc?.bungalows),
    getMajorationPct("coutOccasionnel.bungalows", persistedMajorations, previewMajorations)
  );

  const coutOccasionnelTotal =
    occGenieCivil +
    occInstallation +
    occTransport +
    occDemontage +
    occRemise +
    occSilots +
    occLocalAdjuvant +
    occBungalows;

  // 5.6) Autres coûts (items)
  // - frais généraux = item % (on ne majore pas ce % ici)
  const fraisGenPct = n(
    autresItems.find((x: any) => String(x?.unite ?? "").includes("POURCENT"))?.valeur
  );

  // - autres coûts hors % : majoration par item (autresCoutsItem:<id>)
  const autresCoutsHorsPctTotal = sum(autresItems, (x: any) => {
    const unite = String(x?.unite ?? "");
    const baseVal = n(x?.valeur);

    if (unite.includes("POURCENT")) return 0;

    const pctItem = getMajorationPct(
      `autresCoutsItem:${String(x?.id ?? "")}`,
      persistedMajorations,
      previewMajorations
    );

    const valMajore = applyMajoration(baseVal, pctItem);

    if (unite === "MOIS") return valMajore * duree;
    if (unite === "M3") return valMajore * volumeTotalM3;
    return valMajore;
  });

  const productionTotal =
    coutM3Total +
    coutMensuelTotal +
    maintenanceTotal +
    employesTotal +
    coutOccasionnelTotal +
    autresCoutsHorsPctTotal;

  // 6) Pompage désactivé
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
