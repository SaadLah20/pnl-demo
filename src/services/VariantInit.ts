// src/services/variants/variantInit.ts

export type VariantInitMode = "ZERO" | "INITIEE" | "COMPOSEE";

/**
 * Construit le payload attendu par PUT /variants/:id
 *
 * NOTE: formules => ton endpoint PUT ne peut UPDATE que des variantFormule existants via {id,...}.
 * Lors d'une création, pas d'items existants => on laisse vide pour l’instant.
 */
export function buildVariantInitPayload(mode: VariantInitMode) {
  if (mode === "ZERO") return buildZero();
  if (mode === "INITIEE") return buildRandom();
  // COMPOSEE sera généré par le futur modal “composer”
  return buildZero();
}

function buildZero() {
  return {
    transport: {
      category: "LOGISTIQUE_APPRO",
      type: "MOYENNE",
      prixMoyen: 0,
      volumePompePct: 0,
      prixAchatPompe: 0,
      prixVentePompe: 0,
    },
    cab: {
      category: "LOGISTIQUE_APPRO",
      etat: "NEUVE",
      mode: "ACHAT",
      capaciteM3: 0,
      amortMois: 0,
    },
    maintenance: {
      category: "COUTS_CHARGES",
      cab: 0,
      elec: 0,
      chargeur: 0,
      generale: 0,
      bassins: 0,
      preventive: 0,
    },
    coutM3: {
      category: "COUTS_CHARGES",
      eau: 0,
      qualite: 0,
      dechets: 0,
    },
    coutMensuel: {
      category: "COUTS_CHARGES",
      electricite: 0,
      gasoil: 0,
      location: 0,
      securite: 0,
      hebergements: 0,
      locationTerrain: 0,
      telephone: 0,
      troisG: 0,
      taxeProfessionnelle: 0,
      locationVehicule: 0,
      locationAmbulance: 0,
      locationBungalows: 0,
      epi: 0,
    },
    coutOccasionnel: {
      category: "COUTS_CHARGES",
      genieCivil: 0,
      installation: 0,
      transport: 0,
      demontage: 0,
      remisePointCentrale: 0,
      silots: 0,
      localAdjuvant: 0,
      bungalows: 0,
    },
    employes: {
      category: "COUTS_CHARGES",
      responsableNb: 0,
      responsableCout: 0,
      centralistesNb: 0,
      centralistesCout: 0,
      manoeuvreNb: 0,
      manoeuvreCout: 0,
      coordinateurExploitationNb: 0,
      coordinateurExploitationCout: 0,
      technicienLaboNb: 0,
      technicienLaboCout: 0,
      femmeMenageNb: 0,
      femmeMenageCout: 0,
      gardienNb: 0,
      gardienCout: 0,
      maintenancierNb: 0,
      maintenancierCout: 0,
      panierRepasNb: 0,
      panierRepasCout: 0,
    },
    autresCouts: { items: [] as Array<{ label: string; unite: string; valeur: number }> },
  };
}

function buildRandom() {
  const rInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
  const rNum = (min: number, max: number, digits = 2) => {
    const x = min + Math.random() * (max - min);
    const p = 10 ** digits;
    return Math.round(x * p) / p;
  };

  return {
    transport: {
      category: "LOGISTIQUE_APPRO",
      type: Math.random() > 0.5 ? "MOYENNE" : "PAR_ZONE",
      prixMoyen: rNum(40, 120, 2),
      volumePompePct: rInt(0, 80),
      prixAchatPompe: rNum(10, 80, 2),
      prixVentePompe: rNum(20, 120, 2),
    },
    cab: {
      category: "LOGISTIQUE_APPRO",
      etat: Math.random() > 0.5 ? "NEUVE" : "EXISTANTE",
      mode: Math.random() > 0.5 ? "ACHAT" : "LOCATION",
      capaciteM3: rInt(30, 120),
      amortMois: rInt(12, 60),
    },
    maintenance: {
      category: "COUTS_CHARGES",
      cab: rNum(500, 6000, 0),
      elec: rNum(200, 2500, 0),
      chargeur: rNum(200, 2500, 0),
      generale: rNum(200, 3000, 0),
      bassins: rNum(0, 1500, 0),
      preventive: rNum(200, 3000, 0),
    },
    coutM3: {
      category: "COUTS_CHARGES",
      eau: rNum(0, 8, 2),
      qualite: rNum(0, 4, 2),
      dechets: rNum(0, 4, 2),
    },
    coutMensuel: {
      category: "COUTS_CHARGES",
      electricite: rNum(1000, 15000, 0),
      gasoil: rNum(1000, 20000, 0),
      location: rNum(0, 20000, 0),
      securite: rNum(0, 12000, 0),
      hebergements: rNum(0, 12000, 0),
      locationTerrain: rNum(0, 15000, 0),
      telephone: rNum(0, 2000, 0),
      troisG: rNum(0, 2000, 0),
      taxeProfessionnelle: rNum(0, 5000, 0),
      locationVehicule: rNum(0, 15000, 0),
      locationAmbulance: rNum(0, 8000, 0),
      locationBungalows: rNum(0, 12000, 0),
      epi: rNum(0, 8000, 0),
    },
    coutOccasionnel: {
      category: "COUTS_CHARGES",
      genieCivil: rNum(0, 1200000, 0),
      installation: rNum(0, 800000, 0),
      transport: rNum(0, 300000, 0),
      demontage: rNum(0, 250000, 0),
      remisePointCentrale: rNum(0, 200000, 0),
      silots: rNum(0, 350000, 0),
      localAdjuvant: rNum(0, 150000, 0),
      bungalows: rNum(0, 250000, 0),
    },
    employes: {
      category: "COUTS_CHARGES",
      responsableNb: rInt(0, 1),
      responsableCout: rNum(0, 15000, 0),
      centralistesNb: rInt(0, 2),
      centralistesCout: rNum(0, 22000, 0),
      manoeuvreNb: rInt(0, 6),
      manoeuvreCout: rNum(0, 18000, 0),
      coordinateurExploitationNb: rInt(0, 1),
      coordinateurExploitationCout: rNum(0, 18000, 0),
      technicienLaboNb: rInt(0, 1),
      technicienLaboCout: rNum(0, 14000, 0),
      femmeMenageNb: rInt(0, 1),
      femmeMenageCout: rNum(0, 4000, 0),
      gardienNb: rInt(0, 2),
      gardienCout: rNum(0, 8000, 0),
      maintenancierNb: rInt(0, 1),
      maintenancierCout: rNum(0, 12000, 0),
      panierRepasNb: rInt(0, 10),
      panierRepasCout: rNum(0, 5000, 0),
    },
    autresCouts: {
      items: [{ label: "Divers", unite: "FORFAIT", valeur: rNum(0, 5000, 0) }],
    },
  };
}
