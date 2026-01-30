import { createRouter, createWebHistory } from "vue-router";

import PageView from "@/pages/PageView.vue";
import MesPnlPage from "@/pages/MesPnlPage.vue";

// ✅ tes pages
import MpCataloguePage from "@/pages/MpCataloguePage.vue";
import FormulesCataloguePage from "@/pages/FormulesCataloguePage.vue";

const routes = [
  // ✅ Page dédiée Mes P&L
  {
    path: "/mes-pnls",
    name: "MesPnls",
    component: MesPnlPage,
  },

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
