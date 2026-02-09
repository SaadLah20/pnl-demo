<!-- src/pages/MomdAndQuantityPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionGeneralizeModal, { type CopyPreset } from "@/components/SectionGeneralizeModal.vue";

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
  const items = (((variant.value as any)?.mp?.items ?? []) as any[]) || [];
  const vmp = items.find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return toNum(vmp.prix);
  return toNum(vmp?.mp?.prix);
}

type CompRow = { mpId: string; qty: number; prix: number; coutParM3: number };

function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty); // kg/m³
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}

function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

/* =========================
   BASE ROWS (non triées)
========================= */
type Row = {
  id: string;
  designation: string;
  cmp: number; // DH/m³
  qte: number; // m³
  momd: number; // DH/m³
  pv: number; // DH/m³
  ca: number; // DH
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

/* =========================
   SYNC au changement de variante
========================= */
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
   KPIs
========================= */
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.qte), 0));
const cmpTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.cmp) * toNum(r.qte), 0));
const cmpMoy = computed(() => (volumeTotal.value > 0 ? cmpTotal.value / volumeTotal.value : 0));

const momdTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.momd) * toNum(r.qte), 0));
const momdMoy = computed(() => (volumeTotal.value > 0 ? momdTotal.value / volumeTotal.value : 0));

const caTotal = computed(() => rows.value.reduce((s, r) => s + toNum(r.ca), 0));
const pvMoy = computed(() => (volumeTotal.value > 0 ? caTotal.value / volumeTotal.value : 0));

/* =========================
   MODAL simple (déjà existant)
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
    openInfo("Enregistré", "Quantités & MOMD mises à jour (tri PV appliqué).");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
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
  });
}

/* =========================
   ✅ GENERALISER (Qté & MOMD)
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
  const p = store.activePnl;
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

  // fallback safe: on charge deep temporairement (sans casser l'écran => on restaure ensuite)
  if ((store as any).loadVariantDeep) {
    const current = String((store as any).activeVariantId ?? "");
    await (store as any).loadVariantDeep(String(variantId));
    const loaded = (store as any).activeVariant;

    // restore
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
    // snapshot source by formuleId
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
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
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
   INIT DATA
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
    <div class="top">
      <div class="tleft">
        <div class="titleRow">
          <div class="h1">Qté & MOMD</div>
          <span class="badge" v-if="variant">Variante active</span>
        </div>
        <div class="muted tiny" v-if="variant">
          <b class="clip">{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="contract?.dureeMois" class="sep">•</span>
          <span v-if="contract?.dureeMois">Durée <b>{{ contract.dureeMois }}</b> mois</span>
        </div>
        <div class="muted tiny" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || genBusy" @click="genOpen = true">Généraliser</button>
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Reset</button>
        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "…" : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="genErr" class="alert error"><b>Généralisation :</b> {{ genErr }}</div>
    <div v-if="genBusy" class="alert"><b>Généralisation :</b> traitement…</div>

    <div v-if="(store as any).loading" class="alert">Chargement…</div>
    <div v-else-if="(store as any).error" class="alert error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="alert error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="card">
        <div class="muted">Sélectionne une variante puis reviens ici.</div>
      </div>

      <template v-else>
        <div class="kpis">
          <div class="kpi"><div class="kLbl">CMP</div><div class="kVal mono">{{ n(cmpMoy, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">CMP Tot</div><div class="kVal mono">{{ money(cmpTotal, 2) }}</div></div>
          <div class="kpi"><div class="kLbl">MOMD</div><div class="kVal mono">{{ n(momdMoy, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">MOMD Tot</div><div class="kVal mono">{{ money(momdTotal, 2) }}</div></div>
          <div class="kpi"><div class="kLbl">Transport</div><div class="kVal mono">{{ n(transportPrixMoyen, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">PV</div><div class="kVal mono">{{ n(pvMoy, 2) }} <span>DH/m³</span></div></div>
          <div class="kpi"><div class="kLbl">CA</div><div class="kVal mono">{{ money(caTotal, 2) }}</div></div>
          <div class="kpi"><div class="kLbl">Volume</div><div class="kVal mono">{{ n(volumeTotal, 2) }} <span>m³</span></div></div>
        </div>

        <div class="card pad0">
          <div class="tableWrap">
            <table class="table">
              <colgroup>
                <col class="colDesignation" />
                <col class="colCmp" />
                <col class="colQte" />
                <col class="colMomd" />
                <col class="colPv" />
                <col class="colCa" />
              </colgroup>

              <thead>
                <tr>
                  <th class="th">Désignation</th>
                  <th class="th r">CMP</th>
                  <th class="th r">Qté</th>
                  <th class="th r">MOMD</th>
                  <th class="th r">PV</th>
                  <th class="th r">CA</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="r in rows" :key="r.id">
                  <td class="designation">
                    <b class="designationText">{{ r.designation }}</b>
                  </td>

                  <td class="mono r">{{ n(r.cmp, 2) }}</td>

                  <td class="cellInput">
                    <div class="inCell">
                      <input
                        class="inputSm mono r"
                        type="number"
                        step="1"
                        min="0"
                        :value="getDraft(r.id).volumeM3"
                        @input="getDraft(r.id).volumeM3 = toNum(($event.target as HTMLInputElement).value)"
                      />
                      <span class="unit">m³</span>
                    </div>
                  </td>

                  <td class="cellInput">
                    <div class="inCell">
                      <input
                        class="inputSm mono r"
                        type="number"
                        step="0.01"
                        min="0"
                        :value="getDraft(r.id).momd"
                        @input="getDraft(r.id).momd = toNum(($event.target as HTMLInputElement).value)"
                      />
                      <span class="unit">DH</span>
                    </div>
                  </td>

                  <td class="r">
                    <span class="pvPill mono">{{ n(r.pv, 2) }}</span>
                  </td>

                  <td class="r">
                    <b class="mono">{{ money(r.ca, 2) }}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="foot muted tiny">Tri PV : au chargement initial + après “Enregistrer”.</div>
        </div>
      </template>
    </template>

    <!-- MODAL (simple confirm/info) -->
    <div v-if="modal.open" class="modalMask" @click.self="closeModal()">
      <div class="modal">
        <div class="modalTitle">{{ modal.title }}</div>
        <div class="modalMsg">{{ modal.message }}</div>

        <div class="modalActions">
          <button class="btn" @click="closeModal()">Fermer</button>
          <button v-if="modal.mode === 'confirm'" class="btn primary" @click="modal.onConfirm && modal.onConfirm()">
            Confirmer
          </button>
        </div>
      </div>
    </div>

    <!-- ✅ MODAL GENERALISATION -->
    <SectionGeneralizeModal
      v-model="genOpen"
      section-label="Qté & MOMD"
      :source-variant-id="String((store as any).activeVariantId ?? '') || null"
      @apply="onApplyGeneralize"
      @close="() => {}"
    />
  </div>
</template>

<style scoped>
/* ✅ Ultra compact overall */
.page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

/* top compact */
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.tleft {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 260px;
}
.titleRow {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.h1 {
  font-size: 16px;
  font-weight: 950;
  line-height: 1.05;
  margin: 0;
  color: #111827;
}
.badge {
  font-size: 10px;
  font-weight: 950;
  color: #065f46;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 7px;
  border-radius: 999px;
}
.muted {
  color: #6b7280;
  font-size: 11px;
}
.tiny {
  font-size: 10px;
}
.clip {
  display: inline-block;
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sep {
  margin: 0 6px;
  color: #9ca3af;
}

.actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

/* alerts */
.alert {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 8px 10px;
  font-size: 12px;
}
.alert.error {
  border-color: #ef4444;
  background: #fff5f5;
}

/* buttons */
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 12px;
  padding: 7px 9px;
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  line-height: 1;
}
.btn:hover {
  background: #f9fafb;
}
.btn.primary {
  background: #007a33;
  border-color: #007a33;
  color: #fff;
}
.btn.primary:hover {
  filter: brightness(0.95);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* cards */
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 10px;
}
.card.pad0 {
  padding: 0;
}

/* ✅ KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(8, minmax(120px, 1fr));
  gap: 8px;
}
@media (max-width: 1400px) {
  .kpis {
    grid-template-columns: repeat(4, minmax(120px, 1fr));
  }
}
@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.kLbl {
  font-size: 10px;
  color: #6b7280;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.kVal {
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
  color: #111827;
}
.kVal span {
  font-weight: 900;
  color: #6b7280;
  margin-left: 6px;
  font-size: 10.5px;
}

/* table */
.tableWrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  table-layout: fixed;
}
.colDesignation {
  width: 280px;
}
.colCmp {
  width: 110px;
}
.colQte {
  width: 140px;
}
.colMomd {
  width: 140px;
}
.colPv {
  width: 120px;
}
.colCa {
  width: 160px;
}

.th,
.table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 6px 7px;
  vertical-align: middle;
}
.th {
  background: #fafafa;
  color: #6b7280;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}
.r {
  text-align: right;
}
.mono {
  font-variant-numeric: tabular-nums;
}

.designation {
  overflow: hidden;
}
.designationText {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  border: 1px solid #d1d5db;
  border-radius: 12px;
  font-size: 11px;
  padding: 6px 7px;
  width: 92px;
  background: #fff;
}
.unit {
  color: #6b7280;
  font-size: 10.5px;
  min-width: 22px;
  text-align: right;
}

.pvPill {
  display: inline-block;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid rgba(0, 122, 51, 0.35);
  background: rgba(236, 253, 245, 0.75);
  font-weight: 950;
  white-space: nowrap;
}

.foot {
  padding: 7px 10px;
  border-top: 1px solid #e5e7eb;
}

/* modal compact (confirm/info) */
.modalMask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 50;
}
.modal {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}
.modalTitle {
  font-weight: 950;
  font-size: 13px;
  margin-bottom: 6px;
  color: #111827;
}
.modalMsg {
  color: #374151;
  font-size: 12px;
  white-space: pre-wrap;
}
.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
