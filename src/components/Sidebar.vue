<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePnlStore } from "@/stores/pnl.store";

// Heroicons
import {
  ChartBarIcon,
  FolderIcon,
  BookOpenIcon,
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  DocumentPlusIcon,

  DocumentTextIcon,
  Squares2X2Icon,
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

const open = ref({
  general: true,

  varianteActive: true,
  sections: true,

  appro: true,
  formules: true,
  couts: true,
  devis: true,
});

/* =====================
   ROUTING
===================== */

// Routes "hard"
const routeByItem: Record<string, string> = {
  // GENERAL
  "Mes P&L": "MesPnls",
  "Répertoire MP": "MpCatalogue",
  "Catalogue formules": "FormulesCatalogue",
  "Détails": "Details",
    "P&L archivés": "PnlArchives",

};

function goToPage(item: string) {
  activeItem.value = item;

  // known routes
  const rn = routeByItem[item];
  if (rn) {
    router.push({ name: rn });
    return;
  }

  // fallback PageView with a stable name
  const pageNameMap: Record<string, string> = {
    "Récapitulatif": "Variante/Récapitulatif",

    "MP": "Variante/Sections/Approvisionnement/MP",
    "Transport": "Variante/Sections/Approvisionnement/Transport",

    "Formules": "Variante/Sections/Formules/Formules",
    "Qté et MOMD": "Variante/Sections/Formules/Qté et MOMD",

    "CAB": "Variante/Sections/Couts/CAB",
    "Maintenance": "Variante/Sections/Couts/Maintenance",
    "Cout au m3": "Variante/Sections/Couts/Cout au m3",
    "Cout au mois": "Variante/Sections/Couts/Cout au mois",
    "Cout employés": "Variante/Sections/Couts/Cout employés",
    "Couts occasionnels": "Variante/Sections/Couts/Couts occasionnels",
    "Autres couts": "Variante/Sections/Couts/Autres couts",

    "Majorations": "Variante/Sections/Devis/Majorations",
    "Devis": "Variante/Sections/Devis/Devis",
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
    else if (route.name === "Details") activeItem.value = "Détails";
    else if (route.name === "PnlArchives") activeItem.value = "P&L archivés";
    else if (route.name === "FormulesCatalogue") activeItem.value = "Catalogue formules";
    else if (route.name === "PageView") {
      const n = typeof route.params.name === "string" ? route.params.name : "";

      const reverse: Array<[string, string]> = [
        ["Variante/Détails", "Détails"],
        ["Variante/Récapitulatif", "Récapitulatif"],

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
      // si la page n'est pas mappée, on ne force pas "Mes P&L"
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

  "Détails": DocumentTextIcon,
  "Récapitulatif": Squares2X2Icon,

  "Approvisionnement": CubeIcon,
  "Formules": BeakerIcon,
  "Coûts": CurrencyDollarIcon,
  "Devis": DocumentPlusIcon,

  "MP": CubeIcon,
  "Transport": TruckIcon,
  "Qté et MOMD": ScaleIcon,

  "CAB": BuildingLibraryIcon,
  "Maintenance": WrenchIcon,
  "Cout au m3": CubeIcon,
  "Cout au mois": CalendarIcon,
  "Cout employés": UsersIcon,
  "Couts occasionnels": CurrencyDollarIcon,
  "Autres couts": EllipsisHorizontalIcon,

  "Majorations": PlusIcon,
};

/* =====================
   GENERAL ITEMS
===================== */
const generalItems = computed(() => [
  "Mes P&L",
  "Répertoire MP",
  "Catalogue formules",
  "P&L archivés",
  "Comparateur de variantes",
  "Générer devis multi-variantes",
]);

/* =====================
   VARIANT SELECTOR (REAL)
===================== */
const activePnl = computed(() => store.activePnl);

type VariantOption = {
  contractId: string;
  contractLabel: string;
  variantId: string;
  variantLabel: string;
};

const variantOptions = computed<VariantOption[]>(() => {
  const pnl = activePnl.value;
  if (!pnl?.contracts?.length) return [];

  const out: VariantOption[] = [];
  for (const c of pnl.contracts ?? []) {
    const cId = String(c.id ?? "");
    const cLabel = c?.title
      ? String(c.title)
      : cId
      ? `Contrat ${cId.slice(0, 6)}`
      : "Contrat";

    for (const v of c.variants ?? []) {
      out.push({
        contractId: cId,
        contractLabel: cLabel,
        variantId: String(v.id),
        variantLabel: String(v.title ?? `Variante ${String(v.id).slice(0, 6)}`),
      });
    }
  }
  return out;
});

const activeVariantId = computed(() => String(store.activeVariantId ?? ""));
const activeVariantLabel = computed(() => store.activeVariant?.title ?? "—");

function setActiveVariant(id: string) {
  // ✅ préfère une action explicite si tu l'as dans le store
  const anyStore: any = store as any;

  if (typeof anyStore.setActiveVariant === "function") {
    anyStore.setActiveVariant(id);
  } else if (typeof anyStore.setActiveVariantId === "function") {
    anyStore.setActiveVariantId(id);
  } else {
    // fallback direct state
    anyStore.activeVariantId = id;
  }
}

/* =====================
   UI helpers
===================== */
function toggle(key: keyof typeof open.value) {
  open.value[key] = !open.value[key];
}
</script>

<template>
  <aside class="sidebar">
    <div class="logo-section">
      <h1>PnL Creator</h1>
    </div>

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

    <!-- ✅ GENERAL -->
    <div class="group-block general-block">
      <div class="section">
        <h2 class="section-title" @click="toggle('general')">
          Général <span>{{ open.general ? "▾" : "▸" }}</span>
        </h2>

        <nav v-show="open.general" class="nav-items">
          <div
            v-for="item in generalItems"
            :key="item"
            class="item"
            :class="{ active: activeItem === item }"
            @click="goToPage(item)"
          >
            <component :is="icons[item] || ChartBarIcon" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>
    </div>

    <!-- ✅ VARIANTE ACTIVE -->
    <div class="group-block edition-block">
      <div class="section">
        <h2 class="section-title" @click="toggle('varianteActive')">
          Variante Active <span>{{ open.varianteActive ? "▾" : "▸" }}</span>
        </h2>

        <div v-show="open.varianteActive">
          <!-- ✅ REAL SELECTOR -->
          <div class="selectors" style="margin-bottom: 10px;">
            <div class="selector" style="cursor: default;">
              <div class="muted" style="font-size: 0.75rem; margin-bottom: 6px;">
                Variante sélectionnée
              </div>

              <select
                class="input"
                :value="activeVariantId"
                @change="setActiveVariant(($event.target as HTMLSelectElement).value)"
              >
                <option value="" disabled>— Choisir une variante —</option>

                <!-- group by contract (simple grouping) -->
                <template v-for="c in Array.from(new Set(variantOptions.map(v => v.contractLabel)))" :key="c">
                  <optgroup :label="c">
                    <option
                      v-for="v in variantOptions.filter(x => x.contractLabel === c)"
                      :key="v.variantId"
                      :value="v.variantId"
                    >
                      {{ v.variantLabel }}
                    </option>
                  </optgroup>
                </template>
              </select>

              <div class="muted" style="margin-top: 6px; font-size: 0.8rem;">
                Active : <b>{{ activeVariantLabel }}</b>
              </div>
            </div>
          </div>

          <!-- ✅ Tree block -->
          <div class="tree">
            <!-- level 1 -->
            <div class="tree-node">
              <div
                class="tree-leaf"
                :class="{ active: activeItem === 'Détails' }"
                @click="goToPage('Détails')"
              >
                <component :is="icons['Détails']" class="icon" />
                Détails
              </div>

              <div
                class="tree-leaf"
                :class="{ active: activeItem === 'Récapitulatif' }"
                @click="goToPage('Récapitulatif')"
              >
                <component :is="icons['Récapitulatif']" class="icon" />
                Récapitulatif
              </div>

              <!-- Sections (parent) -->
              <div class="tree-parent" @click="toggle('sections')">
                <div class="tree-parent-left">
                  <component :is="open.sections ? ChevronDownIcon : ChevronRightIcon" class="chev" />
                  <span class="tree-parent-title">Sections</span>
                </div>
              </div>

              <!-- level 2 -->
              <div v-show="open.sections" class="tree-children">
                <!-- Approvisionnement -->
                <div class="tree-parent lvl2" @click="toggle('appro')">
                  <div class="tree-parent-left">
                    <component :is="open.appro ? ChevronDownIcon : ChevronRightIcon" class="chev" />
                    <component :is="icons['Approvisionnement']" class="icon" />
                    <span class="tree-parent-title">Approvisionnement</span>
                  </div>
                </div>
                <div v-show="open.appro" class="tree-children lvl3">
                  <div class="tree-leaf small" :class="{ active: activeItem === 'MP' }" @click="goToPage('MP')">
                    <component :is="icons['MP']" class="icon" /> MP
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Transport' }" @click="goToPage('Transport')">
                    <component :is="icons['Transport']" class="icon" /> Transport
                  </div>
                </div>

                <!-- Formules -->
                <div class="tree-parent lvl2" @click="toggle('formules')">
                  <div class="tree-parent-left">
                    <component :is="open.formules ? ChevronDownIcon : ChevronRightIcon" class="chev" />
                    <component :is="icons['Formules']" class="icon" />
                    <span class="tree-parent-title">Formules</span>
                  </div>
                </div>
                <div v-show="open.formules" class="tree-children lvl3">
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Formules' }" @click="goToPage('Formules')">
                    <component :is="icons['Formules']" class="icon" /> Formules
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Qté et MOMD' }" @click="goToPage('Qté et MOMD')">
                    <component :is="icons['Qté et MOMD']" class="icon" /> Qté et MOMD
                  </div>
                </div>

                <!-- Coûts -->
                <div class="tree-parent lvl2" @click="toggle('couts')">
                  <div class="tree-parent-left">
                    <component :is="open.couts ? ChevronDownIcon : ChevronRightIcon" class="chev" />
                    <component :is="icons['Coûts']" class="icon" />
                    <span class="tree-parent-title">Coûts</span>
                  </div>
                </div>
                <div v-show="open.couts" class="tree-children lvl3">
                  <div class="tree-leaf small" :class="{ active: activeItem === 'CAB' }" @click="goToPage('CAB')">
                    <component :is="icons['CAB']" class="icon" /> CAB
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Maintenance' }" @click="goToPage('Maintenance')">
                    <component :is="icons['Maintenance']" class="icon" /> Maintenance
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Cout au m3' }" @click="goToPage('Cout au m3')">
                    <component :is="icons['Cout au m3']" class="icon" /> Cout au m3
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Cout au mois' }" @click="goToPage('Cout au mois')">
                    <component :is="icons['Cout au mois']" class="icon" /> Cout au mois
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Cout employés' }" @click="goToPage('Cout employés')">
                    <component :is="icons['Cout employés']" class="icon" /> Cout employés
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Couts occasionnels' }" @click="goToPage('Couts occasionnels')">
                    <component :is="icons['Couts occasionnels']" class="icon" /> Couts occasionnels
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Autres couts' }" @click="goToPage('Autres couts')">
                    <component :is="icons['Autres couts']" class="icon" /> Autres couts
                  </div>
                </div>

                <!-- Devis -->
                <div class="tree-parent lvl2" @click="toggle('devis')">
                  <div class="tree-parent-left">
                    <component :is="open.devis ? ChevronDownIcon : ChevronRightIcon" class="chev" />
                    <component :is="icons['Devis']" class="icon" />
                    <span class="tree-parent-title">Devis</span>
                  </div>
                </div>
                <div v-show="open.devis" class="tree-children lvl3">
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Majorations' }" @click="goToPage('Majorations')">
                    <component :is="icons['Majorations']" class="icon" /> Majorations
                  </div>
                  <div class="tree-leaf small" :class="{ active: activeItem === 'Devis' }" @click="goToPage('Devis')">
                    <component :is="DocumentPlusIcon" class="icon" /> Devis
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- /tree -->
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* ✅ CSS EXISTANT (inchangé) */
.sidebar { width: 280px; background: #f8f9fa; padding: 16px; height: 100vh; overflow-y: auto; font-family: "Inter", sans-serif; box-shadow: 2px 0 8px rgba(0,0,0,0.05); }
.logo-section h1 { background: linear-gradient(135deg,#007a33,#009ee0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; font-size: 1.5rem; font-weight: 700; }
.profile-section { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.profile-img { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #ccc; }
.profile-info .name { font-weight: 600; font-size: 0.95rem; }
.profile-info .role { font-size: 0.8rem; color: #666; }
.group-block { margin-bottom: 16px; padding: 10px; border-radius: 8px; }
.general-block { background: #f1f3f5; }
.edition-block { background: #e8f5e9; }
.variante-block { background: #ffffff; border: 1px solid #ddd; }
.selectors { background: #ffffff; border-radius: 8px; padding: 8px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; }
.selector { background: #f8f9fa; padding: 6px 8px; border-radius: 6px; font-size: 0.85rem; border: 1px solid #ddd; }
.section-title { font-weight: 600; font-size: 0.95rem; cursor: pointer; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(90deg,#007a33,#009ee0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.nav-items { display: flex; flex-direction: column; margin-bottom: 10px; }
.item { padding: 6px 10px; cursor: pointer; border-radius: 6px; transition: all 0.2s; font-size: 0.9rem; color: #333; display: flex; align-items: center; gap: 8px; }
.item:hover { background: #e0f2f1; transform: translateX(2px); }
.item.active { background: #007a33; color: white; }
.icon { width: 16px; height: 16px; }

/* ✅ AJOUTS MINIMAUX pour hiérarchie propre (tree) */
.input {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 0.85rem;
}

.muted { color: #6b7280; }

/* Tree layout */
.tree { background: #ffffff; border: 1px solid #d1d5db; border-radius: 10px; padding: 8px; }
.tree-node { display: flex; flex-direction: column; gap: 6px; }

.tree-leaf {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
  color: #111827;
}
.tree-leaf:hover { background: #e0f2f1; }
.tree-leaf.active { background: #007a33; color: #fff; }

.tree-parent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  background: rgba(255,255,255,0.6);
  border: 1px solid rgba(0,0,0,0.06);
}
.tree-parent:hover { background: #eef2ff; }
.tree-parent-left { display: flex; align-items: center; gap: 8px; }
.tree-parent-title { font-size: 0.88rem; font-weight: 650; color: #111827; }

/* levels */
.tree-children {
  margin-left: 10px;
  padding-left: 10px;
  border-left: 2px solid rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tree-children.lvl3 { margin-left: 14px; padding-left: 10px; border-left-style: dashed; }

.lvl2 .tree-parent-title { font-weight: 600; font-size: 0.86rem; } /* plus petit que "Sections" */
.tree-leaf.small { font-size: 0.85rem; padding: 5px 8px; }

.chev { width: 16px; height: 16px; color: #6b7280; }
</style>
