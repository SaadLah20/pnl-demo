// src/router/index.ts (ou src/router.ts selon ton projet)
import { createRouter, createWebHistory } from "vue-router";

import PageView from "@/pages/PageView.vue";
import MesPnlPage from "@/pages/MesPnlPage.vue";
import DetailsPage from "@/pages/DetailsPage.vue";
import PnlArchivePage from "@/pages/PnlArchivePage.vue";
import MpCataloguePage from "@/pages/MpCataloguePage.vue";
import FormulesCataloguePage from "@/pages/FormulesCataloguePage.vue";

// ⚠️ Si ton fichier s'appelle vraiment "Cab.Page.vue", remets-le.
// import CabPage from "@/pages/Cab.Page.vue";
import CabPage from "@/pages/CabPage.vue";

import MpPage from "@/pages/MpPage.vue";
import TransportPage from "@/pages/TransportPage.vue";
import FormulesPage from "@/pages/FormulesPage.vue";
import MomdAndQuantity from "@/pages/MomdAndQuantityPage.vue";
import MaintenancePage from "@/pages/MaintenancePage.vue";
import CoutM3 from "@/pages/CoutM3Page.vue";
import CoutMensuelPage from "@/pages/CoutMensuelPage.vue";
import CoutEmployesPage from "@/pages/CoutEmployesPage.vue";
import CoutsOccasionnelsPage from "@/pages/CoutsOccasionnelsPage.vue";
import AutresCoutsPage from "@/pages/AutresCoutsPage.vue";
import MajorationsPage from "@/pages/MajorationPage.vue";

import ComparateurVariantesPage from "@/pages/ComparateurVariantesPage.vue";
import DevisPage from "@/pages/DevisPage.vue";

const routes = [
  // ✅ Page dédiée Mes P&L
  { path: "/mes-pnls", name: "MesPnls", component: MesPnlPage },

  // ✅ Sections (je standardise en minuscules pour éviter les surprises)
  { path: "/cab", name: "CAB", component: CabPage },
  { path: "/mp", name: "Mp", component: MpPage },
  { path: "/transport", name: "Transport", component: TransportPage },
  { path: "/formules", name: "Formules", component: FormulesPage },
  { path: "/momd-and-quantity", name: "MomdAndQuantity", component: MomdAndQuantity },
  { path: "/maintenance", name: "Maintenance", component: MaintenancePage },
  { path: "/cout-m3", name: "CoutM3", component: CoutM3 },
  { path: "/cout-mois", name: "CoutMensuel", component: CoutMensuelPage },
  { path: "/cout-employes", name: "CoutEmployes", component: CoutEmployesPage },
  { path: "/couts-occasionnels", name: "CoutsOccasionnels", component: CoutsOccasionnelsPage },
  { path: "/autres-couts", name: "AutresCouts", component: AutresCoutsPage },
  { path: "/majorations", name: "Majorations", component: MajorationsPage },

  // ✅ Devis
  { path: "/devis", name: "Devis", component: DevisPage },

  // ✅ Comparateur
  { path: "/comparateur-variantes", name: "ComparateurVariantes", component: ComparateurVariantesPage },

  // ✅ Répertoires
  { path: "/mp-catalogue", name: "MpCatalogue", component: MpCataloguePage },
  { path: "/formules-catalogue", name: "FormulesCatalogue", component: FormulesCataloguePage },
  { path: "/pnl-archives", name: "PnlArchives", component: PnlArchivePage },

  { path: "/details", name: "Details", component: DetailsPage },

  // ✅ Redirect racine -> Mes P&L
  { path: "/", redirect: { name: "MesPnls" } },

  // ✅ Fallback correct Vue Router 4 (toujours à la fin)
  { path: "/:pathMatch(.*)*", name: "PageView", component: PageView, props: true },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
