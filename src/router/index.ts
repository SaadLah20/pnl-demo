import { createRouter, createWebHistory } from "vue-router";
import PageView from "@/pages/PageView.vue";
import MesPnlPage from "@/pages/MesPnlPage.vue";

const routes = [
  // ✅ Page dédiée Mes P&L
  {
    path: "/mes-pnls",
    name: "MesPnls",
    component: MesPnlPage,
  },

  // ✅ Fallback pour toutes les autres pages (générique)
  {
    path: "/:name",
    name: "PageView",
    component: PageView,
    props: true,
  },

  // ✅ Redirect racine -> Mes P&L (optionnel mais pratique)
  {
    path: "/",
    redirect: { name: "MesPnls" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
