// ✅ src/components/variantWizard/composables/useInitieeWizardState.ts
import { reactive, toRaw } from "vue";

/* =========================
   TYPES (INITIEE WIZARD)
========================= */

export type WizardGeneralState = {
  amortMois: number;
  fraisGenPct: number;
  transportM3: number;

  includePompage: boolean;
  volumePompePct: number;
  prixAchatPompe: number;
  prixVentePompe: number;

  hydrofugePu: number;
  hydrofugeVolume: number;

  ebitCiblePct: number;
};

export type WizardFormulesState = {
  /** ✅ lignes sélectionnées (valeur finale persistée) */
  lines: Array<{
    formuleId: string;
    volumeM3: number;
  }>;
};

export type WizardCoutsState = {
  coutM3: {
    eau: number;
    qualite: number;
    dechets: number;
  };

  coutMensuel: {
    electricite: number;

    /** ✅ Gasoil: peut être "lié au volume" ou libre */
    gasoil: number;
    gasoilLinked: boolean;

    /** champs restants */
    location: number;
    securite: number;
    hebergements: number;
    locationTerrain: number;
    telephone: number;
    troisG: number;
    taxeProfessionnelle: number;
    locationVehicule: number;
    locationChargeur: number;
    locationBungalows: number;
    epi: number;
  };

  maintenance: {
    cab: number;
    elec: number;
    chargeur: number;
    generale: number;
    bassins: number;
    preventive: number;
  };

  coutOccasionnel: {
    genieCivil: number;
    installation: number;
    transport: number;
    demontage: number;
    remisePointCentrale: number;
    silots: number;
    localAdjuvant: number;
    bungalows: number;
    /** ✅ Nom aligné avec le contrat/pages: branchementElec */
    branchementElec: number;
    branchementEau: number;
  };
};

export type WizardEmployesState = {
  responsableNb: number;
  responsableCout: number;

  centralistesNb: number;
  centralistesCout: number;

  manoeuvreNb: number;
  manoeuvreCout: number;

  coordinateurExploitationNb: number;
  coordinateurExploitationCout: number;

  technicienLaboNb: number;
  technicienLaboCout: number;

  femmeMenageNb: number;
  femmeMenageCout: number;

  gardienNb: number;
  gardienCout: number;

  maintenancierNb: number;
  maintenancierCout: number;

  panierRepasNb: number;
  panierRepasCout: number;
};

export type InitieeWizardState = {
  general: WizardGeneralState;
  formules: WizardFormulesState;
  couts: WizardCoutsState;
  employes: WizardEmployesState;
};

/* =========================
   HELPERS (safe assign)
========================= */

function n(x: unknown): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function b(x: unknown): boolean {
  return !!x;
}

/** affecte uniquement des champs connus (sans casser la réactivité) */
function assignGeneral(dst: WizardGeneralState, src: Partial<WizardGeneralState> | undefined) {
  if (!src) return;
  if ("amortMois" in src) dst.amortMois = n(src.amortMois);
  if ("fraisGenPct" in src) dst.fraisGenPct = n(src.fraisGenPct);
  if ("transportM3" in src) dst.transportM3 = n(src.transportM3);

  if ("includePompage" in src) dst.includePompage = b(src.includePompage);
  if ("volumePompePct" in src) dst.volumePompePct = n(src.volumePompePct);
  if ("prixAchatPompe" in src) dst.prixAchatPompe = n(src.prixAchatPompe);
  if ("prixVentePompe" in src) dst.prixVentePompe = n(src.prixVentePompe);

  if ("hydrofugePu" in src) dst.hydrofugePu = n(src.hydrofugePu);
  if ("hydrofugeVolume" in src) dst.hydrofugeVolume = n(src.hydrofugeVolume);

  if ("ebitCiblePct" in src) dst.ebitCiblePct = n(src.ebitCiblePct);
}

function assignFormules(dst: WizardFormulesState, src: Partial<WizardFormulesState> | undefined) {
  if (!src) return;
  if (Array.isArray(src.lines)) {
    // garde uniquement les lignes valides
    dst.lines = src.lines
      .map((l) => ({
        formuleId: String((l as any)?.formuleId ?? ""),
        volumeM3: n((l as any)?.volumeM3),
      }))
      .filter((l) => l.formuleId.length > 0);
  }
}

function assignCouts(dst: WizardCoutsState, src: Partial<WizardCoutsState> | undefined) {
  if (!src) return;

  if (src.coutM3) {
    if ("eau" in src.coutM3) dst.coutM3.eau = n(src.coutM3.eau);
    if ("qualite" in src.coutM3) dst.coutM3.qualite = n(src.coutM3.qualite);
    if ("dechets" in src.coutM3) dst.coutM3.dechets = n(src.coutM3.dechets);
  }

  if (src.coutMensuel) {
    const s = src.coutMensuel;
    if ("electricite" in s) dst.coutMensuel.electricite = n(s.electricite);
    if ("gasoil" in s) dst.coutMensuel.gasoil = n(s.gasoil);
    if ("gasoilLinked" in s) dst.coutMensuel.gasoilLinked = b(s.gasoilLinked);

    if ("location" in s) dst.coutMensuel.location = n(s.location);
    if ("securite" in s) dst.coutMensuel.securite = n(s.securite);
    if ("hebergements" in s) dst.coutMensuel.hebergements = n(s.hebergements);
    if ("locationTerrain" in s) dst.coutMensuel.locationTerrain = n(s.locationTerrain);
    if ("telephone" in s) dst.coutMensuel.telephone = n(s.telephone);
    if ("troisG" in s) dst.coutMensuel.troisG = n(s.troisG);
    if ("taxeProfessionnelle" in s) dst.coutMensuel.taxeProfessionnelle = n(s.taxeProfessionnelle);
    if ("locationVehicule" in s) dst.coutMensuel.locationVehicule = n(s.locationVehicule);
    if ("locationChargeur" in s) dst.coutMensuel.locationChargeur = n(s.locationChargeur);
    if ("locationBungalows" in s) dst.coutMensuel.locationBungalows = n(s.locationBungalows);
    if ("epi" in s) dst.coutMensuel.epi = n(s.epi);
  }

  if (src.maintenance) {
    const s = src.maintenance;
    if ("cab" in s) dst.maintenance.cab = n(s.cab);
    if ("elec" in s) dst.maintenance.elec = n(s.elec);
    if ("chargeur" in s) dst.maintenance.chargeur = n(s.chargeur);
    if ("generale" in s) dst.maintenance.generale = n(s.generale);
    if ("bassins" in s) dst.maintenance.bassins = n(s.bassins);
    if ("preventive" in s) dst.maintenance.preventive = n(s.preventive);
  }

  if (src.coutOccasionnel) {
    const s = src.coutOccasionnel;
    if ("genieCivil" in s) dst.coutOccasionnel.genieCivil = n(s.genieCivil);
    if ("installation" in s) dst.coutOccasionnel.installation = n(s.installation);
    if ("transport" in s) dst.coutOccasionnel.transport = n(s.transport);
    if ("demontage" in s) dst.coutOccasionnel.demontage = n(s.demontage);
    if ("remisePointCentrale" in s) dst.coutOccasionnel.remisePointCentrale = n(s.remisePointCentrale);
    if ("silots" in s) dst.coutOccasionnel.silots = n(s.silots);
    if ("localAdjuvant" in s) dst.coutOccasionnel.localAdjuvant = n(s.localAdjuvant);
    if ("bungalows" in s) dst.coutOccasionnel.bungalows = n(s.bungalows);
    if ("branchementElec" in s) dst.coutOccasionnel.branchementElec = n(s.branchementElec);
    if ("branchementEau" in s) dst.coutOccasionnel.branchementEau = n(s.branchementEau);
  }
}

function assignEmployes(dst: WizardEmployesState, src: Partial<WizardEmployesState> | undefined) {
  if (!src) return;

  const keys: Array<keyof WizardEmployesState> = [
    "responsableNb",
    "responsableCout",
    "centralistesNb",
    "centralistesCout",
    "manoeuvreNb",
    "manoeuvreCout",
    "coordinateurExploitationNb",
    "coordinateurExploitationCout",
    "technicienLaboNb",
    "technicienLaboCout",
    "femmeMenageNb",
    "femmeMenageCout",
    "gardienNb",
    "gardienCout",
    "maintenancierNb",
    "maintenancierCout",
    "panierRepasNb",
    "panierRepasCout",
  ];

  for (const k of keys) {
    if (k in src) (dst as any)[k] = n((src as any)[k]);
  }
}

/* =========================
   DEFAULT FACTORY
========================= */

export function createDefaultInitieeWizardState(opts: {
  cabChargeClient: boolean;
  contractPostes?: number | null; // ✅ optionnel: Contract.postes
}): InitieeWizardState {
  const postes = Number.isFinite(Number(opts.contractPostes)) ? Number(opts.contractPostes) : 0;
  const centralistesDefault = postes === 2 ? 2 : postes === 1 ? 1 : 0;

  const general: WizardGeneralState = {
    amortMois: opts.cabChargeClient ? 0 : 30000,
    fraisGenPct: 7,
    transportM3: 74,

    includePompage: false,
    volumePompePct: 50,
    prixAchatPompe: 50,
    prixVentePompe: 55,

    hydrofugePu: 45,
    hydrofugeVolume: 0,

    ebitCiblePct: 8,
  };

  // ✅ MODE UNIQUE : volumes par formule
  const formules: WizardFormulesState = {
    lines: [],
  };

  const couts: WizardCoutsState = {
    coutM3: { eau: 3, qualite: 2, dechets: 1.75 },
    coutMensuel: {
      electricite: 0,
      gasoil: 0,
      gasoilLinked: true,
      location: 25000,
      securite: 0,
      hebergements: 0,
      locationTerrain: 45000,
      telephone: 0,
      troisG: 500,
      taxeProfessionnelle: 0,
      locationVehicule: 0,
      locationChargeur: 22000,
      locationBungalows: 0,
      epi: 0,
    },
    maintenance: {
      cab: 3000,
      elec: 3000,
      chargeur: 3000,
      generale: 3000,
      bassins: 3000,
      preventive: 3000,
    },
    coutOccasionnel: {
      genieCivil: 1000000,
      installation: 500000,
      transport: 0,
      demontage: 0,
      remisePointCentrale: 0,
      silots: 0,
      localAdjuvant: 0,
      bungalows: 0,
      branchementElec: 0,
      branchementEau: 0,
    },
  };

  const employes: WizardEmployesState = {
    responsableNb: 1,
    responsableCout: 30000,

    centralistesNb: centralistesDefault,
    centralistesCout: 12500,

    manoeuvreNb: 1,
    manoeuvreCout: 7900,

    coordinateurExploitationNb: 0,
    coordinateurExploitationCout: 0,

    technicienLaboNb: 1,
    technicienLaboCout: 7900,

    femmeMenageNb: 1,
    femmeMenageCout: 3500,

    gardienNb: 1,
    gardienCout: 6600,

    maintenancierNb: 0,
    maintenancierCout: 0,

    panierRepasNb: 0,
    panierRepasCout: 0,
  };

  return reactive<InitieeWizardState>({
    general,
    formules,
    couts,
    employes,
  });
}

/* =========================
   ✅ ACTIONS demanded by UI
   - "Mettre tout à 0"
   - "Importer tout de la base"
   (Pure state mutations, no API here)
========================= */

/** ✅ remet absolument tout à 0 (et booleans à false), sans casser la réactivité */
export function resetAllWizardToZero(state: InitieeWizardState) {
  // general
  state.general.amortMois = 0;
  state.general.fraisGenPct = 0;
  state.general.transportM3 = 0;

  state.general.includePompage = false;
  state.general.volumePompePct = 0;
  state.general.prixAchatPompe = 0;
  state.general.prixVentePompe = 0;

  state.general.hydrofugePu = 0;
  state.general.hydrofugeVolume = 0;

  state.general.ebitCiblePct = 0;

  // formules
  state.formules.lines = [];

  // couts
  state.couts.coutM3.eau = 0;
  state.couts.coutM3.qualite = 0;
  state.couts.coutM3.dechets = 0;

  state.couts.coutMensuel.electricite = 0;
  state.couts.coutMensuel.gasoil = 0;
  state.couts.coutMensuel.gasoilLinked = false; // ✅ neutral
  state.couts.coutMensuel.location = 0;
  state.couts.coutMensuel.securite = 0;
  state.couts.coutMensuel.hebergements = 0;
  state.couts.coutMensuel.locationTerrain = 0;
  state.couts.coutMensuel.telephone = 0;
  state.couts.coutMensuel.troisG = 0;
  state.couts.coutMensuel.taxeProfessionnelle = 0;
  state.couts.coutMensuel.locationVehicule = 0;
  state.couts.coutMensuel.locationChargeur = 0;
  state.couts.coutMensuel.locationBungalows = 0;
  state.couts.coutMensuel.epi = 0;

  state.couts.maintenance.cab = 0;
  state.couts.maintenance.elec = 0;
  state.couts.maintenance.chargeur = 0;
  state.couts.maintenance.generale = 0;
  state.couts.maintenance.bassins = 0;
  state.couts.maintenance.preventive = 0;

  state.couts.coutOccasionnel.genieCivil = 0;
  state.couts.coutOccasionnel.installation = 0;
  state.couts.coutOccasionnel.transport = 0;
  state.couts.coutOccasionnel.demontage = 0;
  state.couts.coutOccasionnel.remisePointCentrale = 0;
  state.couts.coutOccasionnel.silots = 0;
  state.couts.coutOccasionnel.localAdjuvant = 0;
  state.couts.coutOccasionnel.bungalows = 0;
  state.couts.coutOccasionnel.branchementElec = 0;
  state.couts.coutOccasionnel.branchementEau = 0;

  // employes
  const empKeys: Array<keyof WizardEmployesState> = [
    "responsableNb",
    "responsableCout",
    "centralistesNb",
    "centralistesCout",
    "manoeuvreNb",
    "manoeuvreCout",
    "coordinateurExploitationNb",
    "coordinateurExploitationCout",
    "technicienLaboNb",
    "technicienLaboCout",
    "femmeMenageNb",
    "femmeMenageCout",
    "gardienNb",
    "gardienCout",
    "maintenancierNb",
    "maintenancierCout",
    "panierRepasNb",
    "panierRepasCout",
  ];
  for (const k of empKeys) (state.employes as any)[k] = 0;
}

/**
 * ✅ Importe "tout de la base" = applique un snapshot (base) sur l'état wizard.
 * - Deep-assign sur champs connus
 * - Coerce numbers/booleans
 * - Ne casse pas la réactivité
 *
 * Remarque: ici on ne fait PAS d'appel API (à faire dans VariantWizardModal / store),
 * tu passes juste l'objet "base" déjà chargé.
 */
export function importAllWizardFromBase(state: InitieeWizardState, base: Partial<InitieeWizardState> | null | undefined) {
  if (!base) return;

  // si base est reactive/proxy => on récupère raw pour éviter surprises
  const rawBase = toRaw(base as any) as Partial<InitieeWizardState>;

  assignGeneral(state.general, rawBase.general);
  assignFormules(state.formules, rawBase.formules);
  assignCouts(state.couts, rawBase.couts);
  assignEmployes(state.employes, rawBase.employes);
}