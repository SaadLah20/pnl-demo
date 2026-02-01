<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

// Heroicons (optionnels si tu veux des icônes dans les selects)
import { MagnifyingGlassIcon, EyeIcon, PencilSquareIcon } from "@heroicons/vue/24/outline";

type KpiName =
  | "ASP"
  | "CMP"
  | "MOMD"
  | "Transport"
  | "Production"
  | "EBITDA"
  | "EBIT"
  | "Amortissement";

type KpiValues = {
  total: number;
  m3: number;
  month: number;
  percent: number;
};

type Metrics = Record<KpiName, KpiValues>;

const store = usePnlStore();

onMounted(() => {
  if (store.pnls.length === 0) store.loadPnls();
});

/* =========================
   ACTIVE ENTITIES
========================= */
const pnls = computed<any[]>(() => store.pnls ?? []);
const activePnl = computed<any | null>(() => store.activePnl ?? null);
const activeVariant = computed<any | null>(() => store.activeVariant ?? null);
const headerKpis = computed<any>(() => store.activeHeaderKPIs);

/** Contrat actif basé sur activeVariantId (même logique que toi) */
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

/* =========================
   SEARCHABLE PNL SELECT
========================= */
const pnlQuery = ref("");
const pnlOpen = ref(false);

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

/** util: retourne la 1ère variante d’un contrat */
function firstVariantIdOfContract(contract: any): string | null {
  const v = (contract?.variants ?? [])[0];
  return v?.id ? String(v.id) : null;
}

/** quand P&L change: activePnl + contrat1 + variante1 */
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

/** quand Contrat change: contrat + variante1 */
function onPickContract(contractId: string) {
  const c = contractsOfActivePnl.value.find((x: any) => String(x.id) === String(contractId));
  if (!c) return;

  setActiveContractId(String(c.id));

  const v0 = firstVariantIdOfContract(c);
  if (v0) setActiveVariantId(v0);
}

/* =========================
   HEADER FIELDS
========================= */
const projectName = computed(() => activePnl.value?.title ?? "—");
const contractName = computed(() => (activeContract.value ? `Contrat ${String(activeContract.value.id).slice(0, 6)}` : "—"));
const variantName = computed(() => activeVariant.value?.title ?? "—");

const durationMonths = computed(() => activeContract.value?.dureeMois ?? 0);
const status = computed(() => activeVariant.value?.status ?? "—");
const volumeTotal = computed(() => headerKpis.value?.volumeTotalM3 ?? 0);
const client = computed(() => activePnl.value?.client ?? "—");

/* =========================
   KPI METRICS (inchangé)
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

const kpiOrder: KpiName[] = [
  "ASP",
  "CMP",
  "MOMD",
  "Transport",
  "Production",
  "EBITDA",
  "EBIT",
  "Amortissement",
];

/* =========================
   Buttons (placeholders)
========================= */
function viewPnl() {
  // TODO route -> page détails pnl si tu en as
}
function editPnl() {
  // TODO open modal edit pnl
}
function viewContract() {
  // TODO route -> page détails contrat si tu en as
}
function editContract() {
  // TODO open modal edit contrat
}
</script>

<template>
  <header class="header-dashboard">
    <!-- Ligne principale -->
    <div class="top-row">
      <div class="left-info">
        <!-- ✅ P&L selector + search -->
        <div class="select-pill pnl">
          <div class="pill-head" @click="pnlOpen = !pnlOpen">
            <span class="pill-label">P&L :</span>
            <span class="pill-value">{{ projectName }}</span>

            <div class="mini-actions">
              <button class="mini-btn" title="Voir" @click.stop="viewPnl">
                <EyeIcon class="mini-ic" />
              </button>
              <button class="mini-btn" title="Éditer" @click.stop="editPnl">
                <PencilSquareIcon class="mini-ic" />
              </button>
            </div>
          </div>

          <div v-if="pnlOpen" class="dropdown">
            <div class="searchbar">
              <MagnifyingGlassIcon class="s-ic" />
              <input
                class="s-in"
                v-model="pnlQuery"
                placeholder="Rechercher un P&L (titre, client, id...)"
              />
            </div>

            <div class="dd-list">
              <button
                v-for="p in filteredPnls"
                :key="p.id"
                class="dd-item"
                :class="{ active: String(p.id) === String(activePnl?.id) }"
                @click="onPickPnl(String(p.id))"
              >
                <div class="dd-main">
                  <b class="dd-title">{{ p.title ?? `P&L ${String(p.id).slice(0, 6)}` }}</b>
                  <div class="dd-sub">{{ p.client ?? "—" }}</div>
                </div>
                <div class="dd-id">{{ String(p.id).slice(0, 6) }}</div>
              </button>

              <div v-if="filteredPnls.length === 0" class="dd-empty">Aucun P&L trouvé.</div>
            </div>
          </div>
        </div>

        <!-- ✅ Contrat selector -->
        <div class="select-pill contract">
          <div class="pill-head">
            <span class="pill-label">Contrat :</span>

            <select
              class="pill-select"
              :value="activeContract?.id ? String(activeContract.id) : ''"
              @change="onPickContract(($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>—</option>
              <option
                v-for="c in contractsOfActivePnl"
                :key="c.id"
                :value="String(c.id)"
              >
                {{ c.title ? String(c.title) : `Contrat ${String(c.id).slice(0, 6)}` }}
              </option>
            </select>

            <div class="mini-actions">
              <button class="mini-btn" title="Voir" @click.stop="viewContract">
                <EyeIcon class="mini-ic" />
              </button>
              <button class="mini-btn" title="Éditer" @click.stop="editContract">
                <PencilSquareIcon class="mini-ic" />
              </button>
            </div>
          </div>
        </div>

        <!-- Variante (inchangé) -->
        <div class="variant-block">
          <div class="edit-item variant">Variante : {{ variantName }}</div>

          <div class="actions-block">
            <button class="action-btn">📄 Dupliquer</button>
            <button class="action-btn">➕ Nouvelle variante</button>
            <button class="action-btn">🗄️ Archiver</button>
            <button class="action-btn">✏️ Éditer</button>
            <button class="action-btn">🗑️ Supprimer</button>
          </div>
        </div>
      </div>

      <div class="right-info">
        <span>Durée : {{ durationMonths }} mois</span>
        <span>Volume : {{ volumeTotal.toLocaleString("fr-FR") }} m³</span>
        <span>Client : {{ client }}</span>
        <span>Status : {{ status }}</span>
      </div>
    </div>

    <!-- KPI GRID -->
    <div class="kpi-grid">
      <div
        v-for="key in kpiOrder"
        :key="key"
        class="kpi-column"
        :class="{ highlight: ['ASP', 'EBITDA', 'EBIT'].includes(key) }"
      >
        <div class="kpi-title">{{ key }}</div>

        <div class="kpi-box">
          <div class="kpi-percent">
            {{
              Number(metrics[key].percent || 0).toLocaleString("fr-FR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })
            }}%
          </div>

          <div class="kpi-values">
            <span>
              {{
                Number(metrics[key].total || 0).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })
              }}
              DH
            </span>

            <span>
              {{
                Number(metrics[key].m3 || 0).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })
              }}
              DH/m³
            </span>

            <span>
              {{
                Number(metrics[key].month || 0).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })
              }}
              DH/mois
            </span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* =========================
   Ton CSS existant (gardé)
========================= */
.header-dashboard {
  position: sticky;
  top: 0;
  z-index: 100;
  font-family: "Inter", sans-serif;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(51, 65, 85, 0.8);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.top-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.left-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 280px; }

.edit-item {
  width: auto; max-width: 420px;
  font-size: 11px; font-weight: 750; color: #e2e8f0;
  padding: 4px 8px; border-radius: 999px;
  border: 1px solid rgba(51, 65, 85, 0.85);
  background: rgba(2, 6, 23, 0.55);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}
.edit-item.variant {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(2, 6, 23, 0.65);
  color: #86efac;
  font-weight: 800;
}

.variant-block {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 5px 7px; border-radius: 12px;
  border: 1px solid rgba(51, 65, 85, 0.85);
  background: rgba(2, 6, 23, 0.55);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
}
.actions-block { display: flex; gap: 6px; flex-wrap: wrap; }
.action-btn {
  border: 1px solid rgba(51, 65, 85, 0.9);
  background: rgba(15, 23, 42, 0.55);
  color: #cbd5e1;
  font-size: 10.2px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease,
    border-color 0.12s ease, color 0.12s ease;
}
.action-btn:hover {
  transform: translateY(-1px);
  background: rgba(0, 158, 224, 0.18);
  border-color: rgba(0, 158, 224, 0.35);
  color: #e2e8f0;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.32);
}

.right-info {
  display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center;
  font-size: 10.5px; font-weight: 750;
  color: rgba(253, 230, 138, 0.98);
  padding: 5px 8px;
  border-radius: 12px;
  border: 1px solid rgba(245, 158, 11, 0.30);
  background: rgba(245, 158, 11, 0.06);
}

/* KPI grid (inchangé) */
.kpi-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.kpi-column { display: flex; flex-direction: column; gap: 5px; }
.kpi-title { font-size: 9.5px; font-weight: 750; letter-spacing: 0.45px; text-transform: uppercase; color: #94a3b8; text-align: center; line-height: 1.1; }
.kpi-box {
  position: relative; border-radius: 14px; padding: 8px 8px;
  background: rgba(2, 6, 23, 0.62);
  border: 1px solid rgba(51, 65, 85, 0.9);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.kpi-box::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 3px;
  border-radius: 14px 14px 0 0; opacity: 0.95;
  background: linear-gradient(90deg, #009ee0, #22c55e);
}
.kpi-box:hover { transform: translateY(-1px); box-shadow: 0 18px 38px rgba(0, 0, 0, 0.45); border-color: rgba(148, 163, 184, 0.55); }
.kpi-percent { font-size: 14px; font-weight: 750; line-height: 1.1; color: #e2e8f0; text-align: center; margin-bottom: 6px; font-variant-numeric: tabular-nums; letter-spacing: -0.2px; }
.kpi-values span {
  display: block; text-align: center;
  font-size: 10px; font-weight: 600; line-height: 1.35;
  font-variant-numeric: tabular-nums; letter-spacing: -0.1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.kpi-values span:nth-child(1) { color: #e2e8f0; font-weight: 650; }
.kpi-values span:nth-child(2) { color: #7dd3fc; font-weight: 600; opacity: 0.95; }
.kpi-values span:nth-child(3) { color: #86efac; font-weight: 600; opacity: 0.95; }

/* accents */
.kpi-column:nth-child(1) .kpi-box::before { background: linear-gradient(90deg, #009ee0, #22c55e); }
.kpi-column:nth-child(2) .kpi-box::before { background: linear-gradient(90deg, #f59e0b, #ef4444); }
.kpi-column:nth-child(3) .kpi-box::before { background: linear-gradient(90deg, #22c55e, #16a34a); }
.kpi-column:nth-child(4) .kpi-box::before { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
.kpi-column:nth-child(5) .kpi-box::before { background: linear-gradient(90deg, #a855f7, #ec4899); }
.kpi-column:nth-child(6) .kpi-box::before { background: linear-gradient(90deg, #10b981, #0ea5e9); }
.kpi-column:nth-child(7) .kpi-box::before { background: linear-gradient(90deg, #0f172a, #64748b); }
.kpi-column:nth-child(8) .kpi-box::before { background: linear-gradient(90deg, #94a3b8, #64748b); }

/* =========================
   ✅ AJOUTS: selectors UI
========================= */
.select-pill {
  position: relative;
  border-radius: 999px;
  padding: 4px 8px;
  border: 1px solid rgba(51, 65, 85, 0.85);
  background: rgba(2, 6, 23, 0.55);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.select-pill.pnl { border-color: rgba(0, 158, 224, 0.35); background: rgba(2, 6, 23, 0.65); }
.select-pill.contract { border-color: rgba(245, 158, 11, 0.35); background: rgba(2, 6, 23, 0.65); }

.pill-head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.pill-label { font-size: 11px; font-weight: 800; color: #cbd5e1; }
.pill-value {
  font-size: 11px; font-weight: 850;
  color: #e2e8f0;
  max-width: 260px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.select-pill.pnl .pill-value { color: #7dd3fc; }
.select-pill.contract .pill-value { color: #fdba74; }

.mini-actions { display: inline-flex; gap: 4px; margin-left: 2px; }
.mini-btn {
  width: 24px; height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(51, 65, 85, 0.9);
  background: rgba(15, 23, 42, 0.55);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mini-btn:hover { background: rgba(0, 158, 224, 0.16); }
.mini-ic { width: 14px; height: 14px; color: #cbd5e1; }

.pill-select {
  border: none;
  outline: none;
  background: transparent;
  color: #fdba74;
  font-weight: 850;
  font-size: 11px;
  max-width: 220px;
  cursor: pointer;
}
.pill-select option { color: #111827; }

/* dropdown search list (P&L) */
.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: min(520px, 72vw);
  background: rgba(2, 6, 23, 0.92);
  border: 1px solid rgba(51, 65, 85, 0.9);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  padding: 10px;
  z-index: 200;
}

.searchbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(51, 65, 85, 0.85);
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.s-ic { width: 16px; height: 16px; color: #94a3b8; }
.s-in {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 12px;
}

.dd-list { max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.dd-item {
  border: 1px solid rgba(51, 65, 85, 0.85);
  background: rgba(15, 23, 42, 0.55);
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}
.dd-item:hover { background: rgba(0, 158, 224, 0.14); border-color: rgba(0, 158, 224, 0.35); }
.dd-item.active { background: rgba(34, 197, 94, 0.14); border-color: rgba(34, 197, 94, 0.35); }
.dd-title { color: #e2e8f0; font-size: 12px; }
.dd-sub { color: #94a3b8; font-size: 11px; margin-top: 2px; }
.dd-id { color: #94a3b8; font-size: 11px; font-variant-numeric: tabular-nums; }
.dd-empty { color: #94a3b8; font-size: 12px; padding: 10px; text-align: center; }

@media (max-width: 900px) {
  .dropdown { width: min(520px, 92vw); }
}
</style>
