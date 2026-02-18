<!-- ✅ src/pages/MaintenancePage.vue (FICHIER COMPLET)
     ✅ Header compact = style référence (MomdAndQuantity-like)
     ✅ Pas d'infos à côté du titre
     ✅ Chiffres en police NORMALE via .num (tabulaires)
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal, { type ImportCopyPreset } from "@/components/SectionImportModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  InformationCircleIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0 && (store as any).loadPnls) {
    await (store as any).loadPnls();
  }
});

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
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => Math.max(0, toNum(contract.value?.dureeMois)));

/* =========================
   EDIT MODEL (MAINTENANCE)
========================= */
type MaintenanceEdit = {
  cab: number;
  elec: number;
  chargeur: number;
  generale: number;
  bassins: number;
  preventive: number;
};

const edit = reactive<MaintenanceEdit>({
  cab: 0,
  elec: 0,
  chargeur: 0,
  generale: 0,
  bassins: 0,
  preventive: 0,
});

function loadFromVariant() {
  const m: any = (variant.value as any)?.maintenance ?? {};
  edit.cab = clamp(m?.cab, 0, 1e12);
  edit.elec = clamp(m?.elec, 0, 1e12);
  edit.chargeur = clamp(m?.chargeur, 0, 1e12);
  edit.generale = clamp(m?.generale, 0, 1e12);
  edit.bassins = clamp(m?.bassins, 0, 1e12);
  edit.preventive = clamp(m?.preventive, 0, 1e12);
}

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

/* =========================
   METRICS
========================= */
type Line = {
  key: keyof MaintenanceEdit;
  label: string;
  mensuel: number; // DH/mois
  total: number; // DH
  parM3: number; // DH/m3
  pctCa: number; // %
};

const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
const volumeTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + toNum(vf?.volumeM3), 0));

const transportPrixMoyen = computed(() => toNum((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find((x: any) => String(x.mpId) === String(mpId));
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
    const qty = toNum(it.qty); // kg/m3
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = toNum(vf?.volumeM3);
    const momd = toNum(vf?.momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

const mensuelTotal = computed(() => {
  return (
    toNum(edit.cab) +
    toNum(edit.elec) +
    toNum(edit.chargeur) +
    toNum(edit.generale) +
    toNum(edit.bassins) +
    toNum(edit.preventive)
  );
});

const total = computed(() => mensuelTotal.value * dureeMois.value);
const parM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pctCa = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

const lines = computed<Line[]>(() => {
  const mk = (key: keyof MaintenanceEdit, label: string): Line => {
    const mensuel = toNum(edit[key]);
    const total = mensuel * dureeMois.value;
    const parM3 = volumeTotal.value > 0 ? total / volumeTotal.value : 0;
    const pctCa = caTotal.value > 0 ? (total / caTotal.value) * 100 : 0;
    return { key, label, mensuel, total, parM3, pctCa };
  };

  return [
    mk("cab", "Maintenance CAB"),
    mk("elec", "Maintenance Électricité"),
    mk("chargeur", "Maintenance Chargeur"),
    mk("generale", "Maintenance Générale"),
    mk("bassins", "Maintenance Bassins"),
    mk("preventive", "Maintenance Préventive"),
  ];
});

/* =========================
   ✅ MASQUER 0 (UI only)
========================= */
const hideZeros = ref(false);
function isZero(v: any) {
  return Math.abs(toNum(v)) <= 0;
}
const visibleLines = computed(() => {
  const arr = lines.value ?? [];
  if (!hideZeros.value) return arr;
  return arr.filter((ln) => !isZero((edit as any)[ln.key]));
});

/* =========================
   TOAST
========================= */
const toastOpen = ref(false);
const toastMsg = ref("");
const toastKind = ref<"ok" | "err" | "info">("ok");

function showToast(msg: string, kind: "ok" | "err" | "info" = "ok") {
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

function buildPayload(): any {
  const existing: any = (variant.value as any)?.maintenance ?? {};
  return {
    category: existing?.category ?? "COUTS_CHARGES",
    cab: Number(clamp(edit.cab, 0, 1e12)),
    elec: Number(clamp(edit.elec, 0, 1e12)),
    chargeur: Number(clamp(edit.chargeur, 0, 1e12)),
    generale: Number(clamp(edit.generale, 0, 1e12)),
    bassins: Number(clamp(edit.bassins, 0, 1e12)),
    preventive: Number(clamp(edit.preventive, 0, 1e12)),
  };
}

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { maintenance: buildPayload() });
    showToast("Maintenance enregistrée.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer Maintenance", "Confirmer l’enregistrement de la Maintenance ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadFromVariant();
    showToast("Valeurs restaurées.", "ok");
  });
}

/* =========================
   IMPORTER
========================= */
const impOpen = ref(false);
const impBusy = ref(false);
const impErr = ref<string | null>(null);

function findVariantById(variantId: string): any | null {
  const id = String(variantId ?? "").trim();
  if (!id) return null;

  for (const p of (store as any).pnls ?? []) {
    for (const c of (p as any)?.contracts ?? []) {
      for (const v of c?.variants ?? []) {
        if (String(v?.id ?? "") === id) return v;
      }
    }
  }
  return null;
}

function applyMaintenanceFromVariant(srcVariant: any) {
  const m: any = srcVariant?.maintenance ?? {};
  edit.cab = clamp(m?.cab, 0, 1e12);
  edit.elec = clamp(m?.elec, 0, 1e12);
  edit.chargeur = clamp(m?.chargeur, 0, 1e12);
  edit.generale = clamp(m?.generale, 0, 1e12);
  edit.bassins = clamp(m?.bassins, 0, 1e12);
  edit.preventive = clamp(m?.preventive, 0, 1e12);
}

async function onApplyImport(payload: { sourceVariantId: string; copy: ImportCopyPreset }) {
  if (!variant.value) return;

  const sourceId = String(payload?.sourceVariantId ?? "").trim();
  if (!sourceId) return;

  if (String(variant.value?.id ?? "") === sourceId) {
    showToast("La source est déjà la variante active.", "info");
    impOpen.value = false;
    return;
  }

  impErr.value = null;
  impBusy.value = true;
  try {
    let src = findVariantById(sourceId);

    if (!src) await (store as any).loadPnls?.();

    src = src ?? findVariantById(sourceId);
    if (!src) {
      showToast("Variante source introuvable (données non chargées).", "err");
      return;
    }

    applyMaintenanceFromVariant(src);
    showToast("Maintenance importée dans la variante active. Pense à enregistrer.", "ok");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   GENERALISER
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

      await (store as any).updateVariant(targetId, { maintenance: payload });
    }
    showToast("Section Maintenance généralisée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value ?? e?.message ?? e), "err");
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Maintenance sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Maintenance sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser Maintenance", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}
</script>

<template>
  <div class="page">
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttl">Maintenance</div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="!variant" @click="hideZeros = !hideZeros" :class="{ on: hideZeros }">
            <span class="dot" aria-hidden="true"></span>
            {{ hideZeros ? "Afficher tout" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="!variant || saving || impBusy || genBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <div class="kpis" v-if="variant">
        <div class="kpi kpiTint">
          <div class="kLbl">
            <CalendarDaysIcon class="ic" />
            / mois
          </div>
          <div class="kVal num">
            {{ n(mensuelTotal, 2) }} <span>DH/mois</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal num">{{ money(total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal num">{{ n(parM3, 2) }} <span>DH/m³</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">% CA</div>
          <div class="kVal num">{{ n(pctCa, 2) }} <span>%</span></div>
        </div>
      </div>

      <div v-if="err" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ err }}</div>
      </div>

      <div v-if="impErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Import :</b> {{ impErr }}</div>
      </div>

      <div v-if="genErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Généralisation :</b> {{ genErr }}</div>
      </div>

      <div v-if="(store as any).loading" class="alert">
        <div>Chargement…</div>
      </div>

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
              <col class="colLabel" />
              <col class="colMensuel" />
              <col class="colTotal" />
              <col class="colM3" />
              <col class="colPct" />
            </colgroup>

            <thead>
              <tr>
                <th class="th thL">Poste</th>
                <th class="th r">DH/mois</th>
                <th class="th r">Total</th>
                <th class="th r">DH/m³</th>
                <th class="th r">% CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="ln in visibleLines" :key="String(ln.key)">
                <td class="labelCell">
                  <span class="designationText">{{ ln.label }}</span>
                </td>

                <td class="r">
                  <div class="inCell">
                    <input
                      class="inputLg num"
                      type="number"
                      step="0.01"
                      min="0"
                      :value="(edit as any)[ln.key]"
                      @input="(edit as any)[ln.key] = clamp(($event.target as HTMLInputElement).value, 0, 1e12)"
                    />
                    <span class="unit unitEdit">DH</span>
                  </div>
                </td>

                <td class="r val num">{{ money(ln.total, 2) }}</td>
                <td class="r val num">{{ n(ln.parM3, 2) }}</td>
                <td class="r val num">{{ n(ln.pctCa, 2) }}%</td>
              </tr>

              <tr>
                <td class="val">Total</td>
                <td class="r val num">{{ n(mensuelTotal, 2) }} <span class="unit">DH</span></td>
                <td class="r val num">{{ money(total, 2) }}</td>
                <td class="r val num">{{ n(parM3, 2) }}</td>
                <td class="r val num">{{ n(pctCa, 2) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot tiny muted">
          <InformationCircleIcon class="ic" style="vertical-align: -3px; margin-right: 6px" />
          Montants en <b>DH/mois</b> • Durée : <b>{{ dureeMois }}</b> mois • % calculé sur CA (CMP + Transport + MOMD).
        </div>
      </div>
    </template>

    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Maintenance"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Maintenance"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

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

/* ✅ chiffres en police NORMALE (pas monospace), mais tabulaires */
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

/* masque 0 */
.btn.on {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.35);
}
.btn.on .dot {
  background: rgba(2, 132, 199, 0.9);
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.colLabel {
  width: 34%;
}
.colMensuel {
  width: 20%;
}
.colTotal {
  width: 18%;
}
.colM3 {
  width: 14%;
}
.colPct {
  width: 14%;
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
.thL {
  text-align: left;
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
  text-align: right;
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
