<!-- ✅ src/pages/CoutEmployesPage.vue (FICHIER COMPLET / rows 1 ligne + KPIs + sticky subheader + toast + modal z-index + importer + generalize + ✅ Masquer 0 auto)
     MAJ:
     ✅ KPIs ajoutés: /m³, Total, %
     ✅ Suppression du bloc d’indication “Saisie employés…”
-->
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
  ClipboardDocumentCheckIcon,
  CpuChipIcon,
  BuildingOffice2Icon,
  UserIcon,
  BeakerIcon,
  SparklesIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  TruckIcon,
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
function clamp(v: any, min = 0, max = 1e15) {
  const x = toNum(v);
  return Math.max(min, Math.min(max, x));
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
      d.volumeM3 = clamp(vf?.volumeM3, 0, 1e15);
      d.momd = clamp(vf?.momd, 0, 1e15);
    }
  },
  { immediate: true }
);

const volumeTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3), 0));
const transportPrixMoyen = computed(() => clamp((variant.value as any)?.transport?.prixMoyen, 0, 1e15));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return clamp(vmp.prix, 0, 1e15);
  if (vmp?.prixOverride != null) return clamp(vmp.prixOverride, 0, 1e15);
  return clamp(vmp?.mp?.prix, 0, 1e15);
}
function cmpParM3For(vf: any): number {
  const items = (vf?.formule?.items ?? []) as any[];
  return items.reduce((s: number, it: any) => s + (clamp(it?.qty, 0, 1e15) / 1000) * mpPriceUsed(String(it?.mpId)), 0);
}
const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3, 0, 1e15);
    const momd = clamp(getFormDraft(vf.id).momd, 0, 1e15);
    const pv = cmpParM3For(vf) + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

/* =========================
   EMPLOYES
========================= */
type Draft = Record<string, number>;
const draft = reactive<Draft>({});

const EMP_GROUPS = [
  { key: "responsable", label: "Responsable" },
  { key: "centralistes", label: "Centralistes" },
  { key: "manoeuvre", label: "Manœuvre" },
  { key: "coordinateurExploitation", label: "Coordinateur exploitation" },
  { key: "technicienLabo", label: "Technicien labo" },
  { key: "femmeMenage", label: "Femme ménage" },
  { key: "gardien", label: "Gardien" },
  { key: "maintenancier", label: "Maintenancier" },
  { key: "panierRepas", label: "Panier repas" },
] as const;

const EMP_ICON: Record<(typeof EMP_GROUPS)[number]["key"], any> = {
  responsable: ClipboardDocumentCheckIcon,
  centralistes: CpuChipIcon,
  manoeuvre: BuildingOffice2Icon,
  coordinateurExploitation: UserIcon,
  technicienLabo: BeakerIcon,
  femmeMenage: SparklesIcon,
  gardien: ShieldCheckIcon,
  maintenancier: WrenchScrewdriverIcon,
  panierRepas: TruckIcon,
};
function empIcon(key: string) {
  return (EMP_ICON as any)[key] ?? UserIcon;
}

function loadFromVariant() {
  const s: any = (variant.value as any)?.employes ?? {};
  for (const g of EMP_GROUPS) {
    draft[`${g.key}Nb`] = clamp(s[`${g.key}Nb`], 0, 9999);
    draft[`${g.key}Cout`] = clamp(s[`${g.key}Cout`], 0, 999999999);
  }
}

/* =========================
   ✅ Masquer 0 (AUTO)
   - Par défaut: ON si au moins 1 champ != 0
   - OFF si tout == 0
========================= */
const hideZero = ref(false);
const hideZeroUserToggled = ref(false);

const anyNonZero = computed(() => {
  for (const g of EMP_GROUPS) {
    const nb = clamp(draft[`${g.key}Nb`], 0, 9999);
    const cout = clamp(draft[`${g.key}Cout`], 0, 999999999);
    if (nb !== 0 || cout !== 0) return true;
  }
  return false;
});
const allZero = computed(() => !anyNonZero.value);

function applyAutoHideZeroOnEnter() {
  hideZeroUserToggled.value = false;
  hideZero.value = anyNonZero.value;
  if (allZero.value) hideZero.value = false;
}

watch(
  () => variant.value?.id,
  () => {
    loadFromVariant();
    applyAutoHideZeroOnEnter();
  },
  { immediate: true }
);

watch(
  () => allZero.value,
  (z) => {
    if (z) hideZero.value = false;
  },
  { immediate: true }
);

function toggleHideZero() {
  hideZeroUserToggled.value = true;
  hideZero.value = !hideZero.value;
}

/* filtre: masquer uniquement FULL 0 (nb==0 ET cout==0) */
const empGroupsFiltered = computed(() => {
  if (!hideZero.value) return EMP_GROUPS;
  return EMP_GROUPS.filter((g) => {
    const nb = clamp(draft[`${g.key}Nb`], 0, 9999);
    const cout = clamp(draft[`${g.key}Cout`], 0, 999999999);
    return !(nb === 0 && cout === 0);
  });
});
const hiddenCount = computed(() => EMP_GROUPS.length - empGroupsFiltered.value.length);

/* =========================
   METRICS
========================= */
function rowMonthly(gKey: string) {
  const nb = clamp(draft[`${gKey}Nb`], 0, 9999);
  const cout = clamp(draft[`${gKey}Cout`], 0, 999999999);
  return nb * cout;
}
const monthly = computed(() => EMP_GROUPS.reduce((s, g) => s + rowMonthly(g.key), 0));

const total = computed(() => monthly.value * clamp(dureeMois.value, 0, 9999));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

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
function applyEmployesFromVariant(srcVariant: any) {
  const s: any = srcVariant?.employes ?? {};
  for (const g of EMP_GROUPS) {
    draft[`${g.key}Nb`] = clamp(s[`${g.key}Nb`], 0, 9999);
    draft[`${g.key}Cout`] = clamp(s[`${g.key}Cout`], 0, 999999999);
  }
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
    let src = findVariantById(sourceId);
    if (!src) await (store as any).loadPnls?.();
    src = src ?? findVariantById(sourceId);

    if (!src) {
      showToast("Variante source introuvable (données non chargées).", "err");
      return;
    }

    applyEmployesFromVariant(src);
    hideZeroUserToggled.value = false;
    hideZero.value = anyNonZero.value && !allZero.value;

    showToast("Coûts employés importés. Pense à enregistrer.", "ok");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
  } finally {
    impBusy.value = false;
  }
}

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
  const existing: any = (variant.value as any)?.employes ?? {};
  const out: any = { category: existing.category ?? "COUTS_CHARGES" };
  for (const g of EMP_GROUPS) {
    out[`${g.key}Nb`] = Number(clamp(draft[`${g.key}Nb`], 0, 9999));
    out[`${g.key}Cout`] = Number(clamp(draft[`${g.key}Cout`], 0, 999999999));
  }
  return out;
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { employes: buildPayload() });
    showToast("Coûts employés enregistrés.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des coûts employés ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la variante active ?", () => {
    closeModal();
    loadFromVariant();
    applyAutoHideZeroOnEnter();
    showToast("Valeurs restaurées.", "ok");
  });
}

/* =========================
   GENERALISER
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeEmployesTo(variantIds: string[]) {
  const sourceVariantId = String(variant.value?.id ?? (store as any).activeVariantId ?? "").trim();
  if (!sourceVariantId) return;

  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const idRaw of variantIds ?? []) {
      const targetId = String(idRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;
      await (store as any).updateVariant(targetId, { employes: payload });
    }
    showToast("Section Coûts employés généralisée.", "ok");
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
      ? "Confirmer la généralisation de la section Coûts employés sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Coûts employés sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser", msg, async () => {
    closeModal();
    await generalizeEmployesTo(ids);
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
            <div class="ttl">Coûts employés</div>
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
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="toggleHideZero()" :title="hideZero ? 'Afficher tout' : 'Masquer les lignes à 0'">
            <span class="dot" :class="{ on: hideZero }"></span>
            {{ hideZero ? "Afficher tout" : "Masquer 0" }}
            <span v-if="hideZero && hiddenCount" class="miniBadge">{{ hiddenCount }}</span>
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

      <!-- ✅ KPIs -->
      <div class="kpis" v-if="variant">
        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal mono">{{ n(perM3, 2) }} <span>DH/m³</span></div>
        </div>

        <div class="kpi kpiMonth">
          <div class="kLbl">/ mois</div>
          <div class="kVal mono">{{ money(monthly, 2) }} <span>DH/mois</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(total, 2) }}</div>
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
        <div v-if="hideZero && empGroupsFiltered.length === 0" class="emptyGrid">Aucune ligne à afficher (tout est à 0).</div>

        <!-- ✅ 1 poste par ligne -->
        <div class="rows">
          <div v-for="g in empGroupsFiltered" :key="g.key" class="r">
            <div class="rLeft">
              <component :is="empIcon(g.key)" class="ri" />
              <div class="rlbl" :title="g.label">{{ g.label }}</div>
            </div>

            <div class="rMid">
              <div class="mini">Nb</div>
              <input
                class="inNb mono"
                type="number"
                step="1"
                min="0"
                max="9999"
                :value="draft[`${g.key}Nb`]"
                @input="draft[`${g.key}Nb`] = clamp(($event.target as HTMLInputElement).value, 0, 9999)"
              />

              <div class="mini">Salaire</div>
              <input
                class="inCout mono"
                type="number"
                step="0.01"
                min="0"
                max="999999999"
                :value="draft[`${g.key}Cout`]"
                @input="draft[`${g.key}Cout`] = clamp(($event.target as HTMLInputElement).value, 0, 999999999)"
              />
              <div class="u">DH/mois</div>
            </div>

            <div class="rRight mono">
              <div class="mini2">/mois</div>
              <div class="rVal">{{ money(rowMonthly(g.key), 2) }}</div>
            </div>
          </div>
        </div>

        <div class="note">
          <b>Total</b> = /mois × durée • <b>/m³</b> = Total ÷ volume • <b>%</b> = Total ÷ CA.
        </div>
      </div>
    </template>

    <!-- ✅ IMPORT -->
    <SectionImportModal v-model="impOpen" sectionLabel="Coûts employés" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

    <!-- ✅ GENERALISER -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      section-label="Coûts employés"
      :source-variant-id="String((store as any).activeVariantId ?? (variant?.id ?? '')) || null"
      @apply="onApplyGeneralize"
      @close="() => {}"
    />

    <!-- ✅ Modal confirm/info (au-dessus HeaderDashboard) -->
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

    <!-- ✅ Toast (au-dessus HeaderDashboard) -->
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

/* toggle dot */
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
.emptyGrid {
  padding: 10px 12px;
  margin: 8px;
  border-radius: 14px;
  border: 1px dashed rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 900;
  color: rgba(15, 23, 42, 0.65);
}

/* rows */
.rows {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.r {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.012);
  border-radius: 14px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(320px, 1.2fr) minmax(140px, 0.6fr);
  gap: 10px;
  align-items: center;
}
@media (max-width: 980px) {
  .r {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

.rLeft {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ri {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: rgba(2, 132, 199, 0.95);
}
.rlbl {
  font-weight: 950;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rMid {
  display: grid;
  grid-template-columns: 34px 92px 54px 140px 70px;
  gap: 8px;
  align-items: center;
  justify-content: end;
}
@media (max-width: 980px) {
  .rMid {
    grid-template-columns: 34px 92px 54px 1fr 70px;
    justify-content: start;
  }
}
.mini {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  text-align: right;
}
@media (max-width: 980px) {
  .mini {
    text-align: left;
  }
}
.inNb,
.inCout {
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 10px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
  text-align: right;
  min-width: 0;
}
.inNb:focus,
.inCout:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.u {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
}

.rRight {
  justify-self: end;
  text-align: right;
  min-width: 0;
}
@media (max-width: 980px) {
  .rRight {
    justify-self: start;
    text-align: left;
  }
}
.mini2 {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.rVal {
  font-size: 12.5px;
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note {
  padding: 8px 10px;
  border-top: 1px dashed rgba(16, 24, 40, 0.14);
  font-size: 11.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.65);
}

/* modal (✅ au-dessus du HeaderDashboard) */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 100000;
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

/* toast (✅ au-dessus du HeaderDashboard) */
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
</style>
