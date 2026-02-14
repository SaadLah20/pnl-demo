<!-- ✅ src/pages/CoutOccasionnelPage.vue (FICHIER COMPLET / ultra-compact cards + KPIs en haut + sticky subheader + toast + modal + generalize + ✅ masquer 0 + ✅ importer + ✅ verrouillage contrat (installation/genieCivil/transport) => force 0) -->
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
function isZero(v: any) {
  return clamp(v) === 0;
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
   ✅ VERROUILLAGE (contrat)
   - installation => draft.installation (legacy Installation CAB)
   - genieCivil => draft.genieCivil
   - transport => draft.transport
   Si "CLIENT" => force 0 + input disabled + KPI ignore (0)
========================= */
function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function isChargeClient(v: any): boolean {
  // ex: "CLIENT", "A CHARGE CLIENT", etc.
  return norm(v).includes("client");
}

const lockInstallation = computed<boolean>(() => isChargeClient(contract.value?.installation));
const lockGenieCivil = computed<boolean>(() => isChargeClient(contract.value?.genieCivil));
const lockTransport = computed<boolean>(() => isChargeClient(contract.value?.transport));

function enforceLocks() {
  if (lockInstallation.value) draft.installation = 0;
  if (lockGenieCivil.value) draft.genieCivil = 0;
  if (lockTransport.value) draft.transport = 0;
}

/* ✅ AJOUT: message de synthèse (Save / Généraliser) */
function lockSummaryText(): string {
  const forced: string[] = [];
  if (lockInstallation.value) forced.push("Installation CAB");
  if (lockGenieCivil.value) forced.push("Génie civil");
  if (lockTransport.value) forced.push("Transport");
  if (!forced.length) return "";
  return `\n\n⚠️ Contrat : à la charge du client → ces champs seront forcés à 0 : ${forced.join(", ")}.`;
}

/* =========================
   VOLUME + CA (pour perM3 / %)
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
  installationCab: number; // (retiré de l'UI, gardé compat)
  demontage: number;
  remisePointCentrale: number;
  transport: number;
  silots: number;
  localAdjuvant: number;
  bungalows: number;

  // legacy compat (✅ utilisé comme Installation CAB côté UI)
  installation: number;
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
  draft.installation = clamp(s.installation); // legacy
  enforceLocks();
}

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

// ✅ si le contrat change (ou charge client), on force 0 immédiatement
watch(
  () => contract.value,
  () => enforceLocks(),
  { immediate: true }
);

/* =========================
   KPI
========================= */
const total = computed(() => {
  const inst = lockInstallation.value ? 0 : clamp(draft.installation);
  const gc = lockGenieCivil.value ? 0 : clamp(draft.genieCivil);
  const tr = lockTransport.value ? 0 : clamp(draft.transport);

  return (
    gc +
    // ✅ on retire installationCab du total UI, et on utilise le legacy (installation) comme "Installation CAB"
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
  if (d <= 0) return 0;
  return total.value / d;
});
const perM3 = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  return total.value / vol;
});
const pct = computed(() => {
  const ca = caTotal.value;
  if (ca <= 0) return 0;
  return (total.value / ca) * 100;
});

/* =========================
   ✅ MASQUER 0 (UI uniquement)
========================= */
const hideZeros = ref(false);

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
   SAVE / RESET
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function buildPayload() {
  const existing: any = (variant.value as any)?.coutOccasionnel ?? {};
  return {
    category: existing.category ?? "COUTS_CHARGES",
    genieCivil: Number(lockGenieCivil.value ? 0 : clamp(draft.genieCivil)),
    // ✅ champ retiré côté UI, gardé compat (ne pas casser DB)
    installationCab: Number(clamp(draft.installationCab)),
    demontage: Number(clamp(draft.demontage)),
    remisePointCentrale: Number(clamp(draft.remisePointCentrale)),
    transport: Number(lockTransport.value ? 0 : clamp(draft.transport)),
    silots: Number(clamp(draft.silots)),
    localAdjuvant: Number(clamp(draft.localAdjuvant)),
    bungalows: Number(clamp(draft.bungalows)),
    // ✅ legacy : utilisé comme Installation CAB côté UI
    installation: Number(lockInstallation.value ? 0 : clamp(draft.installation)),
  };
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    // ✅ avant save, on s'assure que les locks ont bien forcé 0
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
  openConfirm(
    "Enregistrer",
    "Confirmer l’enregistrement des coûts occasionnels ?" + lockSummaryText(),
    async () => {
      closeModal();
      await save();
    }
  );
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadFromVariant();
    showToast("Valeurs restaurées.", "ok");
  });
}

/* =========================
   ✅ IMPORTER (depuis autre variante / UI only)
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

function applyCoutOccasionnelFromVariant(srcVariant: any) {
  const s: any = srcVariant?.coutOccasionnel ?? {};
  draft.genieCivil = clamp(s.genieCivil);
  draft.installationCab = clamp(s.installationCab);
  draft.demontage = clamp(s.demontage);
  draft.remisePointCentrale = clamp(s.remisePointCentrale);
  draft.transport = clamp(s.transport);
  draft.silots = clamp(s.silots);
  draft.localAdjuvant = clamp(s.localAdjuvant);
  draft.bungalows = clamp(s.bungalows);
  draft.installation = clamp(s.installation); // legacy
  enforceLocks();
}

async function onApplyImport(payload: { sourceVariantId: string }) {
  if (!variant.value) return;

  const sourceId = String(payload?.sourceVariantId ?? "").trim();
  if (!sourceId) return;

  if (String(variant.value?.id ?? "") === sourceId) {
    showToast("La source est déjà la variante active.", "ok");
    impOpen.value = false;
    return;
  }

  impErr.value = null;
  impBusy.value = true;
  try {
    const src = findVariantById(sourceId);

    if (!src) {
      await (store as any).loadPnls?.();
    }

    const src2 = src ?? findVariantById(sourceId);
    if (!src2) {
      showToast("Variante source introuvable (données non chargées).", "err");
      return;
    }

    applyCoutOccasionnelFromVariant(src2);
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
   GENERALISER
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeTo(variantIds: string[]) {
  const sourceId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceId) return;

  // ✅ on généralise avec payload déjà "sanitisé" (locks => 0)
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
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Coûts occasionnels sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Coûts occasionnels sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser", msg + lockSummaryText(), async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}

/* =========================
   UI (liste champs)
========================= */
const COSTS = [
  { key: "genieCivil", label: "Génie civil" },
  // ✅ SUPPRIMÉ: installationCab
  { key: "demontage", label: "Démontage" },
  { key: "remisePointCentrale", label: "Remise point centrale" },
  { key: "transport", label: "Transport" },
  { key: "silots", label: "Silots" },
  { key: "localAdjuvant", label: "Local adjuvant" },
  { key: "bungalows", label: "Bungalows" },
] as const;

type CostKey = (typeof COSTS)[number]["key"];

function isLockedKey(k: CostKey): boolean {
  if (k === "genieCivil") return lockGenieCivil.value;
  if (k === "transport") return lockTransport.value;
  return false;
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
          <!-- ✅ bouton Masquer 0 -->
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="hideZeros = !hideZeros">
            {{ hideZeros ? "Afficher 0" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <!-- ✅ Importer -->
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

      <!-- ✅ KPIs en haut -->
      <div class="kpis" v-if="variant">
        <div class="kpi kpiMain">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">Prix / m³</div>
          <div class="kVal mono">{{ n(perM3, 2) }} <span>DH/m³</span></div>
        </div>

        <div class="kpi kpiMonth">
          <div class="kLbl">/ mois</div>
          <div class="kVal mono">{{ money(monthly, 2) }} <span>DH/mois</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">%</div>
          <div class="kVal mono">{{ n(pct, 2) }} <span>%</span></div>
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
        <!-- ✅ ultra compact grid -->
        <div class="cards">
          <template v-for="c in COSTS" :key="c.key">
            <div class="costCard" v-if="!hideZeros || !isZero((draft as any)[c.key])">
              <div class="hdr">
                <div class="t" :title="c.label">{{ c.label }}</div>
                <div class="h">DH</div>
              </div>

              <div class="line">
                <input
                  class="inCout mono"
                  type="number"
                  step="0.01"
                  min="0"
                  :disabled="isLockedKey(c.key)"
                  :value="(draft as any)[c.key]"
                  @input="(draft as any)[c.key] = clamp(($event.target as HTMLInputElement).value)"
                />
              </div>

              <div v-if="isLockedKey(c.key)" class="lockHint">
                À la charge du client → valeur forcée à 0
              </div>
            </div>
          </template>

          <!-- legacy (✅ renommé Installation CAB) -->
          <div class="costCard legacy" v-if="!hideZeros || !isZero(draft.installation)">
            <div class="hdr">
              <div class="t" title="DB legacy">Installation CAB</div>
              <div class="h">DH</div>
            </div>
            <div class="line">
              <input
                class="inCout mono"
                type="number"
                step="0.01"
                min="0"
                :disabled="lockInstallation"
                :value="draft.installation"
                @input="draft.installation = clamp(($event.target as HTMLInputElement).value)"
              />
            </div>
            <div v-if="lockInstallation" class="lockHint">
              À la charge du client → valeur forcée à 0
            </div>
          </div>
        </div>

        <div class="note muted">
          Saisie en <b>DH</b>. Le <b>Total</b> inclut aussi <span class="mono">Installation CAB</span>.
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
.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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
.kpiMonth {
  border-color: rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.06);
}
.kpiMain {
  border-color: rgba(16, 185, 129, 0.42);
  background: rgba(236, 253, 245, 0.9);
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

/* ✅ ultra compact grid */
.cards {
  padding: 8px;
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}
@media (max-width: 520px) {
  .cards {
    grid-template-columns: 1fr;
  }
}

.costCard {
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 12px;
  padding: 6px;
  background: #fff;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.costCard.legacy {
  background: rgba(15, 23, 42, 0.02);
}

.hdr {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.t {
  font-weight: 950;
  font-size: 11px;
  color: #0f172a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.h {
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.5);
  white-space: nowrap;
}

.line {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
.inCout {
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 8px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
  text-align: right;
  min-width: 0;
  font-size: 12px;
}
.inCout:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.inCout:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  border-color: rgba(16, 24, 40, 0.14);
  background: rgba(15, 23, 42, 0.03);
}

.lockHint {
  font-size: 10.5px;
  font-weight: 850;
  color: rgba(2, 132, 199, 0.9);
  padding: 2px 2px 0;
}

.note {
  padding: 8px 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.06);
  font-size: 11.5px;
  font-weight: 800;
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
  z-index: 99999;
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

/* ✅ Safe: si SectionImportModal/GeneralizeModal utilisent une overlay interne */
:deep(.modalOverlay) {
  z-index: 99999 !important;
}
</style>
