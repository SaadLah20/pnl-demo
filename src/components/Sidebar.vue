<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

// Heroicons
import {
  ChartBarIcon,
  FolderIcon,
  BookOpenIcon,
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  DocumentPlusIcon,
  ClipboardDocumentIcon,
  CubeIcon,
  TruckIcon,
  BeakerIcon,
  ScaleIcon,
  BuildingLibraryIcon,
  WrenchIcon,
  CalendarIcon,
  UsersIcon,
  CurrencyDollarIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from "@heroicons/vue/24/outline";

const router = useRouter();
const route = useRoute();

/* =====================
   STATE
===================== */

// Synchronisé avec la route (au lieu d'un état qui peut diverger)
const activeItem = ref("Mes P&L");

const openSections = ref({
  general: true,
  edition: true,
  logistique: true,
  formules: true,
  couts: true,
  devis: true,
});

// Sélections (mock – futur: brancher sur Pinia activePnl/activeVariant si tu veux)
const selectedPL = ref("P&L – Chantier Agadir");
const selectedContrat = ref("Contrat A");
const selectedVariante = ref("Variante V1");

/* =====================
   ROUTING
===================== */
function goToPage(name: string) {
  activeItem.value = name;

  if (name === "Mes P&L") {
    router.push({ name: "MesPnls" });
    return;
  }

  router.push({ name: "PageView", params: { name } });
}

// Met à jour l’item actif si l’utilisateur navigue autrement (back/forward, refresh, etc.)
watch(
  () => route.fullPath,
  () => {
    if (route.name === "MesPnls") {
      activeItem.value = "Mes P&L";
      return;
    }
    // route.name === "PageView" et route.params.name est le libellé
    const n = typeof route.params.name === "string" ? route.params.name : "";
    if (n) activeItem.value = n;
  },
  { immediate: true }
);

/* =====================
   ICONS
===================== */
const icons: Record<string, any> = {
  // Général
  "Mes P&L": ChartBarIcon,
  "Répertoire MP": FolderIcon,
  "Catalogue formules": BookOpenIcon,
  "P&L archivés": ArchiveBoxIcon,
  "Comparateur de variantes": ArrowsRightLeftIcon,
  "Générer devis multi-variantes": DocumentPlusIcon,

  // Édition
  "P&L": ClipboardDocumentIcon,
  "Contrat": DocumentPlusIcon,
  "Variante": ClipboardDocumentIcon,

  // Logistique
  "Matière première": CubeIcon,
  "Transport": TruckIcon,

  // Formules
  "Formules de la variante": BeakerIcon,
  "Quantité et MOMD": ScaleIcon,

  // Coûts
  "CAB": BuildingLibraryIcon,
  "Maintenance": WrenchIcon,
  "Cout au m3": CubeIcon,
  "Cout au mois": CalendarIcon,
  "Cout employés": UsersIcon,
  "Couts occasionnels": CurrencyDollarIcon,
  "Autres couts": EllipsisHorizontalIcon,

  // Devis
  "Majorations": PlusIcon,
  "Devis": DocumentPlusIcon,
};

const generalItems = computed(() => [
  "Mes P&L",
  "Répertoire MP",
  "Catalogue formules",
  "P&L archivés",
  "Comparateur de variantes",
  "Générer devis multi-variantes",
]);

const editionItems = computed(() => ["P&L", "Contrat", "Variante"]);
const logistiqueItems = computed(() => ["Matière première", "Transport"]);
const formulesItems = computed(() => ["Formules de la variante", "Quantité et MOMD"]);
const coutsItems = computed(() => [
  "CAB",
  "Maintenance",
  "Cout au m3",
  "Cout au mois",
  "Cout employés",
  "Couts occasionnels",
  "Autres couts",
]);
const devisItems = computed(() => ["Majorations", "Devis"]);
</script>

<template>
  <aside class="sidebar">
    <!-- LOGO -->
    <div class="logo-section">
      <h1>PnL Creator</h1>
    </div>

    <!-- PROFIL -->
    <div class="profile-section">
      <img
        class="profile-img"
        src="https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
        alt="Profil"
      />
      <div class="profile-info">
        <div class="name">Saad Lahlimi</div>
        <div class="role">Responsable P&L</div>
      </div>
    </div>

    <!-- Bloc 1 : Généralités -->
    <div class="group-block general-block">
      <div class="section">
        <h2 class="section-title" @click="openSections.general = !openSections.general">
          Général <span>{{ openSections.general ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="openSections.general" class="nav-items">
          <div
            v-for="item in generalItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>
    </div>

    <!-- Bloc 2 : Sélection + Édition -->
    <div class="group-block edition-block">
      <!-- Sélecteurs (mock) -->
      <div class="selectors">
        <div class="selector">📊 {{ selectedPL }}</div>
        <div class="selector">📄 {{ selectedContrat }}</div>
        <div class="selector">🧬 {{ selectedVariante }}</div>
      </div>

      <!-- Édition -->
      <div class="section">
        <h2 class="section-title" @click="openSections.edition = !openSections.edition">
          Édition <span>{{ openSections.edition ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="openSections.edition" class="nav-items">
          <div
            v-for="item in editionItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>
    </div>

    <!-- Bloc 3 : Variante active -->
    <div class="group-block variante-block">
      <!-- LOGISTIQUE -->
      <div class="section">
        <h2 class="section-title" @click="openSections.logistique = !openSections.logistique">
          Logistique & Approvisionnement
          <span>{{ openSections.logistique ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="openSections.logistique" class="nav-items">
          <div
            v-for="item in logistiqueItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

      <!-- FORMULES -->
      <div class="section">
        <h2 class="section-title" @click="openSections.formules = !openSections.formules">
          Formules <span>{{ openSections.formules ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="openSections.formules" class="nav-items">
          <div
            v-for="item in formulesItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

      <!-- COÛTS -->
      <div class="section">
        <h2 class="section-title" @click="openSections.couts = !openSections.couts">
          Coûts et charges <span>{{ openSections.couts ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="openSections.couts" class="nav-items">
          <div
            v-for="item in coutsItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

      <!-- DEVIS -->
      <div class="section">
        <h2 class="section-title" @click="openSections.devis = !openSections.devis">
          Devis <span>{{ openSections.devis ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="openSections.devis" class="nav-items">
          <div
            v-for="item in devisItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 280px;
  background: #f8f9fa;
  padding: 16px;
  height: 100vh;
  overflow-y: auto;
  font-family: "Inter", sans-serif;
  box-shadow: 2px 0 8px rgba(0,0,0,0.05);
}

.logo-section h1 {
  background: linear-gradient(135deg,#007a33,#009ee0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 16px;
  font-size: 1.5rem;
  font-weight: 700;
}

.profile-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.profile-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid #ccc;
}

.profile-info .name {
  font-weight: 600;
  font-size: 0.95rem;
}

.profile-info .role {
  font-size: 0.8rem;
  color: #666;
}

.group-block {
  margin-bottom: 16px;
  padding: 10px;
  border-radius: 8px;
}

.general-block { background: #f1f3f5; }
.edition-block { background: #e8f5e9; }
.variante-block { background: #ffffff; border: 1px solid #ddd; }

.selectors {
  background: #ffffff;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selector {
  background: #f8f9fa;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid #ddd;
}

.selector:hover { background: #e0f2f1; }

.section-title {
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(90deg,#007a33,#009ee0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-items {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
}

.item {
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  font-size: 0.9rem;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.item:hover {
  background: #e0f2f1;
  transform: translateX(2px);
}

.item.active {
  background: #007a33;
  color: white;
}

.icon {
  width: 16px;
  height: 16px;
}
</style>
