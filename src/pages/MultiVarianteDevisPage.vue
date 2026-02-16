<!-- ✅ src/pages/MultiVarianteDevisPage.vue (FICHIER COMPLET — refonte demandée)
  Changements :
  ✅ Supprime l’affichage des 4 données projet (ville/client/projet/date) dans le header
  ✅ Corrige superpositions/débordements des champs Introduction / Validité / Signature (grid robuste + minmax + box-sizing)
  ✅ Cards variantes : affiche EBIT & PMV moyen (au lieu du message "Inclure dans l’export")
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { contractUiTitle } from "@/services/contractTitle";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

const loading = ref(false);
const error = ref<string | null>(null);
const busy = reactive({ reload: false, export: false });

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function todayFr() {
  const d = new Date();
  return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function int(v: any) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n(v));
}
function money2(v: any) {
  const x = n(v);
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}
function vTitle(v: any) {
  return String(v?.title ?? v?.name ?? v?.label ?? "Variante");
}

/* =========================
   STATE
========================= */
const pnl = computed<any | null>(() => (store as any).activePnl ?? null);
const contracts = computed<any[]>(() => (pnl.value?.contracts ?? []) as any[]);

type ContractPick = { contractId: string; variantId: string | null };
const picks = reactive<Record<string, ContractPick>>({});

function ensurePick(contractId: any): ContractPick {
  const cid = String(contractId ?? "");
  if (!picks[cid]) picks[cid] = { contractId: cid, variantId: null };
  return picks[cid];
}
function setPick(contractId: any, variantId: string | null) {
  const cid = String(contractId ?? "");
  ensurePick(cid).variantId = variantId ? String(variantId) : null;
}

const exportOpts = reactive({
  useDevisSurcharges: true,
});

/* =========================
   Meta doc (ville/date/client/projet = read-only source PnL)
   ⚠️ On ne les affiche plus dans le header (demandé),
   mais on les garde pour l’export.
========================= */
const meta = reactive({
  ville: "",
  date: todayISO(),
  client: "",
  titreProjet: "",
  intro: "",
  validiteTexte: "Propositions valables pour une durée d’un mois à partir de la date d’envoi.",
  signature: {
    nom: "Saad LAHLIMI",
    poste: "Commercial P&L",
    telephone: "+212701888888",
  },
});

// UI helpers
const collapsed = reactive<Record<string, boolean>>({});
const query = ref("");
const showSelectedOnly = ref(false);

function toggleCollapse(contractId: any) {
  const cid = String(contractId ?? "");
  collapsed[cid] = !collapsed[cid];
}
function isCollapsed(contractId: any) {
  const cid = String(contractId ?? "");
  return Boolean(collapsed[cid]);
}

const selectedVariantIds = computed(() => {
  const ids: string[] = [];
  for (const c of contracts.value ?? []) {
    const cid = String(c?.id ?? "");
    const pick = picks[cid];
    if (pick?.variantId) ids.push(String(pick.variantId));
  }
  return ids;
});

const selectedContractsCount = computed(() => {
  let k = 0;
  for (const c of contracts.value ?? []) {
    const cid = String(c?.id ?? "");
    if (picks[cid]?.variantId) k++;
  }
  return k;
});

const canExport = computed(() => {
  const ids = selectedVariantIds.value;
  return ids.length > 0 && ids.length === selectedContractsCount.value;
});

const headerFacts = computed(() => {
  return {
    ville: String(pnl.value?.city ?? meta.ville ?? ""),
    date: meta.date,
    client: String(pnl.value?.client ?? meta.client ?? ""),
    projet: String(pnl.value?.title ?? meta.titreProjet ?? ""),
  };
});

const filteredContracts = computed(() => {
  const q = String(query.value ?? "").trim().toLowerCase();
  const selOnly = Boolean(showSelectedOnly.value);

  return (contracts.value ?? []).filter((c) => {
    const cid = String(c?.id ?? "");
    const picked = Boolean(picks[cid]?.variantId);

    if (selOnly && !picked) return false;
    if (!q) return true;

    const t = String(contractUiTitle(c) ?? "").toLowerCase();
    const vars = (c?.variants ?? []) as any[];
    const hitVar = vars.some((v) => String(vTitle(v)).toLowerCase().includes(q));
    return t.includes(q) || hitVar;
  });
});

function initState() {
  const cs = contracts.value ?? [];
  const activeVid = String((store as any).activeVariant?.id ?? "");

  for (const c of cs) {
    const cid = String(c?.id ?? "");
    ensurePick(cid);

    if (collapsed[cid] === undefined) collapsed[cid] = false;

    const vars = (c?.variants ?? []) as any[];
    if (!vars.length) continue;

    const hit = activeVid && vars.some((v) => String(v?.id ?? "") === activeVid);
    if (hit) ensurePick(cid).variantId = activeVid;
  }

  // ✅ meta read-only depuis pnl
  meta.ville = String(pnl.value?.city ?? meta.ville ?? "");
  meta.client = String(pnl.value?.client ?? meta.client ?? "");
  meta.titreProjet = String(pnl.value?.title ?? meta.titreProjet ?? "");

  if (!meta.intro.trim()) {
    meta.intro =
      `Nous vous prions de trouver ci-dessous nos propositions de prix relatives au projet "${meta.titreProjet}". ` +
      `Chaque proposition correspond à une variante sélectionnée par contrat.`;
  }
}

/* =========================
   ✅ KPI helpers (EBIT / PMV moyen par variante)
   - On calcule à partir de computeHeaderKpis(variant, dureeMois)
   - PMV moyen = prixMoyenM3
   - EBIT = ebitTotal
========================= */
const variantKpisMap = computed(() => {
  const map: Record<string, { ebit: number; pmv: number; ebitPct: number }> = {};
  for (const c of contracts.value ?? []) {
    const d = n(c?.dureeMois ?? 0);
    for (const v of (c?.variants ?? []) as any[]) {
      const vid = String(v?.id ?? "");
      if (!vid) continue;
      if (map[vid]) continue;

      try {
        const k = computeHeaderKpis(v, d, null, null, false);
        map[vid] = {
          ebit: n((k as any)?.ebitTotal),
          pmv: n((k as any)?.prixMoyenM3),
          ebitPct: n((k as any)?.ebitPct),
        };
      } catch {
        map[vid] = { ebit: 0, pmv: 0, ebitPct: 0 };
      }
    }
  }
  return map;
});

function kpiForVariant(v: any) {
  const vid = String(v?.id ?? "");
  return (variantKpisMap.value as any)?.[vid] ?? { ebit: 0, pmv: 0, ebitPct: 0 };
}

/* =========================
   Actions
========================= */
async function reload() {
  loading.value = true;
  busy.reload = true;
  error.value = null;
  try {
    if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
    initState();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    busy.reload = false;
  }
}

function clearSelection() {
  for (const c of contracts.value ?? []) {
    const cid = String(c?.id ?? "");
    if (picks[cid]) picks[cid].variantId = null;
  }
}

async function exportWordMulti() {
  if (!canExport.value) return;
  busy.export = true;
  error.value = null;

  try {
    await (store as any).exportDevisMultiWord({
      variantIds: selectedVariantIds.value,
      options: {
        // ✅ la page ne gère pas majorations (elles doivent être appliquées réellement)
        useMajorations: false,
        useDevisSurcharges: Boolean(exportOpts.useDevisSurcharges),
      },
      meta: {
        ville: headerFacts.value.ville,
        date: headerFacts.value.date,
        client: headerFacts.value.client,
        titreProjet: headerFacts.value.projet,
        intro: meta.intro,
        validiteTexte: meta.validiteTexte,
        signature: { ...meta.signature },
      },
    });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.export = false;
  }
}

onMounted(async () => {
  await reload();
});

watch(
  () => pnl.value?.id,
  () => initState()
);
</script>

<template>
  <div class="page">
    <!-- TOP BAR (sans les 4 facts) -->
    <div class="top">
      <div class="topLeft">
        <div class="hTitle">
          <div class="title">Devis multi-variantes</div>

          <span class="badge" :class="{ on: selectedVariantIds.length > 0 }" title="Sélection">
            <CheckCircleIcon v-if="selectedVariantIds.length > 0" class="bIc" />
            <span>
              {{ selectedContractsCount }}
              <span class="muted">/</span>
              {{ contracts.length }}
              <span class="muted">contrat(s)</span>
            </span>
          </span>

          <span class="badge soft" title="Date affichée">
            <span class="muted">Date :</span> <b>{{ todayFr() }}</b>
          </span>
        </div>
      </div>

      <div class="topRight">
        <div class="actions">
          <button class="btn" @click="reload" :disabled="busy.reload || loading" title="Recharger">
            <ArrowPathIcon class="ic16" />
            <span class="hideSm">Recharger</span>
          </button>

          <button class="btn" @click="clearSelection" :disabled="busy.export || loading" title="Vider sélection">
            <XMarkIcon class="ic16" />
            <span class="hideSm">Vider</span>
          </button>

          <button class="btn primary" @click="exportWordMulti" :disabled="busy.export || !canExport || loading">
            <ArrowDownTrayIcon class="ic16" />
            {{ busy.export ? "Export..." : "Exporter Word" }}
          </button>
        </div>

        <div class="miniOpts">
          <label class="chk">
            <input type="checkbox" v-model="exportOpts.useDevisSurcharges" />
            <span>Inclure surcharges</span>
          </label>
        </div>
      </div>
    </div>

    <!-- ALERTS -->
    <div v-if="error" class="alert error">
      <ExclamationTriangleIcon class="ic18" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-else-if="loading" class="alert">
      <div>Chargement…</div>
    </div>

    <!-- INFO: Majorations -->
    <div class="alert info">
      <InformationCircleIcon class="ic18" />
      <div class="infoTxt">
        <div class="infoTitle">Majorations</div>
        <div class="muted">
          Cette page n’intègre pas de “prévisualisation” des majorations.
          Pour que les majorations soient prises en compte dans les variantes exportées,
          il faut <b>les appliquer réellement</b> depuis la section <b>Majorations</b> (mise à jour DB).
        </div>
      </div>
    </div>

    <!-- GLOBAL TEXTS (✅ layout corrigé : plus de débordement) -->
    <div class="card wide">
      <div class="cardHead">
        <div class="lbl">Contenu document</div>
        <div class="hint">Intro & validité restent modifiables. Signature modifiable.</div>
      </div>

      <div class="docGrid">
        <div class="block">
          <div class="k">Introduction</div>
          <textarea class="ta" v-model="meta.intro" rows="4"></textarea>
        </div>

        <div class="block">
          <div class="k">Validité</div>
          <textarea class="ta" v-model="meta.validiteTexte" rows="3"></textarea>
        </div>

        <div class="block sig">
          <div class="k">Signature</div>
          <div class="sigGrid">
            <div>
              <div class="kk">Nom</div>
              <input class="input" v-model="meta.signature.nom" />
            </div>
            <div>
              <div class="kk">Poste</div>
              <input class="input" v-model="meta.signature.poste" />
            </div>
            <div>
              <div class="kk">Téléphone</div>
              <input class="input" v-model="meta.signature.telephone" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SELECTION TOOLBAR -->
    <div class="card wide">
      <div class="selectTop">
        <div class="lbl">Sélection des variantes</div>

        <div class="selectTools">
          <div class="search">
            <input class="input searchIn" v-model="query" placeholder="Rechercher contrat ou variante…" />
          </div>

          <label class="chk">
            <input type="checkbox" v-model="showSelectedOnly" />
            <span>Afficher seulement sélectionnés</span>
          </label>
        </div>
      </div>

      <div v-if="filteredContracts.length === 0" class="muted" style="padding: 8px 2px">
        Aucun contrat ne correspond au filtre.
      </div>

      <!-- Contracts list -->
      <div class="contracts">
        <div v-for="c in filteredContracts" :key="String(c?.id ?? '')" class="contractRow">
          <div class="rowHead" @click="toggleCollapse(c?.id)" role="button" tabindex="0">
            <div class="headLeft">
              <component :is="isCollapsed(c?.id) ? ChevronRightIcon : ChevronDownIcon" class="ic18 mutedIc" />
              <div class="headTexts">
                <div class="ctName ell">{{ contractUiTitle(c) }}</div>
                <div class="ctMeta muted">
                  Durée : <b>{{ int(c?.dureeMois) }}</b> mois
                  <span class="sep">•</span>
                  Quantité :
                  <b>{{ int((c as any)?.quantiteM3 || (c as any)?.volumeM3 || (c as any)?.volumeTotalM3 || 0) }}</b> m³
                </div>
              </div>
            </div>

            <div class="headRight">
              <span class="pill" :class="{ on: !!picks[String(c?.id ?? '')]?.variantId }">
                {{ picks[String(c?.id ?? '')]?.variantId ? "Sélectionnée" : "Aucune" }}
              </span>
            </div>
          </div>

          <div v-show="!isCollapsed(c?.id)" class="rowBody">
            <div class="pickGrid">
              <!-- Aucune -->
              <button
                class="pickCard none"
                type="button"
                :class="{ active: !ensurePick(c?.id).variantId }"
                @click="setPick(c?.id, null)"
              >
                <div class="pcTitle">Aucune</div>
                <div class="pcSub muted">Ne pas inclure ce contrat</div>
              </button>

              <!-- Variantes (✅ EBIT + PMV moyen) -->
              <button
                v-for="v in (c?.variants ?? [])"
                :key="String(v?.id ?? '')"
                class="pickCard"
                type="button"
                :class="{ active: ensurePick(c?.id).variantId === String(v?.id ?? '') }"
                @click="setPick(c?.id, String(v?.id ?? ''))"
                :title="vTitle(v)"
              >
                <div class="pcTitle ell">{{ vTitle(v) }}</div>

                <div class="pcKpis">
                  <div class="kpi">
                    <div class="kk2">PMV moyen</div>
                    <div class="vv mono">{{ money2(kpiForVariant(v).pmv) }} <span class="unit">DH/m³</span></div>
                  </div>
                  <div class="kpi">
                    <div class="kk2">EBIT</div>
                    <div class="vv mono">
                      {{ money2(kpiForVariant(v).ebit) }} <span class="unit">DH</span>
                      <span class="pct muted">({{ money2(kpiForVariant(v).ebitPct) }}%)</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!canExport" class="alert warn" style="margin-top: 12px">
        <ExclamationTriangleIcon class="ic18" />
        <div>
          Sélectionne au moins <b>une</b> variante (max <b>une</b> par contrat) pour activer l’export.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ✅ anti overflow global */
*{ box-sizing: border-box; }

.page{
  padding: 10px 12px;
  display:flex;
  flex-direction:column;
  gap:10px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Top bar */
.top{
  display:grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px 12px;
  border-radius: 18px;
  border: 1px solid rgba(16,24,40,0.10);
  background: linear-gradient(180deg, rgba(15,23,42,0.03), rgba(15,23,42,0.00));
}
@media (max-width: 980px){
  .top{ grid-template-columns: 1fr; }
}

.topLeft{ min-width: 0; }
.hTitle{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.title{ font-size: 15px; font-weight: 1000; color:#0f172a; }

.badge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-weight: 1000;
  font-size: 11px;
  color: rgba(15,23,42,0.72);
}
.badge.on{
  border-color: rgba(16,185,129,0.25);
  background: rgba(16,185,129,0.10);
  color: rgba(6,95,70,1);
}
.badge.soft{
  border-color: rgba(59,130,246,0.25);
  background: rgba(59,130,246,0.06);
  color: rgba(30,64,175,0.95);
}
.bIc{ width:16px; height:16px; }

.topRight{
  display:flex;
  flex-direction:column;
  gap:10px;
  align-items:flex-end;
}
@media (max-width: 980px){
  .topRight{ align-items: stretch; }
}

.actions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.miniOpts{ display:flex; justify-content:flex-end; }
@media (max-width: 980px){
  .actions{ justify-content:flex-start; }
  .miniOpts{ justify-content:flex-start; }
}

.btn{
  border:1px solid rgba(16,24,40,0.14);
  background:#fff;
  border-radius:12px;
  padding:8px 10px;
  font-size:11px;
  font-weight:1000;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:8px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
}
.btn:hover{ background: rgba(15,23,42,0.03); }
.btn.primary{
  background: rgba(24,64,112,0.95);
  border-color: rgba(24,64,112,0.55);
  color:#fff;
}
.btn.primary:hover{ background: rgba(24,64,112,1); }
.btn:disabled{ opacity: .6; cursor:not-allowed; }

.hideSm{ display:inline; }
@media (max-width: 520px){ .hideSm{ display:none; } }

.ic16{ width:16px; height:16px; }
.ic18{ width:18px; height:18px; }
.mutedIc{ color: rgba(15,23,42,0.6); }

.sep{ color:#9ca3af; }
.muted{ color:#6b7280; font-size:11.5px; }
.ell{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mono { font-variant-numeric: tabular-nums; }

/* Alerts / cards */
.card{
  background:#fff;
  border:1px solid rgba(16,24,40,0.10);
  border-radius:16px;
  padding:12px 12px;
}
.card.wide{ padding: 12px 12px; }

.alert{
  border:1px solid rgba(16,24,40,0.12);
  border-radius:14px;
  padding:10px 12px;
  background:#fff;
  color:#0f172a;
  font-size:12px;
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.alert.error{ border-color:#ef4444; background:#fff5f5; }
.alert.warn{ border-color:#f59e0b; background:#fffbeb; }
.alert.info{ border-color: rgba(59,130,246,0.35); background: rgba(59,130,246,0.06); }

.infoTxt{ display:flex; flex-direction:column; gap:2px; }
.infoTitle{ font-weight:1000; font-size:12.5px; }

/* Doc content (✅ fix overflow) */
.cardHead{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom: 10px;
}
.lbl{ font-weight:1000; font-size:13px; color:#0f172a; }
.hint{ font-size: 11.5px; color: rgba(15,23,42,0.65); }

/* ✅ grid robuste : minmax(0,1fr) + signature full row */
.docGrid{
  display:grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
@media (max-width: 980px){
  .docGrid{ grid-template-columns: 1fr; }
}

.block{ min-width:0; overflow:hidden; }
.k{ font-size: 11px; font-weight: 1000; color:#6b7280; margin-bottom: 6px; }
.kk{ font-size: 10.5px; font-weight: 1000; color:#6b7280; margin-bottom: 4px; }

.input{
  width:100%;
  padding:8px 10px;
  border:1px solid rgba(16,24,40,0.16);
  border-radius:12px;
  font-size:12px;
  background:#fff;
}
.ta{
  width:100%;
  border:1px solid rgba(16,24,40,0.16);
  border-radius:14px;
  padding:10px 12px;
  font-size:13px;
  background:#fff;
  resize: vertical;
  min-width: 0;
}

/* ✅ signature = pleine largeur, jamais en conflit */
.sig{ grid-column: 1 / -1; }
.sigGrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 10px;
}
@media (max-width: 980px){
  .sigGrid{ grid-template-columns: 1fr; }
}

/* Selection toolbar */
.selectTop{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap: 10px;
  flex-wrap:wrap;
  margin-bottom: 10px;
}
.selectTools{
  display:flex;
  gap: 10px;
  align-items:center;
  flex-wrap:wrap;
  justify-content:flex-end;
}
.search{ min-width: 320px; max-width: 520px; width: 42vw; }
@media (max-width: 980px){
  .search{ width: 100%; min-width: 0; max-width: none; }
}
.searchIn{ width:100%; }

/* Checkbox */
.chk{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:11.5px;
  font-weight:1000;
  color:#0f172a;
  user-select:none;
}
.chk input{ width:15px; height:15px; border-radius:6px; }

/* Contracts list */
.contracts{ display:flex; flex-direction:column; gap: 10px; }
.contractRow{
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 16px;
  overflow:hidden;
  background: rgba(255,255,255,0.96);
}
.rowHead{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(15,23,42,0.02);
  border-bottom: 1px solid rgba(16,24,40,0.08);
  cursor: pointer;
  user-select: none;
}
.headLeft{ display:flex; align-items:flex-start; gap: 8px; min-width:0; }
.headTexts{ min-width:0; }
.ctName{ font-weight:1000; color:#0f172a; font-size: 12.5px; }
.ctMeta{ margin-top: 2px; }

.headRight{ display:flex; align-items:center; gap: 10px; }

.pill{
  display:inline-flex;
  align-items:center;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-weight: 1000;
  font-size: 11px;
  color: rgba(15,23,42,0.75);
  white-space: nowrap;
}
.pill.on{
  border-color: rgba(16,185,129,0.25);
  background: rgba(16,185,129,0.10);
  color: rgba(6,95,70,1);
}

.rowBody{ padding: 12px 12px; }

.pickGrid{
  display:grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 1200px){
  .pickGrid{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 720px){
  .pickGrid{ grid-template-columns: repeat(1, minmax(0, 1fr)); }
}

.pickCard{
  border: 1px solid rgba(16,24,40,0.12);
  background: #fff;
  border-radius: 16px;
  padding: 10px 10px;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
  min-width:0;
}
.pickCard:hover{
  background: rgba(15,23,42,0.02);
  border-color: rgba(16,24,40,0.18);
}
.pickCard:active{ transform: translateY(0.5px); }

.pickCard.active{
  border-color: rgba(24,64,112,0.30);
  background: rgba(24,64,112,0.06);
  box-shadow: 0 0 0 3px rgba(24,64,112,0.10);
}

.pickCard.none{
  border-style: dashed;
  background: rgba(15,23,42,0.01);
}

.pcTitle{
  font-weight: 1000;
  font-size: 12px;
  color:#0f172a;
  margin-bottom: 8px;
}
.pcSub{ font-size: 11.5px; }

/* ✅ KPI block inside card */
.pcKpis{
  display:flex;
  flex-direction:column;
  gap: 8px;
}
.kpi{
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.02);
  border-radius: 12px;
  padding: 8px 9px;
}
.kk2{
  font-size: 10px;
  font-weight: 1000;
  color: rgba(15,23,42,0.55);
  text-transform: uppercase;
  letter-spacing: .02em;
}
.vv{
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 1000;
  color: #0f172a;
}
.unit{ color: rgba(15,23,42,0.55); font-weight: 900; margin-left: 6px; font-size: 11.5px; }
.pct{ margin-left: 6px; }
</style>
