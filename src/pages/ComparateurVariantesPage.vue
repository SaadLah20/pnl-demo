<!-- ✅ src/pages/ComparateurVariantesPage.vue (FICHIER COMPLET / VERSION COMPACTE + Résumé pliable + Variante optimale) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

// Heroicons
import {
  ArrowsRightLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon,
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

    if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
    seedSelection();
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

type Metric = {
  key: string;
  label: string;
  unitHint?: string;
  group: "Essentiel" | "Avancé";
  better?: "higher" | "lower";
  get: (k: any, pack: VariantPack) => number | null;
  format: (v: number | null) => string;
};

type TableCell = {
  value: number | null;
  text: string;
  cls: string;
  deltaText: string;
  deltaCls: string;
};

type TableRow = {
  metric: Metric;
  cells: TableCell[];
};

/* =========================
   UI (compact + less scroll)
========================= */
const ui = reactive({
  capMax: 4,
  showDelta: true,
  baselineMode: "first" as "first" | "active",

  // compact panels
  showSelection: true,
  showSummary: true,

  // quick tools
  q: "",
  metricGroup: "Essentiel" as "Essentiel" | "Avancé" | "Tout",
});

/* =========================
   DATA / SOURCE
========================= */
const activePnl = computed(() => (store as any).activePnl ?? null);
const activeVariantId = computed(() => (store as any).activeVariantId ?? null);

const allVariants = computed<VariantPack[]>(() => {
  const pnl = activePnl.value;
  if (!pnl) return [];
  const out: VariantPack[] = [];
  for (const c of pnl.contracts ?? []) for (const v of c.variants ?? []) out.push({ variant: v, contract: c, pnl });
  return out;
});

function vTitle(v: any) {
  return String(v?.title ?? v?.name ?? v?.id ?? "Variante");
}
function cTitle(c: any) {
  const client = c?.client ?? c?.clientName ?? null;
  const name = c?.title ?? c?.name ?? null;
  const bits = [client, name].filter(Boolean);
  return bits.length ? bits.join(" — ") : "Contrat";
}
function n(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function fmtNumber(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n(v));
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

/* =========================
   SELECTION
========================= */
const selectedIds = ref<string[]>([]);

function seedSelection() {
  const ids = allVariants.value.map((x) => String(x.variant.id));
  const a = activeVariantId.value ? String(activeVariantId.value) : null;

  if (a && ids.includes(a)) {
    const other = ids.find((id) => id !== a) ?? null;
    selectedIds.value = other ? [a, other] : [a];
  } else {
    selectedIds.value = ids.slice(0, 2);
  }
}

function toggleSelect(id: string) {
  const sid = String(id);
  const idx = selectedIds.value.indexOf(sid);

  // remove
  if (idx >= 0) {
    if (selectedIds.value.length <= 1) return;
    selectedIds.value.splice(idx, 1);
    return;
  }

  // add
  if (selectedIds.value.length >= ui.capMax) return;
  selectedIds.value.push(sid);
}

function clearSelection() {
  seedSelection();
}

const filteredVariants = computed(() => {
  const q = ui.q.trim().toLowerCase();
  if (!q) return allVariants.value;
  return allVariants.value.filter((p) => {
    const s = `${vTitle(p.variant)} ${cTitle(p.contract)} ${p.contract?.dureeMois ?? ""}`.toLowerCase();
    return s.includes(q);
  });
});

const selectedPacks = computed<VariantPack[]>(() => {
  const byId = new Map(allVariants.value.map((x) => [String(x.variant.id), x]));
  return selectedIds.value.map((id) => byId.get(String(id))).filter(Boolean) as VariantPack[];
});

watch(
  () => allVariants.value.map((x) => x.variant?.id).join("|"),
  () => {
    const ids = new Set(allVariants.value.map((x) => String(x.variant.id)));
    selectedIds.value = selectedIds.value.filter((id) => ids.has(String(id)));
    if (selectedIds.value.length === 0) seedSelection();

    // ensure >=2 when possible
    if (selectedIds.value.length === 1) {
      const other =
        allVariants.value.map((x) => String(x.variant.id)).find((id) => id !== selectedIds.value[0]) ?? null;
      if (other) selectedIds.value.push(other);
    }
  }
);

/* =========================
   KPI COMPUTE
========================= */
const kpisById = computed(() => {
  const out = new Map<string, any>();
  for (const pack of selectedPacks.value) {
    const vid = String(pack.variant.id);
    const dureeMois = n(pack.contract?.dureeMois ?? 0);
    out.set(vid, computeHeaderKpis(pack.variant, dureeMois, null));
  }
  return out;
});

const baselineId = computed(() => {
  if (ui.baselineMode === "active" && activeVariantId.value) {
    const a = String(activeVariantId.value);
    if (selectedIds.value.includes(a)) return a;
  }
  return selectedIds.value[0] ? String(selectedIds.value[0]) : null;
});

const baselinePack = computed<VariantPack | null>(() => {
  const bid = baselineId.value;
  if (!bid) return null;
  return selectedPacks.value.find((x) => String(x.variant.id) === String(bid)) ?? null;
});

function deltaPct(val: number, base: number) {
  if (!Number.isFinite(val) || !Number.isFinite(base) || base === 0) return null;
  return ((val - base) / Math.abs(base)) * 100;
}
function deltaBadgeClass(dp: number | null) {
  if (dp == null) return "muted";
  if (dp > 0.0001) return "pos";
  if (dp < -0.0001) return "neg";
  return "muted";
}

function statusPillClass(status: string) {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("CLOT")) return "pill pill-green";
  if (s.includes("ANNU")) return "pill pill-red";
  if (s.includes("ENCO")) return "pill pill-blue";
  return "pill pill-gray";
}

/* =========================
   METRICS
========================= */
const allMetrics = computed<Metric[]>(() => [
  // Essentiel
  {
    key: "prixMoyenM3",
    label: "PV moyen",
    unitHint: "MAD/m³",
    group: "Essentiel",
    better: "higher",
    get: (k) => n(k?.prixMoyenM3),
    format: (v) => fmtMoney(v ?? 0, 2),
  },
  {
    key: "caTotal",
    label: "CA total",
    unitHint: "MAD",
    group: "Essentiel",
    better: "higher",
    get: (k) => n(k?.caTotal),
    format: (v) => fmtMoney(v ?? 0, 0),
  },
  {
    key: "caMensuel",
    label: "CA / mois",
    unitHint: "MAD/mois",
    group: "Essentiel",
    better: "higher",
    get: (k, p) => {
      const d = n(p.contract?.dureeMois ?? 0);
      return d > 0 ? n(k?.caTotal) / d : 0;
    },
    format: (v) => fmtMoney(v ?? 0, 0),
  },
  {
    key: "momdMoyenM3",
    label: "MOMD",
    unitHint: "MAD/m³",
    group: "Essentiel",
    better: "lower",
    get: (k) => n(k?.momdMoyenM3),
    format: (v) => fmtMoney(v ?? 0, 2),
  },
  {
    key: "coutMpMoyenM3",
    label: "CMP moyen",
    unitHint: "MAD/m³",
    group: "Essentiel",
    better: "lower",
    get: (k) => n(k?.coutMpMoyenM3),
    format: (v) => fmtMoney(v ?? 0, 2),
  },
  {
    key: "ebitTotal",
    label: "EBIT total",
    unitHint: "MAD",
    group: "Essentiel",
    better: "higher",
    get: (k) => n(k?.ebitTotal),
    format: (v) => fmtMoney(v ?? 0, 0),
  },
  {
    key: "ebitPct",
    label: "EBIT (%)",
    unitHint: "%",
    group: "Essentiel",
    better: "higher",
    get: (k) => n(k?.ebitPct),
    format: (v) => fmtPct(v ?? 0, 1),
  },

  // Avancé
  {
    key: "volumeTotalM3",
    label: "Volume total",
    unitHint: "m³",
    group: "Avancé",
    better: "higher",
    get: (k) => n(k?.volumeTotalM3),
    format: (v) => fmtNumber(v ?? 0, 1),
  },
  {
    key: "transportMoyenM3",
    label: "Transport",
    unitHint: "MAD/m³",
    group: "Avancé",
    better: "lower",
    get: (k) => n(k?.transportMoyenM3),
    format: (v) => fmtMoney(v ?? 0, 2),
  },
  {
    key: "margeBrutePct",
    label: "Marge brute",
    unitHint: "%",
    group: "Avancé",
    better: "higher",
    get: (k) => (k?.margeBrutePct == null ? null : n(k?.margeBrutePct)),
    format: (v) => (v == null ? "—" : fmtPct(v, 1)),
  },
  {
    key: "ebitdaTotal",
    label: "EBITDA total",
    unitHint: "MAD",
    group: "Avancé",
    better: "higher",
    get: (k) => n(k?.ebitdaTotal),
    format: (v) => fmtMoney(v ?? 0, 0),
  },
  {
    key: "fraisGenerauxPct",
    label: "Frais généraux",
    unitHint: "% CA",
    group: "Avancé",
    better: "lower",
    get: (k) => n(k?.fraisGenerauxPct),
    format: (v) => fmtPct(v ?? 0, 1),
  },
  {
    key: "amortissementMensuel",
    label: "Amortissement",
    unitHint: "MAD/mois",
    group: "Avancé",
    better: "lower",
    get: (k) => n(k?.amortissementMensuel),
    format: (v) => fmtMoney(v ?? 0, 0),
  },
]);

const metrics = computed(() => {
  if (ui.metricGroup === "Tout") return allMetrics.value;
  return allMetrics.value.filter((m) => m.group === ui.metricGroup);
});

/* =========================
   ✅ SAFE METRIC VALUE (never undefined)
========================= */
function getMetricValue(m: Metric, pack: VariantPack): number | null {
  const k = kpisById.value.get(String(pack.variant.id));
  const out = m.get(k, pack);
  if (out == null) return null; // null or undefined => null
  const x = Number(out);
  return Number.isFinite(x) ? x : null;
}

function bestWorstClass(metric: Metric, value: number | null, valuesAll: Array<number | null>) {
  if (value == null) return "";
  const vals = valuesAll.filter((x) => x != null) as number[];
  if (!vals.length) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const isBest = metric.better === "lower" ? value === min : value === max;
  const isWorst = metric.better === "lower" ? value === max : value === min;
  if (isBest && vals.length > 1) return "best";
  if (isWorst && vals.length > 1) return "worst";
  return "";
}

/* =========================
   TABLE ROWS (typed)
========================= */
const tableRows = computed<TableRow[]>(() => {
  const packs = selectedPacks.value;
  const bid = baselineId.value;
  const bp = baselinePack.value;

  return metrics.value.map((m) => {
    const values: Array<number | null> = packs.map((p) => getMetricValue(m, p));
    const baseVal: number | null = bid && bp ? getMetricValue(m, bp) : null;

    const cells: TableCell[] = packs.map((pack, idx) => {
      const val: number | null = values[idx] ?? null;
      const cls = bestWorstClass(m, val, values);

      let deltaText = "—";
      let deltaCls = "muted";

      if (ui.showDelta && bid && bp && String(pack.variant.id) !== String(bid)) {
        if (val != null && baseVal != null) {
          const dp = deltaPct(val, baseVal);
          deltaText = dp == null ? "—" : fmtPct(dp, 1);
          deltaCls = deltaBadgeClass(dp);
        }
      }

      return {
        value: val,
        text: m.format(val),
        cls,
        deltaText,
        deltaCls,
      };
    });

    return { metric: m, cells };
  });
});

/* =========================
   ✅ VARIANTE OPTIMALE (compromis PV bas + EBIT haut)
   Score = z(EBIT total) - z(PV moyen / m3)
========================= */
function safeZ(x: number, mean: number, sd: number) {
  if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) return 0;
  return (x - mean) / sd;
}

const optimal = computed(() => {
  const packs = selectedPacks.value;
  if (!packs.length) return null;

  const rows = packs.map((p) => {
    const k = kpisById.value.get(String(p.variant.id));
    const pv = n(k?.prixMoyenM3); // plus bas = mieux (client)
    const ebit = n(k?.ebitTotal); // plus haut = mieux (nous)
    return { pack: p, pv, ebit };
  });

  const pvVals = rows.map((r) => r.pv);
  const ebitVals = rows.map((r) => r.ebit);

  const pvMean = pvVals.reduce((a, b) => a + b, 0) / (pvVals.length || 1);
  const ebitMean = ebitVals.reduce((a, b) => a + b, 0) / (ebitVals.length || 1);

  const pvSd = Math.sqrt(pvVals.reduce((a, b) => a + (b - pvMean) ** 2, 0) / (pvVals.length || 1));
  const ebitSd = Math.sqrt(ebitVals.reduce((a, b) => a + (b - ebitMean) ** 2, 0) / (ebitVals.length || 1));

  const scored = rows.map((r) => {
    const zPv = safeZ(r.pv, pvMean, pvSd);
    const zEbit = safeZ(r.ebit, ebitMean, ebitSd);
    const score = zEbit - zPv; // compromis: ebit ↑ et pv ↓
    return { ...r, score, zPv, zEbit };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  if (!best) return null;

  const pvRank =
    [...scored].sort((a, b) => a.pv - b.pv).findIndex((x) => x.pack.variant.id === best.pack.variant.id) + 1;
  const ebitRank =
    [...scored].sort((a, b) => b.ebit - a.ebit).findIndex((x) => x.pack.variant.id === best.pack.variant.id) + 1;

  return {
    pack: best.pack,
    pv: best.pv,
    ebit: best.ebit,
    score: best.score,
    pvRank,
    ebitRank,
    count: scored.length,
  };
});
</script>

<template>
  <div class="cmp-page">
    <!-- ========== TOP BAR (compact) ========== -->
    <div class="topbar">
      <div class="title">
        <ArrowsRightLeftIcon class="ico" />
        <div class="ttext">
          <div class="h">Comparateur</div>
          <div class="sub muted">
            {{ selectedPacks.length }} variante(s) • Base:
            <b v-if="baselineId">
              {{ vTitle(allVariants.find((x) => String(x.variant.id) === String(baselineId))?.variant) }}
            </b>
            <span v-else>—</span>
          </div>
        </div>
      </div>

      <div class="tools">
        <button class="btn" :disabled="loading" @click="clearSelection" title="Reset sélection">
          <ArrowPathIcon class="btn-ico" />
          Reset
        </button>

        <label class="toggle" title="Afficher Δ vs base">
          <input type="checkbox" v-model="ui.showDelta" />
          <span>Δ</span>
        </label>

        <select class="select" v-model="ui.baselineMode" :disabled="!activeVariantId" title="Base de comparaison">
          <option value="first">Base: 1ère</option>
          <option value="active">Base: active</option>
        </select>

        <select class="select" v-model="ui.metricGroup" title="Groupe KPI">
          <option value="Essentiel">KPI: Essentiel</option>
          <option value="Avancé">KPI: Avancé</option>
          <option value="Tout">KPI: Tout</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="alert alert-err">
      <ExclamationTriangleIcon class="alert-ico" />
      <div class="alert-text">{{ error }}</div>
    </div>
    <div v-if="loading" class="alert alert-info">
      <ArrowPathIcon class="alert-ico spin" />
      <div class="alert-text">Chargement…</div>
    </div>

    <!-- ========== KPI OPTIMAL (compact, before panels) ========== -->
    <div v-if="optimal && selectedPacks.length >= 2" class="card opt-card">
      <div class="card-head small">
        <div class="ch-left">
          <SparklesIcon class="spark" />
          <div class="card-title">Variante optimale (compromis PV bas + EBIT haut)</div>
          <span class="pill pill-blue">Auto</span>
        </div>
        <div class="muted">score = z(EBIT) - z(PV)</div>
      </div>

      <div class="opt-body">
        <div class="opt-main">
          <div class="opt-name">{{ vTitle(optimal.pack.variant) }}</div>
          <div class="opt-sub muted">
            {{ optimal.pack.contract?.dureeMois ?? 0 }} mois • {{ cTitle(optimal.pack.contract) }}
          </div>
        </div>

        <div class="opt-kpis">
          <div class="okpi">
            <div class="k">PV moyen</div>
            <div class="v">{{ fmtMoney(optimal.pv, 2) }}</div>
            <div class="r muted">rang {{ optimal.pvRank }}/{{ optimal.count }} (↓ mieux)</div>
          </div>
          <div class="okpi">
            <div class="k">EBIT total</div>
            <div class="v">{{ fmtMoney(optimal.ebit, 0) }}</div>
            <div class="r muted">rang {{ optimal.ebitRank }}/{{ optimal.count }} (↑ mieux)</div>
          </div>
          <div class="okpi score">
            <div class="k">Score</div>
            <div class="v">{{ fmtNumber(optimal.score, 2) }}</div>
            <div class="r muted">maximisé</div>
          </div>
        </div>

        <div class="opt-note muted">
          Objectif: un prix client “satisfaisant” (PV bas) tout en gardant une rentabilité “optimale” (EBIT haut).
        </div>
      </div>
    </div>

    <!-- ========== COMPACT PANELS (less scroll) ========== -->
    <div class="panels">
      <!-- Selection (collapsible + internal scroll) -->
      <div class="card">
        <div class="card-head" @click="ui.showSelection = !ui.showSelection" role="button" tabindex="0">
          <div class="ch-left">
            <component :is="ui.showSelection ? ChevronDownIcon : ChevronRightIcon" class="chev" />
            <div class="card-title">Sélection (max {{ ui.capMax }})</div>
            <span class="pill pill-gray">{{ selectedIds.length }}/{{ ui.capMax }}</span>
          </div>

          <div class="chips">
            <span v-for="id in selectedIds" :key="id" class="chip" @click.stop>
              {{ vTitle(allVariants.find((x) => String(x.variant.id) === String(id))?.variant) }}
              <button class="chip-x" @click="toggleSelect(id)" title="Retirer">
                <XMarkIcon class="chip-x-ico" />
              </button>
            </span>
          </div>
        </div>

        <div v-show="ui.showSelection" class="card-body">
          <div class="search">
            <div class="searchbox">
              <MagnifyingGlassIcon class="s-ico" />
              <input v-model="ui.q" class="s-in" placeholder="Rechercher variante / contrat…" />
              <button v-if="ui.q" class="s-clear" @click="ui.q = ''" title="Effacer">×</button>
            </div>

            <button class="btn ghost" @click="ui.showSummary = !ui.showSummary" title="Afficher/masquer résumé">
              <AdjustmentsHorizontalIcon class="btn-ico" />
              Résumé
            </button>
          </div>

          <div class="selector-scroll">
            <button
              v-for="pack in filteredVariants"
              :key="pack.variant.id"
              class="select-item"
              :class="{
                on: selectedIds.includes(String(pack.variant.id)),
                locked: !selectedIds.includes(String(pack.variant.id)) && selectedIds.length >= ui.capMax,
                active: String(pack.variant.id) === String(activeVariantId ?? ''),
              }"
              @click="toggleSelect(pack.variant.id)"
              :disabled="!selectedIds.includes(String(pack.variant.id)) && selectedIds.length >= ui.capMax"
            >
              <div class="si-top">
                <div class="si-name">{{ vTitle(pack.variant) }}</div>
                <CheckCircleIcon v-if="selectedIds.includes(String(pack.variant.id))" class="si-ok" />
              </div>
              <div class="si-meta">
                <span class="muted">{{ cTitle(pack.contract) }}</span>
                <span class="dot">•</span>
                <span class="muted">{{ pack.contract?.dureeMois ?? 0 }} mois</span>
                <span v-if="String(pack.variant.id) === String(activeVariantId ?? '')" class="tag">Active</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Résumé (pliable) -->
      <div v-if="selectedPacks.length" class="card">
        <div class="card-head small" @click="ui.showSummary = !ui.showSummary" role="button" tabindex="0">
          <div class="ch-left">
            <component :is="ui.showSummary ? ChevronDownIcon : ChevronRightIcon" class="chev" />
            <div class="card-title">Résumé</div>
            <span class="muted">PV/m³ • CA • MOMD • EBIT</span>
          </div>
          <div class="pill pill-gray">{{ ui.showSummary ? "ON" : "OFF" }}</div>
        </div>

        <div v-show="ui.showSummary" class="summary-row">
          <div v-for="pack in selectedPacks" :key="pack.variant.id" class="s-card">
            <div class="s-head">
              <div class="s-title">{{ vTitle(pack.variant) }}</div>
              <div class="pill" :class="statusPillClass(kpisById.get(String(pack.variant.id))?.status)">
                {{ kpisById.get(String(pack.variant.id))?.status ?? "—" }}
              </div>
            </div>

            <div class="s-grid">
              <div class="kv">
                <div class="k">PV/m³</div>
                <div class="v">{{ fmtMoney(kpisById.get(String(pack.variant.id))?.prixMoyenM3 ?? 0, 2) }}</div>
              </div>
              <div class="kv">
                <div class="k">CA</div>
                <div class="v">{{ fmtMoney(kpisById.get(String(pack.variant.id))?.caTotal ?? 0, 0) }}</div>
              </div>
              <div class="kv">
                <div class="k">MOMD/m³</div>
                <div class="v">{{ fmtMoney(kpisById.get(String(pack.variant.id))?.momdMoyenM3 ?? 0, 2) }}</div>
              </div>
              <div class="kv">
                <div class="k">EBIT</div>
                <div class="v">{{ fmtMoney(kpisById.get(String(pack.variant.id))?.ebitTotal ?? 0, 0) }}</div>
              </div>
            </div>

            <div class="s-foot muted">{{ pack.contract?.dureeMois ?? 0 }} mois • {{ cTitle(pack.contract) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== TABLE (sticky header) ========== -->
    <div class="card table-card" v-if="selectedPacks.length">
      <div class="card-head small">
        <div class="ch-left">
          <div class="card-title">Tableau comparatif</div>
          <div class="muted">
            Groupe: <b>{{ ui.metricGroup }}</b>
            <span class="dot">•</span>
            Δ: <b>{{ ui.showDelta ? "ON" : "OFF" }}</b>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table class="cmp-table">
          <thead>
            <tr>
              <th class="th-kpi">KPI</th>

              <th v-for="pack in selectedPacks" :key="pack.variant.id" class="th-var">
                <div class="th-var-title">
                  <span class="th-name">{{ vTitle(pack.variant) }}</span>
                  <span v-if="String(pack.variant.id) === String(baselineId ?? '')" class="tag tag-base">Base</span>
                </div>
                <div class="th-sub muted">{{ pack.contract?.dureeMois ?? 0 }} mois • {{ cTitle(pack.contract) }}</div>
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in tableRows" :key="row.metric.key">
              <td class="td-kpi">
                <div class="kpi-label">
                  <div class="kpi-main">{{ row.metric.label }}</div>
                  <div v-if="row.metric.unitHint" class="kpi-unit muted">{{ row.metric.unitHint }}</div>
                </div>
              </td>

              <td v-for="(cell, i) in row.cells" :key="String(i) + row.metric.key" class="td-val">
                <div class="val-box" :class="cell.cls">
                  <div class="val-main">{{ cell.text }}</div>

                  <div v-if="ui.showDelta" class="val-sub">
                    <span :class="['delta', cell.deltaCls]">{{ cell.deltaText }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="table-foot muted">Astuce: “Essentiel” = lecture rapide. “Avancé” = détails (moins de scroll).</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================
   COMPACT THEME
========================= */
.cmp-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  --b: #e2e8f0;
  --muted: #64748b;
  --txt: #0f172a;
  --bg: #ffffff;
  --soft: #f8fafc;
}
.muted {
  color: var(--muted);
}
.dot {
  color: #cbd5e1;
  margin: 0 6px;
}

.card {
  background: var(--bg);
  border: 1px solid #e6eaf2;
  border-radius: 14px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #eef2f7;
  user-select: none;
}
.card-head.small {
  padding: 8px 12px;
}

.card-title {
  font-weight: 900;
  color: var(--txt);
  font-size: 13px;
}
.ch-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.chev {
  width: 16px;
  height: 16px;
  color: #334155;
}

/* =========================
   TOP BAR (less height)
========================= */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e6eaf2;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}
.title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}
.ico {
  width: 18px;
  height: 18px;
  color: #334155;
}
.ttext .h {
  font-weight: 950;
  color: var(--txt);
  font-size: 14px;
  line-height: 1.1;
}
.ttext .sub {
  font-size: 12px;
  margin-top: 2px;
}

.tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--b);
  background: #fff;
  color: var(--txt);
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}
.btn.ghost {
  background: var(--soft);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-ico {
  width: 16px;
  height: 16px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--txt);
  background: #fff;
  border: 1px solid var(--b);
  border-radius: 10px;
  padding: 7px 10px;
}
.toggle input {
  transform: translateY(1px);
}

.select {
  border: 1px solid var(--b);
  background: #fff;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: var(--txt);
}

/* =========================
   ALERTS
========================= */
.alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid;
  background: #fff;
}
.alert-ico {
  width: 18px;
  height: 18px;
  margin-top: 1px;
}
.alert-text {
  font-size: 12.5px;
  color: var(--txt);
  font-weight: 800;
}
.alert-err {
  border-color: #fecaca;
  background: #fef2f2;
}
.alert-err .alert-ico {
  color: #dc2626;
}
.alert-info {
  border-color: #bfdbfe;
  background: #eff6ff;
}
.alert-info .alert-ico {
  color: #2563eb;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

/* =========================
   OPT CARD
========================= */
.opt-card {
  border-color: #bfdbfe;
}
.spark {
  width: 16px;
  height: 16px;
  color: #2563eb;
}
.opt-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.opt-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.opt-name {
  font-weight: 950;
  color: var(--txt);
  font-size: 14px;
}
.opt-sub {
  font-size: 12px;
}
.opt-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 980px) {
  .opt-kpis {
    grid-template-columns: 1fr;
  }
}
.okpi {
  border: 1px solid #eef2f7;
  background: #fbfdff;
  border-radius: 12px;
  padding: 8px;
}
.okpi .k {
  font-size: 10.5px;
  color: var(--muted);
  font-weight: 900;
  margin-bottom: 3px;
}
.okpi .v {
  font-size: 12.5px;
  color: var(--txt);
  font-weight: 950;
}
.okpi .r {
  font-size: 11px;
  margin-top: 2px;
}
.okpi.score {
  border-color: #93c5fd;
  background: #eff6ff;
}
.opt-note {
  font-size: 12px;
}

/* =========================
   PANELS
========================= */
.panels {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

/* chips inline in header */
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid var(--b);
  background: var(--soft);
  font-size: 11.5px;
  color: var(--txt);
  font-weight: 800;
}
.chip-x {
  display: inline-flex;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.chip-x-ico {
  width: 14px;
  height: 14px;
  color: var(--muted);
}

.card-body {
  padding: 10px 12px;
}

/* search row */
.search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.searchbox {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--b);
  background: #fff;
  border-radius: 12px;
  padding: 6px 10px;
  min-width: 260px;
  flex: 1;
}
.s-ico {
  width: 16px;
  height: 16px;
  color: var(--muted);
}
.s-in {
  border: 0;
  outline: none;
  font-size: 12.5px;
  width: 100%;
  color: var(--txt);
}
.s-clear {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--muted);
  padding: 0 4px;
}

/* internal scroll => less page scroll */
.selector-scroll {
  max-height: 240px;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding-right: 4px;
}
@media (max-width: 980px) {
  .selector-scroll {
    grid-template-columns: 1fr;
  }
}

.select-item {
  text-align: left;
  border: 1px solid var(--b);
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
  transition: transform 0.04s ease, border-color 0.12s ease, background 0.12s ease;
}
.select-item:hover {
  transform: translateY(-1px);
  border-color: #cbd5e1;
}
.select-item.on {
  border-color: #2563eb;
  background: #eff6ff;
}
.select-item.active {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}
.select-item.locked {
  opacity: 0.6;
}
.select-item:disabled {
  cursor: not-allowed;
}

.si-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.si-name {
  font-weight: 950;
  color: var(--txt);
  font-size: 12.5px;
}
.si-ok {
  width: 18px;
  height: 18px;
  color: #2563eb;
}
.si-meta {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--muted);
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

/* summary horizontal => less vertical */
.summary-row {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  overflow-x: auto;
}
.s-card {
  min-width: 260px;
  max-width: 300px;
  border: 1px solid #eef2f7;
  background: #fbfdff;
  border-radius: 12px;
  padding: 10px;
  flex: 0 0 auto;
}
.s-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.s-title {
  font-weight: 950;
  color: var(--txt);
  font-size: 13px;
}
.s-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.kv {
  border: 1px solid #eef2f7;
  background: #fff;
  border-radius: 10px;
  padding: 8px;
}
.k {
  font-size: 10.5px;
  color: var(--muted);
  font-weight: 900;
  margin-bottom: 3px;
}
.v {
  font-size: 12px;
  color: var(--txt);
  font-weight: 950;
}
.s-foot {
  margin-top: 8px;
  font-size: 11.5px;
}

/* pills + tags */
.pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-weight: 950;
  font-size: 11px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.pill-green {
  background: #ecfdf5;
  color: #065f46;
  border-color: #a7f3d0;
}
.pill-red {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
}
.pill-blue {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}
.pill-gray {
  background: #f8fafc;
  color: #334155;
  border-color: var(--b);
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  border: 1px solid var(--b);
  background: #fff;
  color: var(--txt);
}
.tag-base {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

/* =========================
   TABLE
========================= */
.table-card {
  overflow: visible;
}
.table-wrap {
  padding: 10px 12px 12px;
}

.cmp-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 12.5px;
  color: var(--txt);
}

/* ✅ Sticky header */
.cmp-table thead th {
  position: sticky;
  top: -14px;
  z-index: 12;
  background: rgba(248, 250, 252, 0.96);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--b);
}
.cmp-table thead tr th {
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.th-kpi {
  width: 220px;
  text-align: left;
  padding: 9px 10px;
  font-weight: 950;
}
.th-var {
  text-align: left;
  padding: 9px 10px;
}
.th-var-title {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.th-name {
  font-weight: 950;
}
.th-sub {
  margin-top: 2px;
  font-size: 11px;
}

tbody tr td {
  border-bottom: 1px solid #f1f5f9;
}
.td-kpi {
  padding: 9px 10px;
  vertical-align: middle;
}
.td-val {
  padding: 7px 10px;
  vertical-align: middle;
}

.kpi-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kpi-main {
  font-weight: 950;
}
.kpi-unit {
  font-size: 11px;
}

.val-box {
  border: 1px solid #eef2f7;
  background: #fbfdff;
  border-radius: 12px;
  padding: 7px 9px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 42px;
  justify-content: center;
}
.val-main {
  font-weight: 950;
  font-size: 12.5px;
}
.val-sub {
  font-size: 11px;
}

.delta {
  font-weight: 950;
}
.delta.pos {
  color: #166534;
}
.delta.neg {
  color: #991b1b;
}
.delta.muted {
  color: var(--muted);
}

.best {
  border-color: #86efac;
  background: #f0fdf4;
}
.worst {
  border-color: #fecaca;
  background: #fef2f2;
}

.table-foot {
  margin-top: 8px;
  font-size: 12px;
}
</style>
