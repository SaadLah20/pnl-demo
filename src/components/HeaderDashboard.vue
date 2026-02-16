<!-- ✅ HeaderDashboard.vue (FICHIER COMPLET / clair + pro + P&L dominant + EBIT hero conservé) -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import HeaderActionsModals from "@/components/HeaderActionsModals.vue";
import { contractUiTitle } from "@/services/contractTitle";
import { useRoute, useRouter } from "vue-router";

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
const router = useRouter();
const route = useRoute();

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
  toastTimer = setTimeout(() => {
    toastMsg.value = null;
  }, 2600);
}


// =========================
// ✅ Store refs (déclarés tôt pour éviter TDZ)
// =========================
const pnls = computed<any[]>(() => store.pnls ?? []);
const activePnl = computed<any | null>(() => store.activePnl ?? null);
const activeVariant = computed<any | null>(() => store.activeVariant ?? null);
const headerKpis = computed<any>(() => store.activeHeaderKPIs);

// =========================
// ✅ CAB Fixe rules (sans TDZ)
// =========================
const activePnlModel = computed(() => String((store as any)?.activePnl?.model ?? "").trim());
const isCabFixe = computed(() => isCabFixePnl({ model: activePnlModel.value }));

// ✅ Ta règle corrigée: verrouillage CAB & CoutsOcc seulement pour "CAB fixe - existante"
const isCabFixeExist = computed(() => norm(activePnlModel.value).includes("cab fixe - existante"));

// ✅ contrat non éditable pour CAB fixe (tous)
const canEditContract = computed(() => !isCabFixe.value);
const editContractTooltip = computed(() =>
  canEditContract.value ? "Éditer" : "Contrat verrouillé pour les P&L CAB FIXE."
);

const hasActiveVariant = computed(() => !!String((store as any)?.activeVariantId ?? "").trim());

// ✅ Devis non dispo pour CAB fixe (si tu veux l’inverse, dis-moi, je te le bascule)
const devisAllowed = computed(() => hasActiveVariant.value && !isCabFixe.value);
const cabSectionAllowed = computed(() => hasActiveVariant.value && !isCabFixeExist.value);
const coutsOccAllowed = computed(() => hasActiveVariant.value && !isCabFixeExist.value);

// ✅ guard runtime: si on change P&L via selectors et route devient interdite => redirect
watch(
  [activePnlModel, () => (store as any)?.activePnl?.id, () => (store as any)?.activeVariantId, () => route.name],
  () => {
    const rn = String(route.name ?? "");

    if ((rn === "Devis" || rn === "Majorations") && !devisAllowed.value) {
      router.replace({ name: "Details" });
      return;
    }
    if (rn === "CAB" && !cabSectionAllowed.value) {
      router.replace({ name: "Details" });
      return;
    }
    if (rn === "CoutsOccasionnels" && !coutsOccAllowed.value) {
      router.replace({ name: "Details" });
      return;
    }
  },
  { immediate: true }
);

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

/* =========================
   HEADER COLLAPSE (user controlled)
========================= */
const collapsed = ref(false);

function restoreCollapsedPref() {
  collapsed.value = localStorage.getItem("hd_collapsed") === "1";
}

watch(collapsed, (v) => {
  localStorage.setItem("hd_collapsed", v ? "1" : "0");
  if (v) pnlOpen.value = false;
});

onMounted(() => {
  restoreCollapsedPref();
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

/* ✅ Ordre demandé */
const kpiLeftRow1: KpiName[] = ["ASP", "CMP", "Transport", "MOMD"];
const kpiLeftRow2: KpiName[] = ["Production", "EBITDA", "Amortissement", "EBIT"];

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

/* ✅ EBIT bucket logic (used for CSS coloring) */
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
   PNL Dropdown Teleport positioning
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
  if (collapsed.value) collapsed.value = false;
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
  <header class="hd" :class="{ collapsed }">
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
  title="Éditer"
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

      <!-- Fold button -->
      <button class="foldBtn" type="button" @click="collapsed = !collapsed" :aria-expanded="!collapsed">
        <ChevronDownIcon class="foldIc" :class="{ up: collapsed }" />
      </button>
    </div>

    <!-- KPI + Summary -->
    <transition name="hdFold">
      <div v-show="!collapsed" class="cockpit">
        <div class="kpis-left">
          <div class="kpi-row">
            <div
              v-for="key in kpiLeftRow1"
              :key="key"
              class="kpi"
              :class="[kpiClass(key), key === 'EBIT' ? ebitClass : '', key === 'EBIT' ? 'hero' : '']"
            >
              <div class="kpi__top">
                <span class="kpi__name">{{ key }}</span>
                <span class="kpi__pct" :class="{ hot: key === 'EBIT' }">{{ fmtPct(metrics[key].percent) }}%</span>
              </div>

              <div class="kpi__valRow">
                <span class="kpi__num" :class="{ big: key === 'EBIT' }">{{ fmtMoney(metrics[key].total, 0) }}</span>
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

          <div class="kpi-row">
            <div
              v-for="key in kpiLeftRow2"
              :key="key"
              class="kpi"
              :class="[kpiClass(key), key === 'EBIT' ? ebitClass : '', key === 'EBIT' ? 'hero' : '']"
            >
              <div class="kpi__top">
                <span class="kpi__name">{{ key }}</span>
                <span class="kpi__pct" :class="{ hot: key === 'EBIT' }">{{ fmtPct(metrics[key].percent) }}%</span>
              </div>

              <div class="kpi__valRow">
                <span class="kpi__num" :class="{ big: key === 'EBIT' }">{{ fmtMoney(metrics[key].total, 0) }}</span>
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
        </div>

        <aside class="summary">
          <div class="summary__head">
            <div class="summary__title">Résumé</div>
          </div>

          <div class="summary__grid">
            <div class="sum">
              <BuildingOffice2Icon class="sum__ic" />
              <div class="sum__txt">
                <div class="sum__k">Client</div>
                <div class="sum__v" :title="client">{{ client }}</div>
              </div>
            </div>

            <div class="sum">
              <CalendarDaysIcon class="sum__ic" />
              <div class="sum__txt">
                <div class="sum__k">Durée</div>
                <div class="sum__v">{{ durationMonths }} mois</div>
              </div>
            </div>

            <div class="sum">
              <CubeIcon class="sum__ic" />
              <div class="sum__txt">
                <div class="sum__k">Volume</div>
                <div class="sum__v">{{ Number(volumeTotal || 0).toLocaleString("fr-FR") }} m³</div>
              </div>
            </div>

            <div class="sum">
              <CheckBadgeIcon class="sum__ic" />
              <div class="sum__txt">
                <div class="sum__k">Statut</div>
                <div class="sum__v">{{ status }}</div>
              </div>
            </div>
          </div>
        </aside>
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
  <div v-if="toastMsg" class="miniToast">
    {{ toastMsg }}
  </div>
</transition>

  </header>

  <HeaderActionsModals ref="actionsRef" />
</template>

<style scoped>
/* ===== Header frame ===== */
.hd {
  --navy: #184070;
  --cyan: #20b8e8;

  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.65);
  --border: rgba(16, 24, 40, 0.12);

  position: sticky;
  top: 0;
  z-index: 9999;
  isolation: isolate;

  /* ✅ clair + séparation forte avec contenu (objectif) */
  background: #f2f5fa;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08); /* ✅ séparation visuelle */
  padding: 6px 10px;
  display: grid;
  gap: 6px;

  overflow-x: hidden;
}
.hd.collapsed {
  gap: 0;
  padding-bottom: 6px;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.07);
}

/* ===== Top bar ===== */
.bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: stretch;
  width: 100%;
  min-width: 0;
}

/* ✅ P&L width +50% minimum + dominance */
.pill.pnl {
  flex: 1 1 520px;   /* >= +50% vs 340 */
  max-width: 760px;  /* on autorise titres longs */
  min-width: 520px;  /* garde l'UX stable */
}
.pill.contract {
  flex: 1 1 360px;
}
.pill.variant {
  flex: 1 1 320px;
}

/* Responsive */
@media (max-width: 900px) {
  .pill.pnl,
  .pill.contract,
  .pill.variant {
    flex: 1 1 100%;
    max-width: none;
    min-width: 0;
  }
  .hdToggles {
    width: 100%;
    justify-content: flex-end;
  }
}

.pill {
  position: relative;
  min-width: 0;
  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 14px;

  padding: 4px 10px; /* ✅ compact mais “premium” */
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Controls => more visible */
.pill.control {
  border-color: rgba(15, 23, 42, 0.18);
}

/* Light distinct backgrounds */
.pill.pnl.control {
  background: #fff7e6;
}
.pill.contract.control {
  background: #ffffff;
}
.pill.variant.control {
  background: #eef6ff;
}

/* hover */
.pill.pnl.control:hover {
  background: #fff1d6;
  border-color: rgba(32, 184, 232, 0.28);
}
.pill.contract.control:hover {
  background: #f3f6fb;
  border-color: rgba(32, 184, 232, 0.28);
}
.pill.variant.control:hover {
  background: #e5f0ff;
  border-color: rgba(32, 184, 232, 0.28);
}

.pill__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  background: transparent;
  border: none;
  padding: 0;
}
.pill__head:not(.static) {
  cursor: pointer;
}

/* ✅ petite badge discrète */
.pill__badge {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.78);
  background: rgba(32, 184, 232, 0.12);
  border: 1px solid rgba(32, 184, 232, 0.22);
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1;
  white-space: nowrap;
}

.pill__miniic {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.7);
  flex: 0 0 auto;
}

.pill__label {
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.2px;
  color: rgba(15, 23, 42, 0.62);
  white-space: nowrap;
}

.pill__value {
  font-size: 14px; /* ✅ un poil plus grand */
  font-weight: 1000;
  letter-spacing: 0.15px;
  color: var(--navy);
  line-height: 1.1;

  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill__chev {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.62);
  flex: 0 0 auto;
  transition: transform 140ms ease;
}
.pill__chev.rot {
  transform: rotate(180deg);
}

.pill__actions {
  display: inline-flex;
  gap: 6px;
  flex: 0 0 auto;
  margin-left: auto;
  justify-content: flex-end;
}

.iconbtn {
  width: 24px;
  height: 24px;
  border-radius: 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.iconbtn:hover {
  background: rgba(32, 184, 232, 0.1);
  border-color: rgba(32, 184, 232, 0.22);
}
.ic {
  width: 13px;
  height: 13px;
  color: rgba(15, 23, 42, 0.75);
}

/* Toggles */
.hdToggles {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;

  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 14px;
  padding: 4px 10px;

  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.toggSm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  line-height: 1;
  user-select: none;
  min-width: 0;
  max-width: 190px;
}
.toggSm__cb {
  width: 13px;
  height: 13px;
  margin: 0;
}
.toggSm__txt {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.75);
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Select overlay */
.contractHead {
  position: relative;
  min-height: 22px;
}
.pill__selectOverlay {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  opacity: 0;
  cursor: pointer;
  border: none;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background: transparent;
}

/* fold button */
.foldBtn {
  width: 30px;
  height: 30px;
  border-radius: 13px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.92);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.foldBtn:hover {
  background: rgba(32, 184, 232, 0.1);
  border-color: rgba(32, 184, 232, 0.22);
}
.foldIc {
  width: 16px;
  height: 16px;
  transition: transform 160ms ease;
  color: rgba(15, 23, 42, 0.75);
}
.foldIc.up {
  transform: rotate(180deg);
}

/* Dropdown */
.dd {
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
  padding: 10px;
}
.dd__search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.dd__ic {
  width: 16px;
  height: 16px;
  color: rgba(15, 23, 42, 0.55);
}
.dd__in {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.88);
}
.dd__list {
  max-height: 300px; /* ✅ un peu plus grand */
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dd__item {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}
.dd__item:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.18);
}
.dd__item.active {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.18);
}
.dd__title {
  font-size: 12px;
  font-weight: 950;
  color: var(--text);
}
.dd__sub {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
.dd__id {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.55);
}
.dd__empty {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  padding: 10px;
  text-align: center;
}

/* ===== Cockpit / KPI / Summary (inchangé) ===== */
.cockpit {
  display: grid;
  grid-template-columns: 1fr 185px;
  gap: 8px;
  align-items: stretch;
  min-width: 0;
}
@media (max-width: 1100px) {
  .cockpit {
    grid-template-columns: 1fr;
  }
}
.hdFold-enter-active,
.hdFold-leave-active {
  transition: max-height 200ms ease, opacity 160ms ease, transform 160ms ease;
  overflow: hidden;
}
.hdFold-enter-from,
.hdFold-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}
.hdFold-enter-to,
.hdFold-leave-from {
  max-height: 900px;
  opacity: 1;
  transform: translateY(0);
}
.kpis-left {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
@media (max-width: 900px) {
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* KPI */
.kpi {
  position: relative;
  --accent: rgba(148, 163, 184, 0.9);
  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-left: 4px solid var(--accent);
  border-radius: 14px;
  padding: 7px 8px 7px 7px;
  overflow: hidden;
}
.kpi.asp { --accent: rgba(2, 132, 199, 0.9); }
.kpi.cmp { --accent: rgba(67, 56, 202, 0.88); }
.kpi.transport { --accent: rgba(234, 88, 12, 0.86); }
.kpi.momd { --accent: rgba(147, 51, 234, 0.86); }
.kpi.prod { --accent: rgba(13, 148, 136, 0.86); }
.kpi.ebitda { --accent: rgba(5, 150, 105, 0.86); }
.kpi.amort { --accent: rgba(71, 85, 105, 0.78); }

.kpi.ebit.ebit-neg { --accent: rgba(220, 38, 38, 0.88); }
.kpi.ebit.ebit-low { --accent: rgba(245, 158, 11, 0.88); }
.kpi.ebit.ebit-mid { --accent: rgba(37, 99, 235, 0.88); }
.kpi.ebit.ebit-good { --accent: rgba(16, 185, 129, 0.9); }

.kpi__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.kpi__name {
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  color: rgba(15, 23, 42, 0.72);
}
.kpi__pct {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
}
.kpi__pct.hot {
  font-size: 14px;
  padding: 4px 12px;
  letter-spacing: 0.2px;
}
.kpi__valRow {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
}
.kpi__num {
  font-size: 16px;
  font-weight: 950;
  color: #184070;
  font-variant-numeric: tabular-nums;
}
.kpi__num.big {
  font-size: 19px;
  letter-spacing: 0.2px;
}
.kpi__unit {
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.5);
}
.kpi__mini {
  margin-top: 5px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.7);
  font-variant-numeric: tabular-nums;
}
.mini__left,
.mini__right {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}
.mini__right {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dot { color: rgba(15, 23, 42, 0.26); }
.kmini { font-size: 10px; font-weight: 950; color: rgba(15, 23, 42, 0.82); }
.kmini.m3 { color: rgba(24, 64, 112, 0.95); font-weight: 950; }
.u { font-size: 9px; font-weight: 900; color: rgba(15, 23, 42, 0.45); }
.u.m3u { color: rgba(24, 64, 112, 0.6); font-weight: 950; }

/* ✅ EBIT HERO conservé + attractif */
.kpi.ebit.hero {
  border-left-width: 6px;
  outline: 2px solid rgba(15, 23, 42, 0.08);
  outline-offset: 0px;
}
.kpi.ebit.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
}
.kpi.ebit.hero .kpi__name {
  font-size: 11px;
  letter-spacing: 0.55px;
  color: rgba(15, 23, 42, 0.82);
}
.kpi.ebit.hero .kpi__num {
  font-size: 21px;
  line-height: 1.05;
  letter-spacing: 0.2px;
}
.kpi.ebit.hero .kpi__unit {
  font-size: 10px;
  font-weight: 950;
}
.kpi.ebit.hero .kpi__pct.hot {
  font-size: 15px;
  padding: 4px 12px;
  font-weight: 950;
  border-width: 1px;
}
.kpi.ebit.hero .kpi__mini .kmini.m3 {
  font-size: 11px;
  font-weight: 950;
}
.kpi.ebit.ebit-neg .kpi__pct.hot {
  color: rgba(185, 28, 28, 0.98);
  border-color: rgba(220, 38, 38, 0.3);
  background: rgba(220, 38, 38, 0.08);
}
.kpi.ebit.ebit-low .kpi__pct.hot {
  color: rgba(180, 83, 9, 0.98);
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.08);
}
.kpi.ebit.ebit-mid .kpi__pct.hot {
  color: rgba(29, 78, 216, 0.98);
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(37, 99, 235, 0.07);
}
.kpi.ebit.ebit-good .kpi__pct.hot {
  color: rgba(5, 150, 105, 0.98);
  border-color: rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.07);
}

/* Summary */
.summary {
  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  padding: 9px 9px 7px;
  overflow: hidden;
}
.summary__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.summary__title {
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  color: rgba(15, 23, 42, 0.68);
  margin-bottom: 0;
}
.summary__grid {
  display: grid;
  gap: 7px;
}
.sum {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 8px;
  align-items: center;
}
.sum__ic {
  width: 18px;
  height: 18px;
  color: rgba(24, 64, 112, 0.7);
}
.sum__k {
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}
.sum__v {
  font-size: 12px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Mini Toast ===== */
.miniToast {
  position: fixed;
  top: 84px;
  right: 22px;
  background: #184070;
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  padding: 10px 16px;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
  z-index: 200000;
  letter-spacing: 0.2px;
}

/* animation */
.toast-enter-active,
.toast-leave-active {
  transition: all 180ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.toast-enter-to,
.toast-leave-from {
  opacity: 1;
  transform: translateY(0);
}

</style>
