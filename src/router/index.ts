import { createRouter, createWebHistory } from "vue-router";

import PageView from "@/pages/PageView.vue";
import MesPnlPage from "@/pages/MesPnlPage.vue";
import DetailsPage from "@/pages/DetailsPage.vue";
import PnlArchivePage from "@/pages/PnlArchivePage.vue";
import MpCataloguePage from "@/pages/MpCataloguePage.vue";
import FormulesCataloguePage from "@/pages/FormulesCataloguePage.vue";
import CabPage from "@/pages/Cab.Page.vue";
import MpPage from "@/pages/MpPage.vue";


const routes = [
  // ✅ Page dédiée Mes P&L
  {
    path: "/mes-pnls",
    name: "MesPnls",
    component: MesPnlPage,
  },

    { path: "/CAB", name: "CAB", component: CabPage },
        { path: "/mp", name: "Mp", component: MpPage },



  // ✅ Répertoire MP
  {
    path: "/mp-catalogue",
    name: "MpCatalogue",
    component: MpCataloguePage,
  },

  // ✅ Catalogue Formules
  {
    path: "/formules-catalogue",
    name: "FormulesCatalogue",
    component: FormulesCataloguePage,
  },

  {
  path: "/pnl-archives",
  name: "PnlArchives",
  component: PnlArchivePage,
},

  { path: "/details", name: "Details", component: DetailsPage },

  // ✅ Redirect racine -> Mes P&L
  {
    path: "/",
    redirect: { name: "MesPnls" },
  },

  // ✅ Fallback (toujours à la fin)
  {
    path: "/:name",
    name: "PageView",
    component: PageView,
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
