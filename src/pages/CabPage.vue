<!-- ✅ src/pages/CabPage.vue (FICHIER COMPLET)
     ✅ Contrat: CAB à charge client => amortMois forcé à 0 (UI + auto-fix backend),
     ✅ page reste active, seul champ amortissement verrouillé
     ✅ Header calqué sur MomdAndQuantityPage (positions/tailles/boutons) + aucune info à côté du titre
     ✅ Police chiffres: normale (pas monospace), comme FormulesCataloguePage
-->
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
  LockClosedIcon,
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
function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function isChargeClient(v: any): boolean {
  if (typeof v === "boolean") return v;
  const t = norm(v);
  return !!t && t.includes("client");
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const cab = computed<any>(() => (variant.value as any)?.cab ?? null);

/**
 * ✅ CAB à la charge du client ?
 * -> aligné avec ton backend: contract.cab (string contenant "client" ou boolean)
 */
const cabChargeClient = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  const v: any = variant.value ?? {};

  const candidates = [
    c.cab, // ✅ backend
    c.cabChargeClient,
    c.cabAChargeClient,
    c.cabPrisEnChargeParClient,
    c.cabCharge,

    v.cab,
    v.cabChargeClient,
    v.cabAChargeClient,
    v.cabPrisEnChargeParClient,
    v.cabCharge,
  ];

  for (const x of candidates) if (typeof x === "boolean") return x;
  for (const x of candidates) if (isChargeClient(x)) return true;

  for (const x of candidates) {
    if (typeof x === "string") {
      const s = x.trim().toUpperCase();
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

  // ✅ si charge client => draft amort = 0 (UI)
  draft.amortMois = cabChargeClient.value ? 0 : toNum(c.amortMois);

  activeField.value = null;
  dirty.value = false;
}

watch(
  () => variant.value?.id,
  () => resetFromVariant(),
  { immediate: true }
);

function startEdit(k: keyof CabDraft) {
  // ✅ seul amortissement est verrouillé
  if (k === "amortMois" && cabChargeClient.value) return;
  activeField.value = k;
}
function stopEdit() {
  activeField.value = null;
}
function markDirty(field?: keyof CabDraft) {
  // ✅ si contrat charge client => amort verrouillé, pas de dirty sur amort
  if (field === "amortMois" && cabChargeClient.value) return;
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
   ✅ AUTO-FIX BACKEND (important pour dashboard)
========================= */
const fixBusy = ref(false);
const fixErr = ref<string | null>(null);

async function ensureAmortZeroIfChargeClient() {
  const vId = String(variant.value?.id ?? "").trim();
  if (!vId) return;
  if (!cabChargeClient.value) return;

  const current = toNum(cab.value?.amortMois);
  if (current === 0) return;

  if (fixBusy.value) return;

  fixErr.value = null;
  fixBusy.value = true;
  try {
    await (store as any).updateVariant(vId, { cab: { amortMois: 0 } });
    draft.amortMois = 0;
    dirty.value = false;
    showToast("Amortissement forcé à 0 (contrat: charge client).", "info");
  } catch (e: any) {
    fixErr.value = e?.message ?? String(e);
    showToast("Impossible de forcer l'amortissement à 0: " + String(fixErr.value), "err");
  } finally {
    fixBusy.value = false;
  }
}

watch(
  () => [variant.value?.id, cabChargeClient.value, cab.value?.amortMois],
  () => ensureAmortZeroIfChargeClient(),
  { immediate: true }
);

/* =========================
   SAVE CAB
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function buildCabPayload() {
  const existing: any = cab.value ?? {};
  return {
    category: existing?.category ?? "LOGISTIQUE_APPRO",
    etat: String(draft.etat ?? "NEUVE"),
    mode: String(draft.mode ?? "ACHAT"),
    capaciteM3: toNum(draft.capaciteM3),
    amortMois: cabChargeClient.value ? 0 : toNum(draft.amortMois),
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

function applyCabFromVariant(srcVariant: any) {
  const c = srcVariant?.cab ?? {};

  draft.etat = String(c?.etat ?? "NEUVE");
  draft.mode = String(c?.mode ?? "ACHAT");
  draft.capaciteM3 = toNum(c?.capaciteM3);

  draft.amortMois = cabChargeClient.value ? 0 : toNum(c?.amortMois);

  activeField.value = null;
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

    if (cabChargeClient.value) {
      await ensureAmortZeroIfChargeClient();
    }

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
const amortMoisEff = computed<number>(() => (cabChargeClient.value ? 0 : toNum(draft.amortMois)));
const amortTotal = computed<number>(() => amortMoisEff.value * dureeMois.value);

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
    <!-- ✅ Header calqué sur MomdAndQuantityPage -->
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttl">CAB</div>
        </div>

        <div class="actions" v-if="variant">
          <button class="btn" :disabled="saving || genBusy || impBusy || fixBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy || fixBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy || fixBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="saving || !dirty || impBusy || fixBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <!-- ✅ Indication discrète (pas à côté du titre) -->
      <div v-if="variant && cabChargeClient" class="hintLock">
        <LockClosedIcon class="lic" />
        Amortissement verrouillé (contrat à charge client) — valeur forcée à 0.
      </div>

      <div v-if="err" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ err }}</div>
      </div>

      <div v-if="fixErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Contrat → Fix amortissement :</b> {{ fixErr }}</div>
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
      <div class="grid">
        <div class="card">
          <div class="cardHdr">
            <div class="cardTtl">
              <TruckIcon class="ic3" />
              <div>
                <div class="h">Données CAB</div>
                <div class="p">
                  Clique sur une valeur pour modifier.
                  <span class="muted">Seul l’amortissement est verrouillé si charge client.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="rows">
            <div class="rrow">
              <div class="lab">État</div>
              <div class="val">
                <template v-if="activeField === 'etat'">
                  <select class="inSel" v-model="draft.etat" @change="markDirty('etat')" data-editor="1">
                    <option value="NEUVE">NEUVE</option>
                    <option value="OCCASION">OCCASION</option>
                  </select>
                </template>
                <template v-else>
                  <span class="click" @click="startEdit('etat')">{{ draft.etat }}</span>
                </template>
              </div>
            </div>

            <div class="rrow">
              <div class="lab">Mode</div>
              <div class="val">
                <template v-if="activeField === 'mode'">
                  <select class="inSel" v-model="draft.mode" @change="markDirty('mode')" data-editor="1">
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

            <div class="rrow">
              <div class="lab">Capacité (m³)</div>
              <div class="val">
                <template v-if="activeField === 'capaciteM3'">
                  <input
                    class="inNum mono"
                    type="number"
                    step="0.1"
                    v-model.number="draft.capaciteM3"
                    @input="markDirty('capaciteM3')"
                    data-editor="1"
                  />
                </template>
                <template v-else>
                  <span class="click mono" @click="startEdit('capaciteM3')">{{ n(draft.capaciteM3, 1) }}</span>
                </template>
              </div>
            </div>

            <div class="rrow">
              <div class="lab">
                Amortissement / mois
                <span v-if="cabChargeClient" class="lockPill">
                  <LockClosedIcon class="lic2" />
                  Contrat
                </span>
              </div>

              <div class="val">
                <template v-if="cabChargeClient">
                  <span class="click mono lockedVal" title="Verrouillé par contrat">
                    <b>{{ money(0, 2) }}</b>
                  </span>
                </template>

                <template v-else>
                  <template v-if="activeField === 'amortMois'">
                    <input
                      class="inNum mono"
                      type="number"
                      step="0.01"
                      v-model.number="draft.amortMois"
                      @input="markDirty('amortMois')"
                      data-editor="1"
                    />
                  </template>
                  <template v-else>
                    <span class="click mono" @click="startEdit('amortMois')">
                      <b>{{ money(draft.amortMois, 2) }}</b>
                    </span>
                  </template>
                </template>
              </div>
            </div>
          </div>

          <div class="note">
            Amortissement total = amort./mois × durée.
            <b v-if="cabChargeClient"> Contrat charge client ⇒ amortissement = 0.</b>
          </div>
        </div>

        <div class="card side">
          <div class="sideTtl">Repères</div>
          <div class="sideLine">
            <span class="k">Durée</span>
            <span class="v mono">{{ n(dureeMois, 0) }} mois</span>
          </div>
          <div class="sideLine">
            <span class="k">Amort./mois</span>
            <span class="v mono">{{ money(amortMoisEff, 2) }}</span>
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

    <!-- ✅ MODAL IMPORT -->
    <SectionImportModal v-model="impOpen" sectionLabel="CAB" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

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
            <button v-if="modal.mode === 'confirm'" class="btn2 pri" type="button" @click="modal.onConfirm && modal.onConfirm()">
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

/* ✅ police normale (pas monospace) + chiffres tabulaires */
.mono {
  font-variant-numeric: tabular-nums;
}

/* sticky subheader (même esprit que MomdAndQuantityPage) */
.subhdr {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 16px;
  padding: 10px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.left {
  display: flex;
  align-items: center;
  min-width: 180px;
}
.ttl {
  font-size: 15px;
  font-weight: 950;
  color: #0f172a;
}

/* actions (mêmes tailles) */
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

/* hint discret sous header */
.hintLock {
  margin-top: 8px;
  border-radius: 14px;
  padding: 9px 10px;
  border: 1px solid rgba(124, 45, 18, 0.18);
  background: rgba(255, 247, 237, 0.75);
  display: inline-flex;
  gap: 10px;
  align-items: center;
  font-weight: 900;
  color: rgba(124, 45, 18, 0.95);
}
.lic {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
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
  padding: 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.cardTtl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ic3 {
  width: 18px;
  height: 18px;
  color: rgba(15, 23, 42, 0.75);
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.lockPill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 950;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  padding: 1px 6px;
  border-radius: 999px;
}
.lic2 {
  width: 12px;
  height: 12px;
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
.lockedVal {
  cursor: not-allowed;
  opacity: 0.95;
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

/* toast */
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

/* safe overlays from child modals */
:deep(.modalOverlay) {
  position: fixed !important;
  inset: 0 !important;
  z-index: 100000 !important;
}
:deep(.modalDialog),
:deep(.modalCard),
:deep(.modalPanel) {
  z-index: 100001 !important;
}
</style>
