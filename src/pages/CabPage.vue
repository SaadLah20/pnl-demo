<!-- ✅ src/pages/CabPage.vue (FICHIER COMPLET)
     ✅ + Système global "unsaved changes" + bouton Appliquer (preview header)
     🎨 UI harmonisée sur TransportPage (head/buttons/badges/alerts/typo) — logique inchangée
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { useUnsavedStore } from "@/stores/unsaved.store";
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
  EyeIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();
const unsaved = useUnsavedStore();

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
 */
const cabChargeClient = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  const v: any = variant.value ?? {};

  const candidates = [
    c.cab,
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
const headerApplied = ref(false);

function resetFromVariant() {
  const c: any = cab.value ?? {};
  draft.etat = String(c.etat ?? "NEUVE");
  draft.mode = String(c.mode ?? "ACHAT");
  draft.capaciteM3 = toNum(c.capaciteM3);
  draft.amortMois = cabChargeClient.value ? 0 : toNum(c.amortMois);

  activeField.value = null;
  dirty.value = false;

  // ✅ reset local "applied"
  headerApplied.value = false;

  // ✅ on purge le preview header (sécurité)
  (store as any).clearHeaderVariantPreviewPatch?.();
}

watch(
  () => variant.value?.id,
  () => resetFromVariant(),
  { immediate: true }
);

function startEdit(k: keyof CabDraft) {
  if (k === "amortMois" && cabChargeClient.value) return;
  activeField.value = k;
}
function stopEdit() {
  activeField.value = null;
}
function markDirty(field?: keyof CabDraft) {
  if (field === "amortMois" && cabChargeClient.value) return;
  dirty.value = true;
  headerApplied.value = false; // ✅ modifs ont changé après apply
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
let toastT: any = null;

function showToast(msg: string, kind: "ok" | "err" | "info" = "ok") {
  toastMsg.value = msg;
  toastKind.value = kind;
  toastOpen.value = true;
  if (toastT) clearTimeout(toastT);
  toastT = window.setTimeout(() => (toastOpen.value = false), 2400);
}
onBeforeUnmount(() => {
  if (toastT) clearTimeout(toastT);
});

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
function closeModal() {
  modal.open = false;
  modal.title = "";
  modal.message = "";
  modal.onConfirm = null;
}

/* =========================
   ✅ AUTO-FIX BACKEND
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
    headerApplied.value = false;
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
   BUILD PAYLOAD
========================= */
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

/* =========================
   ✅ APPLY (Preview header KPIs)
========================= */
function applyToHeader() {
  if (!dirty.value) return;

  // preview patch header uniquement
  (store as any).setHeaderVariantPreviewPatch?.({ cab: buildCabPayload() });
  headerApplied.value = true;
  showToast("Changements appliqués au dashboard (preview).", "info");
}

/* =========================
   SAVE CAB
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

async function saveCab(): Promise<boolean> {
  const variantId = String(variant.value?.id ?? (store as any).activeVariantId ?? "").trim();
  if (!variantId) return false;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variantId, { cab: buildCabPayload() });

    // ✅ on purge le preview (le header doit refléter le "naturel" persisté)
    (store as any).clearHeaderVariantPreviewPatch?.();

    activeField.value = null;
    dirty.value = false;
    headerApplied.value = false;
    showToast("CAB enregistrée.", "ok");
    return true;
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
    return false;
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
function askDiscard() {
  openConfirm("Annuler", "Annuler les modifications non enregistrées ?", async () => {
    closeModal();
    await discardCab();
    showToast("Modifications annulées.", "info");
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
  headerApplied.value = false;
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

/* % du CA */
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

/* =========================
   ✅ UNSAVED GLOBAL INTEGRATION
========================= */
const PAGE_KEY = "CAB";

async function discardCab() {
  // revert header preview
  (store as any).clearHeaderVariantPreviewPatch?.();
  headerApplied.value = false;

  // optionnel: reset draft (cohérent "quitter sans enregistrer")
  resetFromVariant();
}

onMounted(() => {
  unsaved.registerPage({
    pageKey: PAGE_KEY,
    save: async () => await saveCab(),
    discard: async () => await discardCab(),
  });
});

watch(dirty, (v) => unsaved.setDirty(Boolean(v)), { immediate: true });

onBeforeUnmount(() => {
  unsaved.unregisterPage(PAGE_KEY);
});
</script>

<template>
  <div class="page">
    <!-- ✅ Header sticky (aligné TransportPage) -->
    <div class="head">
      <div class="headL">
        <div class="h1">
          CAB
          <span v-if="variant && dirty" class="dirtyBadge" title="Modifications non enregistrées">
            <ExclamationTriangleIcon class="icSm" />
            Modifié
          </span>
          <span v-if="variant && headerApplied" class="prevBadge" title="Prévisualisation appliquée au header">
            <EyeIcon class="icSm" />
            Preview
          </span>
        </div>

        <div class="sub muted" v-if="variant">
          Variante active :
          <b class="ell">{{ variant?.title ?? String(variant?.id ?? "").slice(0, 6) }}</b>
          <span v-if="dureeMois" class="dot">•</span>
          <span v-if="dureeMois" class="pill">{{ n(dureeMois, 0) }} mois</span>

          <span v-if="cabChargeClient" class="dot">•</span>
          <span v-if="cabChargeClient" class="pill pill-warn" title="Amortissement verrouillé par contrat">
            <LockClosedIcon class="icSm" />
            Charge client
          </span>
        </div>
        <div class="sub muted" v-else>Aucune variante active.</div>
      </div>

      <div class="headR">
        <button
          class="btn"
          type="button"
          :disabled="!variant || saving || genBusy || impBusy || fixBusy || !dirty"
          @click="applyToHeader()"
          title="Appliquer au header (sans enregistrer)"
        >
          <EyeIcon class="ic" />
          Appliquer
        </button>

        <button
          class="btn ghost"
          type="button"
          :disabled="!variant || saving || genBusy || impBusy || fixBusy || (!dirty && !headerApplied)"
          @click="askDiscard()"
          title="Annuler les modifications"
        >
          <XMarkIcon class="ic" />
          Annuler
        </button>

        <button
          class="btn"
          type="button"
          :disabled="!variant || saving || genBusy || impBusy || fixBusy"
          @click="askReset()"
          title="Réinitialiser"
        >
          <ArrowPathIcon class="ic" />
          Réinitialiser
        </button>

        <button
          class="btn"
          type="button"
          :disabled="!variant || saving || genBusy || impBusy || fixBusy"
          @click="impOpen = true"
          title="Importer"
        >
          <ArrowDownTrayIcon class="ic" />
          {{ impBusy ? "..." : "Importer" }}
        </button>

        <button
          class="btn"
          type="button"
          :disabled="!variant || saving || genBusy || impBusy || fixBusy"
          @click="genOpen = true"
          title="Généraliser"
        >
          <Squares2X2Icon class="ic" />
          {{ genBusy ? "..." : "Généraliser" }}
        </button>

        <button
          class="btn primary"
          type="button"
          :disabled="!variant || saving || !dirty || impBusy || fixBusy"
          @click="askSave()"
          title="Enregistrer"
        >
          <CheckCircleIcon class="ic" />
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

      <div v-if="fixErr" class="alert err">
        <ExclamationTriangleIcon class="ic" />
        <div><b>Contrat → Fix amortissement :</b> {{ fixErr }}</div>
      </div>

      <div v-if="genErr" class="alert err">
        <ExclamationTriangleIcon class="ic" />
        <div><b>Généralisation :</b> {{ genErr }}</div>
      </div>

      <div v-if="impErr" class="alert err">
        <ExclamationTriangleIcon class="ic" />
        <div><b>Import :</b> {{ impErr }}</div>
      </div>

      <div v-if="!variant" class="card muted">
        Sélectionne une variante (via Mes P&L) puis reviens ici.
      </div>

      <template v-else>
        <div class="grid">
          <!-- LEFT -->
          <div class="card">
            <div class="cardHdr">
              <div class="cardTtl">
                <TruckIcon class="ic3" />
                <div class="twrap">
                  <div class="h">Données CAB</div>
                  <div class="p muted">
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
                  <span v-if="cabChargeClient" class="pill pill-warn" title="Verrouillé par contrat">
                    <LockClosedIcon class="icSm" />
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

          <!-- RIGHT -->
          <div class="side">
            <div class="card sideCard">
              <div class="sideTitle">Résumé</div>

              <div class="kv">
                <div class="k muted">Durée</div>
                <div class="v mono">{{ n(dureeMois, 0) }} <span class="muted">mois</span></div>
              </div>

              <div class="kv" style="margin-top:10px">
                <div class="k muted">Amort./mois</div>
                <div class="v mono">{{ money(amortMoisEff, 2) }}</div>
              </div>

              <div class="kv" style="margin-top:10px">
                <div class="k muted">Total</div>
                <div class="v mono">{{ money(amortTotal, 2) }}</div>
              </div>

              <div class="kv" style="margin-top:10px">
                <div class="k muted">% CA</div>
                <div class="v mono">{{ n(amortPctCa, 2) }} <span class="muted">%</span></div>
              </div>

              <div class="sideHint muted">Si le CA = 0 (formules non saisies), le % reste à 0.</div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <SectionImportModal
      v-model="impOpen"
      sectionLabel="CAB"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="CAB"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- ✅ Modal confirm/info (local page: reset/save/generalize/annuler) -->
    <teleport to="body">
      <div v-if="modal.open" class="overlay" role="dialog" aria-modal="true" @click.self="closeModal()">
        <div class="modal">
          <div class="mhead">
            <div class="mtitle">{{ modal.title }}</div>
            <button class="x" type="button" @click="closeModal()" aria-label="Fermer">×</button>
          </div>

          <div class="mbody">{{ modal.message }}</div>

          <div class="mact">
            <button class="btn ghost" type="button" @click="closeModal()">Annuler</button>
            <button class="btn primary" type="button" @click="modal.onConfirm && modal.onConfirm()">Confirmer</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ✅ Toast -->
    <teleport to="body">
      <div v-if="toastOpen" class="toast" :class="toastKind" role="status" aria-live="polite">
        <div class="ticon">
          <CheckCircleIcon v-if="toastKind === 'ok'" class="ic" />
          <ExclamationTriangleIcon v-else class="ic" />
        </div>
        <div class="tmsg">{{ toastMsg }}</div>
        <button class="tclose" @click="toastOpen = false" title="Fermer">×</button>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* ✅ Aligné TransportPage */
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
.dot{ color: rgba(148,163,184,1); font-weight: 900; }
.ell{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.mono{ font-variant-numeric: tabular-nums; }

/* badges (dirty / preview) */
.dirtyBadge, .prevBadge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  margin-left: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 1000;
  border: 1px solid rgba(245,158,11,0.28);
  background: rgba(245,158,11,0.10);
  color: rgba(146,64,14,0.98);
}
.prevBadge{
  border-color: rgba(59,130,246,0.25);
  background: rgba(59,130,246,0.10);
  color: rgba(29,78,216,0.98);
}
.icSm{ width: 14px; height: 14px; }

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
.h1{
  font-size:14px;
  font-weight: 1000;
  line-height: 1.05;
  color: var(--text);
  display:flex;
  align-items:center;
  flex-wrap:wrap;
}
.sub{
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
  font-size: 11.5px;
  min-width:0;
}
.pill{
  border:1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.82);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.78);
  display:inline-flex;
  align-items:center;
  gap:6px;
}
.pill-warn{
  border-color: rgba(245,158,11,0.28);
  background: rgba(245,158,11,0.10);
  color: rgba(146,64,14,0.98);
}

.headR{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

/* buttons */
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
.btn.primary{
  background: rgba(24,64,112,0.92);
  border-color: rgba(24,64,112,0.6);
  color:#fff;
  box-shadow:none;
}
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

/* grid/cards */
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
  box-shadow: 0 10px 22px rgba(15,23,42,0.06);
  overflow:hidden;
}
.card.muted{
  padding: 10px;
  color: var(--muted);
  font-weight: 900;
}

/* left card head (conserve look mais harmonise typo) */
.cardHdr{
  padding: 10px;
  border-bottom: 1px solid rgba(16,24,40,0.08);
}
.cardTtl{
  display:flex;
  align-items:center;
  gap:10px;
}
.ic3{
  width: 18px;
  height: 18px;
  color: rgba(15,23,42,0.75);
}
.twrap{ min-width:0; }
.h{
  font-weight: 1000;
  color: var(--text);
  font-size: 12px;
}
.p{
  font-weight: 900;
  font-size: 11.5px;
  line-height: 1.35;
}

/* rows */
.rows{
  padding: 10px;
  display:flex;
  flex-direction:column;
  gap: 8px;
}
.rrow{
  display:grid;
  grid-template-columns: 180px 1fr;
  gap: 10px;
  align-items:center;
}
@media (max-width: 980px){
  .rrow{ grid-template-columns: 1fr; }
}
.lab{
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.62);
  display:inline-flex;
  align-items:center;
  gap: 8px;
}
.val{ min-height: 34px; display:flex; align-items:center; }

/* click-to-edit */
.click{
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.02);
  font-weight: 950;
  color: rgba(15,23,42,0.86);
  width: 100%;
}
.click:hover{
  background: rgba(32,184,232,0.12);
  border-color: rgba(32,184,232,0.18);
}
.lockedVal{ cursor:not-allowed; opacity: .9; }

/* inputs */
.inSel, .inNum{
  width: 100%;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: #fff;
  padding: 0 10px;
  font-size: 12.5px;
  font-weight: 950;
  color: var(--text);
  outline:none;
}
.inNum{ text-align:right; }
.inSel:focus, .inNum:focus{
  border-color: rgba(32,184,232,0.35);
  box-shadow: 0 0 0 4px rgba(32,184,232,0.12);
}

/* note */
.note{
  padding: 8px 10px;
  border-top: 1px dashed rgba(16,24,40,0.14);
  font-size: 11.5px;
  font-weight: 900;
  color: rgba(15,23,42,0.70);
}

/* side */
.side{ position: relative; }
.sideCard{ position: sticky; top: 64px; padding: 10px; }
.sideTitle{
  font-size: 12px;
  font-weight: 1000;
  color: var(--text);
  margin-bottom: 8px;
}
.kv{
  padding: 8px;
  border:1px solid rgba(16,24,40,0.10);
  border-radius: 14px;
  background: rgba(255,255,255,0.85);
}
.k{ font-size: 10.5px; font-weight: 950; letter-spacing: .2px; }
.v{ margin-top: 4px; font-size: 13px; font-weight: 1000; color: var(--text); }
.sideHint{ margin-top: 10px; font-size: 11.5px; font-weight: 900; }

/* modal (Transport style) */
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

/* toast (Transport style) */
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