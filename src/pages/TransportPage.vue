<!-- ✅ src/pages/TransportPage.vue (FICHIER COMPLET / moyenne + calculateur zones (UI only) + toast non bloquant + ✅ importer depuis autre variante (save séparé)) -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

// Heroicons
import {
  ArrowPathIcon,
  CheckIcon,
  CalculatorIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
});

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(x: any, min: number, max: number) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}
function nearlyEqual(a: number, b: number, eps = 0.001) {
  return Math.abs(a - b) <= eps;
}

/* =========================
   ACTIVE VARIANT ONLY
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => toNum(contract.value?.dureeMois ?? 0));

/* =========================
   MODEL
   ✅ On enregistre TOUJOURS une moyenne (type=MOYENNE)
   ✅ Les zones ne sont PAS envoyées en BD (UI only)
========================= */
type ZoneKey = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";
type ZoneRow = { key: ZoneKey; label: string; pct: number; prix: number };

const DEFAULT_ZONES: ZoneRow[] = [
  { key: "Z1", label: "Z1 — 0–10 km", pct: 0, prix: 0 },
  { key: "Z2", label: "Z2 — 10–20 km", pct: 0, prix: 0 },
  { key: "Z3", label: "Z3 — 20–30 km", pct: 0, prix: 0 },
  { key: "Z4", label: "Z4 — 30–40 km", pct: 0, prix: 0 },
  { key: "Z5", label: "Z5 — 40–50 km", pct: 0, prix: 0 },
];

const ui = reactive({
  calcOn: false, // ✅ calculateur zones visible seulement si activé
});

const edit = reactive({
  prixMoyen: 0,

  // UI-only zones
  zones: DEFAULT_ZONES.map((z) => ({ ...z })) as ZoneRow[],

  includePompage: false,
  volumePompePct: 0,
  prixAchatPompe: 0,
  prixVentePompe: 0,
});

const manualPrixMoyen = ref<number>(0);

/* =========================
   LOAD FROM VARIANT
========================= */
function loadFromVariant() {
  const t = variant.value?.transport ?? {};

  const pm = toNum((t as any)?.prixMoyen);
  manualPrixMoyen.value = pm;
  edit.prixMoyen = pm;

  // -------------------------
  // pompage (persist + backward compatible)
  // -------------------------
  const rawPct = clamp((t as any)?.volumePompePct, 0, 100);
  const rawPA = clamp((t as any)?.prixAchatPompe, 0, 1e9);
  const rawPV = clamp((t as any)?.prixVentePompe, 0, 1e9);

  const incRaw = (t as any)?.includePompage;

  // ✅ ancien enregistrement: si flag absent, on déduit depuis valeurs > 0
  const hasPompe = rawPct > 0 || rawPA > 0 || rawPV > 0;

  edit.includePompage = typeof incRaw === "boolean" ? Boolean(incRaw) : hasPompe;

  // ✅ on conserve les valeurs même si includePompage = false
  edit.volumePompePct = rawPct;
  edit.prixAchatPompe = rawPA;
  edit.prixVentePompe = rawPV;

  // reset zones UI (on ne persiste pas)
  edit.zones = DEFAULT_ZONES.map((z) => ({ ...z }));
}
watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

/* =========================
   COMPUTEDS (zones + moyenne + pompage)
========================= */
const pctSum = computed(() => (edit.zones ?? []).reduce((s, z) => s + toNum(z.pct), 0));
const pctOk = computed(() => nearlyEqual(pctSum.value, 100));
const remainingPct = computed(() => Math.max(0, 100 - pctSum.value));

const prixMoyenParZone = computed(() => {
  const list = edit.zones ?? [];
  return list.reduce((s, z) => s + toNum(z.prix) * (toNum(z.pct) / 100), 0);
});

// ✅ La moyenne utilisée par la page
const prixMoyenUsed = computed(() => (ui.calcOn ? prixMoyenParZone.value : edit.prixMoyen));

watch(
  () => ui.calcOn,
  (on) => {
    if (on) edit.prixMoyen = Number(prixMoyenParZone.value.toFixed(2));
    else edit.prixMoyen = manualPrixMoyen.value;
  }
);

watch(
  () => prixMoyenParZone.value,
  (v) => {
    if (ui.calcOn) edit.prixMoyen = Number(toNum(v).toFixed(2));
  }
);

// impact pompage
const margePompageParM3 = computed(() => {
  if (!edit.includePompage) return 0;
  const marge = toNum(edit.prixVentePompe) - toNum(edit.prixAchatPompe);
  const pct = toNum(edit.volumePompePct) / 100;
  return marge * pct;
});

const canSave = computed(() => {
  if (!variant.value) return false;
  if (ui.calcOn && !pctOk.value) return false; // bloquant uniquement si calculateur actif
  return true;
});

/* =========================
   ZONES UX (table compacte)
========================= */
const overMsg = ref<string>("");

function setPct(z: ZoneRow, raw: any) {
  overMsg.value = "";
  const next = clamp(raw, 0, 100);

  const sumWithout = pctSum.value - toNum(z.pct);
  const maxForThis = clamp(100 - sumWithout, 0, 100);

  if (next > maxForThis + 1e-9) {
    z.pct = maxForThis;
    overMsg.value = `Somme max = 100%. Pour "${z.label}", max autorisé = ${n(maxForThis, 2)}%.`;
    return;
  }
  z.pct = next;
}

function normalizeTo100ByLast() {
  const list: ZoneRow[] = (edit.zones ?? []).map((z) => ({ ...z }));
  if (list.length === 0) return;

  const last = list.pop();
  if (!last) return;

  const sum = list.reduce((s, z) => s + toNum(z.pct), 0) + toNum(last.pct);
  const drift = 100 - sum;

  last.pct = clamp(toNum(last.pct) + drift, 0, 100);

  list.push(last);
  edit.zones = list;
}

function splitEqual() {
  const src: ZoneRow[] = edit.zones ?? [];
  const len = src.length;
  if (len === 0) return;

  const each = 100 / len;

  // ✅ on garde key/label de src pour rester strict TS
  const list: ZoneRow[] = src.map((z) => ({
    key: z.key,
    label: z.label,
    prix: toNum(z.prix),
    pct: clamp(each, 0, 100),
  }));

  edit.zones = list;
  normalizeTo100ByLast();
}

/* =========================
   "RÉPARTITION ÉGALE" AVANCÉE (escalier prix)
========================= */
const stair = reactive({
  open: false,
  maxZone: 5,
  basePrix: 0,
  stepPrix: 0,
});

function openStair() {
  stair.open = true;
  stair.maxZone = 5;
  stair.basePrix = 0;
  stair.stepPrix = 0;
}
function closeStair() {
  stair.open = false;
}
function applyStaircase() {
  const maxZ = clamp(stair.maxZone, 1, 5);
  const base = clamp(stair.basePrix, 0, 1e9);
  const step = clamp(stair.stepPrix, 0, 1e9);

  const list: ZoneRow[] = DEFAULT_ZONES.map((z, idx) => {
    const i = idx + 1;
    if (i <= maxZ) {
      return {
        ...z,
        prix: base + step * (i - 1),
        pct: 100 / maxZ,
      };
    }
    return { ...z, prix: 0, pct: 0 };
  });

  edit.zones = list;
  normalizeTo100ByLast();
  ui.calcOn = true;
  closeStair();
}

/* =========================
   TOAST (non bloquant)
========================= */
const toast = reactive({
  show: false,
  kind: "ok" as "ok" | "err" | "info",
  msg: "",
});
let toastT: any = null;
function showToast(kind: "ok" | "err" | "info", msg: string) {
  toast.kind = kind;
  toast.msg = msg;
  toast.show = true;
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => (toast.show = false), 2400);
}
onBeforeUnmount(() => {
  if (toastT) clearTimeout(toastT);
});

/* =========================
   CONFIRM (save)
========================= */
const confirm = reactive({
  open: false,
  msg: "",
});
function openConfirm() {
  confirm.msg =
    `Confirmer la mise à jour de la moyenne de transport` +
    (edit.includePompage ? " + pompage" : "") +
    ` pour la variante active ?`;
  confirm.open = true;
}
function closeConfirm() {
  confirm.open = false;
}

const saving = ref(false);
const err = ref<string | null>(null);

function buildPayload(): any {
  const tExisting: any = variant.value?.transport ?? {};
  return {
    category: tExisting.category ?? "LOGISTIQUE_APPRO",
    type: "MOYENNE",
    prixMoyen: Number(toNum(prixMoyenUsed.value)),
    zones: [],

    // ✅ persiste le flag + conserve valeurs (ne force plus à 0)
    includePompage: Boolean(edit.includePompage),
    volumePompePct: Number(clamp(edit.volumePompePct, 0, 100)),
    prixAchatPompe: Number(clamp(edit.prixAchatPompe, 0, 1e9)),
    prixVentePompe: Number(clamp(edit.prixVentePompe, 0, 1e9)),
  };
}

async function save() {
  if (!variant.value) return;

  if (!canSave.value) {
    showToast("err", "Somme des % zones doit être exactement 100% (calculateur actif).");
    return;
  }

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { transport: buildPayload() });

    const t = (store as any).activeVariant?.transport ?? {};
    manualPrixMoyen.value = toNum(t?.prixMoyen);
    if (!ui.calcOn) edit.prixMoyen = manualPrixMoyen.value;

    showToast("ok", "Transport mis à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast("err", String(err.value));
  } finally {
    saving.value = false;
  }
}

/* =========================
   ✅ IMPORTER (depuis autre variante / save séparé)
========================= */
const impOpen = ref(false);
const impBusy = ref(false);
const impErr = ref<string | null>(null);

function findVariantById(variantId: string): any | null {
  const id = String(variantId ?? "").trim();
  if (!id) return null;

  // ✅ cherche dans toutes les variantes chargées
  for (const p of (store as any).pnls ?? []) {
    for (const c of (p as any)?.contracts ?? []) {
      for (const v of c?.variants ?? []) {
        if (String(v?.id ?? "") === id) return v;
      }
    }
  }
  return null;
}

function applyTransportFromVariant(srcVariant: any) {
  const t = srcVariant?.transport ?? {};
  const pm = toNum((t as any)?.prixMoyen);

  // ✅ Importer copie la section "persistée": moyenne + pompage (zones UI reset)
  ui.calcOn = false;

  manualPrixMoyen.value = pm;
  edit.prixMoyen = pm;

  // ✅ IMPORTANT: respecter includePompage s'il existe (sinon fallback ancien)
  const rawPct = clamp((t as any)?.volumePompePct, 0, 100);
  const rawPA = clamp((t as any)?.prixAchatPompe, 0, 1e9);
  const rawPV = clamp((t as any)?.prixVentePompe, 0, 1e9);
  const incRaw = (t as any)?.includePompage;
  const hasPompe = rawPct > 0 || rawPA > 0 || rawPV > 0;

  edit.includePompage = typeof incRaw === "boolean" ? Boolean(incRaw) : hasPompe;

  edit.volumePompePct = rawPct;
  edit.prixAchatPompe = rawPA;
  edit.prixVentePompe = rawPV;

  edit.zones = DEFAULT_ZONES.map((z) => ({ ...z }));
}

async function onApplyImport(payload: { sourceVariantId: string }) {
  if (!variant.value) return;

  const sourceId = String(payload?.sourceVariantId ?? "").trim();
  if (!sourceId) return;

  if (String(variant.value?.id ?? "") === sourceId) {
    showToast("info", "La source est déjà la variante active.");
    impOpen.value = false;
    return;
  }

  impErr.value = null;
  impBusy.value = true;
  try {
    const src = findVariantById(sourceId);

    if (!src) {
      // ✅ si jamais pas chargé (rare), on tente de recharger tout
      await (store as any).loadPnls?.();
    }

    const src2 = src ?? findVariantById(sourceId);
    if (!src2) {
      showToast("err", "Variante source introuvable (données non chargées).");
      return;
    }

    applyTransportFromVariant(src2);
    showToast("ok", "Transport importé dans la variante active. Pense à enregistrer.");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast("err", String(impErr.value));
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   GENERALISER (inchangé)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeTo(variantIds: string[]) {
  const sourceId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceId) return;

  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const targetIdRaw of variantIds ?? []) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceId) continue;
      await (store as any).updateVariant(targetId, { transport: payload });
    }
    showToast("ok", "Transport généralisé.");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast("err", String(genErr.value));
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;
  await generalizeTo(ids);
  if (!genErr.value) genOpen.value = false;
}

/* =========================
   RESET
========================= */
function reset() {
  loadFromVariant();
  showToast("info", "Valeurs rechargées.");
}
</script>

<template>
  <div class="page">
    <!-- ✅ Header sticky sous HeaderDashboard -->
    <div class="head">
      <div class="headL">
        <div class="h1">Transport</div>
        <div class="sub muted" v-if="variant">
          Variante active : <b class="ell">{{ variant?.title ?? String(variant?.id ?? "").slice(0, 6) }}</b>
          <span v-if="dureeMois" class="dot">•</span>
          <span v-if="dureeMois" class="pill">{{ dureeMois }} mois</span>
        </div>
        <div class="sub muted" v-else>Aucune variante active.</div>
      </div>

      <div class="headR">
        <button class="btn" type="button" :disabled="!variant || saving" @click="reset" title="Réinitialiser">
          <ArrowPathIcon class="ic" />
          Réinitialiser
        </button>

        <!-- ✅ NEW: Importer -->
        <button class="btn" type="button" :disabled="!variant || impBusy || saving || genBusy" @click="impOpen = true" title="Importer">
          <ArrowDownTrayIcon class="ic" />
          {{ impBusy ? "..." : "Importer" }}
        </button>

        <button class="btn" type="button" :disabled="!variant || genBusy || saving" @click="genOpen = true" title="Généraliser">
          <Squares2X2Icon class="ic" />
          Généraliser
        </button>

        <!-- ✅ CHANGEMENT: Appliquer => Enregistrer -->
        <button class="btn primary" type="button" :disabled="!canSave || saving" @click="openConfirm()" title="Enregistrer">
          <CheckIcon class="ic" />
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="alert info">
      <ArrowPathIcon class="ic spin" />
      Chargement…
    </div>
    <div v-else-if="(store as any).error" class="alert err">
      <ExclamationTriangleIcon class="ic" />
      <div><b>Erreur :</b> {{ (store as any).error }}</div>
    </div>

    <template v-else>
      <div v-if="err" class="alert err">
        <ExclamationTriangleIcon class="ic" />
        <div><b>Erreur :</b> {{ err }}</div>
      </div>

      <div v-if="!variant" class="card muted">
        Sélectionne une variante (via Mes P&L) puis reviens ici.
      </div>

      <template v-else>
        <!-- ✅ Layout: gauche (saisie) + droite (infos + actions) -->
        <div class="grid">
          <!-- LEFT -->
          <div class="card">
            <div class="rowTop">
              <div class="field">
                <div class="lbl">Moyenne transport</div>
                <div class="avgLine">
                  <input
                    class="in r mono"
                    type="number"
                    step="0.01"
                    :disabled="ui.calcOn"
                    :value="Number(toNum(edit.prixMoyen).toFixed(2))"
                    @input="
                      (e) => {
                        if (!ui.calcOn) {
                          edit.prixMoyen = toNum((e.target as HTMLInputElement).value);
                          manualPrixMoyen = toNum(edit.prixMoyen); /* ✅ FIX */
                        }
                      }
                    "
                  />
                  <span class="unit">MAD/m³</span>
                </div>
                <div class="hint muted">
                  {{ ui.calcOn ? "Calculée via zones (UI)." : "Saisie directe." }}
                </div>
              </div>

              <div class="field">
                <div class="lbl">Calculateur zones</div>
                <button class="btn ghost" type="button" @click="ui.calcOn = !ui.calcOn">
                  <CalculatorIcon class="ic" />
                  {{ ui.calcOn ? "Désactiver" : "Activer" }}
                </button>
                <div class="hint muted">Zones = outil de calcul. Non sauvegardées.</div>
              </div>
            </div>

            <!-- ✅ Calculateur (visible uniquement si activé) -->
            <div v-if="ui.calcOn" class="calcWrap">
              <div class="calcHead">
                <div class="calcTitle">Zonning</div>
                <div class="calcActions">
                  <button class="btn" type="button" @click="openStair()">
                    Répartition égale
                  </button>
                  <button class="btn" type="button" @click="splitEqual()">
                    % égaux
                  </button>
                </div>
              </div>

              <div v-if="overMsg" class="inlineWarn">
                <InformationCircleIcon class="ic" />
                <div>{{ overMsg }}</div>
              </div>

              <!-- ✅ Tableau compact -->
              <div class="zonesTableWrap">
                <table class="zonesTable">
                  <thead>
                    <tr>
                      <th class="zLab">Zone</th>
                      <th class="zPct r">% </th>
                      <th class="zPrix r">Prix</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr v-for="z in edit.zones" :key="z.key">
                      <td class="zLab">
                        <span class="zTitle ell" :title="z.label">{{ z.label }}</span>
                      </td>

                      <td class="zPct r">
                        <div class="cellIn">
                          <input
                            class="zin r mono"
                            type="number"
                            step="0.01"
                            :value="Number(toNum(z.pct).toFixed(2))"
                            @input="(e) => setPct(z, (e.target as HTMLInputElement).value)"
                          />
                          <span class="cellUnit">%</span>
                        </div>
                      </td>

                      <td class="zPrix r">
                        <div class="cellIn">
                          <input class="zin r mono" type="number" step="0.01" v-model.number="z.prix" />
                          <span class="cellUnit">DH</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ✅ CHANGEMENT: moyenne calculée à côté de Somme -->
              <div class="calcFoot">
                <div class="sum" :class="{ ok: pctOk, bad: !pctOk }">
                  <span class="muted">Somme</span>
                  <b>{{ n(pctSum, 2) }}%</b>
                  <span v-if="!pctOk" class="muted"> (reste {{ n(remainingPct, 2) }}%)</span>

                  <span class="sep">•</span>

                  <span class="avg">
                    Moyenne :
                    <b>{{ n(prixMoyenParZone, 2) }}</b>
                    <span class="muted">MAD/m³</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- POMPAGE -->
            <div class="pump">
              <div class="pumpTop">
                <label class="check">
                  <input type="checkbox" v-model="edit.includePompage" />
                  <span><b>Inclure pompage</b></span>
                </label>
                <div class="muted small">
                  Impact marge/m³ : <b>{{ n(margePompageParM3, 2) }}</b>
                </div>
              </div>

              <div v-if="edit.includePompage" class="pumpGrid">
                <div class="pField">
                  <div class="lbl">%</div>
                  <input class="in r mono" type="number" step="0.01" v-model.number="edit.volumePompePct" />
                </div>
                <div class="pField">
                  <div class="lbl">Achat</div>
                  <input class="in r mono" type="number" step="0.01" v-model.number="edit.prixAchatPompe" />
                </div>
                <div class="pField">
                  <div class="lbl">Vente</div>
                  <input class="in r mono" type="number" step="0.01" v-model.number="edit.prixVentePompe" />
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT -->
          <div class="side">
            <div class="card sideCard">
              <div class="sideTitle">Résumé</div>

              <div class="kv">
                <div class="k muted">Moyenne (utilisée)</div>
                <div class="v mono">{{ n(prixMoyenUsed, 2) }} <span class="muted">MAD/m³</span></div>
              </div>

              <div v-if="ui.calcOn" class="kv" style="margin-top:10px">
                <div class="k muted">Zonning</div>
                <div class="v">
                  <span class="pill" :class="pctOk ? 'pill-ok' : 'pill-bad'">
                    {{ pctOk ? "OK 100%" : "Incomplet" }}
                  </span>
                  <span class="muted" style="margin-left: 8px">{{ n(pctSum, 2) }}%</span>
                </div>
              </div>

              <div class="kv" style="margin-top:10px">
                <div class="k muted">Pompage</div>
                <div class="v">
                  <span class="pill" :class="edit.includePompage ? 'pill-ok' : ''">
                    {{ edit.includePompage ? "Inclus" : "Non" }}
                  </span>
                  <span class="muted" style="margin-left: 8px">marge/m³ {{ n(margePompageParM3, 2) }}</span>
                </div>
              </div>

              <div v-if="ui.calcOn && !pctOk" class="warnBox">
                <ExclamationTriangleIcon class="ic" />
                <div>
                  Somme des % doit être <b>100%</b> pour pouvoir enregistrer.
                </div>
              </div>

              <div class="sideHint muted">
                Le calculateur sert uniquement à calculer la moyenne. Seule la moyenne + pompage sont enregistrés.
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ✅ MODAL IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Transport"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ MODAL GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Transport"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- ✅ CONFIRM SAVE -->
    <div v-if="confirm.open" class="overlay" @click.self="closeConfirm()">
      <div class="modal">
        <div class="mhead">
          <div class="mtitle">Confirmer</div>
          <button class="x" @click="closeConfirm()" title="Fermer">×</button>
        </div>
        <div class="mbody">
          {{ confirm.msg }}
        </div>
        <div class="mact">
          <button class="btn ghost" @click="closeConfirm()">Annuler</button>
          <button class="btn primary" :disabled="saving || !canSave" @click="closeConfirm(); save();">
            {{ saving ? "..." : "Confirmer" }}
          </button>
        </div>
      </div>
    </div>

    <!-- ✅ MODAL "Répartition égale" escalier -->
    <div v-if="stair.open" class="overlay" @click.self="closeStair()">
      <div class="modal">
        <div class="mhead">
          <div class="mtitle">Répartition égale</div>
          <button class="x" @click="closeStair()" title="Fermer">×</button>
        </div>

        <div class="mbody">
          <div class="mgrid">
            <div class="mfield">
              <div class="lbl">Zone max</div>
              <select class="in" v-model.number="stair.maxZone">
                <option :value="1">Z1</option>
                <option :value="2">Z2</option>
                <option :value="3">Z3</option>
                <option :value="4">Z4</option>
                <option :value="5">Z5</option>
              </select>
            </div>

            <div class="mfield">
              <div class="lbl">Prix base (Z1)</div>
              <input class="in r mono" type="number" step="0.01" v-model.number="stair.basePrix" />
            </div>

            <div class="mfield">
              <div class="lbl">Prix du pas</div>
              <input class="in r mono" type="number" step="0.01" v-model.number="stair.stepPrix" />
            </div>
          </div>

          <div class="muted small" style="margin-top: 8px">
            Prix Z2 = Z1 + pas, etc. % répartis également sur Z1..Zmax (reste à 0).
          </div>
        </div>

        <div class="mact">
          <button class="btn ghost" @click="closeStair()">Annuler</button>
          <button class="btn primary" @click="applyStaircase()">Appliquer</button>
        </div>
      </div>
    </div>

    <!-- ✅ TOAST non bloquant -->
    <div v-if="toast.show" class="toast" :class="toast.kind">
      <div class="ticon">
        <CheckIcon v-if="toast.kind === 'ok'" class="ic" />
        <ExclamationTriangleIcon v-else-if="toast.kind === 'err'" class="ic" />
        <InformationCircleIcon v-else class="ic" />
      </div>
      <div class="tmsg">{{ toast.msg }}</div>
      <button class="tclose" @click="toast.show = false" title="Fermer">×</button>
    </div>
  </div>
</template>

<style scoped>
/* (styles inchangés) */
.page{
  --text:#0f172a;
  --muted: rgba(15,23,42,0.62);
  --b: rgba(16,24,40,0.12);
  --soft: rgba(15,23,42,0.04);

  display:flex;
  flex-direction:column;
  gap:10px;
  padding: 0 10px 14px;
}
.page, .page *{ box-sizing: border-box; }
.muted{ color: var(--muted); }
.small{ font-size: 11px; }
.dot{ color: rgba(148,163,184,1); font-weight: 900; }
.ell{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.r{ text-align:right; }
.mono{ font-variant-numeric: tabular-nums; }
/* ... le reste de ton CSS est identique à ton fichier ... */

/* =========================
   STICKY HEADER
========================= */
.head{
  position: sticky;
  top: -15px;
  z-index: 40;
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:10px;
  padding: 8px 0;
  background: rgba(248,250,252,0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(16,24,40,0.08);
}
.headL{ display:flex; flex-direction:column; gap:3px; min-width:0; }
.h1{ font-size:14px; font-weight: 1000; line-height: 1.05; color: var(--text); }
.sub{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size: 11.5px; min-width:0; }
.pill{
  border:1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.82);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.78);
}
.pill-ok{ border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.10); color: rgba(20,83,45,0.98); }
.pill-bad{ border-color: rgba(239,68,68,0.30); background: rgba(239,68,68,0.10); color: rgba(127,29,29,0.95); }

.headR{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

.btn{
  height: 30px;
  border:1px solid var(--b);
  background: rgba(255,255,255,0.84);
  border-radius: 12px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
  color: rgba(15,23,42,0.86);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15,23,42,0.06);
  display:inline-flex;
  align-items:center;
  gap:8px;
}
.btn:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.btn.primary{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; box-shadow:none; }
.btn.primary:hover{ background: rgba(24,64,112,1); }
.btn.ghost{ background: rgba(255,255,255,0.72); }
.btn:disabled{ opacity:.6; cursor:not-allowed; }
.ic{ width:16px; height:16px; }
.spin{ animation: spin .9s linear infinite; }
@keyframes spin{ from{ transform: rotate(0);} to{ transform: rotate(360deg);} }

/* alerts */
.alert{
  border:1px solid var(--b);
  border-radius: 14px;
  padding: 8px 10px;
  background:#fff;
  font-size: 12px;
  font-weight: 900;
  color: rgba(15,23,42,0.86);
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.alert.err{ border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); color: rgba(127,29,29,0.95); }
.alert.info{ border-color: rgba(59,130,246,0.25); background: rgba(59,130,246,0.08); }

/* grid/cards/etc (inchangé) */
.grid{
  display:grid;
  grid-template-columns: minmax(520px, 1fr) 320px;
  gap: 10px;
  align-items:start;
}
@media (max-width: 1060px){
  .grid{ grid-template-columns: 1fr; }
}
.card{
  background: rgba(255,255,255,0.92);
  border:1px solid var(--b);
  border-radius: 16px;
  padding: 10px;
  box-shadow: 0 10px 22px rgba(15,23,42,0.06);
  overflow:hidden;
}
.side{ position: relative; }
.sideCard{ position: sticky; top: 64px; }
.sideTitle{ font-size: 12px; font-weight: 1000; color: var(--text); margin-bottom: 8px; }
.kv{ padding: 8px; border:1px solid rgba(16,24,40,0.10); border-radius: 14px; background: rgba(255,255,255,0.85); }
.k{ font-size: 10.5px; font-weight: 950; letter-spacing: .2px; }
.v{ margin-top: 4px; font-size: 13px; font-weight: 1000; color: var(--text); }
.warnBox{
  margin-top: 10px;
  display:flex;
  gap:10px;
  align-items:flex-start;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(239,68,68,0.28);
  background: rgba(239,68,68,0.08);
  color: rgba(127,29,29,0.95);
  font-weight: 900;
  font-size: 12px;
}
.sideHint{ margin-top: 10px; font-size: 11.5px; }

.rowTop{
  display:grid;
  grid-template-columns: 1fr 220px;
  gap: 10px;
  align-items:start;
}
@media (max-width: 700px){
  .rowTop{ grid-template-columns: 1fr; }
}
.field{ display:flex; flex-direction:column; gap:6px; min-width:0; }
.lbl{ font-size: 11px; font-weight: 950; color: rgba(15,23,42,0.62); }
.hint{ font-size: 11px; }

.avgLine{ display:flex; gap:8px; align-items:center; }
.in{
  height: 30px;
  border:1px solid rgba(16,24,40,0.12);
  border-radius: 12px;
  padding: 0 10px;
  background:#fff;
  font-size: 12.5px;
  font-weight: 950;
  color: var(--text);
  outline:none;
  width: 100%;
}
.in:disabled{ background: rgba(15,23,42,0.04); color: rgba(15,23,42,0.75); }
.in:focus{ border-color: rgba(32,184,232,0.35); box-shadow: 0 0 0 4px rgba(32,184,232,0.12); }
.unit{ font-size: 11px; font-weight: 950; color: rgba(15,23,42,0.55); white-space:nowrap; }

/* calculator */
.calcWrap{
  margin-top: 10px;
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 14px;
  background: rgba(15,23,42,0.02);
  padding: 10px;
}
.calcHead{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  margin-bottom: 8px;
}
.calcTitle{ font-size: 12px; font-weight: 1000; color: var(--text); }
.calcActions{ display:flex; gap:8px; flex-wrap:wrap; }

.inlineWarn{
  display:flex;
  gap:10px;
  align-items:flex-start;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(245,158,11,0.25);
  background: rgba(245,158,11,0.10);
  color: rgba(146,64,14,0.95);
  font-weight: 900;
  font-size: 12px;
  margin-bottom: 8px;
}

.zonesTableWrap{
  background:#fff;
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 14px;
  overflow:auto;
}
.zonesTable{
  width:100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  color: var(--text);
}
.zonesTable th, .zonesTable td{
  border-bottom: 1px solid rgba(16,24,40,0.08);
  padding: 6px 8px;
  vertical-align: middle;
}
.zonesTable th{
  font-size: 10px;
  font-weight: 950;
  color: rgba(15,23,42,0.55);
  background: rgba(248,250,252,0.96);
  white-space: nowrap;
}
.zLab{ width: 44%; }
.zPct{ width: 28%; }
.zPrix{ width: 28%; }

.zTitle{ display:block; max-width: 100%; }

.cellIn{
  position: relative;
  display:flex;
  justify-content:flex-end;
  align-items:center;
  gap:8px;
}
.zin{
  height: 28px;
  width: 100%;
  border:1px solid rgba(16,24,40,0.12);
  border-radius: 12px;
  padding: 0 26px 0 10px;
  background:#fff;
  font-size: 12px;
  font-weight: 950;
  outline:none;
}
.zin:focus{ border-color: rgba(32,184,232,0.35); box-shadow: 0 0 0 4px rgba(32,184,232,0.12); }
.cellUnit{
  position:absolute;
  right: 10px;
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(15,23,42,0.55);
  pointer-events:none;
}

.calcFoot{
  margin-top: 8px;
  display:flex;
  justify-content:flex-end;
}
.sum{
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.10);
  background:#fff;
  font-size: 12px;
  font-weight: 950;
  display:flex;
  gap:8px;
  align-items:baseline;
  flex-wrap:wrap;
}
.sum.ok{ border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.10); color: rgba(20,83,45,0.98); }
.sum.bad{ border-color: rgba(239,68,68,0.28); background: rgba(239,68,68,0.10); color: rgba(127,29,29,0.95); }

.sep{ margin: 0 2px; color: rgba(148,163,184,1); font-weight: 900; }
.avg{ display:inline-flex; gap:6px; align-items:baseline; }

/* pump */
.pump{
  margin-top: 10px;
  border-top: 1px solid rgba(16,24,40,0.08);
  padding-top: 10px;
}
.pumpTop{
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:center;
  flex-wrap:wrap;
}
.check{ display:flex; gap:8px; align-items:center; cursor:pointer; user-select:none; }
.check input{ width: 16px; height: 16px; }
.pumpGrid{
  margin-top: 10px;
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 700px){
  .pumpGrid{ grid-template-columns: 1fr; }
}
.pField{ display:flex; flex-direction:column; gap:6px; }

/* modals */
.overlay{
  position: fixed;
  inset: 0;
  background: rgba(2,6,23,0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 14px;
  z-index: 99999;
}
.modal{
  width: min(560px, 96vw);
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 40%);
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}
.mhead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(16,24,40,0.10);
}
.mtitle{ font-size: 13px; font-weight: 1000; color: var(--text); }
.x{
  width: 30px; height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  cursor:pointer;
  font-size: 18px;
  line-height: 1;
}
.x:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.mbody{ padding: 12px 14px 10px; font-size: 12.5px; font-weight: 900; color: rgba(15,23,42,0.86); }
.mact{
  padding: 10px 14px 14px;
  display:flex;
  justify-content:flex-end;
  gap: 10px;
  border-top: 1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.72);
}
.mgrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 760px){
  .mgrid{ grid-template-columns: 1fr; }
}
.mfield{ display:flex; flex-direction:column; gap:6px; }

/* toast */
.toast{
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 100000;
  display:flex;
  gap:10px;
  align-items:center;

  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 10px 12px;
  box-shadow: 0 18px 60px rgba(15,23,42,0.20);
  max-width: min(520px, 92vw);
}
.toast.ok{ border-color: rgba(34,197,94,0.25); }
.toast.err{ border-color: rgba(239,68,68,0.28); }
.toast.info{ border-color: rgba(59,130,246,0.22); }
.ticon{ display:flex; align-items:center; }
.tmsg{ font-size: 12px; font-weight: 950; color: rgba(15,23,42,0.86); }
.tclose{
  margin-left: auto;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: rgba(15,23,42,0.55);
  padding: 0 4px;
}
.tclose:hover{ color: rgba(15,23,42,0.85); }
</style>
