<!-- Sidebar.vue (FICHIER COMPLET) -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePnlStore } from "@/stores/pnl.store";

// ✅ Logo
import holcimLogoUrl from "@/assets/holcim_logo.png";

// Heroicons
import {
  ChartBarIcon,
  FolderIcon,
  BookOpenIcon,
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ChevronDownIcon,
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
const store = usePnlStore();

/* =====================
   STATE
===================== */
const activeItem = ref("Mes P&L");

/**
 * ✅ Persist open/close state
 * - sections ouvertes au démarrage
 * - conservées au refresh
 */
const OPEN_KEY = "pnl.sidebar.open.v1";

type OpenState = {
  general: boolean;
  varianteActive: boolean;
  sections: boolean;
  appro: boolean;
  formules: boolean;
  couts: boolean;
  devis: boolean;
};

const open = ref<OpenState>({
  general: true,
  varianteActive: true,
  sections: true, // ✅ ouvert par défaut
  appro: true,
  formules: true,
  couts: true,
  devis: true,
});

function loadOpenState() {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<OpenState>;
    open.value = { ...open.value, ...parsed };
  } catch {
    // ignore
  }
}
function saveOpenState() {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open.value));
  } catch {
    // ignore
  }
}

onMounted(() => {
  loadOpenState();
});

// persist on any toggle
watch(open, saveOpenState, { deep: true });

/* =====================
   ROUTING
===================== */

// Routes "hard"
const routeByItem: Record<string, string> = {
  "Mes P&L": "MesPnls",
  "Répertoire MP": "MpCatalogue",
  "Catalogue formules": "FormulesCatalogue",
  "Détails": "Details",
  "P&L archivés": "PnlArchives",

  CAB: "CAB",
  MP: "Mp",
  Transport: "Transport",
  Formules: "Formules",
  "Qté et MOMD": "MomdAndQuantity",
  Maintenance: "Maintenance",
  "Cout au m3": "CoutM3",
  "Cout au mois": "CoutMensuel",
  "Cout employés": "CoutEmployes",
  "Couts occasionnels": "CoutsOccasionnels",
  "Autres couts": "AutresCouts",
  Majorations: "Majorations",
  "Comparateur de variantes": "ComparateurVariantes",
  Devis: "Devis",
  "Générer devis multi-variantes": "MultiVarianteDevis",
};

function goToPage(item: string) {
  activeItem.value = item;

  const rn = routeByItem[item];
  if (rn) {
    router.push({ name: rn });
    return;
  }

  // fallback PageView (si tu l'utilises encore)
  const pageNameMap: Record<string, string> = {
    Formules: "Variante/Sections/Formules/Formules",
    "Qté et MOMD": "Variante/Sections/Formules/Qté et MOMD",

    CAB: "Variante/Sections/Couts/CAB",
    Maintenance: "Variante/Sections/Couts/Maintenance",
    "Cout au m3": "Variante/Sections/Couts/Cout au m3",
    "Cout au mois": "Variante/Sections/Couts/Cout au mois",
    "Cout employés": "Variante/Sections/Couts/Cout employés",
    "Couts occasionnels": "Variante/Sections/Couts/Couts occasionnels",
    "Autres couts": "Variante/Sections/Couts/Autres couts",

    Majorations: "Variante/Sections/Devis/Majorations",
    Devis: "Variante/Sections/Devis/Devis",
  };

  const pageName = pageNameMap[item] ?? item;
  router.push({ name: "PageView", params: { name: pageName } });
}

// keep active item synced with current route
watch(
  () => route.name,
  () => {
    if (route.name === "MesPnls") activeItem.value = "Mes P&L";
    else if (route.name === "MpCatalogue") activeItem.value = "Répertoire MP";
    else if (route.name === "FormulesCatalogue") activeItem.value = "Catalogue formules";
    else if (route.name === "Details") activeItem.value = "Détails";
    else if (route.name === "PnlArchives") activeItem.value = "P&L archivés";
    else if (route.name === "ComparateurVariantes") activeItem.value = "Comparateur de variantes";
    else if (route.name === "CAB") activeItem.value = "CAB";
    else if (route.name === "Mp") activeItem.value = "MP";
    else if (route.name === "Transport") activeItem.value = "Transport";
    else if (route.name === "Formules") activeItem.value = "Formules";
    else if (route.name === "MomdAndQuantity") activeItem.value = "Qté et MOMD";
    else if (route.name === "Maintenance") activeItem.value = "Maintenance";
    else if (route.name === "CoutM3") activeItem.value = "Cout au m3";
    else if (route.name === "CoutMensuel") activeItem.value = "Cout au mois";
    else if (route.name === "CoutEmployes") activeItem.value = "Cout employés";
    else if (route.name === "CoutsOccasionnels") activeItem.value = "Couts occasionnels";
    else if (route.name === "AutresCouts") activeItem.value = "Autres couts";
    else if (route.name === "Majorations") activeItem.value = "Majorations";
    else if (route.name === "Devis") activeItem.value = "Devis";
    else if (route.name === "MultiVarianteDevis") activeItem.value = "Générer devis multi-variantes";
    else if (route.name === "PageView") {
      const n = typeof route.params.name === "string" ? route.params.name : "";

      const reverse: Array<[string, string]> = [
        ["Variante/Détails", "Détails"],

        ["Variante/Sections/Approvisionnement/MP", "MP"],
        ["Variante/Sections/Approvisionnement/Transport", "Transport"],

        ["Variante/Sections/Formules/Formules", "Formules"],
        ["Variante/Sections/Formules/Qté et MOMD", "Qté et MOMD"],

        ["Variante/Sections/Couts/CAB", "CAB"],
        ["Variante/Sections/Couts/Maintenance", "Maintenance"],
        ["Variante/Sections/Couts/Cout au m3", "Cout au m3"],
        ["Variante/Sections/Couts/Cout au mois", "Cout au mois"],
        ["Variante/Sections/Couts/Cout employés", "Cout employés"],
        ["Variante/Sections/Couts/Couts occasionnels", "Couts occasionnels"],
        ["Variante/Sections/Couts/Autres couts", "Autres couts"],

        ["Variante/Sections/Devis/Majorations", "Majorations"],
        ["Variante/Sections/Devis/Devis", "Devis"],
      ];

      const hit = reverse.find(([k]) => k === n);
      if (hit) activeItem.value = hit[1];
    } else {
      activeItem.value = "Mes P&L";
    }
  },
  { immediate: true }
);

/* =====================
   ICONS
===================== */
const icons: Record<string, any> = {
  "Mes P&L": ChartBarIcon,
  "Répertoire MP": FolderIcon,
  "Catalogue formules": BookOpenIcon,
  "P&L archivés": ArchiveBoxIcon,
  "Comparateur de variantes": ArrowsRightLeftIcon,
  "Générer devis multi-variantes": DocumentPlusIcon,

  Détails: DocumentTextIcon,

  Approvisionnement: CubeIcon,
  Formules: BeakerIcon,
  "Coûts": CurrencyDollarIcon,
  Devis: DocumentPlusIcon,

  MP: CubeIcon,
  Transport: TruckIcon,
  "Qté et MOMD": ScaleIcon,

  CAB: BuildingLibraryIcon,
  Maintenance: WrenchIcon,
  "Cout au m3": CubeIcon,
  "Cout au mois": CalendarIcon,
  "Cout employés": UsersIcon,
  "Couts occasionnels": CurrencyDollarIcon,
  "Autres couts": EllipsisHorizontalIcon,

  Majorations: PlusIcon,
};

const generalItems = computed(() => [
  "Mes P&L",
  "Répertoire MP",
  "Catalogue formules",
  "Comparateur de variantes",
  "Générer devis multi-variantes",
]);

/* =====================
   UI helpers
===================== */
function toggle(key: keyof OpenState) {
  open.value[key] = !open.value[key];
}

const allExpanded = computed(() => {
  const o = open.value;
  return o.sections && o.appro && o.formules && o.couts && o.devis;
});

function setAllVariantSections(expand: boolean) {
  open.value.varianteActive = true;
  open.value.sections = expand;
  open.value.appro = expand;
  open.value.formules = expand;
  open.value.couts = expand;
  open.value.devis = expand;
}

// ✅ (optionnel) logique “UX fluide” : désactiver la navigation “Variante active” si aucune variante active
const hasActiveVariant = computed(() => !!String((store as any)?.activeVariantId ?? "").trim());
</script>

<template>
  <aside class="sb">
    <!-- TOP (compact) -->
    <div class="sb__top">
      <div class="sb__brandRow">
        <div class="sb__logoWrap" title="Holcim">
          <img class="sb__logo" :src="holcimLogoUrl" alt="Holcim" />
        </div>

        <div class="sb__brandText">
          <div class="sb__title">P&L Creator</div>
          <div class="sb__subtitle">Analyse & marges</div>
        </div>
      </div>

      <!-- profile compact -->
      <div class="sb__profile">
        <img
          class="sb__avatar"
          src="https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
          alt="Profil"
        />
        <div class="sb__who">
          <div class="sb__name">Saad Lahlimi</div>
          <div class="sb__role">Responsable P&L</div>
        </div>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="sb__contentScroll">
      <!-- GENERAL -->
      <section class="sb__block">
        <header class="sb__blockHead" @click="toggle('general')">
          <div class="sb__blockTitle">Général</div>
          <span class="sb__chev">{{ open.general ? "▾" : "▸" }}</span>
        </header>

        <nav v-show="open.general" class="sb__nav">
          <button
            v-for="item in generalItems"
            :key="item"
            type="button"
            class="sb__item"
            :class="{ 'is-active': activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item] || ChartBarIcon" class="sb__icon" />
            <span class="sb__label">{{ item }}</span>
          </button>
        </nav>
      </section>

      <!-- VARIANTE ACTIVE (sans sélecteur) -->
      <section class="sb__block sb__block--accent">
        <header class="sb__blockHead" @click="toggle('varianteActive')">
          <div class="sb__blockTitle">Variante active</div>
          <span class="sb__chev">{{ open.varianteActive ? "▾" : "▸" }}</span>
        </header>

        <div v-show="open.varianteActive" class="sb__content">
          <div class="sb__tree" :class="{ 'is-disabled': !hasActiveVariant }">
            <button
              type="button"
              class="sb__leaf"
              :class="{ 'is-active': activeItem === 'Détails' }"
              :disabled="!hasActiveVariant"
              @click="goToPage('Détails')"
              :title="!hasActiveVariant ? 'Sélectionne une variante pour accéder aux sections' : ''"
            >
              <component :is="icons['Détails']" class="sb__icon" />
              <span class="sb__label">Détails</span>
            </button>

            <!-- Sections + quick expand/collapse -->
            <div class="sb__row">
              <button
                type="button"
                class="sb__parent sb__parent--row"
                :disabled="!hasActiveVariant"
                @click="toggle('sections')"
              >
                <component :is="open.sections ? ChevronDownIcon : ChevronRightIcon" class="sb__chevIcon" />
                <span class="sb__parentTitle">Sections</span>
              </button>

              <button
                type="button"
                class="sb__miniBtn"
                :disabled="!hasActiveVariant"
                @click="setAllVariantSections(!allExpanded)"
                :title="!hasActiveVariant ? 'Sélectionne une variante' : allExpanded ? 'Tout replier' : 'Tout déplier'"
              >
                {{ allExpanded ? "Replier" : "Déplier" }}
              </button>
            </div>

            <div v-show="open.sections" class="sb__children">
              <!-- Approvisionnement -->
              <button
                type="button"
                class="sb__parent sb__parent--lvl2"
                :disabled="!hasActiveVariant"
                @click="toggle('appro')"
              >
                <component :is="open.appro ? ChevronDownIcon : ChevronRightIcon" class="sb__chevIcon" />
                <component :is="icons['Approvisionnement']" class="sb__icon" />
                <span class="sb__parentTitle">Approvisionnement</span>
              </button>
              <div v-show="open.appro" class="sb__children sb__children--lvl3">
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'MP' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('MP')"
                >
                  <component :is="icons['MP']" class="sb__icon" />
                  <span class="sb__label">MP</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Transport' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Transport')"
                >
                  <component :is="icons['Transport']" class="sb__icon" />
                  <span class="sb__label">Transport</span>
                </button>
              </div>

              <!-- Formules -->
              <button
                type="button"
                class="sb__parent sb__parent--lvl2"
                :disabled="!hasActiveVariant"
                @click="toggle('formules')"
              >
                <component :is="open.formules ? ChevronDownIcon : ChevronRightIcon" class="sb__chevIcon" />
                <component :is="icons['Formules']" class="sb__icon" />
                <span class="sb__parentTitle">Formules</span>
              </button>
              <div v-show="open.formules" class="sb__children sb__children--lvl3">
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Formules' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Formules')"
                >
                  <component :is="icons['Formules']" class="sb__icon" />
                  <span class="sb__label">Formules</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Qté et MOMD' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Qté et MOMD')"
                >
                  <component :is="icons['Qté et MOMD']" class="sb__icon" />
                  <span class="sb__label">Qté et MOMD</span>
                </button>
              </div>

              <!-- Coûts -->
              <button
                type="button"
                class="sb__parent sb__parent--lvl2"
                :disabled="!hasActiveVariant"
                @click="toggle('couts')"
              >
                <component :is="open.couts ? ChevronDownIcon : ChevronRightIcon" class="sb__chevIcon" />
                <component :is="icons['Coûts']" class="sb__icon" />
                <span class="sb__parentTitle">Coûts</span>
              </button>
              <div v-show="open.couts" class="sb__children sb__children--lvl3">
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'CAB' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('CAB')"
                >
                  <component :is="icons['CAB']" class="sb__icon" />
                  <span class="sb__label">CAB</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Maintenance' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Maintenance')"
                >
                  <component :is="icons['Maintenance']" class="sb__icon" />
                  <span class="sb__label">Maintenance</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Cout au m3' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Cout au m3')"
                >
                  <component :is="icons['Cout au m3']" class="sb__icon" />
                  <span class="sb__label">Cout au m3</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Cout au mois' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Cout au mois')"
                >
                  <component :is="icons['Cout au mois']" class="sb__icon" />
                  <span class="sb__label">Cout au mois</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Cout employés' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Cout employés')"
                >
                  <component :is="icons['Cout employés']" class="sb__icon" />
                  <span class="sb__label">Cout employés</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Couts occasionnels' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Couts occasionnels')"
                >
                  <component :is="icons['Couts occasionnels']" class="sb__icon" />
                  <span class="sb__label">Couts occasionnels</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Autres couts' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Autres couts')"
                >
                  <component :is="icons['Autres couts']" class="sb__icon" />
                  <span class="sb__label">Autres couts</span>
                </button>
              </div>

              <!-- Devis -->
              <button
                type="button"
                class="sb__parent sb__parent--lvl2"
                :disabled="!hasActiveVariant"
                @click="toggle('devis')"
              >
                <component :is="open.devis ? ChevronDownIcon : ChevronRightIcon" class="sb__chevIcon" />
                <component :is="icons['Devis']" class="sb__icon" />
                <span class="sb__parentTitle">Devis</span>
              </button>
              <div v-show="open.devis" class="sb__children sb__children--lvl3">
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Majorations' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Majorations')"
                >
                  <component :is="icons['Majorations']" class="sb__icon" />
                  <span class="sb__label">Majorations</span>
                </button>
                <button
                  type="button"
                  class="sb__leaf sb__leaf--small"
                  :class="{ 'is-active': activeItem === 'Devis' }"
                  :disabled="!hasActiveVariant"
                  @click="goToPage('Devis')"
                >
                  <component :is="DocumentPlusIcon" class="sb__icon" />
                  <span class="sb__label">Devis</span>
                </button>
              </div>
            </div>
          </div>
          <!-- /TREE -->
        </div>
      </section>
    </div>

    <!-- BOTTOM (archives small) -->
    <div class="sb__bottom">
      <button
        type="button"
        class="sb__archiveBtn"
        :class="{ 'is-active': activeItem === 'P&L archivés' }"
        @click="goToPage('P&L archivés')"
      >
        <component :is="icons['P&L archivés']" class="sb__icon" />
        <span class="sb__label">P&L archivés</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sb {
  --navy: #184070;
  --cyan: #20b8e8;

  --bg: #ffffff;
  --panel: #f7f8fb;
  --border: rgba(16, 24, 40, 0.1);
  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.62);

  width: 268px;
  height: 100vh;
  overflow: auto;

  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 10px;
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;

  display: flex;
  flex-direction: column;
}

/* scroll */
.sb__contentScroll {
  display: block;
  padding-right: 2px;
  padding-bottom: 14px;
}

.sb::-webkit-scrollbar {
  width: 10px;
}
.sb::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.16);
  border-radius: 999px;
  border: 3px solid rgba(255, 255, 255, 0.82);
}
.sb::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.24);
}

/* TOP compact */
.sb__top {
  display: grid;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}

.sb__brandRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sb__logoWrap {
  width: 54px;
  height: 36px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2px 6px;
  display: grid;
  place-items: center;
}

.sb__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.sb__brandText {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.sb__title {
  font-weight: 850;
  letter-spacing: -0.2px;
  color: var(--navy);
  font-size: 0.98rem;
  line-height: 1.1;
}

.sb__subtitle {
  font-size: 0.74rem;
  color: var(--muted);
  line-height: 1.1;
}

/* profile compact */
.sb__profile {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
}

.sb__avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
}

.sb__who {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.sb__name {
  font-weight: 750;
  font-size: 0.86rem;
  color: var(--text);
  line-height: 1.1;
}
.sb__role {
  font-size: 0.74rem;
  color: var(--muted);
  line-height: 1.1;
}

/* blocks */
.sb__block {
  margin-top: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}

.sb__block--accent {
  box-shadow: 0 0 0 1px rgba(32, 184, 232, 0.12) inset;
}

.sb__blockHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  user-select: none;
}

.sb__blockTitle {
  font-weight: 850;
  font-size: 0.84rem;
  color: var(--navy);
}

.sb__chev {
  font-size: 0.9rem;
  color: var(--muted);
}

/* nav items */
.sb__nav {
  display: grid;
  gap: 5px;
  padding: 9px 9px 10px;
}

.sb__item {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  padding: 7px 9px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text);
  font-size: 0.86rem;
  line-height: 1.1;
}

.sb__item:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.14);
}

.sb__item.is-active {
  background: var(--navy);
  color: #fff;
  border-color: rgba(0, 0, 0, 0.06);
}

.sb__icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.sb__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* content */
.sb__content {
  padding: 9px 9px 10px;
  display: grid;
  gap: 9px;
}

/* tree */
.sb__tree {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  display: grid;
  gap: 6px;
}

.sb__tree.is-disabled {
  opacity: 0.72;
}

.sb__leaf {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  padding: 7px 9px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text);
  font-size: 0.86rem;
  text-align: left;
  line-height: 1.1;
}

.sb__leaf:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.14);
}

.sb__leaf.is-active {
  background: var(--navy);
  color: #fff;
}

.sb__leaf:disabled {
  cursor: not-allowed;
}

.sb__leaf--small {
  padding: 6px 9px;
  font-size: 0.84rem;
}

.sb__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sb__parent {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: rgba(15, 23, 42, 0.02);
  border: 1px solid rgba(16, 24, 40, 0.08);
  padding: 7px 9px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text);
  text-align: left;
}

.sb__parent:disabled {
  cursor: not-allowed;
}

.sb__parent--row {
  flex: 1 1 auto;
}

.sb__parent:hover {
  background: rgba(32, 184, 232, 0.07);
  border-color: rgba(32, 184, 232, 0.16);
}

.sb__parent--lvl2 {
  margin-top: 4px;
}

.sb__parentTitle {
  font-weight: 850;
  font-size: 0.84rem;
  color: var(--text);
}

.sb__chevIcon {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.55);
}

.sb__miniBtn {
  flex: 0 0 auto;
  border: 1px solid rgba(32, 184, 232, 0.18);
  background: rgba(32, 184, 232, 0.08);
  color: rgba(15, 23, 42, 0.85);
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 0.78rem;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
}

.sb__miniBtn:hover {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.24);
}

.sb__miniBtn:disabled {
  cursor: not-allowed;
  opacity: 0.75;
}

.sb__children {
  margin-left: 10px;
  padding-left: 10px;
  border-left: 2px solid rgba(16, 24, 40, 0.08);
  display: grid;
  gap: 6px;
}

.sb__children--lvl3 {
  margin-left: 12px;
  border-left-style: dashed;
}

/* bottom */
.sb__bottom {
  flex: 0 0 auto;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  margin-top: 10px;
  padding-bottom: 10px;
}

.sb__archiveBtn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  padding: 8px 10px;
  cursor: pointer;
  font-size: 0.84rem;
  color: var(--text);
  text-align: left;
}

.sb__archiveBtn:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.14);
}

.sb__archiveBtn.is-active {
  background: var(--navy);
  color: #fff;
  border-color: rgba(0, 0, 0, 0.06);
}
</style>
