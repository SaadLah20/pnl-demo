<!-- ✅ src/pages/CoutEmployesPage.vue (FICHIER COMPLET)
     ✅ 0 affiché comme vide (placeholder "Nb"/"Salaire" visible)
     ✅ Save/import/generalize sûrs (0 dans payload)
     ✅ Textes/chiffres par poste un peu plus grands
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

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
function compact(v: number, digits = 0) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toNum(v));
}

/* ✅ Affichage inputs: 0 => vide (placeholder), null => vide */
function toNullableNumberInput(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  if (num === 0) return null; // ✅ 0 => placeholder visible
  return num;
}
function inputToNullable(v: string, min: number, max: number, integers = false): number | null {
  const raw = (v ?? "").trim();
  if (!raw) return null; // vide => null (donc affichage placeholder)
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const x = Math.max(min, Math.min(max, num));
  const out = integers ? Math.round(x) : x;
  // ✅ si l'utilisateur tape 0, on l'accepte en data (mais en UI on veut placeholder)
  // => on garde 0 en draft? non: on le remet à null pour afficher placeholder.
  return out === 0 ? null : out;
}
function nz(x: number | null | undefined) {
  // ✅ au moment des calculs/payload: null => 0
  return Number.isFinite(Number(x)) ? Number(x) : 0;
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const dureeMois = computed(() => clamp(contract.value?.dureeMois, 0, 9999));

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

const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3, 0, 1e15), 0)
);

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
type Draft = Record<string, number | null>;
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
    draft[`${g.key}Nb`] = toNullableNumberInput(s[`${g.key}Nb`]);
    draft[`${g.key}Cout`] = toNullableNumberInput(s[`${g.key}Cout`]);
  }
}

/* =========================
   ✅ Masquer 0 (AUTO + USER OVERRIDE)
========================= */
const hideZero = ref(false);
const hideZeroUserToggled = ref(false);

function anyNonZeroNow(): boolean {
  for (const g of EMP_GROUPS) {
    const nb = clamp(nz(draft[`${g.key}Nb`]), 0, 9999);
    const cout = clamp(nz(draft[`${g.key}Cout`]), 0, 999999999);
    if (nb !== 0 || cout !== 0) return true;
  }
  return false;
}
function syncHideZeroAuto() {
  const anyNZ = anyNonZeroNow();
  if (!anyNZ) {
    hideZero.value = false;
    hideZeroUserToggled.value = false;
    return;
  }
  if (!hideZeroUserToggled.value) hideZero.value = true;
}
function applyAutoHideZeroOnEnter() {
  hideZeroUserToggled.value = false;
  syncHideZeroAuto();
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
  () => EMP_GROUPS.map((g) => [draft[`${g.key}Nb`], draft[`${g.key}Cout`]]),
  () => syncHideZeroAuto()
);

function toggleHideZero() {
  hideZeroUserToggled.value = true;
  hideZero.value = !hideZero.value;
}

const empGroupsFiltered = computed(() => {
  if (!hideZero.value) return EMP_GROUPS;
  return EMP_GROUPS.filter((g) => {
    const nb = clamp(nz(draft[`${g.key}Nb`]), 0, 9999);
    const cout = clamp(nz(draft[`${g.key}Cout`]), 0, 999999999);
    return !(nb === 0 && cout === 0);
  });
});
const hiddenCount = computed(() => EMP_GROUPS.length - empGroupsFiltered.value.length);

/* =========================
   METRICS
========================= */
function rowMonthly(gKey: string) {
  const nb = clamp(nz(draft[`${gKey}Nb`]), 0, 9999);
  const cout = clamp(nz(draft[`${gKey}Cout`]), 0, 999999999);
  return nb * cout;
}
function rowTotal(gKey: string) {
  return rowMonthly(gKey) * clamp(dureeMois.value, 0, 9999);
}
function rowPerM3(gKey: string) {
  return volumeTotal.value > 0 ? rowTotal(gKey) / volumeTotal.value : 0;
}
function rowPct(gKey: string) {
  return caTotal.value > 0 ? (rowTotal(gKey) / caTotal.value) * 100 : 0;
}

const monthly = computed(() => EMP_GROUPS.reduce((s, g) => s + rowMonthly(g.key), 0));
const total = computed(() => monthly.value * clamp(dureeMois.value, 0, 9999));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

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
function applyEmployesFromVariant(srcVariant: any) {
  const s: any = srcVariant?.employes ?? {};
  for (const g of EMP_GROUPS) {
    draft[`${g.key}Nb`] = toNullableNumberInput(s[`${g.key}Nb`]);
    draft[`${g.key}Cout`] = toNullableNumberInput(s[`${g.key}Cout`]);
  }
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

    applyEmployesFromVariant(src);
    hideZeroUserToggled.value = false;
    syncHideZeroAuto();

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

  // ✅ null (ou champ vide / 0 affiché) => 0 dans le payload
  for (const g of EMP_GROUPS) {
    out[`${g.key}Nb`] = Number(clamp(nz(draft[`${g.key}Nb`]), 0, 9999));
    out[`${g.key}Cout`] = Number(clamp(nz(draft[`${g.key}Cout`]), 0, 999999999));
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
    <div class="subhdr">
      <div class="row">
        <div class="ttl">Coûts employés</div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="toggleHideZero()" :class="{ on: hideZero }">
            <span class="dot" aria-hidden="true"></span>
            {{ hideZero ? "Afficher" : "Masquer 0" }}
            <span v-if="hideZero && hiddenCount" class="miniBadge">{{ hiddenCount }}</span>
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

      <div class="kpis" v-if="variant">
        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal num">{{ n(perM3, 2) }} <span>DH/m³</span></div>
        </div>
        <div class="kpi kpiTint">
          <div class="kLbl">Total/mois</div>
          <div class="kVal num">{{ money(monthly, 2) }} <span>DH/mois</span></div>
        </div>
        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal num">{{ money(total, 2) }}</div>
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
        <div v-if="hideZero && empGroupsFiltered.length === 0" class="emptyGrid">Aucune ligne (tout est à 0).</div>

        <div class="list">
          <div v-for="g in empGroupsFiltered" :key="g.key" class="rowCard">
            <div class="line">
              <div class="poste" :title="g.label">
                <component :is="empIcon(g.key)" class="pi" />
                <div class="plbl">{{ g.label }}</div>
              </div>

              <input
                class="inNb num"
                type="number"
                step="1"
                min="0"
                max="9999"
                placeholder="Nb"
                :value="draft[`${g.key}Nb`] ?? ''"
                @input="draft[`${g.key}Nb`] = inputToNullable(($event.target as HTMLInputElement).value, 0, 9999, true)"
              />

              <input
                class="inSalaire num"
                type="number"
                step="0.01"
                min="0"
                max="999999999"
                placeholder="Salaire"
                :value="draft[`${g.key}Cout`] ?? ''"
                @input="draft[`${g.key}Cout`] = inputToNullable(($event.target as HTMLInputElement).value, 0, 999999999, false)"
              />

              <div class="unit">DH/mois</div>

              <div class="kpiInline num" :title="'/m³ / mois / total / %CA'">
                <span class="k">{{ n(rowPerM3(g.key), 2) }}</span><span class="u">DH/m³</span>
                <span class="s">/</span>
                <span class="k">{{ compact(rowMonthly(g.key), 0) }}</span><span class="u">DH/mois</span>
                <span class="s">/</span>
                <span class="k">{{ compact(rowTotal(g.key), 0) }}</span><span class="u">DH</span>
                <span class="s">/</span>
                <span class="k">{{ n(rowPct(g.key), 2) }}</span><span class="u">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <SectionImportModal v-model="impOpen" sectionLabel="Coûts employés" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coûts employés"
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
.page {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
* {
  box-sizing: border-box;
}
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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
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
.btn.pri,
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
.miniBadge {
  font-size: 10px;
  font-weight: 950;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.08);
}

/* KPI globaux */
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
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}
.emptyGrid {
  padding: 10px 12px;
  margin: 8px;
  border-radius: 12px;
  border: 1px dashed rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 900;
  color: rgba(15, 23, 42, 0.65);
}

/* list */
.list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* alternance plus visible */
.rowCard {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  padding: 10px;
}
.rowCard:nth-child(odd) {
  background: rgba(15, 23, 42, 0.085);
}
.rowCard:nth-child(even) {
  background: rgba(15, 23, 42, 0.03);
}

/* ✅ une seule ligne */
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* poste (un peu plus grand) */
.poste {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 0 auto;
}
.pi {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  color: rgba(2, 132, 199, 0.95);
}
.plbl {
  font-weight: 950;
  font-size: 12.5px;
  color: rgba(15, 23, 42, 0.88);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

/* inputs (un peu plus grands) */
.inNb,
.inSalaire {
  height: 26px;
  border-radius: 10px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.055);
  padding: 0 8px;
  font-weight: 950;
  font-size: 12px;
  color: #0f172a;
  outline: none;
  text-align: right;
}
.inNb {
  width: 66px;
  padding: 0 7px;
}
.inSalaire {
  width: 160px;
}
.inNb::placeholder,
.inSalaire::placeholder {
  color: rgba(15, 23, 42, 0.45);
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.inNb:focus,
.inSalaire:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}

.unit {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
}

/* KPI poste */
.kpiInline {
  margin-left: auto;
  flex: 0 1 auto;
  min-width: 0;

  display: inline-flex;
  align-items: center;
  gap: 6px;

  padding: 3px 7px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.55);

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  font-size: 10.5px;
  line-height: 1.1;
}
.kpiInline .k {
  font-weight: 950;
  color: rgba(15, 23, 42, 0.9);
  font-size: 10.5px;
}
.kpiInline .u {
  font-weight: 850;
  color: rgba(15, 23, 42, 0.55);
  font-size: 10px;
  margin-left: 2px;
}
.kpiInline .s {
  opacity: 0.35;
  padding: 0 2px;
  font-weight: 900;
}

/* responsive */
@media (max-width: 980px) {
  .kpiInline {
    display: none;
  }
}
@media (max-width: 760px) {
  .line {
    flex-wrap: wrap;
  }
  .unit {
    display: none;
  }
}

/* modal + toast */
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
  border-radius: 14px;
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
  width: 32px;
  height: 32px;
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
  height: 32px;
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
