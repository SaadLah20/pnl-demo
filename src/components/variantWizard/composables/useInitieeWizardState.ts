// ✅ src/components/variantWizard/composables/useInitieeWizardState.ts
import { reactive } from "vue";

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
      location: 0,
      securite: 0,
      hebergements: 0,
      locationTerrain: 0,
      telephone: 0,
      troisG: 500,
      taxeProfessionnelle: 0,
      locationVehicule: 0,
      locationChargeur: 25000,
      locationBungalows: 0,
      epi: 0,
    },
    maintenance: { cab: 3000, elec: 3000, chargeur: 3000, generale: 3000, bassins: 3000, preventive: 3000 },
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