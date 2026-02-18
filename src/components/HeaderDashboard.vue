<!-- ✅ HeaderDashboard.vue (FICHIER COMPLET / ✅ Résumé split en 2 blocs (sans titre) + ✅ même taille que KPI + ✅ jamais plus haut que KPI) -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import HeaderActionsModals from "@/components/HeaderActionsModals.vue";
import { contractUiTitle } from "@/services/contractTitle";

const actionsRef = ref<InstanceType<typeof HeaderActionsModals> | null>(null);

// Heroicons
import {
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  Squares2X2Icon,
  DocumentDuplicateIcon,
  PlusCircleIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CubeIcon,
  CheckBadgeIcon,
} from "@heroicons/vue/24/outline";

type KpiName =
  | "ASP"
  | "CMP"
  | "MOMD"
  | "Transport"
  | "Production"
  | "EBITDA"
  | "EBIT"
  | "Amortissement";

type KpiValues = { total: number; m3: number; month: number; percent: number };
type Metrics = Record<KpiName, KpiValues>;

const store = usePnlStore();

function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}
function isCabFixePnl(p: any) {
  return norm(p?.model).includes("cab fixe");
}

/* =========================
   MINI TOAST
========================= */
const toastMsg = ref<string | null>(null);
let toastTimer: any = null;

function showToast(msg: string) {
  toastMsg.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = null), 2600);
}

// =========================
// ✅ Store refs
// =========================
const pnls = computed<any[]>(() => store.pnls ?? []);
const activePnl = computed<any | null>(() => store.activePnl ?? null);
const activeVariant = computed<any | null>(() => store.activeVariant ?? null);
const headerKpis = computed<any>(() => store.activeHeaderKPIs);

// =========================
// ✅ CAB Fixe rules
// =========================
const activePnlModel = computed(() => String((store as any)?.activePnl?.model ?? "").trim());
const isCabFixe = computed(() => isCabFixePnl({ model: activePnlModel.value }));
const isCabFixeExist = computed(() => norm(activePnlModel.value).includes("cab fixe - existante"));

const canEditContract = computed(() => !isCabFixe.value);
const editContractTooltip = computed(() =>
  canEditContract.value ? "Éditer" : "Contrat verrouillé pour les P&L CAB FIXE."
);

/* =========================
   ✅ THEME (clair / sombre)
========================= */
type HdTheme = "light" | "dark";
const theme = ref<HdTheme>("light");

function restoreThemePref() {
  const v = localStorage.getItem("hd_theme");
  theme.value = v === "dark" ? "dark" : "light";
}
watch(theme, (v) => localStorage.setItem("hd_theme", v), { deep: true });

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}

/* =========================
   ✅ KPI FOLD (2 étapes)
   0 = cockpit caché
   1 = ligne 1 visible (DEFAULT)
   2 = lignes 1 + 2 visibles
========================= */
const foldLevel = ref<0 | 1 | 2>(1);

function restoreFoldPref() {
  const raw = Number(localStorage.getItem("hd_fold") ?? "1");
  foldLevel.value = raw === 0 || raw === 2 ? (raw as any) : 1;
}
watch(foldLevel, (v) => {
  localStorage.setItem("hd_fold", String(v));
  if (v === 0) pnlOpen.value = false;
});

const showRow1 = computed(() => foldLevel.value >= 1);
const showRow2 = computed(() => foldLevel.value >= 2);
const showCockpit = computed(() => foldLevel.value >= 1);

function cycleFold() {
  foldLevel.value = foldLevel.value === 2 ? 1 : foldLevel.value === 1 ? 0 : 2;
}

/* =========================
   ✅ TOGGLES
========================= */
const withMajorations = computed<boolean>({
  get: () => Boolean((store as any).headerUseMajorations ?? false),
  set: (v) => {
    const s: any = store as any;
    if (typeof s.setHeaderUseMajorations === "function") s.setHeaderUseMajorations(Boolean(v));
    else s.headerUseMajorations = Boolean(v);
  },
});

const withDevisSurcharge = computed<boolean>({
  get: () => Boolean((store as any).headerUseDevisSurcharge ?? false),
  set: (v) => {
    const s: any = store as any;
    if (typeof s.setHeaderUseDevisSurcharge === "function") s.setHeaderUseDevisSurcharge(Boolean(v));
    else s.headerUseDevisSurcharge = Boolean(v);
  },
});

onMounted(() => {
  restoreThemePref();
  restoreFoldPref();
  if (store.pnls.length === 0) store.loadPnls();
});

const activeContract = computed<any | null>(() => {
  const pnl = activePnl.value;
  const vId = store.activeVariantId;
  if (!pnl || !pnl.contracts?.length) return null;
  if (!vId) return pnl.contracts[0] ?? null;

  return (
    pnl.contracts.find((c: any) => (c.variants ?? []).some((v: any) => v.id === vId)) ??
    pnl.contracts[0] ??
    null
  );
});

const contractsOfActivePnl = computed<any[]>(() => activePnl.value?.contracts ?? []);
const variantsOfActiveContract = computed<any[]>(() => activeContract.value?.variants ?? []);

/* =========================
   SEARCHABLE PNL SELECT
========================= */
const pnlQuery = ref("");
const pnlOpen = ref(false);
const pnlBtnRef = ref<HTMLElement | null>(null);
const ddStyle = ref<Record<string, string>>({});

const filteredPnls = computed(() => {
  const q = pnlQuery.value.trim().toLowerCase();
  if (!q) return pnls.value;
  return pnls.value.filter((p: any) => {
    const blob = `${p.title ?? ""} ${p.client ?? ""} ${p.id ?? ""}`.toLowerCase();
    return blob.includes(q);
  });
});

/* =========================
   STORE SETTERS (safe)
========================= */
function setActivePnlId(id: string) {
  const s: any = store as any;
  if (typeof s.setActivePnl === "function") s.setActivePnl(id);
  else s.activePnlId = id;
}
function setActiveContractId(id: string) {
  const s: any = store as any;
  if (typeof s.setActiveContract === "function") s.setActiveContract(id);
  else s.activeContractId = id;
}
function setActiveVariantId(id: string) {
  const s: any = store as any;
  if (typeof s.setActiveVariant === "function") s.setActiveVariant(id);
  else s.activeVariantId = id;
}

function firstVariantIdOfContract(contract: any): string | null {
  const v = (contract?.variants ?? [])[0];
  return v?.id ? String(v.id) : null;
}

function onPickPnl(pnlId: string) {
  pnlOpen.value = false;
  pnlQuery.value = "";

  const pnl = pnls.value.find((p: any) => String(p.id) === String(pnlId));
  if (!pnl) return;

  setActivePnlId(String(pnl.id));

  const c0 = (pnl.contracts ?? [])[0];
  if (c0?.id) setActiveContractId(String(c0.id));

  const v0 = firstVariantIdOfContract(c0);
  if (v0) setActiveVariantId(v0);
}

function onPickContract(contractId: string) {
  const c = contractsOfActivePnl.value.find((x: any) => String(x.id) === String(contractId));
  if (!c) return;

  setActiveContractId(String(c.id));

  const v0 = firstVariantIdOfContract(c);
  if (v0) setActiveVariantId(v0);
}

function onPickVariant(variantId: string) {
  const v = variantsOfActiveContract.value.find((x: any) => String(x.id) === String(variantId));
  if (!v) return;
  setActiveVariantId(String(v.id));
}

/* =========================
   HEADER FIELDS
========================= */
const projectName = computed(() => activePnl.value?.title ?? "—");
const variantName = computed(() => activeVariant.value?.title ?? "—");
const durationMonths = computed(() => activeContract.value?.dureeMois ?? 0);
const status = computed(() => activeVariant.value?.status ?? "—");
const volumeTotal = computed(() => headerKpis.value?.volumeTotalM3 ?? 0);
const client = computed(() => activePnl.value?.client ?? "—");
const contractName = computed(() => contractUiTitle(activeContract.value));

/* =========================
   KPI METRICS
========================= */
const metrics = computed<Metrics>(() => {
  const k = headerKpis.value;

  const vol = k?.volumeTotalM3 ?? 0;
  const duree = durationMonths.value || 0;
  const ca = k?.caTotal ?? 0;

  const per = (x: number) => (ca > 0 ? (x / ca) * 100 : 0);
  const m3 = (total: number) => (vol > 0 ? total / vol : 0);
  const month = (total: number) => (duree > 0 ? total / duree : 0);

  const aspTotal = k?.caTotal ?? 0;
  const cmpTotal = k?.coutMpTotal ?? 0;
  const momdTotal = k?.momdTotal ?? 0;

  const transportTotal = k?.transportTotal ?? 0;
  const productionTotal = k?.productionTotal ?? 0;

  const amortTotal = k?.amortissementTotal ?? 0;
  const ebitdaTotal = k?.ebitdaTotal ?? 0;
  const ebitTotal = k?.ebitTotal ?? 0;

  return {
    ASP: { total: aspTotal, m3: m3(aspTotal), month: month(aspTotal), percent: 100 },
    CMP: { total: cmpTotal, m3: m3(cmpTotal), month: month(cmpTotal), percent: per(cmpTotal) },
    MOMD: { total: momdTotal, m3: m3(momdTotal), month: month(momdTotal), percent: per(momdTotal) },
    Transport: { total: transportTotal, m3: m3(transportTotal), month: month(transportTotal), percent: per(transportTotal) },
    Production: { total: productionTotal, m3: m3(productionTotal), month: month(productionTotal), percent: per(productionTotal) },
    EBITDA: { total: ebitdaTotal, m3: m3(ebitdaTotal), month: month(ebitdaTotal), percent: per(ebitdaTotal) },
    EBIT: { total: ebitTotal, m3: m3(ebitTotal), month: month(ebitTotal), percent: per(ebitTotal) },
    Amortissement: { total: amortTotal, m3: m3(amortTotal), month: month(amortTotal), percent: per(amortTotal) },
  };
});

/* ✅ Ordres demandés */
const kpiRow1: KpiName[] = ["EBIT", "ASP", "CMP", "MOMD"];
const kpiRow2: KpiName[] = ["EBITDA", "Amortissement", "Production", "Transport"];

/* =========================
   Buttons
========================= */
function viewPnl() {
  actionsRef.value?.openViewPnl();
}
function editPnl() {
  actionsRef.value?.openEditPnl();
}
function viewContract() {
  actionsRef.value?.openViewContract();
}
function editContract() {
  actionsRef.value?.openEditContract();
}
function newVariant() {
  actionsRef.value?.openNewVariant();
}
function editVariant() {
  actionsRef.value?.openEditVariant();
}
function duplicateVariant() {
  actionsRef.value?.openDuplicateVariant?.();
}

/* =========================
   UI HELPERS
========================= */
function fmtMoney(v: number, digits = 0) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  });
}
function fmtPct(v: number) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/* ✅ EBIT bucket logic */
function ebitBucket(pct: number) {
  if (pct < 0) return "neg";
  if (pct < 2) return "low";
  if (pct < 4) return "mid";
  return "good";
}
const ebitClass = computed(() => `ebit-${ebitBucket(metrics.value.EBIT.percent)}`);

function kpiClass(key: KpiName) {
  return {
    ebit: key === "EBIT",
    asp: key === "ASP",
    cmp: key === "CMP",
    transport: key === "Transport",
    momd: key === "MOMD",
    prod: key === "Production",
    ebitda: key === "EBITDA",
    amort: key === "Amortissement",
  };
}

/* =========================
   PNL Dropdown positioning
========================= */
function calcDropdownPosition() {
  const btn = pnlBtnRef.value;
  if (!btn) return;

  const r = btn.getBoundingClientRect();
  const gap = 8;

  const desired = Math.min(760, Math.max(560, r.width));
  const width = Math.min(desired, window.innerWidth - 16);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);

  ddStyle.value = {
    position: "fixed",
    top: `${Math.min(window.innerHeight - 12, r.bottom + gap)}px`,
    left: `${left}px`,
    width: `${width}px`,
    zIndex: "100000",
  };
}

function openPnlDropdown() {
  if (foldLevel.value === 0) foldLevel.value = 1;
  pnlOpen.value = !pnlOpen.value;
}
function closePnlDropdown() {
  pnlOpen.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!pnlOpen.value) return;
  const target = e.target as Node | null;
  const btn = pnlBtnRef.value;
  const dd = document.getElementById("pnl-dd");
  if (!target) return;

  if (btn && btn.contains(target)) return;
  if (dd && dd.contains(target)) return;

  closePnlDropdown();
}
function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") closePnlDropdown();
}

watch(pnlOpen, async (v) => {
  if (!v) return;
  await nextTick();
  calcDropdownPosition();
  const el = document.querySelector<HTMLInputElement>("#pnl-dd input.dd__in");
  el?.focus();
});

onMounted(() => {
  window.addEventListener("resize", calcDropdownPosition, { passive: true });
  window.addEventListener("scroll", calcDropdownPosition, { passive: true, capture: true });
  document.addEventListener("mousedown", onDocClick, true);
  document.addEventListener("keydown", onEsc);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", calcDropdownPosition);
  window.removeEventListener("scroll", calcDropdownPosition, true as any);
  document.removeEventListener("mousedown", onDocClick, true);
  document.removeEventListener("keydown", onEsc);
});
</script>

<template>
  <header class="hd" :class="[theme, `fold-${foldLevel}`]">
    <div class="bar">
      <!-- P&L selector -->
      <div class="pill pnl control">
        <button ref="pnlBtnRef" type="button" class="pill__head" @click="openPnlDropdown">
          <span class="pill__label">P&L</span>
          <span class="pill__badge" title="P&L actif">Actif</span>
          <span class="pill__value" :title="projectName">{{ projectName }}</span>
          <ChevronDownIcon class="pill__chev" :class="{ rot: pnlOpen }" />
        </button>

        <div class="pill__actions">
          <button class="iconbtn" title="Voir" @click.stop="viewPnl"><EyeIcon class="ic" /></button>
          <button class="iconbtn" title="Éditer" @click.stop="editPnl"><PencilSquareIcon class="ic" /></button>
        </div>
      </div>

      <!-- Theme switch -->
      <button
        class="themeBtn"
        type="button"
        :title="theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'"
        @click="toggleTheme"
      >
        <span class="themeBtn__dot" :class="{ on: theme === 'dark' }"></span>
        <span class="themeBtn__txt">{{ theme === "dark" ? "Sombre" : "Clair" }}</span>
      </button>

      <!-- Toggles -->
      <div class="hdToggles" aria-label="Options header">
        <label class="toggSm">
          <input class="toggSm__cb" type="checkbox" v-model="withMajorations" />
          <span class="toggSm__txt">Majoration</span>
        </label>

        <label class="toggSm">
          <input class="toggSm__cb" type="checkbox" v-model="withDevisSurcharge" />
          <span class="toggSm__txt">Surcharge devis</span>
        </label>
      </div>

      <!-- Contrat selector -->
      <div class="pill contract control">
        <div class="pill__head contractHead">
          <span class="pill__label">Contrat</span>
          <span class="pill__value" :title="contractName">{{ contractName }}</span>
          <ChevronDownIcon class="pill__chev" />

          <select
            class="pill__selectOverlay"
            :value="activeContract?.id ? String(activeContract.id) : ''"
            @change="onPickContract(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>—</option>
            <option v-for="c in contractsOfActivePnl" :key="c.id" :value="String(c.id)">
              {{ contractUiTitle(c) }}
            </option>
          </select>
        </div>

        <div class="pill__actions">
          <button class="iconbtn" title="Voir" @click.stop="viewContract"><EyeIcon class="ic" /></button>
          <button
            class="iconbtn"
            :title="editContractTooltip"
            @click.stop="canEditContract ? editContract() : showToast('Contrat verrouillé pour les P&L CAB FIXE.')"
          >
            <PencilSquareIcon class="ic" />
          </button>
        </div>
      </div>

      <!-- Variante selector -->
      <div class="pill variant control">
        <div class="pill__head contractHead">
          <Squares2X2Icon class="pill__miniic" />
          <span class="pill__label">Variante</span>
          <span class="pill__value" :title="variantName">{{ variantName }}</span>
          <ChevronDownIcon class="pill__chev" />

          <select
            class="pill__selectOverlay"
            :value="activeVariant?.id ? String(activeVariant.id) : ''"
            @change="onPickVariant(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>—</option>
            <option v-for="v in variantsOfActiveContract" :key="v.id" :value="String(v.id)">
              {{ v.title ? String(v.title) : `Variante ${String(v.id).slice(0, 6)}` }}
            </option>
          </select>
        </div>

        <div class="pill__actions">
          <button class="iconbtn" title="Dupliquer" @click.stop="duplicateVariant">
            <DocumentDuplicateIcon class="ic" />
          </button>
          <button class="iconbtn" title="Nouvelle variante" @click.stop="newVariant">
            <PlusCircleIcon class="ic" />
          </button>
          <button class="iconbtn" title="Éditer variante" @click.stop="editVariant">
            <PencilSquareIcon class="ic" />
          </button>
        </div>
      </div>

      <!-- Fold button (2-step) -->
      <button class="foldBtn" type="button" @click="cycleFold" title="Pliage: 0/1/2 lignes">
        <span class="foldPips">
          <span class="pip" :class="{ on: foldLevel >= 1 }"></span>
          <span class="pip" :class="{ on: foldLevel >= 2 }"></span>
        </span>
        <ChevronDownIcon class="foldIc" :class="{ up: foldLevel === 0 }" />
      </button>
    </div>

    <!-- KPI + Résumé (2 blocs) -->
    <transition name="hdFold">
      <div v-show="showCockpit" class="cockpit">
        <!-- LEFT: KPI rows -->
        <div class="kpis-left">
          <transition name="rowFold">
            <div v-show="showRow1" class="kpi-row">
              <div
                v-for="key in kpiRow1"
                :key="key"
                class="kpi"
                :class="[kpiClass(key), key === 'EBIT' ? ebitClass : '', key === 'EBIT' ? 'hero' : '']"
              >
                <div class="kpi__top">
                  <span class="kpi__name">{{ key }}</span>
                  <span class="kpi__pct" :class="{ hot: key === 'EBIT' }">{{ fmtPct(metrics[key].percent) }}%</span>
                </div>

                <div class="kpi__valRow">
                  <span class="kpi__num">{{ fmtMoney(metrics[key].total, 0) }}</span>
                  <span class="kpi__unit">DH</span>
                </div>

                <div class="kpi__mini">
                  <span class="mini__left">
                    <span class="kmini m3">{{ fmtMoney(metrics[key].m3, 2) }}</span>
                    <span class="u m3u">DH/m3</span>
                  </span>
                  <span class="dot">•</span>
                  <span class="mini__right">
                    <span class="kmini">{{ fmtMoney(metrics[key].month, 0) }}</span>
                    <span class="u">DH/mo</span>
                  </span>
                </div>
              </div>
            </div>
          </transition>

          <transition name="rowFold">
            <div v-show="showRow2" class="kpi-row">
              <div
                v-for="key in kpiRow2"
                :key="key"
                class="kpi"
                :class="[kpiClass(key), key === 'EBIT' ? ebitClass : '', key === 'EBIT' ? 'hero' : '']"
              >
                <div class="kpi__top">
                  <span class="kpi__name">{{ key }}</span>
                  <span class="kpi__pct" :class="{ hot: key === 'EBIT' }">{{ fmtPct(metrics[key].percent) }}%</span>
                </div>

                <div class="kpi__valRow">
                  <span class="kpi__num">{{ fmtMoney(metrics[key].total, 0) }}</span>
                  <span class="kpi__unit">DH</span>
                </div>

                <div class="kpi__mini">
                  <span class="mini__left">
                    <span class="kmini m3">{{ fmtMoney(metrics[key].m3, 2) }}</span>
                    <span class="u m3u">DH/m3</span>
                  </span>
                  <span class="dot">•</span>
                  <span class="mini__right">
                    <span class="kmini">{{ fmtMoney(metrics[key].month, 0) }}</span>
                    <span class="u">DH/mo</span>
                  </span>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- RIGHT: Résumé split en 2 blocs => même hauteur que KPI -->
        <div class="summaryCol">
          <!-- Bloc Résumé ligne 1 -->
          <transition name="rowFold">
            <div v-show="showRow1" class="sumkpi">
              <span class="schip" :title="client"><BuildingOffice2Icon class="schip__ic" />{{ client }}</span>
              <span class="schip"><CalendarDaysIcon class="schip__ic" />{{ durationMonths }} mois</span>
            </div>
          </transition>

          <!-- Bloc Résumé ligne 2 -->
          <transition name="rowFold">
            <div v-show="showRow2" class="sumkpi">
              <span class="schip"><CubeIcon class="schip__ic" />{{ Number(volumeTotal || 0).toLocaleString("fr-FR") }} m³</span>
              <span class="schip"><CheckBadgeIcon class="schip__ic" />{{ status }}</span>
            </div>
          </transition>
        </div>
      </div>
    </transition>

    <!-- Dropdown P&L -->
    <teleport to="body">
      <div v-if="pnlOpen" id="pnl-dd" class="dd" :style="ddStyle" @click.stop>
        <div class="dd__search">
          <MagnifyingGlassIcon class="dd__ic" />
          <input class="dd__in" v-model="pnlQuery" placeholder="Rechercher un P&L..." />
        </div>

        <div class="dd__list">
          <button
            v-for="p in filteredPnls"
            :key="p.id"
            class="dd__item"
            :class="{ active: String(p.id) === String(activePnl?.id) }"
            @click="onPickPnl(String(p.id))"
          >
            <div class="dd__main">
              <div class="dd__title">{{ p.title ?? `P&L ${String(p.id).slice(0, 6)}` }}</div>
              <div class="dd__sub">{{ p.client ?? "—" }}</div>
            </div>
            <div class="dd__id">{{ String(p.id).slice(0, 6) }}</div>
          </button>

          <div v-if="filteredPnls.length === 0" class="dd__empty">Aucun P&L trouvé.</div>
        </div>
      </div>
    </teleport>

    <transition name="toast">
      <div v-if="toastMsg" class="miniToast">{{ toastMsg }}</div>
    </transition>
  </header>

  <HeaderActionsModals ref="actionsRef" />
</template>

<style scoped>
/* =========================
   HEADER FRAME
========================= */
.hd {
  --navy: #184070;

  --hdBg: #f2f5fa;
  --hdBorder: rgba(16, 24, 40, 0.12);
  --hdShadow: 0 10px 22px rgba(15, 23, 42, 0.08);

  --pillBg: #ffffff;
  --pillBorder: rgba(16, 24, 40, 0.14);
  --pillHover: #f3f6fb;
  --pillTxt: rgba(15, 23, 42, 0.86);
  --pillMut: rgba(15, 23, 42, 0.62);

  position: sticky;
  top: 0;
  z-index: 9999;
  isolation: isolate;

  background: var(--hdBg);
  border-bottom: 1px solid var(--hdBorder);
  box-shadow: var(--hdShadow);

  padding: 6px 10px 10px;
  display: grid;
  gap: 6px;
  overflow-x: hidden;
}

/* ✅ DARK THEME: moins sombre */
.hd.dark {
  --hdBg: radial-gradient(140% 160% at 10% 0%, #2a3f67, #22365b 55%, #1c2f50);
  --hdBorder: rgba(255, 255, 255, 0.14);
  --hdShadow: 0 14px 34px rgba(0, 0, 0, 0.22);

  --pillBg: rgba(255, 255, 255, 0.08);
  --pillBorder: rgba(255, 255, 255, 0.16);
  --pillHover: rgba(255, 255, 255, 0.10);
  --pillTxt: rgba(255, 255, 255, 0.92);
  --pillMut: rgba(255, 255, 255, 0.72);
}

/* ===== Top bar ===== */
.bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.pill.pnl { flex: 1 1 520px; max-width: 760px; min-width: 520px; }
.pill.contract { flex: 1 1 360px; }
.pill.variant { flex: 1 1 320px; }

@media (max-width: 900px) {
  .pill.pnl, .pill.contract, .pill.variant { flex: 1 1 100%; max-width: none; min-width: 0; }
  .hdToggles { width: 100%; justify-content: flex-end; }
  .themeBtn { margin-left: auto; }
}

/* Pills */
.pill {
  position: relative;
  min-width: 0;
  overflow: hidden;

  background: var(--pillBg);
  border: 1px solid var(--pillBorder);
  border-radius: 14px;

  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}
.hd.dark .pill { backdrop-filter: blur(8px); }

.pill.control:hover { background: var(--pillHover); border-color: rgba(59, 130, 246, 0.26); }

.pill__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
}
.pill__head:not(.static) { cursor: pointer; }

.pill__label { font-size: 10px; font-weight: 950; letter-spacing: 0.2px; color: var(--pillMut); white-space: nowrap; }
.pill__badge {
  font-size: 10px;
  font-weight: 950;
  color: var(--pillTxt);
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.30);
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1;
  white-space: nowrap;
}
.pill__value {
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: 0.15px;
  color: var(--pillTxt);
  line-height: 1.1;
  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pill__miniic { width: 16px; height: 16px; color: rgba(15,23,42,0.7); }
.hd.dark .pill__miniic { color: rgba(255,255,255,0.78); }

.pill__chev {
  width: 16px;
  height: 16px;
  color: color-mix(in srgb, var(--pillTxt) 70%, transparent);
  flex: 0 0 auto;
  transition: transform 140ms ease;
}
.pill__chev.rot { transform: rotate(180deg); }

.pill__actions {
  display: inline-flex;
  gap: 6px;
  flex: 0 0 auto;
  margin-left: auto;
  justify-content: flex-end;
  position: relative;
  z-index: 2;
}

.iconbtn {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--pillBorder) 60%, rgba(255,255,255,0.10));
  background: rgba(15, 23, 42, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.hd.dark .iconbtn { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.14); }
.iconbtn:hover { background: rgba(59, 130, 246, 0.16); border-color: rgba(59, 130, 246, 0.26); }
.ic { width: 13px; height: 13px; color: var(--pillTxt); }

/* Theme button */
.themeBtn {
  height: 34px;
  border-radius: 14px;
  border: 1px solid var(--pillBorder);
  background: var(--pillBg);
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  white-space: nowrap;
  min-width: 120px;
}
.hd.dark .themeBtn { backdrop-filter: blur(8px); }
.themeBtn:hover { background: var(--pillHover); border-color: rgba(59, 130, 246, 0.26); }
.themeBtn__dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.65);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.30);
}
.themeBtn__dot.on {
  background: rgba(59, 130, 246, 0.85);
  box-shadow: 0 0 0 4px rgba(59,130,246,0.18);
}
.themeBtn__txt { font-size: 11px; font-weight: 950; letter-spacing: 0.2px; color: var(--pillTxt); }

/* Toggles */
.hdToggles {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  background: var(--pillBg);
  border: 1px solid var(--pillBorder);
  border-radius: 14px;
  padding: 4px 10px;
  min-height: 34px;

  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.hd.dark .hdToggles { backdrop-filter: blur(8px); }
.toggSm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--pillBorder) 70%, rgba(255,255,255,0.10));
  background: rgba(15, 23, 42, 0.02);
  line-height: 1;
  user-select: none;
}
.hd.dark .toggSm { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14); }
.toggSm__cb { width: 13px; height: 13px; margin: 0; }
.toggSm__txt { font-size: 10px; font-weight: 950; color: var(--pillTxt); opacity: 0.88; }

/* Select overlay */
.contractHead { position: relative; min-height: 22px; }
.pill__selectOverlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: none;
  appearance: none;
  background: transparent;
}

/* Fold button */
.foldBtn {
  height: 34px;
  border-radius: 14px;
  border: 1px solid var(--pillBorder);
  background: var(--pillBg);
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex: 0 0 auto;
}
.hd.dark .foldBtn { backdrop-filter: blur(8px); }
.foldBtn:hover { background: var(--pillHover); border-color: rgba(59, 130, 246, 0.22); }

.foldPips { display: inline-flex; gap: 6px; align-items: center; }
.pip {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.55);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.30);
}
.pip.on { background: rgba(59, 130, 246, 0.90); box-shadow: 0 0 0 4px rgba(59,130,246,0.14); }
.foldIc { width: 16px; height: 16px; transition: transform 160ms ease; color: var(--pillTxt); opacity: 0.9; }
.foldIc.up { transform: rotate(180deg); }

/* =========================
   Cockpit layout
========================= */
.cockpit {
  display: grid;
  grid-template-columns: 1fr 185px;
  gap: 8px;
  align-items: start;
  min-width: 0;
}
@media (max-width: 1100px) {
  .cockpit { grid-template-columns: 1fr; }
  .summaryCol { grid-template-columns: 1fr; }
}

.hdFold-enter-active, .hdFold-leave-active { transition: max-height 200ms ease, opacity 160ms ease, transform 160ms ease; overflow: hidden; }
.hdFold-enter-from, .hdFold-leave-to { max-height: 0; opacity: 0; transform: translateY(-4px); }
.hdFold-enter-to, .hdFold-leave-from { max-height: 900px; opacity: 1; transform: translateY(0); }

.rowFold-enter-active, .rowFold-leave-active { transition: max-height 180ms ease, opacity 140ms ease, transform 140ms ease; overflow: hidden; }
.rowFold-enter-from, .rowFold-leave-to { max-height: 0; opacity: 0; transform: translateY(-3px); }
.rowFold-enter-to, .rowFold-leave-from { max-height: 140px; opacity: 1; transform: translateY(0); }

.kpis-left { display: grid; gap: 6px; min-width: 0; }
.kpi-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
@media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

/* KPI ultra-compact (référence de hauteur) */
.kpi {
  position: relative;
  --accent: rgba(148, 163, 184, 0.9);

  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-left: 4px solid var(--accent);
  border-radius: 14px;

  padding: 5px 6px 5px 6px;
  min-height: 62px;

  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto auto;
  align-content: start;
}

.kpi.asp { --accent: rgba(2, 132, 199, 0.9); }
.kpi.cmp { --accent: rgba(67, 56, 202, 0.88); }
.kpi.transport { --accent: rgba(234, 88, 12, 0.86); }
.kpi.momd { --accent: rgba(147, 51, 234, 0.86); }
.kpi.prod { --accent: rgba(13, 148, 136, 0.86); }
.kpi.ebitda { --accent: rgba(5, 150, 105, 0.86); }
.kpi.amort { --accent: rgba(71, 85, 105, 0.78); }

.kpi.ebit.ebit-neg { --accent: rgba(220, 38, 38, 0.88); --ebitTint: 220, 38, 38; }
.kpi.ebit.ebit-low { --accent: rgba(245, 158, 11, 0.88); --ebitTint: 245, 158, 11; }
.kpi.ebit.ebit-mid { --accent: rgba(37, 99, 235, 0.88); --ebitTint: 37, 99, 235; }
.kpi.ebit.ebit-good { --accent: rgba(16, 185, 129, 0.9); --ebitTint: 16, 185, 129; }

/* EBIT hero */
.kpi.ebit.hero { border-left-width: 6px; box-shadow: 0 0 0 1px rgba(var(--ebitTint, 37,99,235), 0.16) inset; }
.kpi.ebit.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(95% 65% at 50% 0%, rgba(var(--ebitTint, 37,99,235), 0.18), rgba(255,255,255,0) 62%);
  opacity: 0.95;
}

.kpi__top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; position: relative; z-index: 1; }
.kpi__name { font-size: 9px; font-weight: 950; text-transform: uppercase; letter-spacing: 0.35px; color: rgba(15, 23, 42, 0.74); line-height: 1.1; }
.kpi__pct {
  font-size: 9px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.62);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(15, 23, 42, 0.02);
  line-height: 1.05;
}
.kpi__pct.hot { font-size: 16px; padding: 3px 10px; font-weight: 1000; letter-spacing: 0.15px; }

.kpi.ebit.ebit-neg .kpi__pct.hot { color: rgba(185, 28, 28, 0.98); border-color: rgba(220, 38, 38, 0.30); background: rgba(220, 38, 38, 0.10); }
.kpi.ebit.ebit-low .kpi__pct.hot { color: rgba(180, 83, 9, 0.98); border-color: rgba(245, 158, 11, 0.30); background: rgba(245, 158, 11, 0.10); }
.kpi.ebit.ebit-mid .kpi__pct.hot { color: rgba(29, 78, 216, 0.98); border-color: rgba(37, 99, 235, 0.28); background: rgba(37, 99, 235, 0.10); }
.kpi.ebit.ebit-good .kpi__pct.hot { color: rgba(5, 150, 105, 0.98); border-color: rgba(16, 185, 129, 0.28); background: rgba(16, 185, 129, 0.10); }

.kpi__valRow { display: flex; justify-content: center; align-items: baseline; gap: 6px; margin-top: 2px; position: relative; z-index: 1; }
.kpi__num { font-size: 14px; font-weight: 1000; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.05; }
.kpi__unit { font-size: 9px; font-weight: 900; color: rgba(15, 23, 42, 0.50); line-height: 1.05; }

.kpi__mini {
  margin-top: 3px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.72);
  font-variant-numeric: tabular-nums;
  position: relative;
  z-index: 1;
  line-height: 1.05;
}
.mini__left, .mini__right { display: inline-flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.mini__right { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dot { color: rgba(15, 23, 42, 0.26); }
.kmini { font-size: 9px; font-weight: 950; color: rgba(15, 23, 42, 0.86); }
.kmini.m3 { color: rgba(24, 64, 112, 0.92); font-weight: 1000; }
.u { font-size: 8px; font-weight: 900; color: rgba(15, 23, 42, 0.46); }
.u.m3u { color: rgba(24, 64, 112, 0.62); font-weight: 950; }

/* =========================
   ✅ Résumé split en 2 blocs = hauteur KPI
========================= */
.summaryCol {
  display: grid;
  gap: 6px;
  align-content: start;
  min-width: 0;
}

/* ✅ même hauteur que KPI (jamais plus haut) */
.sumkpi {
  height: 62px;
  max-height: 62px;
  overflow: hidden;

  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(255, 255, 255, 0.92);

  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
  align-content: flex-start;
}
.hd.dark .sumkpi { background: rgba(255,255,255,0.92); } /* ✅ KPI & résumé restent clairs */

.schip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.88);
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.schip__ic { width: 14px; height: 14px; color: rgba(24, 64, 112, 0.72); flex: 0 0 auto; }

/* Dropdown */
.dd { background: #fff; border: 1px solid rgba(16, 24, 40, 0.12); border-radius: 16px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18); padding: 10px; }
.dd__search { display: flex; align-items: center; gap: 8px; background: rgba(15, 23, 42, 0.03); border: 1px solid rgba(16, 24, 40, 0.10); border-radius: 12px; padding: 8px 10px; margin-bottom: 8px; }
.dd__ic { width: 16px; height: 16px; color: rgba(15, 23, 42, 0.55); }
.dd__in { width: 100%; border: none; outline: none; background: transparent; font-size: 12px; font-weight: 900; color: rgba(15, 23, 42, 0.88); }
.dd__list { max-height: 300px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.dd__item { border: 1px solid rgba(16, 24, 40, 0.10); background: #fff; border-radius: 12px; padding: 10px; display: flex; justify-content: space-between; gap: 10px; cursor: pointer; text-align: left; }
.dd__item:hover { background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.18); }
.dd__item.active { background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.18); }
.dd__title { font-size: 12px; font-weight: 950; color: #0f172a; }
.dd__sub { font-size: 11px; color: rgba(15, 23, 42, 0.65); margin-top: 2px; }
.dd__id { font-size: 11px; color: rgba(15, 23, 42, 0.55); }
.dd__empty { font-size: 12px; color: rgba(15, 23, 42, 0.55); padding: 10px; text-align: center; }

/* Toast */
.miniToast { position: fixed; top: 84px; right: 22px; background: #184070; color: #fff; font-size: 12px; font-weight: 900; padding: 10px 16px; border-radius: 12px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18); z-index: 200000; letter-spacing: 0.2px; }
.toast-enter-active, .toast-leave-active { transition: all 180ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-6px); }
.toast-enter-to, .toast-leave-from { opacity: 1; transform: translateY(0); }
</style>
