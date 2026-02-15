<!-- ✅ src/pages/MultiVarianteDevisPage.vue (FICHIER COMPLET — MAJ: titres contrats/variantes sans id) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { contractUiTitle } from "@/services/contractTitle";

import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
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
function vTitle(v: any) {
  // ✅ pas de fallback sur id
  return String(v?.title ?? v?.name ?? v?.label ?? "Variante");
}

/* =========================
   STATE
========================= */
const pnl = computed<any | null>(() => (store as any).activePnl ?? null);

// contracts list (robuste)
const contracts = computed<any[]>(() => (pnl.value?.contracts ?? []) as any[]);

type ContractPick = {
  contractId: string;
  variantId: string | null;
};

const picks = reactive<Record<string, ContractPick>>({});

// ✅ helper pour éviter "Object is possibly 'undefined'" sur picks[cid]
function ensurePick(contractId: any): ContractPick {
  const cid = String(contractId ?? "");
  if (!picks[cid]) picks[cid] = { contractId: cid, variantId: null };
  return picks[cid];
}

// options export
const exportOpts = reactive({
  useMajorations: true,
  useDevisSurcharges: true,
});

// meta / generic header (global)
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

// rappel (global) : on prend une valeur synthèse (max durée, somme volumes si dispo)
const rappel = computed(() => {
  const cs = contracts.value ?? [];
  const dureeMax = cs.reduce((m, c) => Math.max(m, n(c?.dureeMois)), 0);

  // quantiteM3 possible au niveau contrat → sinon 0
  const qSum = cs.reduce((s, c) => {
    const q =
      n((c as any)?.quantiteM3) ||
      n((c as any)?.volumeM3) ||
      n((c as any)?.volumeTotalM3) ||
      0;
    return s + q;
  }, 0);

  return {
    dureeMois: dureeMax,
    quantiteM3: qSum,
    demarrage: String(pnl.value?.startDate ?? ""),
    lieu: String(pnl.value?.city ?? ""),
  };
});

const selectedVariantIds = computed(() => {
  const ids: string[] = [];
  for (const c of contracts.value ?? []) {
    const cid = String(c?.id ?? "");
    const pick = picks[cid];
    if (pick?.variantId) ids.push(String(pick.variantId));
  }
  return ids;
});

const uniqueContractCountSelected = computed(() => {
  // par construction: 1 pick max par contrat, donc c'est juste count non-null
  let k = 0;
  for (const c of contracts.value ?? []) {
    const cid = String(c?.id ?? "");
    if (picks[cid]?.variantId) k++;
  }
  return k;
});

const canExport = computed(() => {
  // au moins 1 variante sélectionnée
  const ids = selectedVariantIds.value;
  return ids.length > 0 && ids.length === uniqueContractCountSelected.value;
});

function initPicks() {
  // initialise les picks (1 contrat => 0 ou 1 variante présélectionnée si activeVariant appartient)
  const cs = contracts.value ?? [];
  const activeVid = String((store as any).activeVariant?.id ?? "");
  for (const c of cs) {
    const cid = String(c?.id ?? "");
    ensurePick(cid);

    const vars = (c?.variants ?? []) as any[];
    if (!vars.length) continue;

    // si active variant est dans ce contrat, on la preselect
    const hit = activeVid && vars.some((v) => String(v?.id ?? "") === activeVid);
    if (hit) ensurePick(cid).variantId = activeVid;
  }

  // init meta depuis pnl
  meta.ville = String(pnl.value?.city ?? meta.ville ?? "");
  meta.client = String(pnl.value?.client ?? meta.client ?? "");
  meta.titreProjet = String(pnl.value?.title ?? meta.titreProjet ?? "");

  if (!meta.intro.trim()) {
    meta.intro =
      `Nous vous prions de trouver ci-dessous nos propositions de prix relatives au projet "${meta.titreProjet}". ` +
      `Chaque proposition correspond à une variante (une seule variante par contrat).`;
  }
}

async function reload() {
  loading.value = true;
  busy.reload = true;
  error.value = null;
  try {
    if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
    initPicks();
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
      options: { ...exportOpts },
      meta: {
        ville: meta.ville,
        date: meta.date,
        client: meta.client,
        titreProjet: meta.titreProjet,
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
  () => initPicks()
);
</script>

<template>
  <div class="page">
    <!-- TOP -->
    <div class="top">
      <div class="tleft">
        <div class="title">Devis multi-variantes</div>
        <div class="subline">
          <span class="muted">P&L :</span>
          <b class="ell">{{ pnl?.title ?? pnl?.name ?? "—" }}</b>
          <span class="sep">•</span>
          <span class="muted">Client :</span>
          <b class="ell">{{ pnl?.client ?? pnl?.clientName ?? "—" }}</b>
        </div>
      </div>

      <div class="tright">
        <button class="btn" @click="reload" :disabled="busy.reload || loading" title="Recharger">
          <ArrowPathIcon class="actIc" />
        </button>

        <button class="btn" @click="clearSelection" :disabled="busy.export">Vider sélection</button>

        <button class="btn primary" @click="exportWordMulti" :disabled="busy.export || !canExport">
          <ArrowDownTrayIcon class="actIc" />
          {{ busy.export ? "Export..." : "Exporter Word" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error">
      <ExclamationTriangleIcon class="ic" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- OPTIONS -->
    <div class="card">
      <div class="grid2">
        <div class="block">
          <div class="lbl">Paramètres d’export</div>

          <label class="chk">
            <input type="checkbox" v-model="exportOpts.useMajorations" />
            <span>Inclure majorations</span>
          </label>

          <label class="chk">
            <input type="checkbox" v-model="exportOpts.useDevisSurcharges" />
            <span>Inclure surcharges devis</span>
          </label>

          <div class="muted" style="margin-top: 8px">
            Règle : <b>1 seule variante par contrat</b>. Tu peux sélectionner 0 ou 1 variante pour chaque contrat.
          </div>
        </div>

        <div class="block">
          <div class="lbl">En-tête document (global)</div>

          <div class="formGrid">
            <div>
              <div class="k">Ville</div>
              <input class="input" v-model="meta.ville" placeholder="Ville" />
            </div>
            <div>
              <div class="k">Date</div>
              <input class="input" v-model="meta.date" type="date" />
            </div>
            <div>
              <div class="k">Client</div>
              <input class="input" v-model="meta.client" placeholder="Client" />
            </div>
            <div>
              <div class="k">Titre projet</div>
              <input class="input" v-model="meta.titreProjet" placeholder="Titre projet" />
            </div>
          </div>

          <div class="k" style="margin-top: 10px">Introduction</div>
          <textarea class="ta" v-model="meta.intro" rows="3"></textarea>

          <div class="k" style="margin-top: 10px">Validité</div>
          <textarea class="ta" v-model="meta.validiteTexte" rows="2"></textarea>
        </div>
      </div>
    </div>

    <!-- SIGNATURE -->
    <div class="card">
      <div class="lbl">Signature (global)</div>
      <div class="grid3">
        <div>
          <div class="k">Nom</div>
          <input class="input" v-model="meta.signature.nom" />
        </div>
        <div>
          <div class="k">Poste</div>
          <input class="input" v-model="meta.signature.poste" />
        </div>
        <div>
          <div class="k">Téléphone</div>
          <input class="input" v-model="meta.signature.telephone" />
        </div>
      </div>

      <div class="muted" style="margin-top: 8px">
        Date affichée : <b>{{ todayFr() }}</b> • Sélection : <b>{{ selectedVariantIds.length }}</b> proposition(s)
      </div>
    </div>

    <!-- SELECTION PAR CONTRAT -->
    <div class="card">
      <div class="lbl">Sélection des variantes (par contrat)</div>

      <div v-if="contracts.length === 0" class="muted">Aucun contrat dans ce P&L.</div>

      <div class="contracts">
        <div v-for="c in contracts" :key="String(c?.id ?? '')" class="contractCard">
          <div class="contractHead">
            <div class="contractTitle">
              <!-- ✅ titre contrat: via helper, pas d'id -->
              <div class="ctName">{{ contractUiTitle(c) }}</div>
              <div class="ctSub muted">
                Durée : <b>{{ int(c?.dureeMois) }}</b> mois
                <span class="sep">•</span>
                Quantité :
                <b>{{ int((c as any)?.quantiteM3 || (c as any)?.volumeM3 || (c as any)?.volumeTotalM3 || 0) }}</b> m³
              </div>
            </div>

            <div class="pickState">
              <span class="pill" :class="{ on: !!picks[String(c?.id ?? '')]?.variantId }">
                {{ picks[String(c?.id ?? '')]?.variantId ? "Sélectionnée" : "Non sélectionnée" }}
              </span>
            </div>
          </div>

          <div class="variants">
            <label v-for="v in (c?.variants ?? [])" :key="String(v?.id ?? '')" class="varRow">
              <input
                type="radio"
                :name="'pick-' + String(c?.id ?? '')"
                :value="String(v?.id ?? '')"
                v-model="ensurePick(c?.id).variantId"
              />
              <div class="varInfo">
                <div class="varTitle">
                  <!-- ✅ titre variante: pas d'id -->
                  <b class="ell">{{ vTitle(v) }}</b>
                </div>
                <div class="muted varSub">(Export = proposition dédiée à ce contrat)</div>
              </div>
            </label>

            <label class="varRow clear">
              <input
                type="radio"
                :name="'pick-' + String(c?.id ?? '')"
                :value="null"
                :checked="!ensurePick(c?.id).variantId"
                @change="ensurePick(c?.id).variantId = null"
              />
              <div class="varInfo">
                <div class="varTitle muted"><b>Aucune</b></div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div v-if="!canExport" class="alert warn" style="margin-top: 10px">
        <ExclamationTriangleIcon class="ic" />
        <div>Sélectionne au moins <b>une</b> variante (et max <b>une</b> par contrat) pour activer l’export.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 10px 12px; display:flex; flex-direction:column; gap:10px; }

.top { display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap; }
.tleft { display:flex; flex-direction:column; gap:2px; min-width: 260px; }
.title { font-size:15px; font-weight:900; color:#111827; line-height:1.15; }
.subline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:11.5px; }
.sep { color:#9ca3af; }

.tright { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:10px 12px; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:12px; display:flex; gap:10px; align-items:flex-start; }
.alert.error { border-color:#ef4444; background:#fff5f5; }
.alert.warn { border-color:#f59e0b; background:#fffbeb; }
.ic { width:18px; height:18px; margin-top:2px; color: rgba(15,23,42,0.7); }

.btn {
  border:1px solid #d1d5db;
  background:#fff;
  border-radius:12px;
  padding:7px 9px;
  font-size:11px;
  font-weight:900;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:8px;
}
.btn:hover { background:#f9fafb; }
.btn.primary { background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover { background: rgba(24,64,112,1); }
.btn:disabled { opacity: .6; cursor:not-allowed; }

.actIc{ width:16px; height:16px; }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:12px; background:#fff; }
.ta{
  width:100%;
  border:1px solid #d1d5db;
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 13px;
  background:#fff;
  resize: vertical;
}
.muted { color:#6b7280; font-size:11.5px; }
.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.lbl{ font-weight: 1000; font-size: 13px; color:#111827; margin-bottom: 8px; }
.k{ font-size: 11px; font-weight: 1000; color:#6b7280; margin-bottom: 4px; }

.grid2{ display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.grid3{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
@media (max-width: 980px){
  .grid2{ grid-template-columns: 1fr; }
  .grid3{ grid-template-columns: 1fr; }
}

.chk{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:11.5px;
  font-weight:900;
  color:#111827;
  user-select:none;
  margin-right: 14px;
}
.chk input{ width:15px; height:15px; border-radius:6px; }

.formGrid{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 980px){
  .formGrid{ grid-template-columns: 1fr; }
}

/* contracts */
.contracts{ display:flex; flex-direction:column; gap: 10px; }
.contractCard{
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 16px;
  overflow:hidden;
  background: rgba(255,255,255,0.95);
}
.contractHead{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(15,23,42,0.02);
  border-bottom: 1px solid rgba(16,24,40,0.08);
}
.ctName{ font-weight: 1000; color:#0f172a; font-size: 12.5px; }
.ctSub{ margin-top: 3px; }
.variants{ padding: 10px 12px; display:flex; flex-direction:column; gap: 8px; }
.varRow{
  display:flex;
  gap: 10px;
  align-items:flex-start;
  padding: 8px 10px;
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 14px;
  cursor: pointer;
  background:#fff;
}
.varRow:hover{ background: rgba(15,23,42,0.02); }
.varRow input{ margin-top: 3px; }
.varInfo{ min-width:0; flex:1; }
.varTitle{ font-size: 12px; color:#0f172a; }
.varSub{ margin-top: 3px; }

.varRow.clear{ opacity: .85; }

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
  border-color: rgba(24,64,112,0.25);
  background: rgba(24,64,112,0.08);
  color: rgba(24,64,112,1);
}
</style>
