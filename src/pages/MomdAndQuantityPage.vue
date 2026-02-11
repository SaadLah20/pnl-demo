<!-- ✅ src/pages/MomdAndQuantityPage.vue (FICHIER COMPLET / Qté + MOMD en bleu, PV neutre) -->
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
  MagnifyingGlassIcon,
  ArrowsUpDownIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(x: any, min: number, max: number) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

/* =========================
   DRAFTS
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
    d.momd = clamp(vf?.momd, 0, 1e12);
  }
}

/* =========================
   TRANSPORT
========================= */
const transportPrixMoyen = computed(() => toNum((variant.value as any)?.transport?.prixMoyen));

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
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

/* =========================
   BASE ROWS
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
    const momd = toNum(d.momd);
    const pv = cmp + transportPrixMoyen.value + momd;
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
   ORDER STABLE
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
   KPIs (4)
========================= */
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.qte), 0));
const cmpTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.cmp) * toNum(r.qte), 0));
const cmpMoy = computed(() => (volumeTotal.value > 0 ? cmpTotal.value / volumeTotal.value : 0));
const momdTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.momd) * toNum(r.qte), 0));
const momdMoy = computed(() => (volumeTotal.value > 0 ? momdTotal.value / volumeTotal.value : 0));
const caTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.ca), 0));
const pvMoy = computed(() => (volumeTotal.value > 0 ? caTotal.value / volumeTotal.value : 0));

/* =========================
   UI TOOLBAR
========================= */
const q = ref("");
const hideZero = ref(false);

const rowsUi = computed(() => {
  const query = String(q.value ?? "").trim().toLowerCase();
  return rows.value.filter((r) => {
    const okQuery = !query || String(r.designation ?? "").toLowerCase().includes(query);
    const okZero = !hideZero.value || !(toNum(r.qte) === 0 || toNum(r.momd) === 0);
    return okQuery && okZero;
  });
});
const hiddenCount = computed(() => rows.value.length - rowsUi.value.length);

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
   MODAL
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

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    const items = formules.value.map((vf: any) => {
      const d = getDraft(vf.id);
      return {
        id: String(vf.id),
        volumeM3: Number(clamp(d.volumeM3, 0, 1e12)),
        momd: Number(clamp(d.momd, 0, 1e12)),
      };
    });

    await (store as any).updateVariant(variant.value.id, { formules: { items } });
    applySortNow();
    showToast("Quantités & MOMD enregistrées (tri PV appliqué).", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des quantités & MOMD ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadDraftsFromVariant();
    showToast("Valeurs restaurées.", "ok");
  });
}

/* =========================
   ✅ GENERALISER
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

function labelForCopy(copy: CopyPreset) {
  if (copy === "ZERO") return "Formules seulement (Qté=0 / MOMD=0)";
  if (copy === "QTY_ONLY") return "Formules + Qté (MOMD=0)";
  if (copy === "MOMD_ONLY") return "Formules + MOMD (Qté=0)";
  return "Formules + Qté + MOMD";
}

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

  const ok = window.confirm(
    payload.mode === "ALL"
      ? `Généraliser “Qté & MOMD” sur TOUTES les variantes ?\nMode: ${labelForCopy(copy)}`
      : `Généraliser “Qté & MOMD” sur ${ids.length} variante(s) ?\nMode: ${labelForCopy(copy)}`
  );
  if (!ok) return;

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
          <div class="ttlRow">
            <div class="ttl">Qté & MOMD</div>
            <span v-if="variant" class="badge">Variante active</span>
          </div>

          <div class="meta" v-if="variant">
            <span class="clip"><b>{{ variant.title ?? variant.id?.slice?.(0, 8) }}</b></span>
            <span class="sep" v-if="contract?.dureeMois">•</span>
            <span v-if="contract?.dureeMois">Durée <b>{{ n(contract.dureeMois, 0) }}</b> mois</span>
          </div>
          <div class="meta" v-else>Aucune variante active.</div>
        </div>

        <div class="actions" v-if="variant">
          <button class="btn" :disabled="saving || genBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="saving || genBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn" :disabled="saving || genBusy" @click="applySortNow()" title="Re-trier par PV décroissant">
            <ArrowsUpDownIcon class="ic" />
            Tri PV
          </button>

          <button class="btn pri" :disabled="saving || genBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <div class="kpis" v-if="variant">
        <div class="kpi kpiTint">
          <div class="kLbl">PV moyen</div>
          <div class="kVal mono">{{ n(pvMoy, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">CMP moyen</div>
          <div class="kVal mono">{{ n(cmpMoy, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">MOMD moyenne</div>
          <div class="kVal mono">{{ n(momdMoy, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">Volume</div>
          <div class="kVal mono">{{ n(volumeTotal, 2) }} <span>m³</span></div>
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
        <div class="toolbar">
          <div class="search">
            <MagnifyingGlassIcon class="sic" />
            <input v-model="q" class="sin" type="text" placeholder="Rechercher une formule…" />
          </div>

          <button
            class="tbtn"
            type="button"
            @click="hideZero = !hideZero"
            :title="hideZero ? 'Afficher tout' : 'Masquer lignes qté=0 ou MOMD=0'"
          >
            <span class="dot" :class="{ on: hideZero }"></span>
            {{ hideZero ? "Afficher tout" : "Masquer 0" }}
            <span v-if="hideZero && hiddenCount" class="miniBadge">{{ hiddenCount }}</span>
          </button>
        </div>

        <div class="tableWrap">
          <table class="table">
            <colgroup>
              <col class="colDesignation" />
              <col class="colNum" />
              <!-- ✅ Qté + MOMD éditables -->
              <col class="colIn" />
              <col class="colIn" />
              <!-- ✅ PV + CA neutres -->
              <col class="colNum" />
              <col class="colNumWide" />
            </colgroup>

            <thead>
              <tr>
                <th class="th thL">Désignation</th>
                <th class="th thC">CMP</th>
                <!-- ✅ BLEU sur Qté + MOMD -->
                <th class="th thC thEdit">Qté</th>
                <th class="th thC thEdit">MOMD</th>
                <!-- ✅ PV NEUTRE -->
                <th class="th thC">PV</th>
                <th class="th thC">CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="r in rowsUi" :key="r.id" class="tr">
                <td class="designation">
                  <b class="designationText" :title="r.designation">{{ r.designation }}</b>
                </td>

                <td class="mono r val">{{ n(r.cmp, 2) }}</td>

                <!-- ✅ Qté (editable) -->
                <td class="cellInput cellEdit">
                  <div class="inCell">
                    <input
                      class="inputSm mono r val inputEdit"
                      type="number"
                      step="1"
                      min="0"
                      :value="getDraft(r.id).volumeM3"
                      @input="getDraft(r.id).volumeM3 = toNum(($event.target as HTMLInputElement).value)"
                    />
                    <span class="unit unitEdit">m³</span>
                  </div>
                </td>

                <!-- ✅ MOMD (editable) -->
                <td class="cellInput cellEdit">
                  <div class="inCell">
                    <input
                      class="inputSm mono r val inputEdit"
                      type="number"
                      step="0.01"
                      min="0"
                      :value="getDraft(r.id).momd"
                      @input="getDraft(r.id).momd = toNum(($event.target as HTMLInputElement).value)"
                    />
                    <span class="unit unitEdit">DH</span>
                  </div>
                </td>

                <!-- ✅ PV (read-only, NEUTRE, jamais bleu) -->
                <td class="r cellPv">
                  <span class="pvPill mono val">{{ n(r.pv, 2) }}</span>
                </td>

                <td class="r">
                  <b class="mono val">{{ money(r.ca, 2) }}</b>
                </td>
              </tr>

              <tr v-if="rowsUi.length === 0">
                <td class="emptyRow" colspan="6">Aucun résultat (filtre / recherche).</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot muted tiny">
          Tri PV : au chargement initial + après “Enregistrer” (tu peux aussi cliquer “Tri PV”).
        </div>
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
            <button v-if="modal.mode === 'confirm'" class="btn2 pri" type="button" @click="modal.onConfirm && modal.onConfirm()">
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
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.muted {
  color: rgba(15, 23, 42, 0.55);
}
.tiny {
  font-size: 10.5px;
}

/* sticky subheader */
.subhdr {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 16px;
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
  flex-direction: column;
  gap: 2px;
  min-width: 260px;
}
.ttlRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ttl {
  font-size: 15px;
  font-weight: 950;
  color: #0f172a;
}
.badge {
  font-size: 10px;
  font-weight: 950;
  color: #065f46;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 8px;
  border-radius: 999px;
}
.meta {
  font-size: 10.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
}
.clip {
  display: inline-block;
  max-width: 520px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sep {
  margin: 0 8px;
  color: rgba(15, 23, 42, 0.35);
}

/* actions */
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  height: 32px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  color: #0f172a;
  font-weight: 950;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
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
  width: 18px;
  height: 18px;
}

/* KPIs (4) */
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
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.kpiTint {
  border-color: rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.06);
}
.kLbl {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.kVal {
  font-size: 13px;
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
  font-size: 11px;
}

/* alerts */
.alert {
  margin-top: 8px;
  border-radius: 14px;
  padding: 9px 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.alert.err {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
}
.aic {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin-top: 1px;
}

/* card */
.card {
  border-radius: 16px;
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

/* toolbar */
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.06);
  flex-wrap: wrap;
}
.search {
  flex: 1 1 260px;
  min-width: 240px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 12px;
  padding: 0 10px;
  height: 34px;
}
.sic {
  width: 18px;
  height: 18px;
  color: rgba(15, 23, 42, 0.55);
}
.sin {
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  font-weight: 900;
  color: #0f172a;
  font-size: 12px;
}
.tbtn {
  height: 34px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.tbtn:hover {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid rgba(15, 23, 42, 0.35);
  background: transparent;
  display: inline-block;
}
.dot.on {
  border-color: rgba(2, 132, 199, 0.55);
  background: rgba(2, 132, 199, 0.22);
}
.miniBadge {
  font-size: 10px;
  font-weight: 950;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.08);
  color: #0f172a;
}

/* table */
.tableWrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}

/* colonnes optimisées */
.colDesignation {
  width: 34%;
}
.colNum {
  width: 11%;
}
.colIn {
  width: 16%;
}
.colNumWide {
  width: 12%;
}

.th,
.table td {
  box-sizing: border-box;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  padding: 9px 10px;
  vertical-align: middle;
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

/* ✅ BLEU UNIQUEMENT sur Qté + MOMD */
.thEdit {
  color: rgba(2, 132, 199, 0.95);
}

/* ✅ background bleu UNIQUEMENT sur cellules editables */
.cellEdit {
  background: rgba(2, 132, 199, 0.03);
}

/* ✅ hover: on garde PV neutre */
.tr:hover td {
  background: rgba(15, 23, 42, 0.02);
}
.tr:hover td.cellEdit {
  background: rgba(2, 132, 199, 0.05);
}
.tr:hover td.cellPv {
  background: rgba(15, 23, 42, 0.02) !important;
}

.r {
  text-align: right;
}

.designation {
  overflow: hidden;
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

/* chiffres */
.val {
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
  gap: 6px;
  width: 100%;
}
.inputSm {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  font-size: 12.5px;
  padding: 7px 9px;
  width: min(110px, 100%);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 950;
  outline: none;
  color: #0f172a;
}
.inputSm:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
  background: #fff;
}

/* ✅ inputs + unités bleues UNIQUEMENT (Qté + MOMD) */
.inputEdit {
  border-color: rgba(2, 132, 199, 0.22);
  background: rgba(2, 132, 199, 0.06);
}
.inputEdit:focus {
  border-color: rgba(2, 132, 199, 0.65);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
}
.unit {
  color: rgba(15, 23, 42, 0.55);
  font-size: 11px;
  min-width: 26px;
  text-align: right;
  font-weight: 900;
}
.unitEdit {
  color: rgba(2, 132, 199, 0.9);
}

/* ✅ PV NEUTRE (force) */
.cellPv {
  background: transparent;
}
.pvPill {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.16);
  background: rgba(15, 23, 42, 0.03);
  color: #0f172a !important;
  font-weight: 950;
  white-space: nowrap;
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

/* modal */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 80;
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
