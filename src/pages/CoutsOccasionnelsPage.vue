<!-- ✅ src/pages/CoutOccasionnelPage.vue (FICHIER COMPLET / lignes compactes + KPIs + masquer 0 auto + locks contrat + importer + generalize + confirmation variantes impactées) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
} from "@heroicons/vue/24/outline";
import { LockClosedIcon } from "@heroicons/vue/24/solid";

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
function clamp(v: any, min = 0, max = 1e15) {
  const x = toNum(v);
  return Math.max(min, Math.min(max, x));
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const dureeMois = computed(() => clamp(contract.value?.dureeMois, 0, 9999));

const variantLabel = computed(() => {
  const v = variant.value;
  if (!v) return "—";
  return v.title ?? v.name ?? v.id?.slice?.(0, 8) ?? "Variante";
});

/* =========================
   ✅ UI: Masquer 0 (auto)
========================= */
const hideZeros = ref(false);
const hideZerosUserToggled = ref(false);

function toggleHideZeros() {
  hideZeros.value = !hideZeros.value;
  hideZerosUserToggled.value = true;
}

/* =========================
   ✅ VERROUILLAGE (contrat)
========================= */
function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function isChargeClient(v: any): boolean {
  return norm(v).includes("client");
}
const lockInstallation = computed<boolean>(() => isChargeClient(contract.value?.installation));
const lockGenieCivil = computed<boolean>(() => isChargeClient(contract.value?.genieCivil));
const lockTransport = computed<boolean>(() => isChargeClient(contract.value?.transport));

/* =========================
   VOLUME + CA (pour /m3 et %)
========================= */
type DraftForm = { volumeM3: number; momd: number };
const formDrafts = reactive<Record<string, DraftForm>>({});

function getFormDraft(id: string): DraftForm {
  const k = String(id);
  if (!formDrafts[k]) formDrafts[k] = { volumeM3: 0, momd: 0 };
  return formDrafts[k];
}

const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

watch(
  () => variant.value?.id,
  () => {
    for (const vf of formules.value) {
      const d = getFormDraft(vf.id);
      d.volumeM3 = clamp(vf?.volumeM3);
      d.momd = clamp(vf?.momd);
    }
  },
  { immediate: true }
);

const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3), 0)
);
const transportPrixMoyen = computed(() => clamp((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;

  if (vmp?.prix != null) return clamp(vmp.prix);
  if (vmp?.prixOverride != null) return clamp(vmp.prixOverride);

  return clamp(vmp?.mp?.prix);
}
function cmpParM3For(vf: any): number {
  const items = (vf?.formule?.items ?? []) as any[];
  return items.reduce((s: number, it: any) => {
    const qtyKg = clamp(it?.qty);
    const prixTonne = mpPriceUsed(String(it?.mpId));
    return s + (qtyKg / 1000) * prixTonne;
  }, 0);
}
const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3);
    const momd = clamp(getFormDraft(vf.id).momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

/* =========================
   DRAFT (Occasionnel)
========================= */
type Draft = {
  genieCivil: number;
  installationCab: number; // compat
  demontage: number;
  remisePointCentrale: number;
  transport: number;
  silots: number;
  localAdjuvant: number;
  bungalows: number;
  installation: number; // legacy = Installation CAB
};

const draft = reactive<Draft>({
  genieCivil: 0,
  installationCab: 0,
  demontage: 0,
  remisePointCentrale: 0,
  transport: 0,
  silots: 0,
  localAdjuvant: 0,
  bungalows: 0,
  installation: 0,
});

function enforceLocks() {
  if (lockInstallation.value) draft.installation = 0;
  if (lockGenieCivil.value) draft.genieCivil = 0;
  if (lockTransport.value) draft.transport = 0;
}

function anyNonZeroDraft() {
  return (
    clamp(draft.genieCivil) > 0 ||
    clamp(draft.demontage) > 0 ||
    clamp(draft.remisePointCentrale) > 0 ||
    clamp(draft.transport) > 0 ||
    clamp(draft.silots) > 0 ||
    clamp(draft.localAdjuvant) > 0 ||
    clamp(draft.bungalows) > 0 ||
    clamp(draft.installation) > 0
  );
}

function loadFromVariant() {
  const s: any = (variant.value as any)?.coutOccasionnel ?? {};
  draft.genieCivil = clamp(s.genieCivil);
  draft.installationCab = clamp(s.installationCab);
  draft.demontage = clamp(s.demontage);
  draft.remisePointCentrale = clamp(s.remisePointCentrale);
  draft.transport = clamp(s.transport);
  draft.silots = clamp(s.silots);
  draft.localAdjuvant = clamp(s.localAdjuvant);
  draft.bungalows = clamp(s.bungalows);
  draft.installation = clamp(s.installation);
  enforceLocks();

  if (!hideZerosUserToggled.value) hideZeros.value = anyNonZeroDraft();
}

watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });
watch(() => contract.value, () => enforceLocks(), { immediate: true });

/* =========================
   KPI (global)
========================= */
const total = computed(() => {
  const inst = lockInstallation.value ? 0 : clamp(draft.installation);
  const gc = lockGenieCivil.value ? 0 : clamp(draft.genieCivil);
  const tr = lockTransport.value ? 0 : clamp(draft.transport);

  return (
    gc +
    clamp(draft.demontage) +
    clamp(draft.remisePointCentrale) +
    tr +
    clamp(draft.silots) +
    clamp(draft.localAdjuvant) +
    clamp(draft.bungalows) +
    inst
  );
});
const monthly = computed(() => {
  const d = dureeMois.value;
  return d > 0 ? total.value / d : 0;
});
const perM3 = computed(() => {
  const vol = volumeTotal.value;
  return vol > 0 ? total.value / vol : 0;
});
const pct = computed(() => {
  const ca = caTotal.value;
  return ca > 0 ? (total.value / ca) * 100 : 0;
});

/* =========================
   LINES + per line metrics
========================= */
const LINES = [
  { key: "genieCivil", label: "Génie civil" },
  { key: "demontage", label: "Démontage" },
  { key: "remisePointCentrale", label: "Remise point centrale" },
  { key: "transport", label: "Transport" },
  { key: "silots", label: "Silots" },
  { key: "localAdjuvant", label: "Local adjuvant" },
  { key: "bungalows", label: "Bungalows" },
  { key: "installation", label: "Installation CAB" },
] as const;

type LineKey = (typeof LINES)[number]["key"];

function isLockedKey(k: LineKey): boolean {
  if (k === "genieCivil") return lockGenieCivil.value;
  if (k === "transport") return lockTransport.value;
  if (k === "installation") return lockInstallation.value;
  return false;
}

function getValue(k: LineKey): number {
  if (isLockedKey(k)) return 0;
  return clamp((draft as any)[k]);
}
function setValue(k: LineKey, raw: any) {
  if (isLockedKey(k)) return;
  (draft as any)[k] = clamp(raw);
}

const visibleLines = computed(() => {
  const d = dureeMois.value;
  const vol = volumeTotal.value;
  const ca = caTotal.value;

  const rows = LINES.map((ln) => {
    const v = getValue(ln.key);
    return {
      ...ln,
      locked: isLockedKey(ln.key),
      value: v,
      perMonth: d > 0 ? v / d : 0,
      parM3: vol > 0 ? v / vol : 0,
      pctCa: ca > 0 ? (v / ca) * 100 : 0,
      totalBold: v, // ✅ “cout total par cout” = value (DH) en gras
    };
  });

  return hideZeros.value ? rows.filter((r) => clamp(r.value) !== 0) : rows;
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
  const existing: any = (variant.value as any)?.coutOccasionnel ?? {};
  return {
    category: existing.category ?? "COUTS_CHARGES",
    genieCivil: Number(lockGenieCivil.value ? 0 : clamp(draft.genieCivil)),
    installationCab: Number(clamp(draft.installationCab)), // compat
    demontage: Number(clamp(draft.demontage)),
    remisePointCentrale: Number(clamp(draft.remisePointCentrale)),
    transport: Number(lockTransport.value ? 0 : clamp(draft.transport)),
    silots: Number(clamp(draft.silots)),
    localAdjuvant: Number(clamp(draft.localAdjuvant)),
    bungalows: Number(clamp(draft.bungalows)),
    installation: Number(lockInstallation.value ? 0 : clamp(draft.installation)),
  };
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    enforceLocks();
    await (store as any).updateVariant(variant.value.id, { coutOccasionnel: buildPayload() });
    showToast("Coûts occasionnels enregistrés.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des coûts occasionnels ?", async () => {
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
   ✅ IMPORTER (UI only)
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

function applyFromVariant(srcVariant: any) {
  const s: any = srcVariant?.coutOccasionnel ?? {};
  draft.genieCivil = clamp(s.genieCivil);
  draft.installationCab = clamp(s.installationCab);
  draft.demontage = clamp(s.demontage);
  draft.remisePointCentrale = clamp(s.remisePointCentrale);
  draft.transport = clamp(s.transport);
  draft.silots = clamp(s.silots);
  draft.localAdjuvant = clamp(s.localAdjuvant);
  draft.bungalows = clamp(s.bungalows);
  draft.installation = clamp(s.installation);
  enforceLocks();

  if (!hideZerosUserToggled.value) hideZeros.value = anyNonZeroDraft();
}

async function onApplyImport(payload: { sourceVariantId: string }) {
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

    applyFromVariant(src);
    showToast("Coûts occasionnels importés. Pense à enregistrer.", "ok");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   ✅ GENERALISER + variantes impactées → 0
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

function findContractByVariantId(variantId: string): any | null {
  const id = String(variantId ?? "").trim();
  if (!id) return null;

  for (const p of (store as any).pnls ?? []) {
    for (const c of (p as any)?.contracts ?? []) {
      for (const v of c?.variants ?? []) {
        if (String(v?.id ?? "") === id) return c;
      }
    }
  }
  return null;
}

function impactedByContractOnTargets(targetIds: string[], payload: any) {
  const impacted: Array<{ id: string; label: string; fields: string[] }> = [];

  for (const tid of targetIds) {
    const c = findContractByVariantId(tid);
    if (!c) continue;

    const fields: string[] = [];
    if (isChargeClient(c?.genieCivil) && toNum(payload?.genieCivil) !== 0) fields.push("Génie civil");
    if (isChargeClient(c?.transport) && toNum(payload?.transport) !== 0) fields.push("Transport");
    if (isChargeClient(c?.installation) && toNum(payload?.installation) !== 0) fields.push("Installation CAB");

    if (fields.length) {
      const v = findVariantById(tid);
      const label = v?.title ?? v?.name ?? String(tid).slice(0, 8);
      impacted.push({ id: tid, label, fields });
    }
  }

  return impacted;
}

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
      await (store as any).updateVariant(targetId, { coutOccasionnel: payload });
    }
    showToast("Section Coûts occasionnels généralisée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value), "err");
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = (payload?.variantIds ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (!ids.length) return;

  const data = buildPayload();
  const impacted = impactedByContractOnTargets(ids, data);

  let warn = "";
  if (impacted.length) {
    const lines = impacted
      .slice(0, 8)
      .map((x) => `• ${x.label}: ${x.fields.join(", ")} → 0`)
      .join("\n");
    warn =
      `\n\n⚠️ Contrats: ${impacted.length} variante(s) recevront des valeurs forcées à 0:\n` +
      lines +
      (impacted.length > 8 ? `\n… (+${impacted.length - 8} autres)` : "");
  }

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Coûts occasionnels sur TOUTES les variantes ?" + warn
      : `Confirmer la généralisation de la section Coûts occasionnels sur ${ids.length} variante(s) ?` + warn;

  openConfirm("Généraliser", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}
</script>

<template>
  <div class="page">
    <!-- ✅ Sticky subheader -->
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttlRow">
            <div class="ttl">Coûts occasionnels</div>
            <span v-if="variant" class="badge">Variante active</span>
          </div>

          <div class="meta" v-if="variant">
            <span class="clip"><b>{{ variantLabel }}</b></span>
            <span class="sep" v-if="dureeMois">•</span>
            <span v-if="dureeMois">Durée <b>{{ n(dureeMois, 0) }}</b> mois</span>
          </div>
          <div class="meta" v-else>Aucune variante active.</div>
        </div>

        <div class="actions" v-if="variant">
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="toggleHideZeros()">
            {{ hideZeros ? "Afficher 0" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="saving || genBusy || impBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <!-- ✅ KPIs en haut (✅ BG sur TOTAL) -->
      <div class="kpis" v-if="variant">
        <div class="kpi">
          <div class="kLbl">/ mois</div>
          <div class="kVal mono">
            {{ money(monthly, 2) }}
            <span class="unit">DH/mois</span>
          </div>
        </div>

        <div class="kpi main">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal mono">{{ n(perM3, 2) }} <span class="unit">DH/m³</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">% CA</div>
          <div class="kVal mono">{{ n(pct, 2) }}<span class="unit">%</span></div>
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
        <!-- ✅ Table: champs proches de la désignation (focus) -->
        <div class="tableWrap">
          <table class="table">
            <colgroup>
              <col class="colPoste" />
              <col class="colInput" />
              <col class="colTot" />
              <col class="colMensuel" />
              <col class="colM3" />
              <col class="colPct" />
            </colgroup>

            <thead>
              <tr>
                <th class="th">Poste</th>
                <th class="th r">Saisie (DH)</th>
                <th class="th r">Total (DH)</th>
                <th class="th r">DH/mois</th>
                <th class="th r">DH/m³</th>
                <th class="th r">% CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="ln in visibleLines" :key="String(ln.key)">
                <!-- Poste -->
                <td class="poste">
                  <div class="posteWrap">
                    <b class="posteLbl">{{ ln.label }}</b>
                    <span v-if="ln.locked" class="lockTag"><LockClosedIcon class="lk" /> Contrat</span>
                  </div>
                </td>

                <!-- input (proche du poste) -->
                <td class="r">
                  <div class="inCell">
                    <input
                      class="inputSm r mono"
                      type="number"
                      step="0.01"
                      min="0"
                      :disabled="ln.locked"
                      :value="ln.value"
                      @input="setValue(ln.key as any, ($event.target as HTMLInputElement).value)"
                    />
                    <span class="unitDh">DH</span>
                  </div>
                </td>

                <!-- Total (par cout) en gras -->
                <td class="r mono"><b>{{ money(ln.totalBold, 2) }}</b></td>

                <td class="r mono">{{ money(ln.perMonth, 2) }}</td>
                <td class="r mono">{{ n(ln.parM3, 2) }}</td>
                <td class="r mono">{{ n(ln.pctCa, 2) }}%</td>
              </tr>

              <tr class="sumRow">
                <td><b>Total</b></td>
                <td></td>
                <td class="r"><b>{{ money(total, 2) }}</b></td>
                <td class="r"><b>{{ money(monthly, 2) }}</b></td>
                <td class="r"><b>{{ n(perM3, 2) }}</b></td>
                <td class="r"><b>{{ n(pct, 2) }}%</b></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot">
          Durée : <b>{{ n(dureeMois, 0) }}</b> mois • Volume total : <b>{{ n(volumeTotal, 2) }}</b> m³ • CA estimé :
          <b>{{ money(caTotal, 2) }}</b>
        </div>
      </div>
    </template>

    <!-- ✅ IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Coûts occasionnels"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coûts occasionnels"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- ✅ Modal confirm/info -->
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

    <!-- ✅ Toast -->
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
/* ✅ base sizes like CoutMensuelPage */
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
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.kpi.main {
  border-color: rgba(16, 185, 129, 0.42);
  background: rgba(236, 253, 245, 0.9);
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
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

/* table */
.tableWrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

/* ✅ input proche du libellé => col input plus étroite + col poste plus large */
.colPoste {
  width: 34%;
}
.colInput {
  width: 18%;
}
.colTot {
  width: 16%;
}
.colMensuel {
  width: 12%;
}
.colM3 {
  width: 10%;
}
.colPct {
  width: 10%;
}

.th {
  text-align: left;
  font-weight: 950;
  padding: 10px 10px;
  color: rgba(15, 23, 42, 0.7);
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(248, 250, 252, 0.7);
}
.r {
  text-align: right;
}
tbody td {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.06);
  vertical-align: middle;
}

/* poste cell */
.posteWrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.posteLbl {
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}

.lockTag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.95);
  background: rgba(2, 132, 199, 0.08);
  border: 1px solid rgba(2, 132, 199, 0.2);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.lk {
  width: 12px;
  height: 12px;
}

/* input cell */
.inCell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start; /* ✅ proche poste */
  width: 100%;
}
.inputSm {
  width: 130px;
  max-width: 100%;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 10px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
}
.inputSm:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.inputSm:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  border-color: rgba(16, 24, 40, 0.14);
  background: rgba(15, 23, 42, 0.03);
}
.unitDh {
  font-size: 11px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
}

/* sum */
.sumRow td {
  background: rgba(248, 250, 252, 0.7);
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  border-bottom: 0;
}
.foot {
  padding: 10px 12px;
  border-top: 1px solid rgba(16, 24, 40, 0.06);
  font-size: 11.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.65);
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
.toast.info {
  border-color: rgba(59, 130, 246, 0.22);
}
.tic {
  width: 18px;
  height: 18px;
}
.tmsg {
  font-weight: 900;
  color: rgba(15, 23, 42, 0.85);
}

/* ✅ Safe overlays */
:deep(.modalOverlay) {
  z-index: 100000 !important;
}
</style>
