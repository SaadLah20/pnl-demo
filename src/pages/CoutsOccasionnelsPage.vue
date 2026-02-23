<!-- ✅ src/pages/CoutOccasionnelPage.vue (FICHIER COMPLET)
     ✅ UI comme tes autres pages (system-ui + tabulaires)
     ✅ Masquer 0 auto + override user
     ✅ Locks contrat + badge (GC/Transport/Installation + Branchement Eau/Elec)
     ✅ Import + Generalize + confirmation variantes impactées
     ✅ Apply preview + quitter sans enregistrer (Unsaved) comme Transport/MOMD/CoutMensuel
     ✅ Hint "Modifié" ORANGE (comme TransportPage + CoutM3)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { useUnsavedStore } from "@/stores/unsaved.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
  EyeIcon,
} from "@heroicons/vue/24/outline";
import { LockClosedIcon } from "@heroicons/vue/24/solid";

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
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toNum(v));
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
function isZero(v: any) {
  return Math.abs(toNum(v)) <= 1e-12;
}
function stableJson(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// same logic family as backend
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

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const dureeMois = computed(() => clamp(contract.value?.dureeMois, 0, 9999));

/* =========================
   ✅ VERROUILLAGE (contrat)
========================= */
const lockInstallation = computed<boolean>(() => isChargeClient(contract.value?.installation));
const lockGenieCivil = computed<boolean>(() => isChargeClient(contract.value?.genieCivil));
const lockTransport = computed<boolean>(() => isChargeClient(contract.value?.transport));

// nouveaux locks
const lockBranchementEau = computed<boolean>(() => isChargeClient(contract.value?.branchementEau));
const lockBranchementElec = computed<boolean>(() => isChargeClient(contract.value?.branchementElec));

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
  demontage: number;
  remisePointCentrale: number;
  transport: number;
  silots: number;
  localAdjuvant: number;
  bungalows: number;

  installation: number; // legacy = Installation CAB

  // compat (si existe dans la DB)
  installationCab: number;

  // nouveaux champs
  branchementEau: number;
  branchementElec: number;
};

const draft = reactive<Draft>({
  genieCivil: 0,
  demontage: 0,
  remisePointCentrale: 0,
  transport: 0,
  silots: 0,
  localAdjuvant: 0,
  bungalows: 0,
  installation: 0,
  installationCab: 0,
  branchementEau: 0,
  branchementElec: 0,
});

function enforceLocks() {
  if (lockInstallation.value) draft.installation = 0;
  if (lockGenieCivil.value) draft.genieCivil = 0;
  if (lockTransport.value) draft.transport = 0;

  if (lockBranchementEau.value) draft.branchementEau = 0;
  if (lockBranchementElec.value) draft.branchementElec = 0;
}

function anyNonZeroDraftEffective() {
  return (
    (!lockGenieCivil.value && !isZero(draft.genieCivil)) ||
    !isZero(draft.demontage) ||
    !isZero(draft.remisePointCentrale) ||
    (!lockTransport.value && !isZero(draft.transport)) ||
    !isZero(draft.silots) ||
    !isZero(draft.localAdjuvant) ||
    !isZero(draft.bungalows) ||
    (!lockInstallation.value && !isZero(draft.installation)) ||
    (!lockBranchementEau.value && !isZero(draft.branchementEau)) ||
    (!lockBranchementElec.value && !isZero(draft.branchementElec))
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
  draft.installation = clamp(s.installation ?? s.installationCab);

  draft.branchementEau = clamp(s.branchementEau);
  draft.branchementElec = clamp(s.branchementElec ?? s.branchementElectricite ?? s.branchementElectricité);

  enforceLocks();
}

/* =========================
   ✅ Masquer 0 (auto + override user)
========================= */
const hideZeros = ref(false);
const hideZerosUserToggled = ref(false);

function syncHideZerosAuto() {
  const anyNZ = anyNonZeroDraftEffective();
  if (!anyNZ) {
    hideZeros.value = false;
    hideZerosUserToggled.value = false;
    return;
  }
  if (!hideZerosUserToggled.value) hideZeros.value = true;
}
function toggleHideZeros() {
  hideZerosUserToggled.value = true;
  hideZeros.value = !hideZeros.value;
}

/* =========================
   KPI (global)
========================= */
const total = computed(() => {
  const inst = lockInstallation.value ? 0 : clamp(draft.installation);
  const gc = lockGenieCivil.value ? 0 : clamp(draft.genieCivil);
  const tr = lockTransport.value ? 0 : clamp(draft.transport);
  const eau = lockBranchementEau.value ? 0 : clamp(draft.branchementEau);
  const elec = lockBranchementElec.value ? 0 : clamp(draft.branchementElec);

  return (
    gc +
    clamp(draft.demontage) +
    clamp(draft.remisePointCentrale) +
    tr +
    clamp(draft.silots) +
    clamp(draft.localAdjuvant) +
    clamp(draft.bungalows) +
    inst +
    eau +
    elec
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
  { key: "branchementEau", label: "Branchement eau" },
  { key: "branchementElec", label: "Branchement électricité" },
] as const;

type LineKey = (typeof LINES)[number]["key"];

function isLockedKey(k: LineKey): boolean {
  if (k === "genieCivil") return lockGenieCivil.value;
  if (k === "transport") return lockTransport.value;
  if (k === "installation") return lockInstallation.value;
  if (k === "branchementEau") return lockBranchementEau.value;
  if (k === "branchementElec") return lockBranchementElec.value;
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
      totalBold: v,
    };
  });

  // ✅ garder visibles les lignes lockées même si 0
  if (!hideZeros.value) return rows;
  return rows.filter((r) => !isZero(r.value) || r.locked);
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
   PAYLOADS (effective + baseline-from-variant)
========================= */
function buildPayloadEffective() {
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
    branchementEau: Number(lockBranchementEau.value ? 0 : clamp(draft.branchementEau)),
    // ✅ compat: backend/DB peut utiliser branchementElectricite
    branchementElectricite: Number(lockBranchementElec.value ? 0 : clamp(draft.branchementElec)),
  };
}

/** baseline = valeurs “référence” venant de la variante active, avec locks appliqués */
function buildPayloadFromVariantEffective() {
  const v: any = variant.value ?? {};
  const s: any = v?.coutOccasionnel ?? {};
  return {
    category: s.category ?? "COUTS_CHARGES",
    genieCivil: Number(lockGenieCivil.value ? 0 : clamp(s.genieCivil)),
    installationCab: Number(clamp(s.installationCab)),
    demontage: Number(clamp(s.demontage)),
    remisePointCentrale: Number(clamp(s.remisePointCentrale)),
    transport: Number(lockTransport.value ? 0 : clamp(s.transport)),
    silots: Number(clamp(s.silots)),
    localAdjuvant: Number(clamp(s.localAdjuvant)),
    bungalows: Number(clamp(s.bungalows)),
    installation: Number(lockInstallation.value ? 0 : clamp(s.installation ?? s.installationCab)),
    branchementEau: Number(lockBranchementEau.value ? 0 : clamp(s.branchementEau)),
    branchementElectricite: Number(
      lockBranchementElec.value ? 0 : clamp(s.branchementElec ?? s.branchementElectricite ?? s.branchementElectricité)
    ),
  };
}

/* =========================
   SAVE
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

async function save(): Promise<boolean> {
  if (!variant.value) return false;
  err.value = null;
  saving.value = true;

  try {
    enforceLocks();

    const payload = buildPayloadEffective(); // ✅ snapshot du draft au moment du save

    await (store as any).updateVariant(variant.value.id, { coutOccasionnel: payload });

    // ✅ IMPORTANT: baseline = ce qu’on vient d’enregistrer (robuste même si store ne refresh pas)
    baselineJson.value = stableJson(payload);

    // ✅ snapshot baseline pour restore (discard) cohérent
    try {
      baselineVariantSnapshot.value = structuredClone({
        ...(variant.value ?? {}),
        coutOccasionnel: payload,
      });
    } catch {
      baselineVariantSnapshot.value = JSON.parse(
        JSON.stringify({ ...(variant.value ?? {}), coutOccasionnel: payload })
      );
    }

    previewApplied.value = false;
    (unsaved as any)?.setDirty?.(false);

    showToast("Coûts occasionnels enregistrés.", "ok");
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
  openConfirm("Enregistrer", "Confirmer l’enregistrement des coûts occasionnels ?", async () => {
    closeModal();
    await save();
  });
}

/* =========================
   ✅ IMPORTER
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
  draft.installation = clamp(s.installation ?? s.installationCab);

  draft.branchementEau = clamp(s.branchementEau);
  draft.branchementElec = clamp(s.branchementElec ?? s.branchementElectricite ?? s.branchementElectricité);

  enforceLocks();
  syncHideZerosAuto();
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

    if (isChargeClient(c?.branchementEau) && toNum(payload?.branchementEau) !== 0) fields.push("Branchement eau");
    // ✅ payload utilise "branchementElectricite"
    if (isChargeClient(c?.branchementElec) && toNum(payload?.branchementElectricite) !== 0) fields.push("Branchement électricité");

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

  const payload = buildPayloadEffective();

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

  const data = buildPayloadEffective();
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

/* =========================
   ✅ UNSAVED + APPLY PREVIEW
========================= */
const PAGE_KEY = "COUT_OCCASIONNEL";

const baselineJson = ref<string>("");
const baselineVariantSnapshot = ref<any | null>(null);
const previewApplied = ref(false);

function setBaselineFromVariant() {
  try {
    baselineVariantSnapshot.value = structuredClone((store as any).activeVariant ?? variant.value);
  } catch {
    baselineVariantSnapshot.value = JSON.parse(JSON.stringify((store as any).activeVariant ?? variant.value ?? null));
  }
  baselineJson.value = stableJson(buildPayloadFromVariantEffective());
  previewApplied.value = false;
}

const currentJson = computed(() => stableJson(buildPayloadEffective()));
const dirty = computed(() => {
  if (!variant.value?.id) return false;
  return currentJson.value !== baselineJson.value;
});

function applyPreviewToHeader() {
  if (!variant.value?.id) return;

  const s: any = store as any;
  if (typeof s.replaceActiveVariantInState !== "function") {
    showToast("Preview non supportée (replaceActiveVariantInState absent).", "err");
    return;
  }

  let next: any;
  try {
    next = structuredClone(s.activeVariant ?? variant.value);
  } catch {
    next = JSON.parse(JSON.stringify(s.activeVariant ?? variant.value ?? null));
  }
  if (!next?.id) return;

  next.coutOccasionnel = buildPayloadEffective();
  s.replaceActiveVariantInState(next);

  previewApplied.value = true;
  showToast("Prévisualisation appliquée (non enregistrée).", "ok");
}

function restoreFromBaselineSnapshot() {
  const snap = baselineVariantSnapshot.value;
  if (!snap?.id) return;
  const s: any = store as any;
  if (typeof s.replaceActiveVariantInState === "function") {
    s.replaceActiveVariantInState(snap);
  }
  previewApplied.value = false;
}

async function discardLocalChanges() {
  if (previewApplied.value) restoreFromBaselineSnapshot();

  loadFromVariant();
  enforceLocks();

  baselineJson.value = stableJson(buildPayloadFromVariantEffective());
  syncHideZerosAuto();

  showToast("Valeurs restaurées.", "ok");
}

function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la variante active ?", async () => {
    closeModal();
    await discardLocalChanges();
  });
}

function syncUnsaved() {
  const u: any = unsaved as any;
  u.setDirty?.(Boolean(dirty.value));

  u.registerPage?.({
    pageKey: PAGE_KEY,
    save: async () => {
      const ok = await save();
      if (ok) setBaselineFromVariant();
      return ok;
    },
    discard: async () => {
      await discardLocalChanges();
    },
  });
}

/* =========================
   WATCHERS INIT
========================= */
watch(
  () => variant.value?.id,
  () => {
    loadFromVariant();
    enforceLocks();
    syncHideZerosAuto();
    setBaselineFromVariant();
    syncUnsaved();
  },
  { immediate: true }
);

watch(
  () => [lockInstallation.value, lockGenieCivil.value, lockTransport.value, lockBranchementEau.value, lockBranchementElec.value],
  () => {
    enforceLocks();
    syncHideZerosAuto();
    setBaselineFromVariant();
    syncUnsaved();
  },
  { immediate: true }
);

watch(
  () => ({
    genieCivil: draft.genieCivil,
    demontage: draft.demontage,
    remisePointCentrale: draft.remisePointCentrale,
    transport: draft.transport,
    silots: draft.silots,
    localAdjuvant: draft.localAdjuvant,
    bungalows: draft.bungalows,
    installation: draft.installation,
    branchementEau: draft.branchementEau,
    branchementElec: draft.branchementElec,
  }),
  () => {
    syncHideZerosAuto();
    syncUnsaved();
  }
);

onBeforeUnmount(() => {
  (unsaved as any).unregisterPage?.(PAGE_KEY);
});
</script>

<template>
  <div class="page">
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttl">
            Coûts occasionnels

            <!-- ✅ Modifié ORANGE -->
            <span v-if="dirty" class="modifiedHint" title="Modifications non enregistrées">
              <span class="modifiedDot" aria-hidden="true"></span>
              Modifié
            </span>

            <!-- ✅ Preview -->
            <span v-if="previewApplied" class="prevBadge" title="Prévisualisation appliquée (non enregistrée)">
              <EyeIcon class="icSm" />
              Preview
            </span>
          </div>
        </div>

        <div class="actions">
          <button
            class="btn"
            :disabled="!variant || saving || genBusy || impBusy || !dirty"
            @click="applyPreviewToHeader()"
            title="Appliquer au header (sans enregistrer)"
          >
            <EyeIcon class="ic" />
            Appliquer
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="toggleHideZeros()" :class="{ on: hideZeros }">
            <span class="dot" aria-hidden="true"></span>
            {{ hideZeros ? "Afficher" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="!variant || saving || genBusy || impBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpis" v-if="variant">
        <div class="kpi">
          <div class="kLbl">/ mois</div>
          <div class="kVal num">{{ money(monthly, 2) }} <span>DH/mois</span></div>
        </div>

        <div class="kpi main">
          <div class="kLbl">Total</div>
          <div class="kVal num">{{ money(total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal num">{{ n(perM3, 2) }} <span>DH/m³</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">% CA</div>
          <div class="kVal num">{{ n(pct, 2) }} <span>%</span></div>
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
    </div>

    <div v-if="!variant" class="card">
      <div class="empty">Sélectionne une variante puis reviens ici.</div>
    </div>

    <template v-else>
      <div class="card">
        <div class="tableWrap">
          <table class="table">
            <colgroup>
              <col class="colPoste" />
              <col class="colTot" />
              <col class="colMensuel" />
              <col class="colM3" />
              <col class="colPct" />
            </colgroup>

            <thead>
              <tr>
                <th class="th">Poste</th>
                <th class="th r">Total (DH)</th>
                <th class="th r">DH/mois</th>
                <th class="th r">DH/m³</th>
                <th class="th r">% CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="ln in visibleLines" :key="String(ln.key)">
                <td class="poste">
                  <div class="posteRow">
                    <div class="posteLblWrap">
                      <b class="posteLbl" :title="ln.label">{{ ln.label }}</b>
                      <span v-if="ln.locked" class="lockTag" title="Forcé à 0 par le contrat">
                        <LockClosedIcon class="lk" />
                        Contrat
                      </span>
                    </div>

                    <div class="inLine">
                      <input
                        class="inputSm r num"
                        type="number"
                        step="0.01"
                        min="0"
                        :disabled="ln.locked"
                        :value="ln.value"
                        @input="setValue(ln.key as any, ($event.target as HTMLInputElement).value)"
                        aria-label="Saisie DH"
                      />
                      <span class="unitDh">DH</span>
                    </div>
                  </div>
                </td>

                <td class="r num"><b>{{ money(ln.totalBold, 2) }}</b></td>
                <td class="r num">{{ money(ln.perMonth, 2) }}</td>
                <td class="r num">{{ n(ln.parM3, 2) }}</td>
                <td class="r num">{{ n(ln.pctCa, 2) }}%</td>
              </tr>

              <tr class="sumRow">
                <td><b>Total</b></td>
                <td class="r num"><b>{{ money(total, 2) }}</b></td>
                <td class="r num"><b>{{ money(monthly, 2) }}</b></td>
                <td class="r num"><b>{{ n(perM3, 2) }}</b></td>
                <td class="r num"><b>{{ n(pct, 2) }}%</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <SectionImportModal v-model="impOpen" sectionLabel="Coûts occasionnels" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coûts occasionnels"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- confirm modal -->
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

    <!-- toast -->
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
* {
  box-sizing: border-box;
}
.num {
  font-variant-numeric: tabular-nums;
}

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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.left {
  min-width: 220px;
}
.ttl {
  font-size: 14px;
  font-weight: 950;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* ✅ MODIFIÉ (ORANGE) — aligné TransportPage + CoutM3 */
.modifiedHint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(194, 65, 12, 1);
  background: rgba(251, 146, 60, 0.14);
  border: 1px solid rgba(251, 146, 60, 0.35);
  white-space: nowrap;
}
.modifiedDot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(249, 115, 22, 1);
}

/* preview badge */
.prevBadge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  border: 1px solid rgba(2, 132, 199, 0.25);
  background: rgba(2, 132, 199, 0.08);
  color: rgba(2, 132, 199, 0.95);
  white-space: nowrap;
}
.icSm {
  width: 14px;
  height: 14px;
}

/* actions */
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
.btn.on {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}
.ic {
  width: 16px;
  height: 16px;
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
.kpi.main {
  border-color: rgba(16, 185, 129, 0.42);
  background: rgba(236, 253, 245, 0.9);
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
  border-radius: 14px;
  padding: 9px 10px;
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
.colPoste {
  width: 44%;
}
.colTot {
  width: 16%;
}
.colMensuel {
  width: 14%;
}
.colM3 {
  width: 13%;
}
.colPct {
  width: 13%;
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

/* poste + input collé */
.posteRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.posteLblWrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}
.posteLbl {
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 420px;
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

.inLine {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.inputSm {
  width: 128px;
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

/* sum row */
.sumRow td {
  background: rgba(248, 250, 252, 0.7);
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  border-bottom: 0;
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