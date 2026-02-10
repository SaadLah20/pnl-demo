<!-- ✅ src/pages/ComparateurVariantesPage.vue (FICHIER COMPLET)
     Refonte: +compact, +lisible, cohérent avec tes autres pages (même “family” UI)
     ✅ Réintègre "Variante optimale"
     ✅ Fix débordement EBIT: aucune valeur ne déborde (ellipsis + min-width:0 partout)
     ✅ MOMD = KPI POSITIF => better: "higher"
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

import {
  ArrowsRightLeftIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XMarkIcon,
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
  better: "higher" | "lower";
  get: (k: any, pack: VariantPack) => number | null;
  format: (v: number | null) => string;
};

/* =========================
   UI
========================= */
const ui = reactive({
  capMax: 4,
  showDelta: true,
  baselineMode: "first" as "first" | "active",
  metricGroup: "Essentiel" as "Essentiel" | "Avancé" | "Tout",
  q: "",
  showSelection: true,
});

/* =========================
   DATA / HELPERS
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

  if (idx >= 0) {
    if (selectedIds.value.length <= 1) return;
    selectedIds.value.splice(idx, 1);
    return;
  }
  if (selectedIds.value.length >= ui.capMax) return;
  selectedIds.value.push(sid);
}

function resetSelection() {
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

function statusPillClass(status: string) {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("CLOT")) return "pill pill-green";
  if (s.includes("ANNU")) return "pill pill-red";
  if (s.includes("ENCO")) return "pill pill-blue";
  return "pill pill-gray";
}

function deltaPct(val: number, base: number) {
  if (!Number.isFinite(val) || !Number.isFinite(base) || base === 0) return null;
  return ((val - base) / Math.abs(base)) * 100;
}
function deltaClass(dp: number | null) {
  if (dp == null) return "muted";
  if (dp > 0.0001) return "pos";
  if (dp < -0.0001) return "neg";
  return "muted";
}

/* =========================
   METRICS (✅ MOMD positif)
========================= */
const allMetrics = computed<Metric[]>(() => [
  // Essentiel
  {
    key: "prixMoyenM3",
    label: "PV moyen",
    unitHint: "MAD/m³",
    group: "Essentiel",
    better: "lower",
    get: (k) => (k?.prixMoyenM3 == null ? null : n(k?.prixMoyenM3)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 2)),
  },
  {
    key: "caTotal",
    label: "CA total",
    unitHint: "MAD",
    group: "Essentiel",
    better: "higher",
    get: (k) => (k?.caTotal == null ? null : n(k?.caTotal)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 0)),
  },
  {
    key: "momdMoyenM3",
    label: "MOMD",
    unitHint: "MAD/m³",
    group: "Essentiel",
    better: "higher", // ✅ important
    get: (k) => (k?.momdMoyenM3 == null ? null : n(k?.momdMoyenM3)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 2)),
  },
  {
    key: "coutMpMoyenM3",
    label: "CMP moyen",
    unitHint: "MAD/m³",
    group: "Essentiel",
    better: "lower",
    get: (k) => (k?.coutMpMoyenM3 == null ? null : n(k?.coutMpMoyenM3)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 2)),
  },
  {
    key: "ebitTotal",
    label: "EBIT total",
    unitHint: "MAD",
    group: "Essentiel",
    better: "higher",
    get: (k) => (k?.ebitTotal == null ? null : n(k?.ebitTotal)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 0)),
  },
  {
    key: "ebitPct",
    label: "EBIT (%)",
    unitHint: "%",
    group: "Essentiel",
    better: "higher",
    get: (k) => (k?.ebitPct == null ? null : n(k?.ebitPct)),
    format: (v) => (v == null ? "—" : fmtPct(v, 1)),
  },

  // Avancé (compact)
  {
    key: "volumeTotalM3",
    label: "Volume total",
    unitHint: "m³",
    group: "Avancé",
    better: "higher",
    get: (k) => (k?.volumeTotalM3 == null ? null : n(k?.volumeTotalM3)),
    format: (v) => (v == null ? "—" : fmtNumber(v, 1)),
  },
  {
    key: "transportMoyenM3",
    label: "Transport",
    unitHint: "MAD/m³",
    group: "Avancé",
    better: "lower",
    get: (k) => (k?.transportMoyenM3 == null ? null : n(k?.transportMoyenM3)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 2)),
  },
  {
    key: "ebitdaTotal",
    label: "EBITDA total",
    unitHint: "MAD",
    group: "Avancé",
    better: "higher",
    get: (k) => (k?.ebitdaTotal == null ? null : n(k?.ebitdaTotal)),
    format: (v) => (v == null ? "—" : fmtMoney(v, 0)),
  },
  {
    key: "fraisGenerauxPct",
    label: "Frais généraux",
    unitHint: "% CA",
    group: "Avancé",
    better: "lower",
    get: (k) => (k?.fraisGenerauxPct == null ? null : n(k?.fraisGenerauxPct)),
    format: (v) => (v == null ? "—" : fmtPct(v, 1)),
  },
]);

const metrics = computed(() => {
  if (ui.metricGroup === "Tout") return allMetrics.value;
  return allMetrics.value.filter((m) => m.group === ui.metricGroup);
});

function getMetricValue(m: Metric, pack: VariantPack): number | null {
  const k = kpisById.value.get(String(pack.variant.id));
  const out = m.get(k, pack);
  if (out == null) return null;
  const x = Number(out);
  return Number.isFinite(x) ? x : null;
}

function bestWorstTag(m: Metric, v: number | null, valuesAll: Array<number | null>) {
  if (v == null) return "";
  const vals = valuesAll.filter((x) => x != null) as number[];
  if (!vals.length || vals.length === 1) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const isBest = m.better === "lower" ? v === min : v === max;
  const isWorst = m.better === "lower" ? v === max : v === min;

  if (isBest) return "best";
  if (isWorst) return "worst";
  return "";
}

function deltaFor(m: Metric, pack: VariantPack): { text: string; cls: string } {
  const bid = baselineId.value;
  const bp = baselinePack.value;
  if (!ui.showDelta || !bid || !bp) return { text: "—", cls: "muted" };
  if (String(pack.variant.id) === String(bid)) return { text: "—", cls: "muted" };

  const val = getMetricValue(m, pack);
  const base = getMetricValue(m, bp);
  if (val == null || base == null) return { text: "—", cls: "muted" };

  const dp = deltaPct(val, base);
  return { text: dp == null ? "—" : fmtPct(dp, 1), cls: deltaClass(dp) };
}

/* =========================
   VARIANTE OPTIMALE (compromis PV bas + EBIT haut)
   score = z(EBIT) - z(PV)
========================= */
function safeZ(x: number, mean: number, sd: number) {
  if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) return 0;
  return (x - mean) / sd;
}

const optimal = computed(() => {
  const packs = selectedPacks.value;
  if (packs.length < 2) return null;

  const rows = packs.map((p) => {
    const k = kpisById.value.get(String(p.variant.id));
    const pv = n(k?.prixMoyenM3); // bas = mieux
    const ebit = n(k?.ebitTotal); // haut = mieux
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
    const score = zEbit - zPv;
    return { ...r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  const pvRank =
    [...scored].sort((a, b) => a.pv - b.pv).findIndex((x) => String(x.pack.variant.id) === String(best.pack.variant.id)) +
    1;
  const ebitRank =
    [...scored].sort((a, b) => b.ebit - a.ebit).findIndex((x) => String(x.pack.variant.id) === String(best.pack.variant.id)) +
    1;

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

/* =========================
   SCORE CARDS (super compact)
========================= */
const cards = computed(() => {
  return selectedPacks.value.map((p) => {
    const k = kpisById.value.get(String(p.variant.id));
    return {
      pack: p,
      status: String(k?.status ?? "—"),
      pv: k?.prixMoyenM3 == null ? null : n(k?.prixMoyenM3),
      momd: k?.momdMoyenM3 == null ? null : n(k?.momdMoyenM3),
      ebit: k?.ebitTotal == null ? null : n(k?.ebitTotal),
    };
  });
});
</script>

<template>
  <div class="page">
    <!-- Header (cohérent avec tes pages) -->
    <div class="head">
      <div class="hTitle">
        Comparateur variantes
        <span class="sep">•</span>
        <span class="hRes">
          Sélection : <b>{{ selectedPacks.length }}</b> / {{ ui.capMax }}
        </span>
      </div>

      <div class="hSearch">
        <div class="searchBox">
          <MagnifyingGlassIcon class="sIc" />
          <input v-model="ui.q" class="hInput" placeholder="Rechercher variante / contrat…" />
          <button v-if="ui.q" class="sClear" type="button" @click="ui.q = ''" title="Effacer">×</button>
        </div>
      </div>

      <div class="hRight">
        <button class="btn ghost" @click="resetSelection" :disabled="loading" title="Reset sélection">
          <ArrowPathIcon class="btnic" />
        </button>

        <label class="toggle" title="Afficher Δ vs base">
          <input type="checkbox" v-model="ui.showDelta" />
          <span>Δ</span>
        </label>

        <select class="sel" v-model="ui.baselineMode" :disabled="!activeVariantId" title="Base de comparaison">
          <option value="first">Base: 1ère</option>
          <option value="active">Base: active</option>
        </select>

        <select class="sel" v-model="ui.metricGroup" title="Groupe KPI">
          <option value="Essentiel">KPI: Essentiel</option>
          <option value="Avancé">KPI: Avancé</option>
          <option value="Tout">KPI: Tout</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="alert error">
      <ExclamationTriangleIcon class="aic" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-if="loading" class="alert info">Chargement…</div>

    <!-- ✅ Variante optimale (compact) -->
    <div v-if="optimal" class="opt">
      <div class="optHead">
        <div class="optLeft">
          <SparklesIcon class="optIc" />
          <div class="optT">
            <div class="optTitle">Variante optimale</div>
            <div class="optSub">Compromis PV bas + EBIT haut (score = z(EBIT) − z(PV))</div>
          </div>
          <span class="pill pill-blue">Auto</span>
        </div>

        <div class="optScore">
          <div class="k">Score</div>
          <div class="v" :title="fmtNumber(optimal.score, 2)">{{ fmtNumber(optimal.score, 2) }}</div>
        </div>
      </div>

      <div class="optBody">
        <div class="optMain">
          <div class="optName ellipsis" :title="vTitle(optimal.pack.variant)">{{ vTitle(optimal.pack.variant) }}</div>
          <div class="optMeta ellipsis" :title="cTitle(optimal.pack.contract)">
            {{ optimal.pack.contract?.dureeMois ?? 0 }} mois • {{ cTitle(optimal.pack.contract) }}
          </div>
        </div>

        <div class="optKpis">
          <div class="okpi">
            <div class="k">PV moyen</div>
            <div class="v ellipsis" :title="fmtMoney(optimal.pv, 2)">{{ fmtMoney(optimal.pv, 2) }}</div>
            <div class="r muted">rang {{ optimal.pvRank }}/{{ optimal.count }} (↓ mieux)</div>
          </div>
          <div class="okpi">
            <div class="k">EBIT total</div>
            <div class="v ellipsis" :title="fmtMoney(optimal.ebit, 0)">{{ fmtMoney(optimal.ebit, 0) }}</div>
            <div class="r muted">rang {{ optimal.ebitRank }}/{{ optimal.count }} (↑ mieux)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Score cards (super compact, fix overflow) -->
    <div v-if="selectedPacks.length" class="cards">
      <div v-for="c in cards" :key="String(c.pack.variant.id)" class="card">
        <div class="cardTop">
          <div class="left">
            <div class="line1">
              <span class="name ellipsis" :title="vTitle(c.pack.variant)">{{ vTitle(c.pack.variant) }}</span>
              <span v-if="String(c.pack.variant.id) === String(activeVariantId ?? '')" class="tag">Active</span>
              <span v-if="String(c.pack.variant.id) === String(baselineId ?? '')" class="tag base">Base</span>
            </div>
            <div class="line2 ellipsis" :title="cTitle(c.pack.contract)">
              {{ c.pack.contract?.dureeMois ?? 0 }} mois — {{ cTitle(c.pack.contract) }}
            </div>
          </div>

          <div class="right">
            <span class="pill" :class="statusPillClass(c.status)">{{ c.status }}</span>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi">
            <div class="k">PV/m³</div>
            <div class="v ellipsis" :title="c.pv == null ? '—' : fmtMoney(c.pv, 2)">{{ c.pv == null ? "—" : fmtMoney(c.pv, 2) }}</div>
          </div>

          <div class="kpi">
            <div class="k">MOMD/m³</div>
            <div class="v ellipsis" :title="c.momd == null ? '—' : fmtMoney(c.momd, 2)">{{ c.momd == null ? "—" : fmtMoney(c.momd, 2) }}</div>
          </div>

          <div class="kpi">
            <div class="k">EBIT</div>
            <!-- ✅ ici: overflow impossible (min-width:0 + ellipsis + tabular) -->
            <div class="v num ellipsis" :title="c.ebit == null ? '—' : fmtMoney(c.ebit, 0)">{{ c.ebit == null ? "—" : fmtMoney(c.ebit, 0) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sélection (pliable) -->
    <div class="box">
      <button class="boxHead" type="button" @click="ui.showSelection = !ui.showSelection">
        <div class="bhLeft">
          <component :is="ui.showSelection ? ChevronDownIcon : ChevronRightIcon" class="chev" />
          <div class="bhTitle">Sélection</div>
          <span class="pill pill-gray">{{ selectedIds.length }}/{{ ui.capMax }}</span>
        </div>

        <div class="chips" @click.stop>
          <span v-for="id in selectedIds" :key="id" class="chip">
            <span class="ellipsis chipTxt" :title="vTitle(allVariants.find((x) => String(x.variant.id) === String(id))?.variant)">
              {{ vTitle(allVariants.find((x) => String(x.variant.id) === String(id))?.variant) }}
            </span>
            <button class="chipX" type="button" @click="toggleSelect(id)" title="Retirer">
              <XMarkIcon class="chipXIc" />
            </button>
          </span>
        </div>
      </button>

      <div v-show="ui.showSelection" class="boxBody">
        <div class="list">
          <button
            v-for="pack in filteredVariants"
            :key="pack.variant.id"
            class="item"
            :class="{
              on: selectedIds.includes(String(pack.variant.id)),
              locked: !selectedIds.includes(String(pack.variant.id)) && selectedIds.length >= ui.capMax,
            }"
            @click="toggleSelect(pack.variant.id)"
            :disabled="!selectedIds.includes(String(pack.variant.id)) && selectedIds.length >= ui.capMax"
          >
            <div class="itTop">
              <span class="itName ellipsis" :title="vTitle(pack.variant)">{{ vTitle(pack.variant) }}</span>
              <CheckCircleIcon v-if="selectedIds.includes(String(pack.variant.id))" class="ok" />
            </div>
            <div class="itMeta ellipsis" :title="cTitle(pack.contract)">
              {{ cTitle(pack.contract) }} • {{ pack.contract?.dureeMois ?? 0 }} mois
              <span v-if="String(pack.variant.id) === String(activeVariantId ?? '')" class="tag">Active</span>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Tableau (compact + sticky + scroll horizontal si besoin) -->
    <div v-if="selectedPacks.length" class="box">
      <div class="boxHeadStatic">
        <div class="bhLeft">
          <div class="bhTitle">Tableau comparatif</div>
          <div class="mutedSmall">
            Groupe: <b>{{ ui.metricGroup }}</b>
            <span class="sep">•</span>
            Δ: <b>{{ ui.showDelta ? "ON" : "OFF" }}</b>
          </div>
        </div>
      </div>

      <div class="tableWrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="kcol">KPI</th>
              <th v-for="p in selectedPacks" :key="p.variant.id" class="vcol">
                <div class="thMain">
                  <span class="ellipsis" :title="vTitle(p.variant)">{{ vTitle(p.variant) }}</span>
                  <span v-if="String(p.variant.id) === String(baselineId ?? '')" class="tag base">Base</span>
                </div>
                <div class="thSub ellipsis" :title="cTitle(p.contract)">
                  {{ p.contract?.dureeMois ?? 0 }} mois — {{ cTitle(p.contract) }}
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="m in metrics" :key="m.key">
              <td class="kcell">
                <div class="kLabel">
                  <div class="kMain ellipsis" :title="m.label">{{ m.label }}</div>
                  <div v-if="m.unitHint" class="kUnit ellipsis" :title="m.unitHint">{{ m.unitHint }}</div>
                </div>
              </td>

              <td v-for="pack in selectedPacks" :key="String(pack.variant.id) + m.key" class="vcell">
                <div
                  class="val"
                  :class="bestWorstTag(m, getMetricValue(m, pack), selectedPacks.map((x) => getMetricValue(m, x)))"
                >
                  <div class="vMain ellipsis" :title="m.format(getMetricValue(m, pack))">
                    {{ m.format(getMetricValue(m, pack)) }}
                  </div>

                  <div v-if="ui.showDelta" class="vSub">
                    <span class="delta" :class="deltaFor(m, pack).cls">{{ deltaFor(m, pack).text }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="hint">
          ✅ MOMD est traité comme KPI positif (plus haut = mieux).
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* base */
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  --txt: #0f172a;
  --muted: rgba(15, 23, 42, 0.65);
  --b: rgba(16, 24, 40, 0.12);
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.sep { margin: 0 6px; color: rgba(15, 23, 42, 0.35); }

/* header (same family as your other pages) */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 55%);
  border: 1px solid var(--b);
  border-radius: 16px;
  padding: 8px 10px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}
.hTitle {
  font-size: 13px;
  font-weight: 950;
  color: var(--txt);
  white-space: nowrap;
}
.hRes { color: rgba(15, 23, 42, 0.75); }
.hSearch { flex: 1 1 520px; min-width: 220px; }
.searchBox {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--b);
  border-radius: 14px;
  height: 34px;
  background: rgba(255, 255, 255, 0.95);
  padding: 0 10px;
  min-width: 0;
}
.sIc { width: 16px; height: 16px; color: rgba(107, 114, 128, 1); flex: 0 0 auto; }
.hInput {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-weight: 850;
  color: var(--txt);
  min-width: 0;
}
.sClear {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: rgba(107, 114, 128, 1);
  padding: 0 4px;
}
.hRight { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.btn {
  height: 34px;
  border: 1px solid var(--b);
  background: rgba(15, 23, 42, 0.04);
  border-radius: 14px;
  padding: 0 12px;
  font-weight: 950;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover { background: rgba(32, 184, 232, 0.12); border-color: rgba(32, 184, 232, 0.18); }
.btn.ghost { background: rgba(255, 255, 255, 0.75); padding: 0 10px; }
.btnic { width: 16px; height: 16px; }

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--b);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 14px;
  height: 34px;
  padding: 0 10px;
  font-weight: 950;
  font-size: 12px;
  color: var(--txt);
}
.sel {
  height: 34px;
  border-radius: 14px;
  border: 1px solid var(--b);
  background: rgba(255, 255, 255, 0.85);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 900;
  color: var(--txt);
}

/* alerts */
.alert {
  border: 1px solid var(--b);
  border-radius: 14px;
  padding: 10px 12px;
  background: #fff;
  color: #111827;
  font-size: 13px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.alert.error { border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08); }
.alert.info { border-color: rgba(37, 99, 235, 0.25); background: rgba(37, 99, 235, 0.06); }
.aic { width: 18px; height: 18px; margin-top: 1px; flex: 0 0 auto; }

/* optimal */
.opt {
  border: 1px solid rgba(37, 99, 235, 0.22);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.7) 0%, #ffffff 55%);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}
.optHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.optLeft { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.optIc { width: 16px; height: 16px; color: #2563eb; flex: 0 0 auto; }
.optT { min-width: 0; }
.optTitle { font-size: 13px; font-weight: 950; color: var(--txt); }
.optSub { font-size: 11px; font-weight: 850; color: rgba(15, 23, 42, 0.55); margin-top: 2px; }
.optScore { text-align: right; min-width: 0; }
.optScore .k { font-size: 10.5px; font-weight: 950; color: rgba(15, 23, 42, 0.55); }
.optScore .v { font-size: 12.5px; font-weight: 950; color: var(--txt); }
.optBody { padding: 10px 12px 12px; display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.optMain { flex: 1 1 260px; min-width: 220px; }
.optName { font-size: 13px; font-weight: 950; color: var(--txt); }
.optMeta { margin-top: 3px; font-size: 11.5px; font-weight: 850; color: rgba(107, 114, 128, 1); }
.optKpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; flex: 1 1 360px; min-width: 260px; }
.okpi {
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  padding: 8px 10px;
  min-width: 0;
}
.okpi .k { font-size: 10.5px; font-weight: 950; color: rgba(15, 23, 42, 0.55); }
.okpi .v { font-size: 12.5px; font-weight: 950; color: var(--txt); margin-top: 2px; }
.okpi .r { margin-top: 2px; font-size: 11px; font-weight: 850; color: rgba(107, 114, 128, 1); }

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
.pill-green { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
.pill-red { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
.pill-blue { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.pill-gray { background: #f8fafc; color: #334155; border-color: rgba(16, 24, 40, 0.12); }

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  color: var(--txt);
  white-space: nowrap;
}
.tag.base { border-color: rgba(147, 197, 253, 1); background: rgba(239, 246, 255, 1); color: #1d4ed8; }

/* cards */
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 1150px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) { .cards { grid-template-columns: 1fr; } }

.card {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
  padding: 10px 12px 12px;
  min-width: 0;
}
.cardTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.cardTop .left { min-width: 0; flex: 1 1 auto; }
.line1 { display: flex; gap: 8px; align-items: center; min-width: 0; flex-wrap: wrap; }
.name { font-size: 12.5px; font-weight: 950; color: var(--txt); max-width: 100%; }
.line2 { margin-top: 4px; font-size: 11.5px; font-weight: 850; color: rgba(107, 114, 128, 1); }

.kpis {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 720px) { .kpis { grid-template-columns: 1fr; } }

.kpi {
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.02);
  padding: 8px 10px;
  min-width: 0; /* ✅ critical for ellipsis */
}
.kpi .k { font-size: 10.5px; font-weight: 950; color: rgba(15, 23, 42, 0.6); }
.kpi .v {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 950;
  color: var(--txt);
  min-width: 0; /* ✅ critical for ellipsis */
}
.kpi .v.num { font-variant-numeric: tabular-nums; }

/* box */
.box {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
}
.boxHead {
  width: 100%;
  border: 0;
  background: #fff;
  cursor: pointer;
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.boxHead:hover { background: rgba(15, 23, 42, 0.02); }
.boxHeadStatic {
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  background: #fff;
}
.bhLeft { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.chev { width: 16px; height: 16px; color: rgba(107, 114, 128, 1); flex: 0 0 auto; }
.bhTitle { font-size: 12.5px; font-weight: 950; color: var(--txt); }
.mutedSmall { color: rgba(107, 114, 128, 1); font-size: 12px; font-weight: 850; }

.chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-size: 11.5px;
  color: var(--txt);
  font-weight: 900;
  min-width: 0;
}
.chipTxt { max-width: 180px; }
.chipX { border: 0; background: transparent; padding: 0; cursor: pointer; display: inline-flex; }
.chipXIc { width: 14px; height: 14px; color: rgba(107, 114, 128, 1); }

.boxBody { padding: 10px 12px; }

/* list */
.list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;
}
@media (max-width: 980px) { .list { grid-template-columns: 1fr; } }

.item {
  text-align: left;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  border-radius: 14px;
  padding: 8px 10px;
  cursor: pointer;
  min-width: 0;
}
.item:hover { background: rgba(15, 23, 42, 0.02); border-color: rgba(32, 184, 232, 0.18); }
.item.on { border-color: rgba(37, 99, 235, 0.35); background: rgba(239, 246, 255, 0.6); }
.item.locked { opacity: 0.6; }
.item:disabled { cursor: not-allowed; }

.itTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.itName { font-weight: 950; color: var(--txt); font-size: 12.5px; }
.ok { width: 18px; height: 18px; color: #2563eb; flex: 0 0 auto; }
.itMeta { margin-top: 5px; font-size: 11.5px; color: rgba(107, 114, 128, 1); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

/* table */
.tableWrap { padding: 10px 12px 12px; overflow-x: auto; }
.tbl {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  min-width: 980px; /* ✅ avoid forced wrapping; use horizontal scroll */
  font-size: 12.5px;
  color: var(--txt);
}
.tbl thead th {
  position: sticky;
  top: -14px;
  z-index: 10;
  background: rgba(248, 250, 252, 0.96);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(16, 24, 40, 0.12);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}
.kcol { width: 220px; text-align: left; padding: 9px 10px; font-weight: 950; }
.vcol { text-align: left; padding: 9px 10px; }
.thMain { display: flex; gap: 8px; align-items: center; min-width: 0; }
.thSub { margin-top: 2px; font-size: 11px; color: rgba(107, 114, 128, 1); }

tbody tr td { border-bottom: 1px solid rgba(16, 24, 40, 0.06); }
.kcell { padding: 9px 10px; vertical-align: middle; }
.vcell { padding: 7px 10px; vertical-align: middle; }

.kLabel { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kMain { font-weight: 950; }
.kUnit { font-size: 11px; color: rgba(107, 114, 128, 1); }

.val {
  border: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 52px;
  justify-content: center;
  min-width: 0;
}
.vMain { font-weight: 950; font-size: 12.5px; }
.vSub { font-size: 11px; }
.delta { font-weight: 950; }
.delta.pos { color: #166534; }
.delta.neg { color: #991b1b; }
.delta.muted { color: rgba(107, 114, 128, 1); }

.val.best { border-color: rgba(34, 197, 94, 0.28); background: rgba(34, 197, 94, 0.08); }
.val.worst { border-color: rgba(239, 68, 68, 0.28); background: rgba(239, 68, 68, 0.08); }

.hint { margin-top: 8px; font-size: 12px; color: rgba(107, 114, 128, 1); font-weight: 850; }

@media (max-width: 980px) {
  .head { flex-wrap: wrap; }
  .hSearch { flex: 1 1 100%; }
}
</style>
