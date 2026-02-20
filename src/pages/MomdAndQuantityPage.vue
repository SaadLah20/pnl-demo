<!-- ✅ src/pages/MomdAndQuantityPage.vue (COMPLET / police normale comme FormulesCataloguePage / MOMD+PV max 2 décimales) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionGeneralizeModal, { type CopyPreset } from "@/components/SectionGeneralizeModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clamp(x: any, min: number, max: number) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}
function round2(x: any) {
  const v = toNum(x);
  return Math.round(v * 100) / 100;
}
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function moneyNum(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}

/* ✅ Round up to step (1DH / 5DH), keep 2 decimals */
function roundUpToStep(val: any, step: number) {
  const v = round2(clamp(val, 0, 1e12));
  const s = Math.max(0.01, toNum(step));
  const up = Math.ceil(v / s) * s;
  return round2(up);
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

/* =========================
   DRAFTS (persisted fields)
========================= */
type Draft = { volumeM3: number; momd: number };
const drafts = reactive<Record<string, Draft>>({});

function getDraft(id: string): Draft {
  const k = String(id);
  if (!drafts[k]) drafts[k] = { volumeM3: 0, momd: 0 };
  return drafts[k];
}

function loadDraftsFromVariant() {
  for (const vf of formules.value) {
    const d = getDraft(vf.id);
    d.volumeM3 = clamp(vf?.volumeM3, 0, 1e12);
    d.momd = round2(clamp(vf?.momd, 0, 1e12));
  }
}

/* =========================
   TRANSPORT
========================= */
const transportPrixMoyen = computed(() => round2(toNum((variant.value as any)?.transport?.prixMoyen)));

/* =========================
   CMP
========================= */
function mpPriceUsed(mpId: string): number {
  const items = ((((variant.value as any)?.mp?.items ?? []) as any[]) || []) as any[];
  const vmp = items.find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return toNum(vmp.prix);
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);
  return toNum(vmp?.mp?.prix);
}
type CompRow = { mpId: string; qty: number; prix: number; coutParM3: number };
function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty);
    const prix = mpPriceUsed(mpId);
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  const v = compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
  return round2(v);
}

/* =========================
   ROWS
========================= */
type Row = {
  id: string;
  designation: string;
  cmp: number;
  qte: number;
  momd: number;
  pv: number;
  ca: number;
  formuleId: string;
};

const baseRows = computed<Row[]>(() => {
  return formules.value.map((vf: any) => {
    const d = getDraft(vf.id);
    const cmp = cmpParM3For(vf);
    const qte = toNum(d.volumeM3);
    const momd = round2(toNum(d.momd));
    const pv = round2(cmp + transportPrixMoyen.value + momd);
    const ca = pv * qte;

    return {
      id: String(vf.id),
      formuleId: String(vf?.formuleId ?? vf?.formule?.id ?? ""),
      designation: String(vf?.formule?.label ?? vf?.formule?.resistance ?? "Formule"),
      cmp,
      qte,
      momd,
      pv,
      ca,
    };
  });
});

/* =========================
   ORDER STABLE (auto only)
========================= */
const orderIds = ref<string[]>([]);
const didInitialSort = ref(false);

function setInitialOrderFromVariant() {
  orderIds.value = formules.value.map((vf: any) => String(vf.id));
}
function applySortNow() {
  const sorted = [...baseRows.value].sort((a, b) => toNum(b.pv) - toNum(a.pv));
  orderIds.value = sorted.map((r) => r.id);
}

const rows = computed<Row[]>(() => {
  const map = new Map(baseRows.value.map((r) => [r.id, r]));
  const out: Row[] = [];
  for (const id of orderIds.value) {
    const r = map.get(id);
    if (r) out.push(r);
  }
  for (const r of baseRows.value) {
    if (!orderIds.value.includes(r.id)) out.push(r);
  }
  return out;
});

watch(
  () => variant.value?.id,
  () => {
    loadDraftsFromVariant();
    setInitialOrderFromVariant();
    if (!didInitialSort.value) {
      applySortNow();
      didInitialSort.value = true;
    }
  },
  { immediate: true }
);

/* =========================
   ✅ PV INPUT -> apply on BLUR
========================= */
const pvDrafts = reactive<Record<string, number>>({});
const pvTouched = reactive<Record<string, boolean>>({});
const pvErr = reactive<Record<string, boolean>>({});

function computedPvFor(id: string) {
  const r = rows.value.find((x) => String(x.id) === String(id));
  return r ? round2(toNum(r.pv)) : 0;
}
function cmpFor(id: string) {
  const r = rows.value.find((x) => String(x.id) === String(id));
  return r ? round2(toNum(r.cmp)) : 0;
}

watch(
  () => rows.value.map((r) => ({ id: r.id, pv: r.pv })),
  (list) => {
    for (const x of list) {
      const id = String(x.id);
      if (!pvTouched[id]) {
        pvDrafts[id] = round2(toNum(x.pv));
        pvErr[id] = false;
      }
    }
  },
  { immediate: true, deep: true }
);

function onPvInput(id: string, raw: any) {
  const v = round2(clamp(raw, 0, 1e12));
  pvTouched[String(id)] = true;
  pvDrafts[String(id)] = v;
  pvErr[String(id)] = false;
}

function onPvBlur(id: string) {
  const key = String(id);
  const pv = round2(clamp(pvDrafts[key], 0, 1e12));

  const cmp = cmpFor(key);
  const tr = transportPrixMoyen.value;

  const momd = round2(pv - cmp - tr);

  if (momd < 0) {
    pvErr[key] = true;
    pvDrafts[key] = computedPvFor(key);
    pvTouched[key] = false;
    showToast("PV trop bas : la MOMD ne peut pas être négative.", "err");
    return;
  }

  pvErr[key] = false;
  getDraft(key).momd = round2(clamp(momd, 0, 1e12));

  pvTouched[key] = false;
  pvDrafts[key] = computedPvFor(key);
}

/* ✅ MOMD warning threshold */
const MOMD_WARN = 100;
function momdIsLowPositive(m: number) {
  const v = toNum(m);
  return v > 0 && v < MOMD_WARN;
}
function onMomdBlur(id: string) {
  const d = getDraft(String(id));
  d.momd = round2(clamp(d.momd, 0, 1e12));
}

/* =========================
   ✅ BULK TOOLS: ARRONDI + REMISE (DH)
========================= */
const roundMode = ref<1 | 5>(1);
const remiseDh = ref<number>(0); // ✅ DH/m³ soustrait sur tous les PV
const bulkBusy = ref(false);

function getDisplayedPv(id: string) {
  const key = String(id);
  return pvTouched[key] ? toNum(pvDrafts[key]) : computedPvFor(key);
}

function bulkApplyPvTransform(fn: (pv: number, rowId: string) => number, successMsg: string) {
  if (!variant.value) return;
  bulkBusy.value = true;

  let touched = 0;
  let rejected = 0;

  try {
    for (const r of rows.value) {
      const id = String(r.id);
      const base = round2(getDisplayedPv(id));
      const next = round2(clamp(fn(base, id), 0, 1e12));

      // set draft as user edit then reuse existing onPvBlur() validation + MOMD recalc
      pvTouched[id] = true;
      pvDrafts[id] = next;
      pvErr[id] = false;

      const beforeErr = !!pvErr[id];
      onPvBlur(id);
      const afterErr = !!pvErr[id];

      if (!beforeErr && afterErr) rejected++;
      else touched++;
    }

    if (rejected > 0) {
      showToast(`Appliqué sur ${touched} lignes. ${rejected} rejetées (PV trop bas).`, "err");
    } else {
      showToast(successMsg, "ok");
    }
  } finally {
    bulkBusy.value = false;
  }
}

function applyRounding() {
  const step = roundMode.value === 5 ? 5 : 1;
  bulkApplyPvTransform(
    (pv) => roundUpToStep(pv, step),
    step === 1 ? "PV arrondis au +1 DH (vers le haut)." : "PV arrondis au +5 DH (multiple de 5, vers le haut)."
  );
}

function applyRemise() {
  const dh = round2(clamp(remiseDh.value, 0, 1e12));
  remiseDh.value = dh;

  if (dh <= 0) {
    showToast("Remise = 0 DH (aucun changement).", "ok");
    return;
  }

  bulkApplyPvTransform((pv) => round2(pv - dh), `Remise ${n(dh, 2)} DH appliquée sur tous les PV.`);
}

/* =========================
   KPIs
========================= */
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.qte), 0));
const cmpTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.cmp) * toNum(r.qte), 0));
const cmpMoy = computed(() => (volumeTotal.value > 0 ? cmpTotal.value / volumeTotal.value : 0));
const momdTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.momd) * toNum(r.qte), 0));
const momdMoy = computed(() => (volumeTotal.value > 0 ? momdTotal.value / volumeTotal.value : 0));
const caTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.ca), 0));
const pvMoy = computed(() => (volumeTotal.value > 0 ? caTotal.value / volumeTotal.value : 0));

const rowsUi = rows;

/* =========================
   TOAST
========================= */
const toastOpen = ref(false);
const toastMsg = ref("");
const toastKind = ref<"ok" | "err">("ok");
function showToast(msg: string, kind: "ok" | "err" = "ok") {
  toastMsg.value = msg;
  toastKind.value = kind;
  toastOpen.value = true;
  window.setTimeout(() => (toastOpen.value = false), 2600);
}

/* =========================
   MODAL confirm/info
========================= */
const modal = reactive({
  open: false,
  title: "",
  message: "",
  mode: "confirm" as "confirm" | "info",
  onConfirm: null as null | (() => void | Promise<void>),
});
function openConfirm(title: string, message: string, onConfirm: () => void | Promise<void>) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "confirm";
  modal.onConfirm = onConfirm;
}
function openInfo(title: string, message: string) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "info";
  modal.onConfirm = null;
}
function closeModal() {
  modal.open = false;
  modal.title = "";
  modal.message = "";
  modal.onConfirm = null;
}

/* =========================
   SAVE / RESET
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function hasPvErrors() {
  return Object.values(pvErr).some((x) => !!x);
}

async function save() {
  if (!variant.value) return;

  if (hasPvErrors()) {
    showToast("Corrige les PV invalides avant d’enregistrer.", "err");
    openInfo("Validation", "Impossible d’enregistrer : certains PV sont invalides.");
    return;
  }

  err.value = null;
  saving.value = true;
  try {
    const items = formules.value.map((vf: any) => {
      const d = getDraft(vf.id);
      return {
        id: String(vf.id),
        volumeM3: Number(clamp(d.volumeM3, 0, 1e12)),
        momd: Number(round2(clamp(d.momd, 0, 1e12))),
      };
    });

    await (store as any).updateVariant(variant.value.id, { formules: { items } });

    applySortNow();
    showToast("Quantités, PV & MOMD enregistrés.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des quantités, PV & MOMD ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadDraftsFromVariant();
    for (const r of rows.value) {
      const id = String(r.id);
      pvTouched[id] = false;
      pvDrafts[id] = round2(toNum(r.pv));
      pvErr[id] = false;
    }
    showToast("Valeurs restaurées.", "ok");
  });
}

/* =========================
   GENERALISER (inchangée)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

function patchFromCopy(copy: CopyPreset, src: { volumeM3: number; momd: number }) {
  if (copy === "ZERO") return { volumeM3: 0, momd: 0 };
  if (copy === "QTY_ONLY") return { volumeM3: Number(src.volumeM3 ?? 0), momd: 0 };
  if (copy === "MOMD_ONLY") return { volumeM3: 0, momd: Number(src.momd ?? 0) };
  return { volumeM3: Number(src.volumeM3 ?? 0), momd: Number(src.momd ?? 0) };
}

function getVariantById(variantId: string): any | null {
  const p = (store as any).activePnl;
  if (!p) return null;
  for (const c of p.contracts ?? []) {
    const v = (c.variants ?? []).find((x: any) => String(x?.id ?? "") === String(variantId));
    if (v) return v;
  }
  return null;
}

async function ensureVariantHasFormulesItems(variantId: string) {
  const v = getVariantById(variantId) as any;
  if (v?.formules?.items && Array.isArray(v.formules.items)) return v;

  if ((store as any).loadVariantDeep) {
    const current = String((store as any).activeVariantId ?? "");
    await (store as any).loadVariantDeep(String(variantId));
    const loaded = (store as any).activeVariant;

    if (current && current !== String(variantId)) {
      await (store as any).loadVariantDeep(current);
    }
    return loaded ?? v ?? null;
  }
  return v ?? null;
}

async function generalizeTo(variantIds: string[], copy: CopyPreset) {
  const sourceVariantId = String((store as any).activeVariantId ?? "").trim();
  if (!sourceVariantId) return;

  genErr.value = null;
  genBusy.value = true;

  try {
    const srcByFormuleId = new Map<string, { volumeM3: number; momd: number }>();
    for (const r of rows.value) {
      if (!r.formuleId) continue;
      srcByFormuleId.set(String(r.formuleId), { volumeM3: toNum(r.qte), momd: toNum(r.momd) });
    }

    for (const targetIdRaw of variantIds) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;

      const target = await ensureVariantHasFormulesItems(targetId);
      const targetItems = ((target as any)?.formules?.items ?? (target as any)?.variantFormules ?? []) as any[];
      if (!Array.isArray(targetItems) || targetItems.length === 0) continue;

      const items = targetItems.map((vf: any) => {
        const id = String(vf?.id ?? "");
        const formuleId = String(vf?.formuleId ?? vf?.formule?.id ?? "");
        const src = srcByFormuleId.get(formuleId) ?? { volumeM3: 0, momd: 0 };
        const patch = patchFromCopy(copy, src);
        return { id, ...patch };
      });

      await (store as any).updateVariant(targetId, { formules: { items } });
    }

    showToast("Généralisation appliquée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value), "err");
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[]; copy: CopyPreset }) {
  const ids = payload?.variantIds ?? [];
  const copy = payload?.copy ?? "QTY_MOMD";
  if (!ids.length) return;
  await generalizeTo(ids, copy);
  if (!genErr.value) genOpen.value = false;
}

/* =========================
   INIT
========================= */
onMounted(async () => {
  const pnls = (store as any).pnls ?? [];
  if (pnls.length === 0 && (store as any).loadPnls) {
    await (store as any).loadPnls();
  }
});
</script>

<template>
  <div class="page">
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttl">Qté & MOMD</div>
        </div>

        <div class="actions" v-if="variant">
          <!-- ✅ mini tools -->
          <div class="miniTools">
            <div class="miniGroup">
              <div class="miniLbl">Arrondi PV</div>
              <select class="miniSel" v-model.number="roundMode" :disabled="saving || genBusy || bulkBusy">
                <option :value="1">+1 DH</option>
                <option :value="5">+5 DH</option>
              </select>
              <button class="btn sm" :disabled="saving || genBusy || bulkBusy" @click="applyRounding()">
                Arrondir
              </button>
            </div>

            <div class="miniGroup">
              <div class="miniLbl">Remise</div>
              <div class="miniIn">
                <input
                  class="miniInp num"
                  type="number"
                  step="0.01"
                  min="0"
                  v-model.number="remiseDh"
                  :disabled="saving || genBusy || bulkBusy"
                />
                <span class="miniUnit">DH</span>
              </div>
              <button class="btn sm" :disabled="saving || genBusy || bulkBusy" @click="applyRemise()">
                Appliquer
              </button>
            </div>
          </div>

          <!-- existing actions -->
          <button class="btn" :disabled="saving || genBusy || bulkBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="saving || genBusy || bulkBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="saving || genBusy || bulkBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <div class="kpis" v-if="variant">
        <div class="kpi kpiTint">
          <div class="kLbl">PV moyen</div>
          <div class="kVal num">{{ n(pvMoy, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">CMP moyen</div>
          <div class="kVal num">{{ n(cmpMoy, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">MOMD moyenne</div>
          <div class="kVal num">{{ n(momdMoy, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">Volume</div>
          <div class="kVal num">{{ n(volumeTotal, 2) }} <span>m³</span></div>
        </div>
      </div>

      <div v-if="genErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Généralisation :</b> {{ genErr }}</div>
      </div>
      <div v-if="genBusy" class="alert"><div><b>Généralisation :</b> traitement…</div></div>

      <div v-if="err" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ err }}</div>
      </div>

      <div v-if="(store as any).loading" class="alert"><div>Chargement…</div></div>
      <div v-else-if="(store as any).error" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ (store as any).error }}</div>
      </div>
    </div>

    <div v-if="!variant" class="card">
      <div class="empty">Sélectionne une variante puis reviens ici.</div>
    </div>

    <template v-else>
      <div class="card pad0">
        <div class="tableWrap">
          <table class="table">
            <colgroup>
              <col class="colDesignation" />
              <col class="colNum" />
              <col class="colIn" />
              <col class="colIn" />
              <col class="colInPv" />
              <col class="colNumCa" />
            </colgroup>

            <thead>
              <tr>
                <th class="th thL">Désignation</th>
                <th class="th thC">CMP</th>
                <th class="th thC thEdit">Qté</th>
                <th class="th thC thEdit">MOMD</th>
                <th class="th thC thEdit">PV</th>
                <th class="th thC">CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="r in rowsUi" :key="r.id" class="tr">
                <td class="designation" :data-label="'Désignation'">
                  <b class="designationText" :title="r.designation">{{ r.designation }}</b>
                </td>

                <td class="r val num" :data-label="'CMP'">{{ n(r.cmp, 2) }}</td>

                <td class="cellInput" :data-label="'Qté'">
                  <div class="inCell">
                    <input
                      class="inputLg r val num inputEdit"
                      type="number"
                      step="1"
                      min="0"
                      :value="getDraft(r.id).volumeM3"
                      @input="getDraft(r.id).volumeM3 = toNum(($event.target as HTMLInputElement).value)"
                    />
                    <span class="unit unitEdit">m³</span>
                  </div>
                </td>

                <td class="cellInput" :data-label="'MOMD'">
                  <div class="inCell">
                    <input
                      class="inputLg r val num inputEdit"
                      :class="{ warn: momdIsLowPositive(getDraft(r.id).momd) }"
                      :title="momdIsLowPositive(getDraft(r.id).momd) ? `MOMD < ${MOMD_WARN} DH` : ''"
                      type="number"
                      step="0.01"
                      min="0"
                      :value="getDraft(r.id).momd"
                      @input="getDraft(r.id).momd = toNum(($event.target as HTMLInputElement).value)"
                      @blur="onMomdBlur(r.id)"
                    />
                    <span class="unit unitEdit">DH</span>
                  </div>
                </td>

                <td class="cellInput" :data-label="'PV'">
                  <div class="inCell pvCell">
                    <input
                      class="inputLg r val num inputEdit"
                      :class="{ bad: !!pvErr[r.id] }"
                      :title="pvErr[r.id] ? 'PV trop bas : MOMD négative interdite' : ''"
                      type="number"
                      step="0.01"
                      min="0"
                      :value="pvTouched[r.id] ? pvDrafts[r.id] : computedPvFor(r.id)"
                      @input="onPvInput(r.id, ($event.target as HTMLInputElement).value)"
                      @blur="onPvBlur(r.id)"
                    />
                    <span class="unit unitEdit">DH</span>
                    <span v-if="pvErr[r.id]" class="dotErr" aria-hidden="true"></span>
                  </div>
                </td>

                <td class="tdCa" :data-label="'CA'">
                  <b class="val num caWrap">
                    <span class="caNum">{{ moneyNum(r.ca, 2) }}</span>
                    <span class="caCur">MAD</span>
                  </b>
                </td>
              </tr>

              <tr v-if="rowsUi.length === 0">
                <td class="emptyRow" colspan="6">Aucun résultat.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot muted tiny">Tri PV : automatique au chargement initial + après “Enregistrer”.</div>
      </div>
    </template>

    <!-- ✅ Modal confirm/info -->
    <teleport to="body">
      <div v-if="modal.open" class="ovl" role="dialog" aria-modal="true" @mousedown.self="closeModal()">
        <div class="dlg">
          <div class="dlgHdr">
            <div class="dlgTtl">{{ modal.title }}</div>
            <button class="x" type="button" @click="closeModal()" aria-label="Fermer">✕</button>
          </div>

          <div class="dlgBody">
            <div class="dlgMsg">{{ modal.message }}</div>
          </div>

          <div class="dlgFtr">
            <button class="btn2" type="button" @click="closeModal()">Fermer</button>
            <button
              v-if="modal.mode === 'confirm'"
              class="btn2 pri"
              type="button"
              @click="modal.onConfirm && modal.onConfirm()"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ✅ MODAL GENERALISATION -->
    <SectionGeneralizeModal
      v-model="genOpen"
      section-label="Qté & MOMD"
      :source-variant-id="String((store as any).activeVariantId ?? '') || null"
      @apply="onApplyGeneralize"
      @close="() => {}"
    />

    <!-- ✅ Toast -->
    <teleport to="body">
      <div v-if="toastOpen" class="toast" :class="{ err: toastKind === 'err' }" role="status" aria-live="polite">
        <CheckCircleIcon v-if="toastKind === 'ok'" class="tic" />
        <ExclamationTriangleIcon v-else class="tic" />
        <div class="tmsg">{{ toastMsg }}</div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.muted {
  color: rgba(15, 23, 42, 0.55);
}
.tiny {
  font-size: 10.5px;
}
* {
  box-sizing: border-box;
}

/* ✅ chiffres en police NORMALE (pas monospace), mais tabulaires comme FormulesCataloguePage */
.num {
  font-variant-numeric: tabular-nums;
}

/* sticky subheader */
.subhdr {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 14px;
  padding: 8px 10px;
}
.row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.left {
  display: flex;
  align-items: center;
  min-width: 220px;
}
.ttl {
  font-size: 14px;
  font-weight: 950;
  color: #0f172a;
}

/* actions */
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ✅ mini tools (arrondi/remise) */
.miniTools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-right: 4px;
}
.miniGroup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.02);
}
.miniLbl {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.miniSel {
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(2, 132, 199, 0.22);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 8px;
  font-weight: 900;
  font-size: 12px;
  outline: none;
}
.miniIn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.miniInp {
  height: 28px;
  width: 92px;
  border-radius: 10px;
  border: 1px solid rgba(2, 132, 199, 0.22);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 8px;
  font-weight: 950;
  font-size: 12px;
  outline: none;
}
.miniUnit {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
}

/* base btn */
.btn {
  height: 30px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  color: #0f172a;
  font-weight: 950;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.btn.sm {
  height: 28px;
  border-radius: 10px;
  padding: 0 10px;
  font-size: 12px;
}
.btn:hover {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.pri {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}
.btn.pri:hover {
  background: rgba(2, 132, 199, 0.18);
}
.ic {
  width: 16px;
  height: 16px;
}

/* KPIs */
.kpis {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 980px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 12px;
  padding: 7px 9px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.kpiTint {
  border-color: rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.06);
}
.kLbl {
  font-size: 9.5px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.kVal {
  font-size: 12px;
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kVal span {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
  margin-left: 6px;
  font-size: 10px;
}

/* alerts */
.alert {
  margin-top: 8px;
  border-radius: 12px;
  padding: 8px 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 12px;
  font-weight: 800;
}
.alert.err {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
}
.aic {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  margin-top: 1px;
}

/* card */
.card {
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: #fff;
  overflow: hidden;
}
.card.pad0 {
  padding: 0;
}
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

/* table */
.tableWrap {
  overflow: hidden;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
.colDesignation {
  width: 24%;
}
.colNum {
  width: 10%;
}
.colIn {
  width: 15%;
}
.colInPv {
  width: 18%;
}
.colNumCa {
  width: 18%;
}

.th,
.table td {
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  padding: 10px 10px;
  vertical-align: middle;
  overflow: hidden;
}
.th {
  background: #fafafa;
  color: rgba(15, 23, 42, 0.6);
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}
.thC {
  text-align: center;
}
.thL {
  text-align: left;
}
.thEdit {
  color: rgba(2, 132, 199, 0.95);
}

.r {
  text-align: right;
}

.val {
  font-size: 12px;
  font-weight: 950;
}

.designationText {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #0f172a;
  font-size: 12.5px;
  font-weight: 950;
}

.cellInput {
  text-align: right;
}
.inCell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

/* Inputs */
.inputLg {
  border: 1px solid rgba(2, 132, 199, 0.25);
  border-radius: 12px;
  font-size: 12.5px;
  padding: 8px 10px;
  width: 100%;
  max-width: 150px;
  background: rgba(2, 132, 199, 0.08);
  font-weight: 950;
  outline: none;
  color: #0f172a;
}
.inputLg:focus {
  border-color: rgba(2, 132, 199, 0.7);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
  background: #fff;
}
.unit {
  color: rgba(15, 23, 42, 0.55);
  font-size: 11px;
  min-width: 28px;
  text-align: right;
  font-weight: 950;
}
.unitEdit {
  color: rgba(2, 132, 199, 0.95);
}

/* MOMD low */
.inputLg.warn {
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.07);
}
.inputLg.warn:focus {
  border-color: rgba(239, 68, 68, 0.55);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.11);
}

/* PV invalid */
.inputLg.bad {
  border-color: rgba(239, 68, 68, 0.42);
  background: rgba(239, 68, 68, 0.08);
}
.inputLg.bad:focus {
  border-color: rgba(239, 68, 68, 0.65);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}
.pvCell {
  position: relative;
}
.dotErr {
  position: absolute;
  right: 38px;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.9);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
  pointer-events: none;
}

/* CA */
.tdCa {
  text-align: right;
  padding-right: 14px;
}
.caWrap {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 8px;
  max-width: 100%;
  white-space: nowrap;
}
.caNum {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.caCur {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}

.emptyRow {
  padding: 14px 10px;
  color: rgba(15, 23, 42, 0.6);
  font-weight: 900;
  text-align: center;
}
.foot {
  padding: 8px 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.06);
}

/* Mobile */
@media (max-width: 920px) {
  .table {
    table-layout: auto;
  }
  thead {
    display: none;
  }
  tbody,
  tr,
  td {
    display: block;
    width: 100%;
  }
  .tr {
    border-bottom: 1px solid rgba(16, 24, 40, 0.08);
    padding: 10px;
  }
  .table td {
    border-bottom: none;
    padding: 8px 0;
  }
  .table td::before {
    content: attr(data-label);
    display: block;
    font-size: 10px;
    font-weight: 950;
    color: rgba(15, 23, 42, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 4px;
  }
  .designationText {
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
  }
  .inCell {
    justify-content: flex-start;
  }
  .inputLg {
    max-width: 100%;
  }
  .dotErr {
    right: 44px;
  }
  .tdCa {
    text-align: left;
    padding-right: 0;
  }
}

/* modal */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 120000;
}
.dlg {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  overflow: hidden;
}
.dlgHdr {
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.dlgTtl {
  font-weight: 950;
  color: #0f172a;
}
.x {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
}
.dlgBody {
  padding: 12px;
}
.dlgMsg {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.8);
  line-height: 1.45;
  white-space: pre-wrap;
}
.dlgFtr {
  padding: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}
.btn2 {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  cursor: pointer;
}
.btn2.pri {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}

/* toast */
.toast {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(2, 6, 23, 0.15);
}
.toast.err {
  border-color: rgba(239, 68, 68, 0.22);
}
.tic {
  width: 18px;
  height: 18px;
}
.tmsg {
  font-weight: 900;
  color: rgba(15, 23, 42, 0.85);
}
</style>