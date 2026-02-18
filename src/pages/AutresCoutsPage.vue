<!-- ✅ src/pages/AutresCoutsPage.vue (FICHIER COMPLET)
     Inspiration: CoutEmployesPage.vue
     ✅ Header: titre + actions (pas de meta / pas de hint)
     ✅ Lignes: Libellé + Unité + Valeur (placeholder discret dans le champ) + KPI inline sur la même ligne
     ✅ KPI inline par ligne: "x DH/m³ / y DH/mois / z DH / t%"
     ✅ Polices NORMALES (pas mono), chiffres alignés via tabular-nums
     ✅ Alternance background bien visible
     ✅ Tooltip (title) sur textes tronqués
     ✅ Logique inchangée: FG unique, non supprimable, seuil <5%, save/import/généralisation, modal confirm, toast
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
  PlusCircleIcon,
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
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ✅ Null-safe helpers (affichage vide + placeholder) */
function toNullableNumberInput(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}
function inputToNullable(v: string, min: number, max: number, integers = false): number | null {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const x = Math.max(min, Math.min(max, num));
  return integers ? Math.round(x) : x;
}
function nz(x: number | null | undefined) {
  return Number.isFinite(Number(x)) ? Number(x) : 0;
}

/** normalise pour comparer (case-insensitive + accents + espaces) */
function normLabel(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
const FG_NORM = normLabel("Frais généraux");

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
   AUTRES COUTS
========================= */
type Unite = "FORFAIT" | "MOIS" | "M3" | "POURCENT_CA";
type DraftRow = { _id: string; label: string; unite: Unite; valeur: number | null };

const rows = ref<DraftRow[]>([]);

function isFraisGenerauxRow(r: DraftRow | null | undefined) {
  if (!r) return false;
  return normLabel(r.label) === FG_NORM;
}

/** ✅ FG existe une seule fois */
function ensureFraisGeneraux() {
  const idx = rows.value.findIndex((r) => isFraisGenerauxRow(r));
  if (idx === -1) {
    rows.value.unshift({ _id: uid(), label: "Frais généraux", unite: "POURCENT_CA", valeur: 0 });
    return;
  }
  if (idx > 0) {
    const [fg] = rows.value.splice(idx, 1);
    if (fg) rows.value.unshift(fg);
  }
}

function loadFromVariant() {
  const items = ((variant.value as any)?.autresCouts?.items ?? []) as any[];
  rows.value = items.map((it: any) => ({
    _id: uid(),
    label: String(it?.label ?? ""),
    unite: (String(it?.unite ?? "FORFAIT") as Unite) || "FORFAIT",
    valeur: toNullableNumberInput(it?.valeur),
  }));
  ensureFraisGeneraux();
}

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

const displayRows = computed(() => {
  ensureFraisGeneraux();
  const fg = rows.value.find((r) => isFraisGenerauxRow(r));
  const rest = rows.value.filter((r) => !isFraisGenerauxRow(r));
  return fg ? [fg, ...rest] : rest;
});

/* =========================
   CALCULS (sur null => 0)
========================= */
function totalFor(r: DraftRow): number {
  const v = clamp(nz(r.valeur), 0, 1e15);
  if (r.unite === "FORFAIT") return v;
  if (r.unite === "MOIS") return v * clamp(dureeMois.value, 0, 9999);
  if (r.unite === "M3") return v * clamp(volumeTotal.value, 0, 1e15);
  return (v / 100) * clamp(caTotal.value, 0, 1e15);
}
function monthlyFor(r: DraftRow): number {
  const d = clamp(dureeMois.value, 0, 9999);
  if (d <= 0) return 0;
  if (r.unite === "MOIS") return clamp(nz(r.valeur), 0, 1e15);
  return totalFor(r) / d;
}
function perM3For(r: DraftRow): number {
  const vol = clamp(volumeTotal.value, 0, 1e15);
  if (vol <= 0) return 0;
  return totalFor(r) / vol;
}
function pctFor(r: DraftRow): number {
  const ca = clamp(caTotal.value, 0, 1e15);
  if (ca <= 0) return 0;
  return (totalFor(r) / ca) * 100;
}

const monthly = computed(() => displayRows.value.reduce((s, r) => s + monthlyFor(r), 0));
const total = computed(() => displayRows.value.reduce((s, r) => s + totalFor(r), 0));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

/* =========================
   FG seuil
========================= */
const fgRow = computed<DraftRow | null>(() => rows.value.find((x) => isFraisGenerauxRow(x)) ?? null);
const fgPct = computed<number>(() => (fgRow.value ? pctFor(fgRow.value) : 0));
const fgLow = computed<boolean>(() => {
  if (!fgRow.value) return false;
  if (clamp(caTotal.value) <= 0) return false;
  return fgPct.value < 5;
});

/* =========================
   ACTIONS
========================= */
function addRow() {
  rows.value.push({ _id: uid(), label: "", unite: "FORFAIT", valeur: null });
}
function removeRowById(id: string) {
  const idx = rows.value.findIndex((r) => r._id === id);
  if (idx < 0) return;
  if (isFraisGenerauxRow(rows.value[idx])) return;
  rows.value.splice(idx, 1);
}

/* =========================
   VALIDATION (FG unique)
========================= */
function validateRows(): string | null {
  ensureFraisGeneraux();

  const norms = rows.value.map((r) => normLabel(r.label));
  const fgCount = norms.filter((x) => x === FG_NORM).length;
  if (fgCount !== 1) return 'Le coût "Frais généraux" doit exister une seule fois (pas de doublon).';

  const seen = new Set<string>();
  for (const x of norms) {
    if (!x) continue;
    if (seen.has(x)) return "Libellés en doublon : merci de les rendre uniques.";
    seen.add(x);
  }
  return null;
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
  ensureFraisGeneraux();
  const fg = rows.value.find((r) => isFraisGenerauxRow(r));
  const rest = rows.value.filter((r) => !isFraisGenerauxRow(r));
  const all = fg ? [fg, ...rest] : rest;

  // ✅ null => 0 dans payload
  return all.map((r) => ({
    label: String(r.label ?? ""),
    unite: String(r.unite ?? "FORFAIT"),
    valeur: Number(clamp(nz(r.valeur), 0, 1e15)),
  }));
}

async function save() {
  if (!variant.value) return;

  err.value = null;

  const validation = validateRows();
  if (validation) {
    err.value = validation;
    showToast(validation, "err");
    openInfo("Erreur", validation);
    return;
  }

  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { autresCouts: { items: buildPayload() } });
    showToast("Autres coûts enregistrés.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des autres coûts ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la variante active ?", () => {
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

async function generalizeTo(variantIds: string[]) {
  const sourceVariantId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceVariantId) return;

  const validation = validateRows();
  if (validation) {
    genErr.value = validation;
    showToast(validation, "err");
    openInfo("Erreur", validation);
    return;
  }

  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const targetIdRaw of variantIds) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;
      await (store as any).updateVariant(targetId, { autresCouts: { items: payload } });
    }
    showToast("Section Autres coûts généralisée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value), "err");
    openInfo("Erreur", String(genErr.value ?? e?.message ?? e));
  } finally {
    genBusy.value = false;
  }
}
async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Autres coûts sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Autres coûts sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
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
function applyFromVariant(v: any) {
  const items = ((v as any)?.autresCouts?.items ?? []) as any[];
  rows.value = items.map((it: any) => ({
    _id: uid(),
    label: String(it?.label ?? ""),
    unite: (String(it?.unite ?? "FORFAIT") as Unite) || "FORFAIT",
    valeur: toNullableNumberInput(it?.valeur),
  }));
  ensureFraisGeneraux();
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
    if (!src) {
      await (store as any).loadPnls?.();
      src = findVariantById(sourceId);
    }
    if (!src) {
      showToast("Variante source introuvable (données non chargées).", "err");
      return;
    }

    applyFromVariant(src);
    showToast("Autres coûts importés. Pense à enregistrer.", "ok");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
    openInfo("Erreur", String(impErr.value));
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   UI helpers
========================= */
function valueUnitLabel(u: Unite): string {
  if (u === "POURCENT_CA") return "%";
  if (u === "MOIS") return "DH/mois";
  if (u === "M3") return "DH/m³";
  return "DH";
}
function valeurPlaceholder(u: Unite): string {
  if (u === "POURCENT_CA") return "%";
  return "Valeur";
}
</script>

<template>
  <div class="page">
    <div class="subhdr">
      <div class="row">
        <div class="ttl">Autres coûts</div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="addRow()">
            <PlusCircleIcon class="ic" />
            Ajouter
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

      <!-- ✅ KPIs globaux (style CoutEmployesPage) -->
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
        <div class="list">
          <div v-for="(r0, idx) in displayRows" :key="r0._id" class="rowCard" :class="{ odd: idx % 2 === 0 }">
            <div class="line">
              <!-- libellé -->
              <input
                class="inLbl"
                v-model="r0.label"
                placeholder="Libellé…"
                :class="{ fg: isFraisGenerauxRow(r0) }"
                :title="r0.label"
              />

              <!-- unité -->
              <select class="inSel" v-model="r0.unite" title="Unité">
                <option value="FORFAIT">FORFAIT</option>
                <option value="MOIS">MOIS</option>
                <option value="M3">M3</option>
                <option value="POURCENT_CA">%CA</option>
              </select>

              <!-- valeur (✅ placeholder dans le champ, pas de label au-dessus) -->
              <input
                class="inVal num"
                type="number"
                step="0.01"
                min="0"
                :placeholder="valeurPlaceholder(r0.unite)"
                :value="r0.valeur ?? ''"
                @input="r0.valeur = inputToNullable(($event.target as HTMLInputElement).value, 0, 1e15, false)"
              />

              <div class="unit">{{ valueUnitLabel(r0.unite) }}</div>

              <!-- KPI inline par poste (✅ une seule ligne) -->
              <div class="kpiInline num" :title="`${n(perM3For(r0), 2)} DH/m³ / ${compact(monthlyFor(r0), 0)} DH/mois / ${compact(totalFor(r0), 0)} DH / ${n(pctFor(r0), 2)}%`">
                <span class="k">{{ n(perM3For(r0), 2) }}</span><span class="u">DH/m³</span>
                <span class="s">/</span>
                <span class="k">{{ compact(monthlyFor(r0), 0) }}</span><span class="u">DH/mois</span>
                <span class="s">/</span>
                <span class="k">{{ compact(totalFor(r0), 0) }}</span><span class="u">DH</span>
                <span class="s">/</span>
                <span class="k">{{ n(pctFor(r0), 2) }}</span><span class="u">%</span>
              </div>

              <!-- delete -->
              <button
                class="icon"
                :class="isFraisGenerauxRow(r0) ? 'disabled' : 'danger'"
                type="button"
                :disabled="isFraisGenerauxRow(r0)"
                :title="isFraisGenerauxRow(r0) ? 'Non supprimable' : 'Supprimer'"
                @click="removeRowById(r0._id)"
              >
                ✕
              </button>
            </div>

            <!-- FG warning (discret) -->
            <div v-if="isFraisGenerauxRow(r0) && fgLow" class="fgHint">⚠ Frais généraux &lt; <b>5%</b></div>
          </div>
        </div>
      </div>
    </template>

    <SectionImportModal v-model="impOpen" sectionLabel="Autres coûts" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Autres coûts"
      :sourceVariantId="String((store as any).activeVariantId ?? (variant?.id ?? '')) || null"
      @apply="onApplyGeneralize"
    />

    <!-- confirm/info modal -->
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
.btn.pri {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}
.ic {
  width: 16px;
  height: 16px;
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

/* list */
.list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* alternance visible (comme demandé) */
.rowCard {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.03);
}
.rowCard.odd {
  background: rgba(15, 23, 42, 0.085);
}

/* ✅ une seule ligne */
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* inputs */
.inLbl,
.inSel,
.inVal {
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.055);
  padding: 0 8px;
  font-weight: 950;
  font-size: 12px;
  color: #0f172a;
  outline: none;
}
.inLbl::placeholder,
.inVal::placeholder {
  color: rgba(15, 23, 42, 0.42);
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.inLbl:focus,
.inSel:focus,
.inVal:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.inLbl {
  flex: 1 1 320px;
  min-width: 220px;
}
.inLbl.fg {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(236, 253, 245, 0.75);
}
.inSel {
  width: 120px;
  flex: 0 0 auto;
}
.inVal {
  width: 140px; /* ✅ plus compact */
  text-align: right;
  flex: 0 0 auto;
}

.unit {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
}

/* KPI inline (même style que CoutEmployesPage) */
.kpiInline {
  margin-left: auto;
  flex: 0 1 auto;
  min-width: 0;

  display: inline-flex;
  align-items: center;
  gap: 6px;

  padding: 3px 7px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.1);
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

/* delete */
.icon {
  width: 34px;
  height: 28px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
  font-weight: 950;
  flex: 0 0 auto;
}
.icon.danger {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(127, 29, 29, 0.95);
}
.icon.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fgHint {
  margin-top: 6px;
  font-size: 11px;
  font-weight: 900;
  color: rgba(185, 28, 28, 0.95);
}

/* responsive */
@media (max-width: 980px) {
  .kpiInline {
    display: none;
  }
  .unit {
    display: none;
  }
}
@media (max-width: 760px) {
  .line {
    flex-wrap: wrap;
  }
  .inLbl {
    flex: 1 1 100%;
    min-width: 0;
  }
}

/* modal + toast (au-dessus HeaderDashboard) */
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
