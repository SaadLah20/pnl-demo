<!-- ✅ src/pages/CabPage.vue (FICHIER COMPLET / compact + sticky subheader + toast + modal confirm + generalize + ✅ importer) -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal, { type ImportCopyPreset } from "@/components/SectionImportModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  TruckIcon,
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
function money(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const cab = computed<any>(() => (variant.value as any)?.cab ?? null);

const variantLabel = computed(() => {
  const v = variant.value;
  if (!v) return "—";
  return v.title ?? v.name ?? v.id?.slice?.(0, 8) ?? "Variante";
});

/**
 * CAB à la charge du client ?
 * (garde le comportement “multi-clés” pour éviter de te bloquer)
 */
const cabChargeClient = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  const v: any = variant.value ?? {};

  const candidates = [
    c.cabChargeClient,
    c.cabAChargeClient,
    c.cabPrisEnChargeParClient,
    c.cabCharge, // ex: "CLIENT" | "NOUS"
    v.cabChargeClient,
    v.cabAChargeClient,
    v.cabPrisEnChargeParClient,
    v.cabCharge,
  ];

  for (const x of candidates) if (typeof x === "boolean") return x;

  for (const x of candidates) {
    if (typeof x === "string") {
      const s = x.toUpperCase();
      if (s === "CLIENT" || s === "CUSTOMER") return true;
      if (s === "NOUS" || s === "OWNER" || s === "MIASMO") return false;
    }
  }
  return false;
});

/* =========================
   UI STATE (edit-on-click)
========================= */
type CabDraft = {
  etat: string;
  mode: string;
  capaciteM3: number;
  amortMois: number;
};

const draft = reactive<CabDraft>({
  etat: "NEUVE",
  mode: "ACHAT",
  capaciteM3: 0,
  amortMois: 0,
});

const activeField = ref<keyof CabDraft | null>(null);
const dirty = ref(false);

function resetFromVariant() {
  const c: any = cab.value ?? {};
  draft.etat = String(c.etat ?? "NEUVE");
  draft.mode = String(c.mode ?? "ACHAT");
  draft.capaciteM3 = toNum(c.capaciteM3);
  draft.amortMois = toNum(c.amortMois);
  activeField.value = null;
  dirty.value = false;
}

watch(
  () => variant.value?.id,
  () => resetFromVariant(),
  { immediate: true }
);

function startEdit(k: keyof CabDraft) {
  activeField.value = k;
}
function stopEdit() {
  activeField.value = null;
}
function markDirty() {
  dirty.value = true;
}

/* click ailleurs => déverrouille */
function onDocPointerDown(e: PointerEvent) {
  if (!activeField.value) return;
  const el = e.target as HTMLElement | null;
  if (!el) return;
  if (el.closest("[data-editor='1']")) return;
  stopEdit();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, { capture: true } as any);
});

/* =========================
   TOAST (non bloquant)
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
   SAVE CAB
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function buildCabPayload() {
  const existing: any = cab.value ?? {};
  return {
    category: existing?.category ?? "COUTS_CHARGES",
    etat: String(draft.etat ?? "NEUVE"),
    mode: String(draft.mode ?? "ACHAT"),
    capaciteM3: toNum(draft.capaciteM3),
    amortMois: toNum(draft.amortMois),
  };
}

async function saveCab() {
  const variantId = String(variant.value?.id ?? (store as any).activeVariantId ?? "").trim();
  if (!variantId) return;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variantId, { cab: buildCabPayload() });
    activeField.value = null;
    dirty.value = false;
    showToast("CAB enregistrée.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer CAB", "Confirmer l’enregistrement de la CAB ?", async () => {
    closeModal();
    await saveCab();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la variante active ?", () => {
    closeModal();
    resetFromVariant();
    showToast("Valeurs restaurées.", "info");
  });
}

/* =========================
   ✅ IMPORTER (depuis autre variante)
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

function applyCabFromVariant(srcVariant: any) {
  const c = srcVariant?.cab ?? {};

  // ✅ Copy section only
  draft.etat = String(c?.etat ?? "NEUVE");
  draft.mode = String(c?.mode ?? "ACHAT");
  draft.capaciteM3 = toNum(c?.capaciteM3);
  draft.amortMois = toNum(c?.amortMois);

  activeField.value = null;

  // ✅ import => local change, needs save
  dirty.value = true;
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

  // NOTE: CAB n’utilise pas les presets -> on ignore payload.copy (toujours FULL par UI)
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

    applyCabFromVariant(src);
    showToast("CAB importée dans la variante active. Pense à enregistrer.", "ok");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
  } finally {
    impBusy.value = false;
  }
}


/* =========================
   GENERALISER (CAB)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeCabTo(variantIds: string[]) {
  const sourceVariantId = String(variant.value?.id ?? (store as any).activeVariantId ?? "").trim();
  if (!sourceVariantId) return;

  const payload = buildCabPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const targetIdRaw of variantIds ?? []) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;
      await (store as any).updateVariant(targetId, { cab: payload });
    }
    showToast("Section CAB généralisée.", "ok");
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
      ? "Confirmer la généralisation de la section CAB sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section CAB sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser CAB", msg, async () => {
    closeModal();
    await generalizeCabTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}

/* =========================
   INDICATEURS (side card)
========================= */
const dureeMois = computed<number>(() => Math.max(1, toNum(contract.value?.dureeMois) || 1));
const amortTotal = computed<number>(() => toNum(draft.amortMois) * dureeMois.value);

/* % du CA (si dispo via formules/transport/mp synchronisés) */
const formules = computed<any[]>(() => (variant.value?.formules?.items ?? []) as any[]);
const volumeTotal = computed<number>(() => formules.value.reduce((s, vf) => s + toNum(vf?.volumeM3), 0));
const transportPrixMoyen = computed<number>(() => toNum(variant.value?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (variant.value?.mp?.items ?? []).find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;

  if (vmp?.prix != null) return toNum(vmp.prix);
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);

  return toNum(vmp?.mp?.prix);
}
function cmpParM3For(vf: any): number {
  const items = (vf?.formule?.items ?? []) as any[];
  return items.reduce((s: number, it: any) => {
    const qty = toNum(it.qty);
    const prix = mpPriceUsed(String(it.mpId));
    return s + (qty / 1000) * prix;
  }, 0);
}
const caTotal = computed<number>(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;

  return formules.value.reduce((s, vf) => {
    const v = toNum(vf?.volumeM3);
    const pv = cmpParM3For(vf) + toNum(vf?.momd) + transportPrixMoyen.value;
    return s + pv * v;
  }, 0);
});
const amortPctCa = computed<number>(() => {
  const ca = caTotal.value;
  if (ca <= 0) return 0;
  return (amortTotal.value / ca) * 100;
});
</script>

<template>
  <div class="page">
    <!-- ✅ Sticky subheader -->
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttlRow">
            <div class="ttl">CAB</div>
            <span v-if="variant" class="badge">Variante active</span>
          </div>

          <div class="meta" v-if="variant">
            <span class="clip"><b>{{ variantLabel }}</b></span>
            <span class="sep" v-if="dureeMois">•</span>
            <span v-if="dureeMois">Durée <b>{{ n(dureeMois, 0) }}</b> mois</span>
          </div>
          <div class="meta" v-else>Aucune variante active.</div>
        </div>

        <div class="actions" v-if="variant && !cabChargeClient">
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <!-- ✅ NEW: Importer -->
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="saving || !dirty || impBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <div v-if="err" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ err }}</div>
      </div>

      <div v-if="genErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Généralisation :</b> {{ genErr }}</div>
      </div>

      <div v-if="impErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Import :</b> {{ impErr }}</div>
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
      <!-- ✅ CAB à la charge du client => message -->
      <div v-if="cabChargeClient" class="card clientOnly">
        <div class="bigMsg">✅ Dans ce contrat, la CAB est à la charge du client.</div>
        <div class="subMsg">Aucune saisie n’est nécessaire sur cette section.</div>
      </div>

      <!-- ✅ UI CAB -->
      <template v-else>
        <div class="grid">
          <div class="card">
            <div class="cardHdr">
              <div class="cardTtl">
                <TruckIcon class="ic3" />
                <div>
                  <div class="h">Données CAB</div>
                  <div class="p">Clique sur une valeur pour modifier. Clique ailleurs pour quitter le champ.</div>
                </div>
              </div>
            </div>

            <div class="rows">
              <!-- Etat -->
              <div class="rrow">
                <div class="lab">État</div>
                <div class="val">
                  <template v-if="activeField === 'etat'">
                    <select class="inSel" v-model="draft.etat" @change="markDirty()" data-editor="1">
                      <option value="NEUVE">NEUVE</option>
                      <option value="OCCASION">OCCASION</option>
                    </select>
                  </template>
                  <template v-else>
                    <span class="click" @click="startEdit('etat')">{{ draft.etat }}</span>
                  </template>
                </div>
              </div>

              <!-- Mode -->
              <div class="rrow">
                <div class="lab">Mode</div>
                <div class="val">
                  <template v-if="activeField === 'mode'">
                    <select class="inSel" v-model="draft.mode" @change="markDirty()" data-editor="1">
                      <option value="ACHAT">ACHAT</option>
                      <option value="LOCATION">LOCATION</option>
                      <option value="LEASING">LEASING</option>
                    </select>
                  </template>
                  <template v-else>
                    <span class="click" @click="startEdit('mode')">{{ draft.mode }}</span>
                  </template>
                </div>
              </div>

              <!-- Capacite -->
              <div class="rrow">
                <div class="lab">Capacité (m³)</div>
                <div class="val">
                  <template v-if="activeField === 'capaciteM3'">
                    <input
                      class="inNum mono"
                      type="number"
                      step="0.1"
                      v-model.number="draft.capaciteM3"
                      @input="markDirty()"
                      data-editor="1"
                    />
                  </template>
                  <template v-else>
                    <span class="click mono" @click="startEdit('capaciteM3')">{{ n(draft.capaciteM3, 1) }}</span>
                  </template>
                </div>
              </div>

              <!-- Amort -->
              <div class="rrow">
                <div class="lab">Amortissement / mois</div>
                <div class="val">
                  <template v-if="activeField === 'amortMois'">
                    <input
                      class="inNum mono"
                      type="number"
                      step="0.01"
                      v-model.number="draft.amortMois"
                      @input="markDirty()"
                      data-editor="1"
                    />
                  </template>
                  <template v-else>
                    <span class="click mono" @click="startEdit('amortMois')">
                      <b>{{ money(draft.amortMois, 2) }}</b>
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <div class="note">
              Amortissement total = amort./mois × durée. % = part du CA si la section Formules est renseignée.
            </div>
          </div>

          <!-- side card compact (info) -->
          <div class="card side">
            <div class="sideTtl">Repères</div>
            <div class="sideLine">
              <span class="k">Durée</span>
              <span class="v mono">{{ n(dureeMois, 0) }} mois</span>
            </div>
            <div class="sideLine">
              <span class="k">Amort./mois</span>
              <span class="v mono">{{ money(draft.amortMois, 2) }}</span>
            </div>
            <div class="sideLine">
              <span class="k">Total</span>
              <span class="v mono">{{ money(amortTotal, 2) }}</span>
            </div>
            <div class="sideLine">
              <span class="k">% CA</span>
              <span class="v mono">{{ n(amortPctCa, 2) }}%</span>
            </div>
            <div class="sideHint muted">Si le CA = 0 (formules non saisies), le % reste à 0.</div>
          </div>
        </div>
      </template>
    </template>

    <!-- ✅ MODAL IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="CAB"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ MODAL GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="CAB"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- ✅ Modal confirm/info -->
    <teleport to="body">
      <div v-if="modal.open" class="ovl underDash" role="dialog" aria-modal="true" @mousedown.self="closeModal()">
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

.muted {
  color: rgba(15, 23, 42, 0.55);
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
.ic {
  width: 18px;
  height: 18px;
}
.ic3 {
  width: 18px;
  height: 18px;
  color: rgba(15, 23, 42, 0.75);
}

.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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

/* cards */
.card {
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: #fff;
  overflow: hidden;
}
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

/* layout */
.grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 10px;
  align-items: start;
}
@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

/* CAB card */
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

.rows {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rrow {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 10px;
  align-items: center;
}
@media (max-width: 980px) {
  .rrow {
    grid-template-columns: 1fr;
  }
}
.lab {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.65);
}
.val {
  min-height: 34px;
  display: flex;
  align-items: center;
}
.click {
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
}
.click:hover {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
}

.inSel,
.inNum {
  width: 100%;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 10px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
}
.inNum {
  text-align: right;
}
.inSel:focus,
.inNum:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}

.note {
  padding: 8px 10px;
  border-top: 1px dashed rgba(16, 24, 40, 0.14);
  font-size: 11.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.65);
}

/* side */
.side {
  padding: 10px;
}
.sideTtl {
  font-weight: 950;
  color: #0f172a;
  margin-bottom: 8px;
}
.sideLine {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(16, 24, 40, 0.06);
}
.sideLine:last-child {
  border-bottom: none;
}
.sideLine .k {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.6);
}
.sideLine .v {
  font-weight: 950;
  color: #0f172a;
}
.sideHint {
  margin-top: 10px;
  font-size: 11.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.6);
}

/* client message */
.clientOnly {
  padding: 18px;
  text-align: center;
  background: rgba(2, 132, 199, 0.04);
}
.bigMsg {
  font-size: 16px;
  font-weight: 950;
  color: #0f172a;
}
.subMsg {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.6);
}

/* ✅ modal (AU-DESSUS + sous header) */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 99999;
}
.ovl.underDash {
  align-items: flex-start;
  padding-top: 82px;
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

/* ✅ toast (AU-DESSUS) */
.toast {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 100000;

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

/* ✅ Safe: si SectionImportModal/GeneralizeModal utilisent une overlay interne */
:deep(.modalOverlay) {
  z-index: 99999 !important;
}
</style>
