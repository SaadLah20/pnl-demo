<!-- ✅ src/pages/CoutM3Page.vue (FICHIER COMPLET / ✅ UI type Maintenance + ✅ Masquer 0 auto + ✅ modals au-dessus headerdashboard) -->
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
  ArrowDownTrayIcon,
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
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    toNum(v)
  );
}
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(x: any, min = 0, max = 1e15) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}
function isZero(v: any) {
  return Math.abs(toNum(v)) <= 0;
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => clamp(contract.value?.dureeMois, 0, 1e9));

const variantLabel = computed(() => {
  const v = variant.value;
  if (!v) return "—";
  return v.title ?? v.name ?? v.id?.slice?.(0, 8) ?? "Variante";
});

/* =========================
   DRAFT (coutM3)
========================= */
type Draft = { eau: number; qualite: number; dechets: number };
const draft = reactive<Draft>({ eau: 0, qualite: 0, dechets: 0 });

/* =========================
   ✅ MASQUER 0 (FIX ORDER)
   - Auto ON à chaque accès si au moins 1 champ ≠ 0
   - Auto OFF si tout = 0
   - L'utilisateur peut forcer ON/OFF via bouton (prioritaire)
========================= */
const hideZeros = ref(false);
const hideZerosUserToggled = ref(false);

function anyNonZero(): boolean {
  return !isZero(draft.eau) || !isZero(draft.qualite) || !isZero(draft.dechets);
}

function syncHideZerosAuto() {
  const anyNZ = anyNonZero();

  // si tout est à 0 => toujours OFF et on reset le "manual"
  if (!anyNZ) {
    hideZeros.value = false;
    hideZerosUserToggled.value = false;
    return;
  }

  // si l'user n'a pas touché => auto ON
  if (!hideZerosUserToggled.value) {
    hideZeros.value = true;
  }
}

function toggleHideZeros() {
  hideZerosUserToggled.value = true;
  hideZeros.value = !hideZeros.value;
}

/* =========================
   LOAD (now safe)
========================= */
function loadDraftFromVariant() {
  const v: any = variant.value ?? {};
  const c: any = v?.coutM3 ?? {};
  draft.eau = clamp(c?.eau, 0, 1e12);
  draft.qualite = clamp(c?.qualite, 0, 1e12);
  draft.dechets = clamp(c?.dechets, 0, 1e12);

  // ✅ "à chaque accès" : on repart en auto (sauf tout=0)
  hideZerosUserToggled.value = false;
  syncHideZerosAuto();
}

watch(
  () => variant.value?.id,
  () => loadDraftFromVariant(),
  { immediate: true }
);

watch(
  () => ({ eau: draft.eau, qualite: draft.qualite, dechets: draft.dechets }),
  () => syncHideZerosAuto()
);

/* =========================
   FORMULES (read-only calc)
   -> CA Total pour calculer %
========================= */
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
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
    const qty = toNum(it.qty); // kg/m³
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const volumeTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + toNum(vf?.volumeM3), 0));

const caTotal = computed(() => {
  const t = transportPrixMoyen.value;
  return formules.value.reduce((s: number, vf: any) => {
    const vol = toNum(vf?.volumeM3);
    const momd = toNum(vf?.momd);
    const pv = cmpParM3For(vf) + momd + t;
    return s + pv * vol;
  }, 0);
});

/* =========================
   KPIs
========================= */
const coutM3ParM3 = computed(() => toNum(draft.eau) + toNum(draft.qualite) + toNum(draft.dechets));
const coutM3Total = computed(() => coutM3ParM3.value * volumeTotal.value);
const coutM3ParMois = computed(() => (dureeMois.value > 0 ? coutM3Total.value / dureeMois.value : 0));
const coutM3Pct = computed(() => (caTotal.value > 0 ? (coutM3Total.value / caTotal.value) * 100 : 0));

/* =========================
   LINES (Maintenance-like)
========================= */
type LineKey = keyof Draft;
type Line = {
  key: LineKey;
  label: string;
  unit: string;
  value: number; // DH/m³
  total: number; // DH
  perMonth: number; // DH/mois
  pctCa: number; // %
};

const lines = computed<Line[]>(() => {
  const mk = (key: LineKey, label: string): Line => {
    const value = clamp((draft as any)[key], 0, 1e12);
    const total = value * volumeTotal.value;
    const perMonth = dureeMois.value > 0 ? total / dureeMois.value : 0;
    const pctCa = caTotal.value > 0 ? (total / caTotal.value) * 100 : 0;
    return { key, label, unit: "DH/m³", value, total, perMonth, pctCa };
  };
  return [mk("eau", "Eau"), mk("qualite", "Qualité"), mk("dechets", "Déchets")];
});

const visibleLines = computed(() => {
  const arr = lines.value ?? [];
  if (!hideZeros.value) return arr;
  return arr.filter((ln) => !isZero(ln.value));
});

function setDraft(key: LineKey, value: any) {
  (draft as any)[key] = clamp(value, 0, 1e12);
}

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
   MODAL (confirm/info)
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

function buildPayload() {
  const existing: any = (variant.value as any)?.coutM3 ?? {};
  return {
    category: existing?.category ?? "COUTS_CHARGES",
    eau: Number(clamp(draft.eau, 0, 1e12)),
    qualite: Number(clamp(draft.qualite, 0, 1e12)),
    dechets: Number(clamp(draft.dechets, 0, 1e12)),
  };
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { coutM3: buildPayload() });
    showToast("Coût au m³ enregistré.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement du coût au m³ ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la variante active ?", () => {
    closeModal();
    loadDraftFromVariant();
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

function applyCoutM3FromVariant(srcVariant: any) {
  const c: any = srcVariant?.coutM3 ?? {};
  draft.eau = clamp(c?.eau, 0, 1e12);
  draft.qualite = clamp(c?.qualite, 0, 1e12);
  draft.dechets = clamp(c?.dechets, 0, 1e12);

  hideZerosUserToggled.value = false;
  syncHideZerosAuto();
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

    applyCoutM3FromVariant(src);
    showToast("Coût au m³ importé. Pense à enregistrer.", "ok");
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
      await (store as any).updateVariant(targetId, { coutM3: payload });
    }
    showToast("Section Coût au m³ généralisée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value), "err");
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Coût au m³ sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Coût au m³ sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser Coût au m³", msg, async () => {
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
          <div class="ttlRow">
            <div class="ttl">Coûts au m³</div>
            <span v-if="variant" class="badge">Variante active</span>
          </div>

          <div class="meta" v-if="variant">
            <span class="clip"><b>{{ variantLabel }}</b></span>
            <span class="sep" v-if="dureeMois">•</span>
            <span v-if="dureeMois">Durée <b>{{ n(dureeMois, 0) }}</b> mois</span>
          </div>
          <div class="meta" v-else>Aucune variante active.</div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="toggleHideZeros()" :class="{ on: hideZeros }">
            <span class="dot" aria-hidden="true"></span>
            {{ hideZeros ? "Afficher tout" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
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
        <div class="kpi main">
          <div class="kLbl">DH / m³</div>
          <div class="kVal mono">
            {{ n(coutM3ParM3, 2) }}
            <span class="unit">DH/m³</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(coutM3Total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">/ mois</div>
          <div class="kVal mono">{{ money(coutM3ParMois, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">% CA</div>
          <div class="kVal mono">{{ n(coutM3Pct, 2) }}<span class="unit">%</span></div>
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
      <div class="card">
        <!-- ✅ cardHdr supprimé car il était devenu vide (logo + paragraphe supprimés) -->

        <div class="tableWrap">
          <table class="table">
            <colgroup>
              <col class="colLabel" />
              <col class="colInput" />
              <col class="colTotal" />
              <col class="colMois" />
              <col class="colPct" />
            </colgroup>

            <thead>
              <tr>
                <th class="th">Poste</th>
                <th class="th r">DH/m³</th>
                <th class="th r">Total</th>
                <th class="th r">/ mois</th>
                <th class="th r">% CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="ln in visibleLines" :key="String(ln.key)">
                <td class="labelCell"><b>{{ ln.label }}</b></td>

                <td class="r">
                  <div class="inCell">
                    <input
                      class="inputSm r mono"
                      type="number"
                      step="0.01"
                      min="0"
                      :value="ln.value"
                      @input="setDraft(ln.key, ($event.target as HTMLInputElement).value)"
                    />
                    <span class="unitMini">DH/m³</span>
                  </div>
                </td>

                <td class="r mono"><b>{{ money(ln.total, 2) }}</b></td>
                <td class="r mono">{{ money(ln.perMonth, 2) }}</td>
                <td class="r mono">{{ n(ln.pctCa, 2) }}%</td>
              </tr>

              <tr class="sumRow">
                <td><b>Total</b></td>
                <td class="r"><b>{{ n(coutM3ParM3, 2) }}</b> <span class="unitMini">DH/m³</span></td>
                <td class="r"><b>{{ money(coutM3Total, 2) }}</b></td>
                <td class="r"><b>{{ money(coutM3ParMois, 2) }}</b></td>
                <td class="r"><b>{{ n(coutM3Pct, 2) }}%</b></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot">
          Volume total : <b>{{ n(volumeTotal, 2) }}</b> m³ • Durée : <b>{{ n(dureeMois, 0) }}</b> mois • CA estimé :
          <b>{{ money(caTotal, 2) }}</b>
        </div>
      </div>
    </template>

    <SectionImportModal v-model="impOpen" sectionLabel="Coût au m³" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coût au m³"
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
            <div class="dlgMsg" style="white-space: pre-line">{{ modal.message }}</div>
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
      <div v-if="toastOpen" class="toast" :class="{ err: toastKind === 'err', info: toastKind === 'info' }" role="status" aria-live="polite">
        <CheckCircleIcon v-if="toastKind === 'ok'" class="tic" />
        <ExclamationTriangleIcon v-else class="tic" />
        <div class="tmsg">{{ toastMsg }}</div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* (STYLE inchangé) */
.page {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  min-width: 240px;
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

.ic {
  width: 18px;
  height: 18px;
}

.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* KPIs */
.kpis {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 8px;
}
@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(160px, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.kpi.main {
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
  font-size: 12.5px;
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
}
.unit {
  margin-left: 8px;
  font-size: 10.5px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
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
.cardHdr {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.cardTtl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.h {
  font-weight: 950;
  color: #0f172a;
  font-size: 13px;
}
.p {
  font-weight: 750;
  color: rgba(15, 23, 42, 0.55);
  font-size: 12px;
}

.tableWrap {
  padding: 8px 10px 10px;
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
.colLabel {
  width: 260px;
}
.colInput {
  width: 170px;
}
.colTotal {
  width: 180px;
}
.colMois {
  width: 170px;
}
.colPct {
  width: 90px;
}
.th,
.table td {
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  padding: 8px 8px;
  vertical-align: middle;
}
.th {
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.55);
  font-size: 11px;
  white-space: nowrap;
}
.r {
  text-align: right;
}
.inCell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
.inputSm {
  width: 110px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 9px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
  text-align: right;
}
.inputSm:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.unitMini {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
}
.sumRow td {
  background: rgba(15, 23, 42, 0.02);
  font-weight: 950;
}
.foot {
  padding: 0 10px 10px;
  font-size: 11.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.65);
}
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  z-index: 120000;
  backdrop-filter: none;
}

.dlg {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.14);
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(2, 6, 23, 0.35);
  transform: translateY(0);
}

/* Header */
.dlgHdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 12px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.02);
}

.dlgTtl {
  font-size: 13px;
  font-weight: 950;
  color: #0f172a;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.x {
  width: 32px;
  height: 32px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.8);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 950;
  line-height: 1;
}
.x:hover {
  background: rgba(2, 132, 199, 0.08);
  border-color: rgba(2, 132, 199, 0.22);
}
.x:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.16);
}

/* Body */
.dlgBody {
  padding: 12px 12px 10px;
}

.dlgMsg {
  font-size: 12.5px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.78);
  line-height: 1.5;
}

/* Footer */
.dlgFtr {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.015);
}

/* Buttons */
.btn2 {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  color: #0f172a;
  font-weight: 950;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.btn2:hover {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
}
.btn2:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
}
.btn2:active {
  transform: translateY(1px);
}

.btn2.pri {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.30);
}
.btn2.pri:hover {
  background: rgba(2, 132, 199, 0.18);
}
.btn2.pri:focus {
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.18);
}

/* Responsive: boutons en colonne si écran étroit */
@media (max-width: 420px) {
  .dlgFtr {
    flex-direction: column;
  }
  .btn2 {
    width: 100%;
  }
}

/* Motion safety */
@media (prefers-reduced-motion: reduce) {
  .btn2:active {
    transform: none;
  }
}
</style>
