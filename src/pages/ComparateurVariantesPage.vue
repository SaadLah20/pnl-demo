<!-- ✅ src/pages/ComparateurVariantesPage.vue (FICHIER COMPLET - FIX BUILD + UI)
     ✅ Icônes safe (outline existants)
     ✅ Filtre contrat global (cartes) => graphes + delta + tableau
     ✅ Base variant + delta (sans delta volume)
     ✅ Tableau: + espace titre, - espace EBIT% + Faisable
     ✅ Delta: anti-chevauchement (2 lignes)
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";
import { contractUiTitle } from "@/services/contractTitle";

import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  Squares2X2Icon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BookmarkIcon,
  ListBulletIcon,
} from "@heroicons/vue/24/outline";

/* =========================
   STORE / LOAD
========================= */
const store = usePnlStore();
const loading = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    loading.value = true;
    error.value = null;

    if ((store as any).pnls?.length === 0 && (store as any).loadPnls) {
      await (store as any).loadPnls();
    }

    initDefaults();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});

/* =========================
   TYPES
========================= */
type VariantPack = { variant: any; contract: any; pnl: any };

type Kpi = {
  pmvM3: number;
  caTotal: number;
  ebitTotal: number;
  ebitPct: number;
  productionTotal: number;
  cmpM3: number;
};

type Row = {
  id: string;
  variantTitle: string;

  contractId: string;
  contractTitle: string;
  dureeMois: number;

  kpi: Kpi;

  valid: boolean;
  feasible: boolean;
};

type ContractSummary = {
  contractId: string;
  contractTitle: string;
  dureeMois: number;
  variantsCount: number;
  validCount: number;
  invalidCount: number;
  maxEbit: number | null;
  minPmv: number | null;
};

/* =========================
   UI STATE
========================= */
const ui = reactive({
  tab: "SYNTH" as "SYNTH" | "DELTA" | "TABLE",

  ebitTargetMode: "total" as "total" | "pct",
  ebitTargetTotal: 0 as number,
  ebitTargetPct: 0 as number,
  onlyFeasible: false,

  contractsOpen: true,

  // ✅ filtre contrat global
  contractIdFilter: "" as string,

  // base
  baseVariantId: "" as string,

  // bars metric
  barMetric: "EBIT" as "EBIT" | "CA" | "PMV" | "CMP",

  // tri tableau
  sortKey: "ebitTotal" as
    | "variantTitle"
    | "pmvM3"
    | "cmpM3"
    | "caTotal"
    | "ebitTotal"
    | "ebitPct"
    | "productionTotal"
    | "feasible",
  sortDir: "desc" as "asc" | "desc",
});

/* =========================
   DERIVED
========================= */
const activePnl = computed(() => (store as any).activePnl ?? null);
const activeVariantId = computed(() => (store as any).activeVariantId ?? null);

function initDefaults() {
  ui.contractIdFilter = "";
  ui.baseVariantId = String(activeVariantId.value ?? "");
}

watch(
  () => String(activePnl.value?.id ?? ""),
  () => initDefaults()
);

/* =========================
   HELPERS
========================= */
function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function fmtNumber(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n(v));
}
function fmtMoney(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n(v));
}
function fmtPct(v: any, digits = 1) {
  return `${fmtNumber(v, digits)} %`;
}
function vTitle(v: any) {
  return String(v?.title ?? v?.name ?? v?.label ?? v?.id ?? "Variante");
}
function cTitle(c: any) {
  return contractUiTitle(c);
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function safeMin(nums: number[]) {
  const a = nums.filter((x) => Number.isFinite(x));
  return a.length ? Math.min(...a) : 0;
}
function safeMax(nums: number[]) {
  const a = nums.filter((x) => Number.isFinite(x));
  return a.length ? Math.max(...a) : 0;
}
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/* =========================
   PREVIEW PARAMS (SAFE)
========================= */
const previewMajorations = computed<Record<string, number> | null>(() => {
  const v = (store as any).headerMajorationsPreview;
  return v && typeof v === "object" ? (v as any) : null;
});
const previewDevisSurcharges = computed<Record<string, number> | null>(() => {
  const v = (store as any).headerDevisSurchargesPreview;
  return v && typeof v === "object" ? (v as any) : null;
});
const useDevisSurcharge = computed<boolean>(() => Boolean((store as any).headerUseDevisSurcharge ?? false));

/* =========================
   PACKS (PNL complet)
========================= */
const allPacks = computed<VariantPack[]>(() => {
  const pnl = activePnl.value;
  if (!pnl) return [];
  const out: VariantPack[] = [];
  for (const c of pnl.contracts ?? []) {
    for (const v of c.variants ?? []) out.push({ variant: v, contract: c, pnl });
  }
  return out;
});

/* =========================
   FEASIBILITY
========================= */
const ebitMinTotal = computed(() => Math.max(0, n(ui.ebitTargetTotal)));
const ebitMinPct = computed(() => Math.max(0, n(ui.ebitTargetPct)));

function isFeasible(ebitTotal: number, ebitPct: number): boolean {
  if (!(ebitTotal >= 0)) return false;
  if (ui.ebitTargetMode === "pct") return ebitPct >= ebitMinPct.value;
  return ebitTotal >= ebitMinTotal.value;
}

/* =========================
   KPI (source unique)
========================= */
function computeKpi(variant: any, dureeMois: number): Kpi {
  const hk = computeHeaderKpis(
    variant,
    n(dureeMois),
    previewMajorations.value,
    previewDevisSurcharges.value,
    useDevisSurcharge.value
  );

  return {
    pmvM3: n((hk as any).prixMoyenM3),
    caTotal: n((hk as any).caTotal),
    ebitTotal: n((hk as any).ebitTotal),
    ebitPct: n((hk as any).ebitPct),
    productionTotal: n((hk as any).productionTotal),
    cmpM3: n((hk as any).coutMpMoyenM3),
  };
}

/* =========================
   ROWS
========================= */
const rowsAllRawAll = computed<Row[]>(() => {
  return allPacks.value.map((pack) => {
    const vid = String(pack.variant.id);
    const duree = n(pack.contract?.dureeMois ?? 0);

    const kpi = computeKpi(pack.variant, duree);

    const valid = kpi.pmvM3 !== 0 && kpi.ebitTotal !== 0;
    const feasible = valid ? isFeasible(kpi.ebitTotal, kpi.ebitPct) : false;

    return {
      id: vid,
      variantTitle: vTitle(pack.variant),
      contractId: String(pack.contract?.id ?? ""),
      contractTitle: cTitle(pack.contract),
      dureeMois: duree,
      kpi,
      valid,
      feasible,
    };
  });
});

const invalidCount = computed(() => rowsAllRawAll.value.filter((r) => !r.valid).length);

/* ✅ filtre contrat global */
const rowsByContract = computed<Row[]>(() => {
  const cid = String(ui.contractIdFilter || "");
  const base = rowsAllRawAll.value.filter((r) => r.valid);
  if (!cid) return base;
  return base.filter((r) => r.contractId === cid);
});

const rowsFiltered = computed<Row[]>(() => {
  if (!ui.onlyFeasible) return rowsByContract.value;
  return rowsByContract.value.filter((r) => r.feasible);
});

const feasibleCount = computed(() => rowsFiltered.value.filter((r) => r.feasible).length);
const validCount = computed(() => rowsByContract.value.length);

/* =========================
   CONTRACT SUMMARY
========================= */
const contractSummaries = computed<ContractSummary[]>(() => {
  const pnl = activePnl.value;
  if (!pnl) return [];

  const out: ContractSummary[] = [];

  for (const c of pnl.contracts ?? []) {
    const cid = String(c.id);
    const packs = allPacks.value.filter((p) => String(p.contract?.id ?? "") === cid);

    const rowsAll = packs.map((p) => {
      const kpi = computeKpi(p.variant, n(c?.dureeMois ?? 0));
      const valid = kpi.pmvM3 !== 0 && kpi.ebitTotal !== 0;
      return { kpi, valid };
    });

    const invalid = rowsAll.filter((x) => !x.valid).length;
    const rows = rowsAll.filter((x) => x.valid);

    const maxE = rows.length ? Math.max(...rows.map((x) => n(x.kpi.ebitTotal))) : null;
    const minP = rows.length ? Math.min(...rows.map((x) => n(x.kpi.pmvM3))) : null;

    out.push({
      contractId: cid,
      contractTitle: cTitle(c),
      dureeMois: n(c?.dureeMois ?? 0),
      variantsCount: rowsAll.length,
      validCount: rows.length,
      invalidCount: invalid,
      maxEbit: maxE,
      minPmv: minP,
    });
  }

  out.sort((a, b) => n(b.maxEbit) - n(a.maxEbit));
  return out;
});

const bestContract = computed(() => (contractSummaries.value.length ? contractSummaries.value[0] : null));

function setContractFilter(cid: string) {
  ui.contractIdFilter = String(cid || "");

  // si la base sort du filtre, fallback propre
  const b = baseRow.value;
  if (b && ui.contractIdFilter && b.contractId !== ui.contractIdFilter) {
    const fallback =
      rowsByContract.value.find((r) => r.id === String(activeVariantId.value ?? "")) ||
      rowsByContract.value[0] ||
      null;
    ui.baseVariantId = fallback ? fallback.id : "";
  }
}

/* =========================
   SORT
========================= */
function sortValue(r: Row, key: typeof ui.sortKey) {
  if (key === "variantTitle") return r.variantTitle;
  if (key === "feasible") return r.feasible ? 1 : 0;
  return (r.kpi as any)[key];
}

const rowsSorted = computed<Row[]>(() => {
  const key = ui.sortKey;
  const dir = ui.sortDir;
  const arr = [...rowsFiltered.value];

  arr.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    const mul = dir === "asc" ? 1 : -1;

    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
    return (n(av) - n(bv)) * mul;
  });

  return arr;
});

function setSort(k: typeof ui.sortKey) {
  if (ui.sortKey === k) ui.sortDir = ui.sortDir === "asc" ? "desc" : "asc";
  else {
    ui.sortKey = k;
    ui.sortDir = k === "variantTitle" ? "asc" : "desc";
  }
}

/* =========================
   BASE + DELTAS (sans volume)
========================= */
const baseRow = computed<Row | null>(() => {
  const id = String(ui.baseVariantId || "");
  if (!id) return null;
  return rowsByContract.value.find((r) => r.id === id) ?? rowsByContract.value[0] ?? null;
});

function setBaseVariant(id: string) {
  ui.baseVariantId = String(id || "");
  ui.tab = "DELTA";
}

function delta(a: number, b: number) {
  return n(a) - n(b);
}
function deltaPct(a: number, b: number) {
  const base = n(b);
  if (base === 0) return 0;
  return ((n(a) - base) / base) * 100;
}

type DeltaRow = Row & {
  isBase: boolean;

  d_pmv: number; d_pmvPct: number;
  d_ca: number; d_caPct: number;
  d_ebit: number; d_ebitRelPct: number;
  d_ebitPct: number;
  d_prod: number; d_prodPct: number;
  d_cmp: number; d_cmpPct: number;
};

const deltaRows = computed<DeltaRow[]>(() => {
  const b = baseRow.value;
  if (!b) return [];

  return rowsSorted.value.map((r) => ({
    ...r,
    isBase: r.id === b.id,

    d_pmv: delta(r.kpi.pmvM3, b.kpi.pmvM3),
    d_pmvPct: deltaPct(r.kpi.pmvM3, b.kpi.pmvM3),

    d_ca: delta(r.kpi.caTotal, b.kpi.caTotal),
    d_caPct: deltaPct(r.kpi.caTotal, b.kpi.caTotal),

    d_ebit: delta(r.kpi.ebitTotal, b.kpi.ebitTotal),
    d_ebitRelPct: deltaPct(r.kpi.ebitTotal, b.kpi.ebitTotal),

    d_ebitPct: delta(r.kpi.ebitPct, b.kpi.ebitPct),

    d_prod: delta(r.kpi.productionTotal, b.kpi.productionTotal),
    d_prodPct: deltaPct(r.kpi.productionTotal, b.kpi.productionTotal),

    d_cmp: delta(r.kpi.cmpM3, b.kpi.cmpM3),
    d_cmpPct: deltaPct(r.kpi.cmpM3, b.kpi.cmpM3),
  }));
});

/* =========================
   GRAPHS (filtrés contrat)
========================= */
const barsTop = computed(() => {
  const rows = rowsByContract.value; // ✅ filtre contrat
  const metric = ui.barMetric;

  const pick = (r: Row) => {
    if (metric === "EBIT") return r.kpi.ebitTotal;
    if (metric === "CA") return r.kpi.caTotal;
    if (metric === "PMV") return r.kpi.pmvM3;
    return r.kpi.cmpM3;
  };

  const sorted = [...rows].sort((a, b) => n(pick(b)) - n(pick(a))).slice(0, 10);
  const maxV = safeMax(sorted.map((r) => pick(r)));
  const minV = safeMin(sorted.map((r) => pick(r)));
  const span = maxV - minV || 1;

  return sorted.map((r) => ({ ...r, v: pick(r), n01: clamp((pick(r) - minV) / span, 0, 1) }));
});

const scatter = computed(() => {
  const rows = rowsByContract.value;

  const xs = rows.map((r) => r.kpi.pmvM3);
  const ys = rows.map((r) => r.kpi.ebitTotal);

  const minX = safeMin(xs);
  const maxX = safeMax(xs);
  const minY = safeMin(ys);
  const maxY = safeMax(ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const targetY = ui.ebitTargetMode === "total" ? n(ui.ebitTargetTotal) : null;

  const pts = rows.map((r) => {
    const x0 = clamp((r.kpi.pmvM3 - minX) / spanX, 0, 1);
    const y0 = clamp((r.kpi.ebitTotal - minY) / spanY, 0, 1);

    const h = hash01(r.id);
    const jx = (h - 0.5) * 0.010;
    const jy = (hash01(r.id + "y") - 0.5) * 0.010;

    const x = clamp(x0 + jx, 0, 1);
    const y = clamp(y0 + jy, 0, 1);

    const isActive = activeVariantId.value ? String(activeVariantId.value) === r.id : false;
    const isBase = baseRow.value ? baseRow.value.id === r.id : false;

    return { ...r, x, y, isActive, isBase };
  });

  const yTarget01 = targetY == null ? null : clamp((targetY - minY) / spanY, 0, 1);

  return { minX, maxX, minY, maxY, pts, yTarget01 };
});

/* =========================
   ACTIONS
========================= */
function activateVariant(variantId: string) {
  const fn = (store as any).setActiveVariant || (store as any).selectVariant || null;
  if (typeof fn === "function") fn.call(store, variantId);
}

function reload() {
  (async () => {
    try {
      loading.value = true;
      error.value = null;
      if ((store as any).loadPnls) await (store as any).loadPnls();
      initDefaults();
    } catch (e: any) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  })();
}

/* =========================
   DELTA COLORS
========================= */
function signClass(val: number, dir: "UP" | "DOWN") {
  const v = n(val);
  if (v === 0) return "neu";
  if (dir === "UP") return v > 0 ? "pos" : "neg";
  return v < 0 ? "pos" : "neg"; // DOWN: baisse = mieux
}
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <div class="head">
      <div class="hLeft">
        <div class="hTitle">Comparateur de variantes</div>
        <div class="hSub ellipsis" v-if="activePnl" :title="String(activePnl?.title ?? activePnl?.name ?? '—')">
          PNL: <b>{{ activePnl?.title ?? activePnl?.name ?? "—" }}</b>
          <span class="sep">•</span>
          Filtre: <b>{{ ui.contractIdFilter ? "Contrat" : "PNL complet" }}</b>
          <span class="sep">•</span>
          Valides: <b>{{ validCount }}</b>
          <span class="sep">•</span>
          Faisables: <b>{{ feasibleCount }}</b>
          <span class="sep">•</span>
          Base: <b>{{ baseRow ? baseRow.variantTitle : "—" }}</b>
        </div>
      </div>

      <div class="hRight">
        <button class="btn ghost" type="button" @click="reload" :disabled="!!loading" title="Rafraîchir">
          <ArrowPathIcon class="ic" />
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error">
      <ExclamationTriangleIcon class="aic" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-if="loading" class="alert info">Chargement…</div>

    <div v-if="invalidCount > 0" class="alert warn">
      <ExclamationTriangleIcon class="aic" />
      <div class="min0">
        <b>{{ invalidCount }}</b> variante(s) ont <b>EBIT</b> et/ou <b>PMV</b> à <b>0</b> : exclues.
      </div>
    </div>

    <!-- CONTROLS -->
    <div class="controls">
      <div class="ctlGrid">
        <div class="ctlBlock">
          <div class="ctlLabel">Cible faisabilité</div>

          <div class="row">
            <div class="seg">
              <button class="segBtn" :class="{ on: ui.ebitTargetMode === 'total' }" type="button" @click="ui.ebitTargetMode='total'">
                EBIT (DH)
              </button>
              <button class="segBtn" :class="{ on: ui.ebitTargetMode === 'pct' }" type="button" @click="ui.ebitTargetMode='pct'">
                EBIT (%)
              </button>
            </div>

            <input
              v-if="ui.ebitTargetMode === 'total'"
              v-model.number="ui.ebitTargetTotal"
              type="number"
              step="1000"
              class="num"
              placeholder="ex: 200000"
            />
            <input
              v-else
              v-model.number="ui.ebitTargetPct"
              type="number"
              step="0.1"
              class="num"
              placeholder="ex: 12.5"
            />

            <label class="check">
              <input type="checkbox" v-model="ui.onlyFeasible" />
              <span>Faisables</span>
            </label>
          </div>

          <div class="hint">
            Faisable si <b>EBIT ≥ 0</b> et
            <b v-if="ui.ebitTargetMode==='total'">EBIT total ≥ cible</b>
            <b v-else>EBIT % ≥ cible</b>.
          </div>
        </div>

        <div class="ctlBlock">
          <div class="ctlLabel">Affichage</div>
          <div class="tabs">
            <button class="tab" :class="{ on: ui.tab==='SYNTH' }" type="button" @click="ui.tab='SYNTH'">
              <ChartBarIcon class="icSm" /> Synthèse
            </button>
            <button class="tab" :class="{ on: ui.tab==='DELTA' }" type="button" @click="ui.tab='DELTA'">
              <BookmarkIcon class="icSm" /> Δ vs Base
            </button>
            <button class="tab" :class="{ on: ui.tab==='TABLE' }" type="button" @click="ui.tab='TABLE'">
              <ListBulletIcon class="icSm" /> Tableau
            </button>
          </div>
          <div class="hint">Filtre contrat via <b>cartes</b> • Base via bouton <b>Base</b>.</div>
        </div>
      </div>
    </div>

    <!-- CONTRACTS CARDS -->
    <div class="box" v-if="contractSummaries.length">
      <button class="boxHead" type="button" @click="ui.contractsOpen = !ui.contractsOpen">
        <div class="bhLeft">
          <component :is="ui.contractsOpen ? ChevronDownIcon : ChevronRightIcon" class="chev" />
          <Squares2X2Icon class="bhIc" />
          <div class="bhTitle">Contrats</div>
          <span class="pillTiny">{{ contractSummaries.length }}</span>
          <span class="mutedSmall" v-if="bestContract">
            • meilleur (EBIT): <b>{{ bestContract.contractTitle }}</b>
          </span>
          <span class="mutedSmall">• filtre: <b>{{ ui.contractIdFilter ? "contrat" : "PNL complet" }}</b></span>
        </div>
        <div class="bhRight"><span class="mutedSmall">Clique un contrat pour filtrer toute la page</span></div>
      </button>

      <div v-show="ui.contractsOpen" class="boxBody">
        <div class="contracts">
          <button class="cCard reset" type="button" :class="{ on: !ui.contractIdFilter }" @click="setContractFilter('')">
            <div class="cTop">
              <div class="cName">PNL complet</div>
              <div class="cMeta">Tous contrats</div>
            </div>
          </button>

          <button
            v-for="c in contractSummaries"
            :key="c.contractId"
            class="cCard"
            type="button"
            :class="{ on: ui.contractIdFilter === c.contractId }"
            @click="setContractFilter(c.contractId)"
          >
            <div class="cTop">
              <div class="cName ellipsis" :title="c.contractTitle">{{ c.contractTitle }}</div>
              <div class="cMeta">
                {{ c.dureeMois }} mois • {{ c.validCount }}/{{ c.variantsCount }} valides
                <span v-if="c.invalidCount > 0" class="cInv">• {{ c.invalidCount }} exclue(s)</span>
              </div>
            </div>

            <div class="cKpis">
              <div class="kv">
                <div class="k">Max EBIT</div>
                <div class="v" v-if="c.maxEbit != null">{{ fmtMoney(c.maxEbit, 0) }}</div>
                <div class="v muted" v-else>—</div>
              </div>
              <div class="kv">
                <div class="k">Min PMV</div>
                <div class="v" v-if="c.minPmv != null">{{ fmtMoney(c.minPmv, 2) }}</div>
                <div class="v muted" v-else>—</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- TAB: SYNTH -->
    <div v-if="ui.tab==='SYNTH'" class="grid2">
      <div class="gCard">
        <div class="gHead">
          <div class="gTitle"><ChartBarIcon class="gIc" /> Top 10</div>
          <div class="gSub">
            <span v-if="!ui.contractIdFilter">PNL complet</span>
            <span v-else>Contrat filtré</span>
          </div>
        </div>

        <div class="segLine">
          <div class="seg">
            <button class="segBtn" :class="{ on: ui.barMetric==='EBIT' }" type="button" @click="ui.barMetric='EBIT'">EBIT</button>
            <button class="segBtn" :class="{ on: ui.barMetric==='CA' }" type="button" @click="ui.barMetric='CA'">CA</button>
            <button class="segBtn" :class="{ on: ui.barMetric==='PMV' }" type="button" @click="ui.barMetric='PMV'">PMV</button>
            <button class="segBtn" :class="{ on: ui.barMetric==='CMP' }" type="button" @click="ui.barMetric='CMP'">CMP</button>
          </div>
        </div>

        <div class="bars" v-if="barsTop.length">
          <div v-for="b in barsTop" :key="b.id" class="barRow">
            <div class="bLab ellipsis" :title="b.variantTitle">
              {{ b.variantTitle }}
              <span v-if="baseRow && b.id===baseRow.id" class="tag base">BASE</span>
            </div>

            <div class="bTrack">
              <div class="bFill" :style="{ width: (b.n01 * 100).toFixed(1) + '%' }"></div>
            </div>

            <div class="bVal">
              <span v-if="ui.barMetric==='PMV' || ui.barMetric==='CMP'">{{ fmtMoney((b as any).v, 2) }}</span>
              <span v-else>{{ fmtMoney((b as any).v, 0) }}</span>
            </div>
          </div>
        </div>

        <div v-else class="muted">Aucune donnée.</div>
      </div>

      <div class="gCard">
        <div class="gHead">
          <div class="gTitle"><AdjustmentsHorizontalIcon class="gIc" /> PMV vs EBIT</div>
          <div class="gSub">X=PMV (MAD/m³), Y=EBIT (DH)</div>
        </div>

        <div class="scatterWrap">
          <svg class="svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="10" y="10" width="80" height="80" class="frame" />

            <line
              v-if="scatter.yTarget01 != null"
              x1="10"
              :y1="90 - scatter.yTarget01*80"
              x2="90"
              :y2="90 - scatter.yTarget01*80"
              class="target"
            />

            <g v-for="p in scatter.pts" :key="p.id">
              <circle
                :cx="10 + p.x*80"
                :cy="90 - p.y*80"
                r="1.35"
                class="pt"
                :class="{ ok: p.feasible, bad: !p.feasible, base: p.isBase, active: p.isActive }"
              >
                <title>
                  {{ p.variantTitle }}
                  • PMV {{ fmtMoney(p.kpi.pmvM3,2) }}
                  • CA {{ fmtMoney(p.kpi.caTotal,0) }}
                  • EBIT {{ fmtMoney(p.kpi.ebitTotal,0) }}
                  • EBIT% {{ fmtPct(p.kpi.ebitPct,1) }}
                </title>
              </circle>
            </g>
          </svg>

          <div class="axisLabels">
            <div class="xLab">PMV: {{ fmtMoney(scatter.minX,2) }} → {{ fmtMoney(scatter.maxX,2) }}</div>
            <div class="yLab">EBIT: {{ fmtMoney(scatter.minY,0) }} → {{ fmtMoney(scatter.maxY,0) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: DELTA -->
    <div v-else-if="ui.tab==='DELTA'" class="deltaSection">
      <div class="deltaHeader">
        <div class="dhLeft min0">
          <div class="dhTitle">Δ vs Variante de base</div>
          <div class="dhSub ellipsis" v-if="baseRow" :title="baseRow.variantTitle">
            Base: <b>{{ baseRow.variantTitle }}</b>
            <span class="sep">•</span>
            Clique <b>Base</b> dans le tableau pour changer
          </div>
          <div class="dhSub" v-else>Aucune base sélectionnée.</div>
        </div>

        <div class="dhRight" v-if="baseRow">
          <div class="baseKpis">
            <div class="chip">
              <div class="k">PMV</div>
              <div class="v">{{ fmtMoney(baseRow.kpi.pmvM3,2) }}</div>
            </div>
            <div class="chip">
              <div class="k">CA</div>
              <div class="v">{{ fmtMoney(baseRow.kpi.caTotal,0) }}</div>
            </div>
            <div class="chip">
              <div class="k">EBIT</div>
              <div class="v">{{ fmtMoney(baseRow.kpi.ebitTotal,0) }}</div>
            </div>
            <div class="chip">
              <div class="k">EBIT%</div>
              <div class="v">{{ fmtPct(baseRow.kpi.ebitPct,1) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="box" v-if="baseRow">
        <div class="boxBody">
          <div class="tableWrap">
            <table class="tbl deltaTbl">
              <thead>
                <tr>
                  <th class="sticky">Variante</th>
                  <th class="num sticky">Δ PMV</th>
                  <th class="num sticky">Δ CA</th>
                  <th class="num sticky">Δ EBIT</th>
                  <th class="num sticky">Δ EBIT%</th>
                  <th class="num sticky">Δ Prod</th>
                  <th class="num sticky">Δ CMP</th>
                  <th class="sticky act">Actions</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="r in deltaRows" :key="r.id" :class="{ base: r.isBase, bad: !r.feasible }">
                  <td class="tTitle">
                    <div class="tMain">
                      <span class="ellipsis" :title="r.variantTitle">{{ r.variantTitle }}</span>
                      <span v-if="r.isBase" class="badge base">BASE</span>
                      <span v-if="String(activeVariantId ?? '') === r.id" class="badge act">Active</span>
                    </div>
                    <div class="tSub ellipsis" :title="r.contractTitle">{{ r.contractTitle }} • {{ r.dureeMois }} mois</div>
                  </td>

                  <td class="num">
                    <div :class="['d2', signClass(r.d_pmv,'DOWN')]">
                      <div class="dMain">{{ r.d_pmv >= 0 ? "+" : "" }}{{ fmtMoney(r.d_pmv,2) }}</div>
                      <div class="dSub">{{ r.d_pmvPct>=0?"+":"" }}{{ fmtPct(r.d_pmvPct,1) }}</div>
                    </div>
                  </td>

                  <td class="num">
                    <div :class="['d2', signClass(r.d_ca,'UP')]">
                      <div class="dMain">{{ r.d_ca >= 0 ? "+" : "" }}{{ fmtMoney(r.d_ca,0) }}</div>
                      <div class="dSub">{{ r.d_caPct>=0?"+":"" }}{{ fmtPct(r.d_caPct,1) }}</div>
                    </div>
                  </td>

                  <td class="num">
                    <div :class="['d2', signClass(r.d_ebit,'UP')]">
                      <div class="dMain">{{ r.d_ebit >= 0 ? "+" : "" }}{{ fmtMoney(r.d_ebit,0) }}</div>
                      <div class="dSub">{{ r.d_ebitRelPct>=0?"+":"" }}{{ fmtPct(r.d_ebitRelPct,1) }}</div>
                    </div>
                  </td>

                  <td class="num">
                    <div :class="['d2', signClass(r.d_ebitPct,'UP')]">
                      <div class="dMain">{{ r.d_ebitPct >= 0 ? "+" : "" }}{{ fmtPct(r.d_ebitPct,1) }}</div>
                      <div class="dSub">&nbsp;</div>
                    </div>
                  </td>

                  <td class="num">
                    <div :class="['d2', signClass(r.d_prod,'DOWN')]">
                      <div class="dMain">{{ r.d_prod >= 0 ? "+" : "" }}{{ fmtMoney(r.d_prod,0) }}</div>
                      <div class="dSub">{{ r.d_prodPct>=0?"+":"" }}{{ fmtPct(r.d_prodPct,1) }}</div>
                    </div>
                  </td>

                  <td class="num">
                    <div :class="['d2', signClass(r.d_cmp,'DOWN')]">
                      <div class="dMain">{{ r.d_cmp >= 0 ? "+" : "" }}{{ fmtMoney(r.d_cmp,2) }}</div>
                      <div class="dSub">{{ r.d_cmpPct>=0?"+":"" }}{{ fmtPct(r.d_cmpPct,1) }}</div>
                    </div>
                  </td>

                  <td class="act">
                    <div class="actBtns">
                      <button class="btn tiny" type="button" @click="activateVariant(r.id)">Activer</button>
                      <button class="btn tiny ghost" type="button" @click="setBaseVariant(r.id)" :disabled="!!(baseRow && baseRow.id === r.id)">
                        <BookmarkIcon class="icSm" /> Base
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="note">
            <div class="mutedSmall">
              ↓ mieux: <b>PMV</b>, <b>CMP</b>, <b>Prod</b> • ↑ mieux: <b>CA</b>, <b>EBIT</b>, <b>EBIT%</b>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: TABLE -->
    <div v-else class="box">
      <div class="boxBody">
        <div class="tableWrap">
          <table class="tbl mainTbl">
            <thead>
              <tr>
                <th class="sticky" @click="setSort('variantTitle')">
                  Variante
                  <span class="srt" v-if="ui.sortKey==='variantTitle'">{{ ui.sortDir==='asc'?'▲':'▼' }}</span>
                </th>

                <th class="num sticky" @click="setSort('pmvM3')">PMV</th>
                <th class="num sticky" @click="setSort('caTotal')">CA</th>
                <th class="num sticky" @click="setSort('ebitTotal')">EBIT</th>
                <th class="num sticky" @click="setSort('ebitPct')">EBIT%</th>
                <th class="num sticky" @click="setSort('productionTotal')">Prod</th>
                <th class="num sticky" @click="setSort('cmpM3')">CMP</th>
                <th class="sticky" @click="setSort('feasible')">Faisable</th>
                <th class="sticky act">Actions</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="r in rowsSorted" :key="r.id" :class="{ bad: !r.feasible, base: baseRow && r.id===baseRow.id }">
                <td class="tTitle">
                  <div class="tMain">
                    <span class="ellipsis" :title="r.variantTitle">{{ r.variantTitle }}</span>
                    <span v-if="baseRow && r.id===baseRow.id" class="badge base">BASE</span>
                    <span v-if="String(activeVariantId ?? '') === r.id" class="badge act">Active</span>
                  </div>
                  <div class="tSub ellipsis" :title="r.contractTitle">{{ r.contractTitle }} • {{ r.dureeMois }} mois</div>
                </td>

                <td class="num">{{ fmtMoney(r.kpi.pmvM3,2) }}</td>
                <td class="num">{{ fmtMoney(r.kpi.caTotal,0) }}</td>
                <td class="num">{{ fmtMoney(r.kpi.ebitTotal,0) }}</td>
                <td class="num">{{ fmtPct(r.kpi.ebitPct,1) }}</td>
                <td class="num">{{ fmtMoney(r.kpi.productionTotal,0) }}</td>
                <td class="num">{{ fmtMoney(r.kpi.cmpM3,2) }}</td>

                <td>
                  <span class="ok" v-if="r.feasible">OK</span>
                  <span class="no" v-else>NON</span>
                </td>

                <td class="act">
                  <div class="actBtns">
                    <button class="btn tiny" type="button" @click="activateVariant(r.id)">Activer</button>
                    <button class="btn tiny ghost" type="button" @click="setBaseVariant(r.id)" :disabled="!!(baseRow && baseRow.id === r.id)">
                      <BookmarkIcon class="icSm" /> Base
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="note">
          <div class="mutedSmall">
            Filtre actif: <b>{{ ui.contractIdFilter ? "Contrat" : "PNL complet" }}</b>
            <span class="sep">•</span>
            Utilise <b>Base</b> pour comparer dans Δ.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding:12px; display:flex; flex-direction:column; gap:10px; }
.head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.hLeft { min-width:0; }
.hTitle { font-size:16px; font-weight:950; letter-spacing:.1px; }
.hSub { margin-top:2px; font-size:12px; color:rgba(0,0,0,.6); }
.sep { margin:0 6px; color:rgba(0,0,0,.35); }
.min0 { min-width:0; }
.ellipsis { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.btn{ display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:8px 10px; border-radius:10px;
  border:1px solid rgba(0,0,0,.12); background:#fff; cursor:pointer; font-size:12px; }
.btn.ghost{ background:rgba(0,0,0,.02); }
.btn.tiny{ padding:5px 8px; border-radius:9px; font-size:11px; }
.btn:disabled{ opacity:.6; cursor:not-allowed; }
.ic{ width:18px; height:18px; }
.icSm{ width:14px; height:14px; }

.alert{ padding:10px 12px; border-radius:12px; font-size:12px; display:flex; align-items:flex-start; gap:10px; }
.alert.info{ background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.2); }
.alert.error{ background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.25); }
.alert.warn{ background:rgba(245,158,11,.10); border:1px solid rgba(245,158,11,.25); }
.aic{ width:18px; height:18px; margin-top:1px; }

.controls{ background:rgba(255,255,255,.92); border:1px solid rgba(0,0,0,.08); border-radius:14px; padding:10px; }
.ctlGrid{ display:grid; grid-template-columns:1.2fr 1fr; gap:10px; }
@media (max-width:900px){ .ctlGrid{ grid-template-columns:1fr; } }
.ctlBlock{ min-width:0; }
.ctlLabel{ font-size:11px; font-weight:950; color:rgba(0,0,0,.72); margin-bottom:6px; }
.row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.hint{ margin-top:6px; font-size:11px; color:rgba(0,0,0,.55); }
.check{ display:inline-flex; gap:8px; align-items:center; font-size:12px; }

.seg{ display:inline-flex; border:1px solid rgba(0,0,0,.12); border-radius:999px; overflow:hidden; }
.segBtn{ padding:6px 10px; font-size:11px; font-weight:950; background:rgba(0,0,0,.03); border:none; cursor:pointer; }
.segBtn.on{ background:rgba(37,99,235,.12); }

.num{ padding:8px 10px; border-radius:10px; border:1px solid rgba(0,0,0,.12); background:#fff; font-size:12px; min-width:180px; }
@media (max-width:700px){ .num{ min-width:0; width:100%; } }

.tabs{ display:flex; gap:8px; flex-wrap:wrap; }
.tab{ display:inline-flex; align-items:center; gap:8px; padding:7px 10px; border-radius:10px; border:1px solid rgba(0,0,0,.12);
  background:rgba(0,0,0,.02); font-weight:950; font-size:12px; cursor:pointer; }
.tab.on{ border-color:rgba(37,99,235,.55); background:rgba(37,99,235,.10); }

.box{ border:1px solid rgba(0,0,0,.08); border-radius:14px; overflow:hidden; background:#fff; }
.boxHead{ width:100%; border:none; background:rgba(0,0,0,.02); padding:10px 12px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; }
.boxBody{ padding:10px 12px; }
.bhLeft{ display:flex; align-items:center; gap:10px; min-width:0; flex-wrap:wrap; }
.bhRight{ font-size:11px; color:rgba(0,0,0,.55); }
.chev,.bhIc{ width:18px; height:18px; opacity:.85; }
.bhTitle{ font-size:13px; font-weight:950; }
.pillTiny{ padding:2px 8px; border-radius:999px; background:rgba(0,0,0,.06); font-size:11px; font-weight:950; }
.mutedSmall{ font-size:11px; color:rgba(0,0,0,.55); }

.contracts{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
@media (max-width:1200px){ .contracts{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:700px){ .contracts{ grid-template-columns:1fr; } }
.cCard{ text-align:left; border:1px solid rgba(0,0,0,.10); background:#fff; border-radius:14px; padding:10px; cursor:pointer; min-width:0; }
.cCard:hover{ border-color:rgba(37,99,235,.35); background:rgba(37,99,235,.04); }
.cCard.on{ border-color:rgba(37,99,235,.55); background:rgba(37,99,235,.08); }
.cCard.reset{ border-style:dashed; }
.cCard.reset.on{ border-style:solid; }
.cTop{ min-width:0; }
.cName{ font-size:12px; font-weight:950; }
.cMeta{ margin-top:2px; font-size:11px; color:rgba(0,0,0,.55); }
.cInv{ color:rgba(245,158,11,.95); font-weight:950; }
.cKpis{ margin-top:8px; display:flex; gap:10px; flex-wrap:wrap; }
.kv{ display:flex; gap:6px; align-items:baseline; }
.kv .k{ font-size:11px; font-weight:950; color:rgba(0,0,0,.55); }
.kv .v{ font-size:12px; font-weight:950; font-variant-numeric:tabular-nums; white-space:nowrap; }
.kv .muted{ color:rgba(0,0,0,.45); }

.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
@media (max-width:1100px){ .grid2{ grid-template-columns:1fr; } }
.gCard{ border:1px solid rgba(0,0,0,.08); border-radius:14px; background:#fff; padding:10px; }
.gHead{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:8px; min-width:0; }
.gTitle{ display:flex; align-items:center; gap:8px; font-size:13px; font-weight:950; }
.gSub{ font-size:11px; color:rgba(0,0,0,.55); }
.gIc{ width:18px; height:18px; opacity:.85; }
.segLine{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; flex-wrap:wrap; }

.bars{ display:flex; flex-direction:column; gap:8px; }
.barRow{ display:grid; grid-template-columns:1fr 220px 110px; gap:10px; align-items:center; min-width:0; }
@media (max-width:700px){ .barRow{ grid-template-columns:1fr; } }
.bLab{ font-size:12px; font-weight:950; min-width:0; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.bTrack{ position:relative; height:10px; border-radius:999px; background:rgba(0,0,0,.06); overflow:hidden; }
.bFill{ height:100%; background:rgba(37,99,235,.45); }
.bVal{ text-align:right; font-variant-numeric:tabular-nums; font-size:12px; font-weight:950; }
.tag{ padding:2px 8px; border-radius:999px; font-size:10px; font-weight:950; border:1px solid rgba(0,0,0,.12); background:rgba(0,0,0,.04); }
.tag.base{ border-color:rgba(0,0,0,.25); background:rgba(0,0,0,.06); }

.scatterWrap{ border:1px solid rgba(0,0,0,.08); border-radius:14px; padding:8px; }
.svg{ width:100%; height:190px; }
.frame{ fill:none; stroke:rgba(0,0,0,.25); stroke-width:.6; }
.target{ stroke:rgba(239,68,68,.75); stroke-width:.8; stroke-dasharray:2 2; }
.pt{ fill:rgba(148,163,184,.70); }
.pt.ok{ fill:rgba(16,185,129,.80); }
.pt.bad{ fill:rgba(239,68,68,.80); }
.pt.base{ stroke:rgba(0,0,0,.65); stroke-width:.9; }
.pt.active{ stroke:rgba(37,99,235,.85); stroke-width:.9; }
.axisLabels{ margin-top:6px; display:flex; flex-direction:column; gap:2px; }
.xLab,.yLab{ font-size:11px; color:rgba(0,0,0,.6); }

.tableWrap{ overflow:hidden; border-radius:12px; border:1px solid rgba(0,0,0,.08); }
.tbl{ width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; }
.tbl th,.tbl td{ padding:9px 8px; border-bottom:1px solid rgba(0,0,0,.06); vertical-align:middle; font-size:12px; }
.tbl th{ background:rgba(0,0,0,.03); font-weight:950; text-align:left; cursor:pointer; user-select:none; }
.tbl th.num,.tbl td.num{ text-align:right; font-variant-numeric:tabular-nums; }
.tbl th.act,.tbl td.act{ text-align:center; width:165px; }
.sticky{ position:sticky; top:0; z-index:2; }
.srt{ margin-left:6px; font-size:10px; opacity:.7; }

.tTitle{ width:44%; }
.tMain{ display:flex; align-items:center; gap:6px; min-width:0; }
.tSub{ margin-top:2px; font-size:11px; color:rgba(0,0,0,.55); }

.badge{ padding:2px 8px; border-radius:999px; font-size:10px; font-weight:950; border:1px solid rgba(0,0,0,.12);
  background:rgba(0,0,0,.04); flex:0 0 auto; }
.badge.base{ border-color:rgba(0,0,0,.25); background:rgba(0,0,0,.06); }
.badge.act{ border-color:rgba(37,99,235,.35); background:rgba(37,99,235,.10); }

.ok,.no{ display:inline-flex; align-items:center; justify-content:center; padding:2px 10px; border-radius:999px; font-weight:950; font-size:11px; }
.ok{ background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.25); }
.no{ background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); }

tr.bad{ opacity:.88; }
tr.base{ background:rgba(0,0,0,.02); }

.note{ margin-top:8px; }
.actBtns{ display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }

/* ✅ TABLEAU PRINCIPAL: + titre, - EBIT% et Faisable */
.mainTbl .tTitle{ width: 50%; }
.mainTbl th:nth-child(5), .mainTbl td:nth-child(5){ width: 7%; }  /* EBIT% */
.mainTbl th:nth-child(8), .mainTbl td:nth-child(8){ width: 6%; }  /* Faisable */
.mainTbl th.act, .mainTbl td.act{ width: 165px; }

/* Delta */
.deltaSection{ display:flex; flex-direction:column; gap:10px; }
.deltaHeader{ border:1px solid rgba(0,0,0,.08); border-radius:14px; background:#fff; padding:10px 12px;
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
@media (max-width:900px){ .deltaHeader{ flex-direction:column; } }
.dhTitle{ font-size:13px; font-weight:950; }
.dhSub{ margin-top:2px; font-size:11.5px; color:rgba(0,0,0,.55); }

.baseKpis{ display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:8px; width:100%; }
@media (max-width:900px){ .baseKpis{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.chip{ border:1px solid rgba(0,0,0,.08); border-radius:12px; padding:8px 10px; background:rgba(0,0,0,.02); min-width:0; }
.chip .k{ font-size:11px; font-weight:950; color:rgba(0,0,0,.55); }
.chip .v{ margin-top:2px; font-size:12px; font-weight:950; font-variant-numeric: tabular-nums;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.deltaTbl .tTitle{ width: 38%; }
.deltaTbl th:nth-child(2), .deltaTbl td:nth-child(2){ width: 10%; }
.deltaTbl th:nth-child(3), .deltaTbl td:nth-child(3){ width: 12%; }
.deltaTbl th:nth-child(4), .deltaTbl td:nth-child(4){ width: 12%; }
.deltaTbl th:nth-child(5), .deltaTbl td:nth-child(5){ width: 8%; }
.deltaTbl th:nth-child(6), .deltaTbl td:nth-child(6){ width: 10%; }
.deltaTbl th:nth-child(7), .deltaTbl td:nth-child(7){ width: 10%; }
.deltaTbl th.act, .deltaTbl td.act{ width: 165px; }

.d2{ display:flex; flex-direction:column; align-items:flex-end; gap:2px; white-space:nowrap; }
.dMain{ font-weight:950; }
.dSub{ font-size:10.5px; color:rgba(0,0,0,.55); min-height:12px; }
.d2.pos{ color: rgba(16,185,129,.95); }
.d2.neg{ color: rgba(239,68,68,.95); }
.d2.neu{ color: rgba(0,0,0,.70); }
.muted{ color: rgba(0,0,0,.55); }
</style>