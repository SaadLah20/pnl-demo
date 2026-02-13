<!-- ✅ src/pages/CoutEmployesPage.vue (FICHIER COMPLET / ultra-compact cards + KPIs en haut + sticky subheader + toast + modal + generalize + hide zero + ✅ importer) -->
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

  // ✅ icônes par poste/charge (uniquement logo + label)
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
  return items.reduce((s: number, it: any) => s + (clamp(it?.qty) / 1000) * mpPriceUsed(String(it?.mpId)), 0);
}
const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3);
    const momd = clamp(getFormDraft(vf.id).momd);
    const pv = cmpParM3For(vf) + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

/* =========================
   DRAFT EMPLOYES
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

/* =========================
   ✅ UI MAP (LOGO + LABEL SEULEMENT)
   (aucune logique métier)
========================= */
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
    draft[`${g.key}Cout`] = clamp(s[`${g.key}Cout`], 0, 999999);
  }
}
watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

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

function applyEmployesFromVariant(srcVariant: any) {
  const s: any = srcVariant?.employes ?? {};
  for (const g of EMP_GROUPS) {
    draft[`${g.key}Nb`] = clamp(s[`${g.key}Nb`], 0, 9999);
    draft[`${g.key}Cout`] = clamp(s[`${g.key}Cout`], 0, 999999);
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
    const src = findVariantById(sourceId);

    if (!src) {
      await (store as any).loadPnls?.();
    }

    const src2 = src ?? findVariantById(sourceId);
    if (!src2) {
      showToast("Variante source introuvable (données non chargées).", "err");
      return;
    }

    applyEmployesFromVariant(src2);
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
   UI FILTER (hide zero cards)
   ✅ masque si Nb==0 OU Cout==0
========================= */
const hideZero = ref(false);

const empGroupsFiltered = computed(() => {
  if (!hideZero.value) return EMP_GROUPS;

  return EMP_GROUPS.filter((g) => {
    const nb = clamp(draft[`${g.key}Nb`], 0, 9999);
    const cout = clamp(draft[`${g.key}Cout`], 0, 999999);
    return !(nb === 0 || cout === 0);
  });
});

const hiddenCount = computed(() => EMP_GROUPS.length - empGroupsFiltered.value.length);

/* =========================
   METRICS
========================= */
const monthly = computed(() => {
  return EMP_GROUPS.reduce((s, g) => {
    const nb = clamp(draft[`${g.key}Nb`], 0, 9999);
    const cout = clamp(draft[`${g.key}Cout`], 0, 999999);
    return s + nb * cout;
  }, 0);
});
const total = computed(() => monthly.value * clamp(dureeMois.value));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

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
    out[`${g.key}Cout`] = Number(clamp(draft[`${g.key}Cout`], 0, 999999));
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
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadFromVariant();
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

          <!-- ✅ Toggle hide zero -->
          <button
            class="btn"
            :disabled="saving || genBusy || impBusy"
            @click="hideZero = !hideZero"
            :title="hideZero ? 'Afficher tout' : 'Masquer les blocs à 0'"
          >
            <span class="dot" :class="{ on: hideZero }"></span>
            {{ hideZero ? "Afficher tout" : "Masquer 0" }}
            <span v-if="hideZero && hiddenCount" class="miniBadge">{{ hiddenCount }}</span>
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
        <div class="kpi">
          <div class="kLbl">Prix / m³</div>
          <div class="kVal mono">{{ n(perM3, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(total, 2) }}</div>
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
        <div v-if="hideZero && empGroupsFiltered.length === 0" class="emptyGrid">
          Aucun bloc à afficher (tous à 0).
        </div>

        <div class="cards">
          <div v-for="g in empGroupsFiltered" :key="g.key" class="empCard">
            <!-- ✅ header minimal: icône + label uniquement -->
            <div class="empHdr">
              <div class="empTitleWrap">
                <component :is="empIcon(g.key)" class="empIc" />
                <div class="empTitle" :title="g.label">{{ g.label }}</div>
              </div>
            </div>

            <div class="line">
              <input
                class="inNb mono"
                type="number"
                step="1"
                min="0"
                max="9999"
                :value="draft[`${g.key}Nb`]"
                @input="draft[`${g.key}Nb`] = clamp(($event.target as HTMLInputElement).value, 0, 9999)"
                title="Nb"
              />
              <input
                class="inCout mono inMonth"
                type="number"
                step="0.01"
                min="0"
                max="999999"
                :value="draft[`${g.key}Cout`]"
                @input="draft[`${g.key}Cout`] = clamp(($event.target as HTMLInputElement).value, 0, 999999)"
                title="Coût DH/mois"
              />
            </div>

            <div class="empFoot mono">
              <span class="fLbl">/mois</span>
              <b class="fVal">{{
                money(clamp(draft[`${g.key}Nb`], 0, 9999) * clamp(draft[`${g.key}Cout`], 0, 999999), 2)
              }}</b>
            </div>
          </div>
        </div>

        <div class="note muted">
          Saisie : <b>Nb</b> et <b>Coût (DH/mois)</b>. Champs bleus = <b>DH/mois</b>.
        </div>
      </div>
    </template>

    <!-- ✅ IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Coûts employés"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ MODAL GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      section-label="Coûts employés"
      :source-variant-id="String((store as any).activeVariantId ?? (variant?.id ?? '')) || null"
      @apply="onApplyGeneralize"
      @close="() => {}"
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
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

/* empty message when filtered all */
.emptyGrid {
  padding: 10px 12px;
  margin: 8px;
  border-radius: 14px;
  border: 1px dashed rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 900;
  color: rgba(15, 23, 42, 0.65);
}

/* ultra compact grid */
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

.empCard {
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 12px;
  padding: 6px;
  background: #fff;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* header minimal */
.empHdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.empTitleWrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.empIc {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: rgba(2, 132, 199, 0.95);
}
.empTitle {
  font-weight: 1000;
  font-size: 12.5px;
  color: #020617;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* inputs */
.line {
  display: grid;
  grid-template-columns: 54px 1fr;
  gap: 6px;
  align-items: center;
}
.inNb,
.inCout {
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.02);
  padding: 0 8px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
  text-align: right;
  min-width: 0;
  font-size: 12px;
}
.inMonth {
  border-color: rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
}
.inNb:focus,
.inCout:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}

.empFoot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px dashed rgba(16, 24, 40, 0.14);
  min-width: 0;
  align-items: baseline;
}
.fLbl {
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.5);
}
.fVal {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  z-index: 80;
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
