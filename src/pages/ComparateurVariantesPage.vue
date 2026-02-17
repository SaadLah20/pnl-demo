<!-- ✅ src/pages/ComparateurVariantesPage.vue (FICHIER COMPLET — CORRIGÉ SELON TES REMARQUES)
     - ✅ En haut: PLUS AUCUNE notion contrat/périmètre (pas de select contrat, pas de scope)
     - ✅ Graphes: PNL complet par défaut, filtre UNIQUEMENT via cartes contrats (cliquables)
     - ✅ Tableau: ajout filtre contrat SEULEMENT (UI compact, sans déformation)
     - ✅ Exclure EBIT=0 et/ou PMV=0 + bandeau compteur
     - ✅ Scatter: points petits + jitter léger
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";
import { contractUiTitle } from "@/services/contractTitle";

import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChartBarIcon,
  Squares2X2Icon,
  AdjustmentsHorizontalIcon,
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
    if ((store as any).pnls?.length === 0 && (store as any).loadPnls) await (store as any).loadPnls();
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

type Row = {
  id: string;
  variantTitle: string;
  contractTitle: string;
  contractId: string;
  dureeMois: number;
  pmv: number;
  ebit: number;
  ebitPct: number;
  feasible: boolean;
  valid: boolean;
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
  bestCompromisePmv: number | null;
};

/* =========================
   UI STATE
========================= */
const ui = reactive({
  // cible faisabilité
  ebitTargetMode: "total" as "total" | "pct",
  ebitTargetTotal: 0 as number,
  ebitTargetPct: 0 as number,
  onlyFeasible: false,

  // affichage
  showGraphs: true,
  contractsOpen: true,
  globalOpen: true,

  // ✅ filtre des graphes par cartes ("" = PNL complet)
  graphsContractId: "" as string,

  // ✅ filtre tableau (SEULEMENT contrat)
  tableContractId: "" as string,

  // tri
  sortKey: "ebit" as keyof Row | "variantTitle" | "dureeMois" | "pmv" | "ebitPct" | "feasible",
  sortDir: "desc" as "asc" | "desc",
});

/* =========================
   DERIVED: active
========================= */
const activePnl = computed(() => (store as any).activePnl ?? null);
const activeContract = computed(() => (store as any).activeContract ?? null);
const activeVariantId = computed(() => (store as any).activeVariantId ?? null);

function initDefaults() {
  // Graphes = PNL complet par défaut
  ui.graphsContractId = "";
  // Tableau = tous par défaut
  ui.tableContractId = "";
}

watch(
  () => String(activePnl.value?.id ?? ""),
  () => initDefaults()
);

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtNumber(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function fmtMoney(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
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
function bestBy(list: Row[], better: (a: Row, b: Row) => boolean): Row | null {
  let best: Row | null = null;
  for (const r of list) if (!best || better(r, best)) best = r;
  return best;
}

/** jitter déterministe (évite superposition dans scatter) */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/* =========================
   SOURCE PACKS (PNL complet)
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
   KPI CACHE (ALL PNL)
========================= */
const kpisByVariantIdAll = computed(() => {
  const out = new Map<string, any>();
  for (const pack of allPacks.value) {
    const vid = String(pack.variant.id);
    const dureeMois = toNum(pack.contract?.dureeMois ?? 0);
    out.set(vid, computeHeaderKpis(pack.variant, dureeMois, null));
  }
  return out;
});
function getKpi(variantId: string) {
  return kpisByVariantIdAll.value.get(String(variantId));
}

/* =========================
   TARGET / FEASIBILITY
========================= */
const ebitMinTotal = computed(() => Math.max(0, toNum(ui.ebitTargetTotal)));
const ebitMinPct = computed(() => Math.max(0, toNum(ui.ebitTargetPct)));

function isFeasible(ebitTotal: number, ebitPct: number): boolean {
  if (!(ebitTotal >= 0)) return false;
  if (ui.ebitTargetMode === "pct") return ebitPct >= ebitMinPct.value;
  return ebitTotal >= ebitMinTotal.value;
}

/* =========================
   ROWS (PNL complet)
========================= */
const rowsAllRawAll = computed<Row[]>(() => {
  return allPacks.value.map((pack) => {
    const vid = String(pack.variant.id);
    const k = getKpi(vid);

    const pmv = toNum(k?.prixMoyenM3);
    const ebit = toNum(k?.ebitTotal);
    const ebitPct = toNum(k?.ebitPct);

    const valid = pmv !== 0 && ebit !== 0; // ✅ règle demandée
    const feasible = valid ? isFeasible(ebit, ebitPct) : false;

    return {
      id: vid,
      variantTitle: vTitle(pack.variant),
      contractTitle: cTitle(pack.contract),
      contractId: String(pack.contract?.id ?? ""),
      dureeMois: toNum(pack.contract?.dureeMois ?? 0),
      pmv,
      ebit,
      ebitPct,
      feasible,
      valid,
    };
  });
});

/* ✅ Comparatif = uniquement valides */
const rowsAllRaw = computed<Row[]>(() => rowsAllRawAll.value.filter((r) => r.valid));
const invalidCount = computed(() => rowsAllRawAll.value.filter((r) => !r.valid).length);
const feasibleCount = computed(() => rowsAllRaw.value.filter((r) => r.feasible).length);

/* =========================
   FILTERS (GLOBAL)
========================= */
const rowsFiltered = computed<Row[]>(() => {
  const only = !!ui.onlyFeasible;
  return rowsAllRaw.value.filter((r) => {
    if (only && !r.feasible) return false;
    return true;
  });
});

/* =========================
   TABLE FILTER (ONLY contract)
========================= */
const rowsTableFiltered = computed<Row[]>(() => {
  const cid = String(ui.tableContractId || "");
  return rowsFiltered.value.filter((r) => {
    if (cid && r.contractId !== cid) return false;
    return true;
  });
});

/* =========================
   SORT
========================= */
function sortValue(r: Row, k: typeof ui.sortKey) {
  switch (k) {
    case "variantTitle":
      return r.variantTitle;
    default:
      return (r as any)[k];
  }
}
const rowsTable = computed<Row[]>(() => {
  const key = ui.sortKey;
  const dir = ui.sortDir;
  const arr = [...rowsTableFiltered.value];
  arr.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    const mul = dir === "asc" ? 1 : -1;
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
    return (toNum(av) - toNum(bv)) * mul;
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
   MAX/MIN/BEST (valide)
========================= */
const maxEbitRow = computed<Row | null>(() => bestBy(rowsFiltered.value, (a, b) => a.ebit > b.ebit));
const minPmvRow = computed<Row | null>(() => bestBy(rowsFiltered.value, (a, b) => a.pmv < b.pmv));

const bestCompromise = computed<null | { row: Row; ok: boolean; reason: string }>(() => {
  const feas = rowsFiltered.value.filter((r) => r.feasible);
  const bestFeasible = bestBy(feas, (a, b) => a.pmv < b.pmv);
  if (bestFeasible) return { row: bestFeasible, ok: true, reason: "PMV minimal parmi variantes faisables" };

  const fallback = maxEbitRow.value;
  if (fallback) return { row: fallback, ok: false, reason: "Aucune variante ne respecte la cible (fallback = Max EBIT)" };

  return null;
});

/* =========================
   CONTRACTS SUMMARY (cards)
========================= */
const contractSummaries = computed<ContractSummary[]>(() => {
  const pnl = activePnl.value;
  if (!pnl) return [];

  const out: ContractSummary[] = [];
  for (const c of pnl.contracts ?? []) {
    const cid = String(c.id);
    const packs = allPacks.value.filter((p) => String(p.contract?.id ?? "") === cid);

    const rowsAll: Row[] = packs.map((p) => {
      const vid = String(p.variant.id);
      const k = getKpi(vid);
      const pmv = toNum(k?.prixMoyenM3);
      const ebit = toNum(k?.ebitTotal);
      const ebitPct = toNum(k?.ebitPct);
      const valid = pmv !== 0 && ebit !== 0;
      const feasible = valid ? isFeasible(ebit, ebitPct) : false;

      return {
        id: vid,
        variantTitle: vTitle(p.variant),
        contractTitle: cTitle(c),
        contractId: cid,
        dureeMois: toNum(c?.dureeMois ?? 0),
        pmv,
        ebit,
        ebitPct,
        feasible,
        valid,
      };
    });

    const invalid = rowsAll.filter((r) => !r.valid).length;
    const rows = rowsAll.filter((r) => r.valid);

    const maxE = bestBy(rows, (a, b) => a.ebit > b.ebit);
    const minP = bestBy(rows, (a, b) => a.pmv < b.pmv);
    const bestC = bestBy(rows.filter((r) => r.feasible), (a, b) => a.pmv < b.pmv);

    out.push({
      contractId: cid,
      contractTitle: cTitle(c),
      dureeMois: toNum(c?.dureeMois ?? 0),
      variantsCount: rowsAll.length,
      validCount: rows.length,
      invalidCount: invalid,
      maxEbit: maxE ? maxE.ebit : null,
      minPmv: minP ? minP.pmv : null,
      bestCompromisePmv: bestC ? bestC.pmv : null,
    });
  }

  out.sort((a, b) => toNum(b.maxEbit) - toNum(a.maxEbit));
  return out;
});

const bestContract = computed(() => (contractSummaries.value.length ? contractSummaries.value[0] : null));

/* =========================
   GRAPHS FILTER (via cards)
========================= */
const packsForGraphs = computed<VariantPack[]>(() => {
  const cid = String(ui.graphsContractId || "");
  if (!cid) return allPacks.value; // ✅ PNL complet
  return allPacks.value.filter((p) => String(p.contract?.id ?? "") === cid);
});

const rowsGraphsRawAll = computed<Row[]>(() => {
  return packsForGraphs.value.map((pack) => {
    const vid = String(pack.variant.id);
    const k = getKpi(vid);

    const pmv = toNum(k?.prixMoyenM3);
    const ebit = toNum(k?.ebitTotal);
    const ebitPct = toNum(k?.ebitPct);

    const valid = pmv !== 0 && ebit !== 0;
    const feasible = valid ? isFeasible(ebit, ebitPct) : false;

    return {
      id: vid,
      variantTitle: vTitle(pack.variant),
      contractTitle: cTitle(pack.contract),
      contractId: String(pack.contract?.id ?? ""),
      dureeMois: toNum(pack.contract?.dureeMois ?? 0),
      pmv,
      ebit,
      ebitPct,
      feasible,
      valid,
    };
  });
});
const rowsGraphs = computed<Row[]>(() => rowsGraphsRawAll.value.filter((r) => r.valid));

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

/* ✅ sélection cartes contrats pour filtrer graphes */
function setGraphsFilter(cid: string) {
  ui.graphsContractId = String(cid || "");
}

/* =========================
   GRAPHS (SVG)
========================= */
const graphData = computed(() => {
  const rows = rowsGraphs.value;
  const maxE = safeMax(rows.map((r) => r.ebit));
  const minE = safeMin(rows.map((r) => r.ebit));
  const minP = safeMin(rows.map((r) => r.pmv));
  const maxP = safeMax(rows.map((r) => r.pmv));

  const spanE = maxE - minE || 1;
  const spanP = maxP - minP || 1;

  const bars = [...rows]
    .sort((a, b) => b.ebit - a.ebit)
    .slice(0, 8)
    .map((r) => ({
      ...r,
      eN: clamp((r.ebit - minE) / spanE, 0, 1),
      pN: clamp((r.pmv - minP) / spanP, 0, 1),
    }));

  return { minE, maxE, minP, maxP, bars };
});

const scatter = computed(() => {
  const rows = rowsGraphs.value;
  const minE = graphData.value.minE;
  const maxE = graphData.value.maxE;
  const minP = graphData.value.minP;
  const maxP = graphData.value.maxP;

  const spanE = maxE - minE || 1;
  const spanP = maxP - minP || 1;

  const targetTotal = ebitMinTotal.value;

  const pts = rows.map((r) => {
    const x0 = clamp((r.pmv - minP) / spanP, 0, 1);
    const y0 = clamp((r.ebit - minE) / spanE, 0, 1);

    const h = hash01(r.id);
    const jx = (h - 0.5) * 0.010;
    const jy = (hash01(r.id + "y") - 0.5) * 0.010;

    const x = clamp(x0 + jx, 0, 1);
    const y = clamp(y0 + jy, 0, 1);

    const isTargetOk = r.feasible;
    const isActive = activeVariantId.value ? String(activeVariantId.value) === r.id : false;

    return { ...r, x, y, isTargetOk, isActive };
  });

  const yTarget =
    ui.ebitTargetMode === "pct"
      ? null
      : clamp((targetTotal - minE) / spanE, 0, 1);

  return { pts, yTarget };
});
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
          Variantes (valides): <b>{{ rowsAllRaw.length }}</b>
          <span class="sep">•</span>
          Faisables: <b>{{ feasibleCount }}</b>
          <span class="sep">•</span>
          Tableau: <b>{{ rowsTable.length }}</b>
        </div>
      </div>

      <div class="hRight">
        <button class="btn ghost" type="button" @click="reload" :disabled="loading" title="Rafraîchir">
          <ArrowPathIcon class="ic" />
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error">
      <ExclamationTriangleIcon class="aic" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-if="loading" class="alert info">Chargement…</div>

    <!-- INFO exclusions -->
    <div v-if="invalidCount > 0" class="alert warn">
      <ExclamationTriangleIcon class="aic" />
      <div class="min0">
        <b>{{ invalidCount }}</b> variante(s) ont <b>EBIT</b> et/ou <b>PMV</b> <b>nul</b> (0) :
        elles sont <b>exclues</b> du comparatif (table + graphes).
      </div>
    </div>

    <!-- CONTROLS (AUCUN contrat ici) -->
    <div class="controls">
      <div class="ctlRow">
        <div class="ctlGroup">
          <div class="ctlLabel">Cible EBIT</div>

          <div class="targetWrap">
            <div class="targetMode">
              <button class="pillTinyBtn" :class="{ on: ui.ebitTargetMode === 'total' }" type="button" @click="ui.ebitTargetMode = 'total'">
                Total (DH)
              </button>
              <button class="pillTinyBtn" :class="{ on: ui.ebitTargetMode === 'pct' }" type="button" @click="ui.ebitTargetMode = 'pct'">
                %
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

            <div class="ctlHint">
              Faisable si <b>EBIT ≥ 0</b> et
              <b v-if="ui.ebitTargetMode === 'total'">EBIT total ≥ cible</b>
              <b v-else>EBIT % ≥ cible</b>.
            </div>
          </div>
        </div>

        <div class="ctlGroup">
          <div class="ctlLabel">Options</div>
          <label class="check">
            <input type="checkbox" v-model="ui.onlyFeasible" />
            <span>Afficher seulement faisables</span>
          </label>
          <label class="check" style="margin-top: 6px">
            <input type="checkbox" v-model="ui.showGraphs" />
            <span>Afficher graphes</span>
          </label>
        </div>
      </div>
    </div>

    <!-- CONTRACTS CARDS (filtre graphes via clic) -->
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
          <span class="mutedSmall">
            • filtre graphes: <b>{{ ui.graphsContractId ? "contrat" : "PNL complet" }}</b>
          </span>
        </div>
        <div class="bhRight"><span class="mutedSmall">Clique un bloc pour filtrer les graphes</span></div>
      </button>

      <div v-show="ui.contractsOpen" class="boxBody">
        <div class="contracts">
          <!-- ✅ reset graphs filter -->
          <button
            class="cCard reset"
            type="button"
            :class="{ on: !ui.graphsContractId }"
            @click="setGraphsFilter('')"
          >
            <div class="cTop">
              <div class="cName">PNL complet</div>
              <div class="cMeta">Toutes variantes valides</div>
            </div>
            <div class="cHint">→ Afficher tous les contrats</div>
          </button>

          <!-- ✅ contract cards clickable -->
          <button
            v-for="c in contractSummaries"
            :key="c.contractId"
            class="cCard"
            type="button"
            :class="{ on: ui.graphsContractId === c.contractId }"
            @click="setGraphsFilter(c.contractId)"
          >
            <div class="cTop">
              <div class="cName ellipsis" :title="c.contractTitle">{{ c.contractTitle }}</div>
              <div class="cMeta">
                {{ c.dureeMois }} mois • {{ c.validCount }}/{{ c.variantsCount }} valides
                <span v-if="c.invalidCount > 0" class="cInv">• {{ c.invalidCount }} exclue(s)</span>
              </div>
            </div>

            <div class="cLines">
              <div class="cLine">
                <div class="k">Max EBIT</div>
                <div class="v" v-if="c.maxEbit != null">{{ fmtMoney(c.maxEbit, 0) }}</div>
                <div class="v muted" v-else>—</div>
              </div>
              <div class="cLine">
                <div class="k">Min PMV</div>
                <div class="v" v-if="c.minPmv != null">{{ fmtMoney(c.minPmv, 2) }}</div>
                <div class="v muted" v-else>—</div>
              </div>
              <div class="cLine">
                <div class="k">Compromis</div>
                <div class="v" v-if="c.bestCompromisePmv != null">{{ fmtMoney(c.bestCompromisePmv, 2) }}</div>
                <div class="v muted" v-else>—</div>
              </div>
            </div>

            <div class="cHint">→ Filtrer les graphes sur ce contrat</div>
          </button>
        </div>
      </div>
    </div>

    <!-- GRAPHS -->
    <div v-if="ui.showGraphs" class="grid2">
      <div class="gCard">
        <div class="gHead">
          <div class="gTitle"><ChartBarIcon class="gIc" /> Top EBIT (8)</div>
          <div class="gSub">
            <span v-if="!ui.graphsContractId">PNL complet</span>
            <span v-else>Contrat filtré</span>
            • Barres (EBIT) + indicateur PMV
          </div>
        </div>

        <div class="bars" v-if="graphData.bars.length">
          <div v-for="b in graphData.bars" :key="b.id" class="barRow">
            <div class="bLab ellipsis" :title="b.variantTitle">{{ b.variantTitle }}</div>
            <div class="bTrack" :title="`EBIT ${fmtMoney(b.ebit,0)} • PMV ${fmtMoney(b.pmv,2)}`">
              <div class="bFill" :style="{ width: (b.eN * 100).toFixed(1) + '%' }"></div>
              <div class="bDot" :style="{ left: (b.pN * 100).toFixed(1) + '%' }" title="PMV (position relative)"></div>
            </div>
            <div class="bVal">{{ fmtMoney(b.ebit, 0) }}</div>
          </div>
        </div>
        <div v-else class="muted">Aucune donnée.</div>
      </div>

      <div class="gCard">
        <div class="gHead">
          <div class="gTitle"><AdjustmentsHorizontalIcon class="gIc" /> PMV vs EBIT</div>
          <div class="gSub">
            Scatter: X=PMV, Y=EBIT •
            <span v-if="ui.ebitTargetMode === 'total'">ligne = cible EBIT (DH)</span>
            <span v-else>cible = EBIT % (filtre)</span>
            <span class="sep">•</span>
            points: <b>{{ rowsGraphs.length }}</b>
          </div>
        </div>

        <div class="scatterWrap">
          <svg class="svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="10" y1="90" x2="90" y2="90" class="axis" />
            <line x1="10" y1="10" x2="10" y2="90" class="axis" />
            <line
              v-if="scatter.yTarget != null"
              x1="10"
              :y1="(90 - scatter.yTarget * 80)"
              x2="90"
              :y2="(90 - scatter.yTarget * 80)"
              class="target"
            />

            <g v-for="p in scatter.pts" :key="p.id">
              <circle
                :cx="10 + p.x * 80"
                :cy="90 - p.y * 80"
                r="1.25"
                class="pt"
                :class="{ ok: p.isTargetOk, bad: !p.isTargetOk, active: p.isActive }"
              >
                <title>
                  {{ p.variantTitle }} • PMV {{ fmtMoney(p.pmv,2) }} • EBIT {{ fmtMoney(p.ebit,0) }} • EBIT% {{ fmtPct(p.ebitPct,1) }}
                </title>
              </circle>
            </g>
          </svg>

          <div class="legend">
            <span class="lg ok">●</span> faisable
            <span class="sep">•</span>
            <span class="lg bad">●</span> non faisable
            <span class="sep">•</span>
            <span class="lg active">◎</span> active
          </div>
        </div>
      </div>
    </div>

    <!-- GLOBAL TABLE -->
    <div class="box">
      <button class="boxHead" type="button" @click="ui.globalOpen = !ui.globalOpen">
        <div class="bhLeft">
          <component :is="ui.globalOpen ? ChevronDownIcon : ChevronRightIcon" class="chev" />
          <ChartBarIcon class="bhIc" />
          <div class="bhTitle">Tableau global des variantes</div>
          <span class="pillTiny">{{ rowsTable.length }}</span>
          <span class="mutedSmall">• tri • sans valeurs nulles</span>
        </div>
      </button>

      <div v-show="ui.globalOpen" class="boxBody">
        <!-- ✅ TABLE FILTER (ONLY contract) -->
        <div class="tableFilter">
          <div class="tfLeft">
            <div class="tfLabel">Filtre (tableau)</div>
            <select v-model="ui.tableContractId" class="sel">
              <option value="">Tous les contrats</option>
              <option v-for="c in contractSummaries" :key="c.contractId" :value="c.contractId">
                {{ c.contractTitle }}
              </option>
            </select>
          </div>

          <div class="tfRight">
            <button class="btn small" type="button" @click="ui.tableContractId = ''" :disabled="!ui.tableContractId">
              Réinitialiser
            </button>
          </div>
        </div>

        <div class="tableWrap">
          <table class="tbl">
            <thead>
              <tr>
                <th class="sticky" @click="setSort('variantTitle')">
                  Variante
                  <span class="srt" v-if="ui.sortKey === 'variantTitle'">{{ ui.sortDir === 'asc' ? "▲" : "▼" }}</span>
                </th>

                <th class="num sticky" @click="setSort('dureeMois')">
                  Durée
                  <span class="srt" v-if="ui.sortKey === 'dureeMois'">{{ ui.sortDir === 'asc' ? "▲" : "▼" }}</span>
                </th>

                <th class="num sticky" @click="setSort('pmv')">
                  PMV
                  <span class="srt" v-if="ui.sortKey === 'pmv'">{{ ui.sortDir === 'asc' ? "▲" : "▼" }}</span>
                </th>

                <th class="num sticky" @click="setSort('ebit')">
                  EBIT
                  <span class="srt" v-if="ui.sortKey === 'ebit'">{{ ui.sortDir === 'asc' ? "▲" : "▼" }}</span>
                </th>

                <th class="num sticky" @click="setSort('ebitPct')">
                  EBIT %
                  <span class="srt" v-if="ui.sortKey === 'ebitPct'">{{ ui.sortDir === 'asc' ? "▲" : "▼" }}</span>
                </th>

                <th class="sticky" @click="setSort('feasible')">
                  Faisable
                  <span class="srt" v-if="ui.sortKey === 'feasible'">{{ ui.sortDir === 'asc' ? "▲" : "▼" }}</span>
                </th>

                <th class="sticky act">Action</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="r in rowsTable"
                :key="r.id"
                :class="{
                  best: bestCompromise?.row && r.id === bestCompromise.row.id,
                  max: maxEbitRow && r.id === maxEbitRow.id,
                  min: minPmvRow && r.id === minPmvRow.id,
                  bad: !r.feasible,
                }"
              >
                <td class="tTitle">
                  <div class="tMain">
                    <span class="ellipsis" :title="r.variantTitle">{{ r.variantTitle }}</span>
                    <span v-if="bestCompromise?.row && r.id === bestCompromise.row.id" class="badge rec">Compromis</span>
                    <span v-if="maxEbitRow && r.id === maxEbitRow.id" class="badge max">Max EBIT</span>
                    <span v-if="minPmvRow && r.id === minPmvRow.id" class="badge min">Min PMV</span>
                    <span v-if="String(activeVariantId ?? '') === r.id" class="badge act">Active</span>
                  </div>
                  <div class="tSub ellipsis" :title="`Contrat: ${r.contractTitle}`">
                    {{ r.contractTitle }} • {{ r.dureeMois }} mois
                  </div>
                </td>

                <td class="num">{{ r.dureeMois }}</td>
                <td class="num">{{ fmtMoney(r.pmv, 2) }}</td>
                <td class="num">{{ fmtMoney(r.ebit, 0) }}</td>
                <td class="num">{{ fmtPct(r.ebitPct, 1) }}</td>

                <td>
                  <span class="ok" v-if="r.feasible">OK</span>
                  <span class="no" v-else>NON</span>
                </td>

                <td class="act">
                  <button class="btn small" type="button" @click="activateVariant(r.id)">Activer</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="note">
          <div class="mutedSmall">
            Règle: faisable si <b>EBIT ≥ 0</b> et
            <b v-if="ui.ebitTargetMode === 'total'">EBIT total ≥ cible (DH)</b>
            <b v-else>EBIT % ≥ cible</b>.
            <span class="sep">•</span>
            Compromis = <b>PMV minimal</b> parmi faisables.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================
   LAYOUT
========================= */
.page { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hLeft { min-width: 0; }
.hTitle { font-size: 16px; font-weight: 900; letter-spacing: 0.1px; }
.hSub { margin-top: 2px; font-size: 12px; color: rgba(0, 0, 0, 0.6); }
.sep { margin: 0 6px; color: rgba(0, 0, 0, 0.35); }
.min0 { min-width: 0; }

/* =========================
   BUTTONS
========================= */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 10px; border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff; cursor: pointer; font-size: 12px;
}
.btn.ghost { padding: 8px; }
.btn.small { padding: 6px 8px; border-radius: 9px; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ic { width: 18px; height: 18px; }

/* =========================
   ALERTS
========================= */
.alert { padding: 10px 12px; border-radius: 12px; font-size: 12px; display: flex; align-items: flex-start; gap: 10px; }
.alert.info { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); }
.alert.error { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); }
.alert.warn { background: rgba(245, 158, 11, 0.10); border: 1px solid rgba(245, 158, 11, 0.25); }
.aic { width: 18px; height: 18px; margin-top: 1px; }

/* =========================
   CONTROLS (NO contract here)
========================= */
.controls {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  padding: 10px;
}
.ctlRow {
  display: grid;
  grid-template-columns: 1.2fr 260px;
  gap: 10px;
  align-items: start;
}
@media (max-width: 900px) { .ctlRow { grid-template-columns: 1fr; } }
.ctlGroup { min-width: 0; }
.ctlLabel { font-size: 11px; font-weight: 800; color: rgba(0, 0, 0, 0.72); margin-bottom: 6px; }
.ctlHint { margin-top: 6px; font-size: 11px; color: rgba(0, 0, 0, 0.55); }
.check { display: flex; gap: 8px; align-items: center; font-size: 12px; }

.targetWrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.targetMode { display: flex; gap: 8px; flex-wrap: wrap; }
.pillTinyBtn {
  padding: 5px 10px; border-radius: 999px;
  border: 1px solid rgba(0,0,0,0.12);
  background: rgba(0,0,0,0.03);
  cursor: pointer; font-size: 11px; font-weight: 800;
}
.pillTinyBtn.on { border-color: rgba(37, 99, 235, 0.55); background: rgba(37, 99, 235, 0.10); }

.sel, .num {
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  min-width: 0;
}

/* =========================
   BOXES
========================= */
.box { border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 14px; overflow: hidden; background: #fff; }
.boxHead { width: 100%; border: none; background: rgba(0, 0, 0, 0.02); padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
.bhLeft { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
.bhRight { font-size: 11px; color: rgba(0, 0, 0, 0.55); }
.chev { width: 18px; height: 18px; opacity: 0.8; }
.bhIc { width: 18px; height: 18px; opacity: 0.85; }
.bhTitle { font-size: 13px; font-weight: 950; }
.pillTiny { padding: 2px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.06); font-size: 11px; font-weight: 900; }
.boxBody { padding: 10px 12px; }
.mutedSmall { font-size: 11px; color: rgba(0, 0, 0, 0.55); }

/* =========================
   CONTRACTS CARDS (clickable)
========================= */
.contracts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 1200px) { .contracts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .contracts { grid-template-columns: 1fr; } }

.cCard {
  text-align: left;
  border: 1px solid rgba(0, 0, 0, 0.10);
  background: #fff;
  border-radius: 14px;
  padding: 10px;
  cursor: pointer;
  min-width: 0;
}
.cCard:hover { border-color: rgba(37, 99, 235, 0.35); background: rgba(37, 99, 235, 0.04); }
.cCard.on { border-color: rgba(37, 99, 235, 0.55); background: rgba(37, 99, 235, 0.08); }
.cCard.reset { border-style: dashed; }
.cCard.reset.on { border-style: solid; }

.cTop { min-width: 0; }
.cName { font-size: 12px; font-weight: 950; }
.cMeta { margin-top: 2px; font-size: 11px; color: rgba(0, 0, 0, 0.55); }
.cInv { color: rgba(245, 158, 11, 0.95); font-weight: 800; }
.cLines { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.cLine { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cLine .k { font-size: 11px; font-weight: 850; color: rgba(0,0,0,0.60); }
.cLine .v { font-size: 12px; font-weight: 950; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cHint { margin-top: 10px; font-size: 11px; color: rgba(37, 99, 235, 0.95); font-weight: 900; }

/* =========================
   GRAPHS
========================= */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 1100px) { .grid2 { grid-template-columns: 1fr; } }

.gCard { border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 14px; background: #fff; padding: 10px; }
.gHead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; min-width:0; }
.gTitle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 950; }
.gSub { font-size: 11px; color: rgba(0, 0, 0, 0.55); }
.gIc { width: 18px; height: 18px; opacity: 0.85; }

.bars { display: flex; flex-direction: column; gap: 8px; }
.barRow { display: grid; grid-template-columns: 1fr 220px 110px; gap: 10px; align-items: center; min-width: 0; }
@media (max-width: 700px) { .barRow { grid-template-columns: 1fr; } }
.bLab { font-size: 12px; font-weight: 850; min-width: 0; }
.bTrack { position: relative; height: 10px; border-radius: 999px; background: rgba(0, 0, 0, 0.06); overflow: hidden; }
.bFill { height: 100%; background: rgba(37, 99, 235, 0.45); }
.bDot { position: absolute; top: -2px; width: 6px; height: 14px; border-radius: 999px; background: rgba(16, 185, 129, 0.8); transform: translateX(-50%); }
.bVal { text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 950; }

.scatterWrap { border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 14px; padding: 8px; }
.svg { width: 100%; height: 180px; }
.axis { stroke: rgba(0, 0, 0, 0.25); stroke-width: 0.6; }
.target { stroke: rgba(239, 68, 68, 0.75); stroke-width: 0.8; stroke-dasharray: 2 2; }
.pt { fill: rgba(148, 163, 184, 0.70); }
.pt.ok { fill: rgba(16, 185, 129, 0.80); }
.pt.bad { fill: rgba(239, 68, 68, 0.80); }
.pt.active { stroke: rgba(0, 0, 0, 0.55); stroke-width: 0.7; }
.legend { margin-top: 8px; font-size: 11px; color: rgba(0, 0, 0, 0.6); }
.lg.ok { color: rgba(16, 185, 129, 0.95); }
.lg.bad { color: rgba(239, 68, 68, 0.95); }
.lg.active { color: rgba(0, 0, 0, 0.7); }

/* =========================
   TABLE FILTER (compact)
========================= */
.tableFilter{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap: 10px;
  margin-bottom: 10px;
  min-width:0;
}
.tfLeft{ min-width:0; flex: 1; }
.tfRight{ flex: 0 0 auto; }
.tfLabel{ font-size: 11px; font-weight: 800; color: rgba(0,0,0,0.72); margin-bottom: 6px; }
@media (max-width: 700px){
  .tableFilter{ flex-direction: column; align-items: stretch; }
  .tfRight .btn{ width: 100%; }
}

/* =========================
   TABLE (no scroll horizontal)
========================= */
.tableWrap { overflow: hidden; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.08); }
.tbl {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.tbl th, .tbl td {
  padding: 9px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  vertical-align: middle;
  font-size: 12px;
}
.tbl th {
  background: rgba(0, 0, 0, 0.03);
  font-weight: 950;
  text-align: left;
  cursor: pointer;
  user-select: none;
}
.tbl th.num, .tbl td.num { text-align: right; font-variant-numeric: tabular-nums; }
.tbl th.act, .tbl td.act { text-align: center; width: 88px; }

.sticky { position: sticky; top: 0; z-index: 2; }
.srt { margin-left: 6px; font-size: 10px; opacity: 0.7; }

.tTitle { width: 48%; }
.tbl th:nth-child(2), .tbl td:nth-child(2) { width: 8%; }
.tbl th:nth-child(3), .tbl td:nth-child(3) { width: 13%; }
.tbl th:nth-child(4), .tbl td:nth-child(4) { width: 13%; }
.tbl th:nth-child(5), .tbl td:nth-child(5) { width: 10%; }
.tbl th:nth-child(6), .tbl td:nth-child(6) { width: 8%; }

.tMain { display: flex; align-items: center; gap: 6px; min-width: 0; }
.tSub { margin-top: 2px; font-size: 11px; color: rgba(0, 0, 0, 0.55); }

.badge {
  padding: 2px 8px; border-radius: 999px;
  font-size: 10px; font-weight: 950;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.04);
  flex: 0 0 auto;
}
.badge.rec { border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08); }
.badge.max { border-color: rgba(37, 99, 235, 0.4); background: rgba(37, 99, 235, 0.08); }
.badge.min { border-color: rgba(245, 158, 11, 0.45); background: rgba(245, 158, 11, 0.10); }
.badge.act { border-color: rgba(0, 0, 0, 0.25); background: rgba(0, 0, 0, 0.06); }

.ok, .no {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 10px; border-radius: 999px;
  font-weight: 950; font-size: 11px;
}
.ok { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); }
.no { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); }

tr.best { background: rgba(16, 185, 129, 0.06); }
tr.max { outline: 1px solid rgba(37, 99, 235, 0.20); }
tr.min { outline: 1px solid rgba(245, 158, 11, 0.20); }
tr.bad { opacity: 0.88; }

.note { margin-top: 8px; }
.muted { color: rgba(0, 0, 0, 0.55); }
.ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
