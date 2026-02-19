<!-- ✅ src/pages/MaintenancePage.vue (FICHIER COMPLET)
     ✅ Header compact = style référence (MomdAndQuantity-like)
     ✅ Pas d'infos à côté du titre
     ✅ Chiffres en police NORMALE via .num (tabulaires)
     ✅ Lock maintenance (charge client) => tous les champs forcés à 0 + verrouillés
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal, { type ImportCopyPreset } from "@/components/SectionImportModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  InformationCircleIcon,
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
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(x: any, min: number, max: number) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}
function isZero(v: any) {
  return Math.abs(toNum(v)) <= 0;
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
  const t = norm(v);
  return t.includes("client"); // "à la charge du client", "charge client", etc.
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => Math.max(0, toNum(contract.value?.dureeMois)));

/* =========================
   ✅ CONTRACT LOCK (maintenance)
========================= */
const lockMaintenance = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  return isChargeClient(c?.maintenance);
});

/* =========================
   EDIT MODEL (MAINTENANCE)
========================= */
type MaintenanceEdit = {
  cab: number;
  elec: number;
  chargeur: number;
  generale: number;
  bassins: number;
  preventive: number;
};

const edit = reactive<MaintenanceEdit>({
  cab: 0,
  elec: 0,
  chargeur: 0,
  generale: 0,
  bassins: 0,
  preventive: 0,
});

function applyFromVariant(v: any) {
  const m: any = (v as any)?.maintenance ?? {};
  edit.cab = clamp(m?.cab, 0, 1e12);
  edit.elec = clamp(m?.elec, 0, 1e12);
  edit.chargeur = clamp(m?.chargeur, 0, 1e12);
  edit.generale = clamp(m?.generale, 0, 1e12);
  edit.bassins = clamp(m?.bassins, 0, 1e12);
  edit.preventive = clamp(m?.preventive, 0, 1e12);
}

/** ✅ enforce contract rule (immediate KPI correctness) */
function enforceMaintenanceLock(): { changed: boolean; note?: string } {
  if (!lockMaintenance.value) return { changed: false };

  const before = {
    cab: toNum(edit.cab),
    elec: toNum(edit.elec),
    chargeur: toNum(edit.chargeur),
    generale: toNum(edit.generale),
    bassins: toNum(edit.bassins),
    preventive: toNum(edit.preventive),
  };

  edit.cab = 0;
  edit.elec = 0;
  edit.chargeur = 0;
  edit.generale = 0;
  edit.bassins = 0;
  edit.preventive = 0;

  const changed =
    before.cab !== 0 ||
    before.elec !== 0 ||
    before.chargeur !== 0 ||
    before.generale !== 0 ||
    before.bassins !== 0 ||
    before.preventive !== 0;

  return {
    changed,
    note: changed ? "Maintenance forcée à 0 (charge client)." : undefined,
  };
}

function loadFromVariant() {
  applyFromVariant(variant.value);
  enforceMaintenanceLock();
}

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

watch(
  () => lockMaintenance.value,
  () => {
    enforceMaintenanceLock();
  },
  { immediate: true }
);

/* =========================
   ✅ EFFECTIVE VALUES (for KPI + save + rows)
========================= */
const effective = computed(() => {
  if (lockMaintenance.value) {
    return { cab: 0, elec: 0, chargeur: 0, generale: 0, bassins: 0, preventive: 0 };
  }
  return {
    cab: clamp(edit.cab, 0, 1e12),
    elec: clamp(edit.elec, 0, 1e12),
    chargeur: clamp(edit.chargeur, 0, 1e12),
    generale: clamp(edit.generale, 0, 1e12),
    bassins: clamp(edit.bassins, 0, 1e12),
    preventive: clamp(edit.preventive, 0, 1e12),
  };
});

/* =========================
   METRICS
========================= */
type Line = {
  key: keyof MaintenanceEdit;
  label: string;
  locked: boolean;
  mensuel: number; // DH/mois
  total: number; // DH
  parM3: number; // DH/m3
  pctCa: number; // %
};

const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
const volumeTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + toNum(vf?.volumeM3), 0));

const transportPrixMoyen = computed(() => toNum((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return toNum(vmp.prix);
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);
  return toNum(vmp?.mp?.prix);
}

type CompRow = { mpId: string; qty: number; prix: number; coutParM3: number };
function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty); // kg/m3
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = toNum(vf?.volumeM3);
    const momd = toNum(vf?.momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});

const mensuelTotal = computed(() => {
  const e = effective.value;
  return toNum(e.cab) + toNum(e.elec) + toNum(e.chargeur) + toNum(e.generale) + toNum(e.bassins) + toNum(e.preventive);
});

const total = computed(() => mensuelTotal.value * dureeMois.value);
const parM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pctCa = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

const lines = computed<Line[]>(() => {
  const mk = (key: keyof MaintenanceEdit, label: string): Line => {
    const mensuel = toNum((effective.value as any)[key]);
    const total = mensuel * dureeMois.value;
    const parM3 = volumeTotal.value > 0 ? total / volumeTotal.value : 0;
    const pctCa = caTotal.value > 0 ? (total / caTotal.value) * 100 : 0;
    return { key, label, locked: lockMaintenance.value, mensuel, total, parM3, pctCa };
  };

  return [
    mk("cab", "Maintenance CAB"),
    mk("elec", "Maintenance Électricité"),
    mk("chargeur", "Maintenance Chargeur"),
    mk("generale", "Maintenance Générale"),
    mk("bassins", "Maintenance Bassins"),
    mk("preventive", "Maintenance Préventive"),
  ];
});

/* =========================
   ✅ MASQUER 0 (UI only)
========================= */
const hideZeros = ref(false);
const visibleLines = computed(() => {
  const arr = lines.value ?? [];
  if (!hideZeros.value) return arr;

  // ✅ garder visibles les lignes verrouillées même à 0
  return arr.filter((ln) => !isZero(ln.mensuel) || ln.locked);
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

function buildPayload(): any {
  const existing: any = (variant.value as any)?.maintenance ?? {};
  const e = effective.value;

  return {
    category: existing?.category ?? "COUTS_CHARGES",
    cab: Number(clamp(e.cab, 0, 1e12)),
    elec: Number(clamp(e.elec, 0, 1e12)),
    chargeur: Number(clamp(e.chargeur, 0, 1e12)),
    generale: Number(clamp(e.generale, 0, 1e12)),
    bassins: Number(clamp(e.bassins, 0, 1e12)),
    preventive: Number(clamp(e.preventive, 0, 1e12)),
  };
}

async function save() {
  if (!variant.value) return;

  // ✅ safety: enforce before save
  const { changed, note } = enforceMaintenanceLock();
  if (changed && note) showToast(note, "info");

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { maintenance: buildPayload() });
    showToast("Maintenance enregistrée.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer Maintenance", "Confirmer l’enregistrement de la Maintenance ?", async () => {
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

function applyMaintenanceFromVariant(srcVariant: any) {
  applyFromVariant(srcVariant);
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

    applyMaintenanceFromVariant(src);

    // ✅ enforce lock after import
    const { changed, note } = enforceMaintenanceLock();
    if (changed && note) showToast(`Import OK. ${note} Pense à enregistrer.`, "info");
    else showToast("Maintenance importée. Pense à enregistrer.", "ok");

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

function impactedByMaintenanceLock(targetIds: string[]) {
  const impacted: Array<{ id: string; label: string }> = [];

  for (const tid of targetIds) {
    const c = findContractByVariantId(tid);
    if (!c) continue;

    if (isChargeClient(c?.maintenance)) {
      const v = findVariantById(tid);
      const label = v?.title ?? v?.name ?? String(tid).slice(0, 8);
      impacted.push({ id: tid, label });
    }
  }

  return impacted;
}

async function generalizeTo(variantIds: string[]) {
  const sourceId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceId) return;

  // ✅ safety: enforce before build payload
  enforceMaintenanceLock();
  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const targetIdRaw of variantIds ?? []) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceId) continue;

      await (store as any).updateVariant(targetId, { maintenance: payload });
    }
    showToast("Section Maintenance généralisée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value ?? e?.message ?? e), "err");
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = (payload?.variantIds ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (!ids.length) return;

  const impacted = impactedByMaintenanceLock(ids);
  let warn = "";
  if (impacted.length) {
    const list = impacted
      .slice(0, 8)
      .map((x) => `• ${x.label} → Maintenance forcée à 0`)
      .join("\n");
    warn =
      `\n\n⚠️ Contrats: ${impacted.length} variante(s) recevront la Maintenance à 0 (charge client):\n` +
      list +
      (impacted.length > 8 ? `\n… (+${impacted.length - 8} autres)` : "");
  }

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Maintenance sur TOUTES les variantes ?" + warn
      : `Confirmer la généralisation de la section Maintenance sur ${ids.length} variante(s) ?` + warn;

  openConfirm("Généraliser Maintenance", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}

/* =========================
   INPUT HANDLERS
========================= */
function setEdit(key: keyof MaintenanceEdit, value: any) {
  if (lockMaintenance.value) return;
  (edit as any)[key] = clamp(value, 0, 1e12);
}
</script>

<template>
  <div class="page">
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttl">Maintenance</div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="!variant || saving || impBusy || genBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="!variant" @click="hideZeros = !hideZeros" :class="{ on: hideZeros }">
            <span class="dot" aria-hidden="true"></span>
            {{ hideZeros ? "Afficher tout" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="!variant || saving || impBusy || genBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <!-- ✅ lock info -->
      <div v-if="variant && lockMaintenance" class="alert lock">
        <LockClosedIcon class="aic" />
        <div><b>Contrat :</b> Maintenance forcée à <b>0</b> (charge client).</div>
      </div>

      <div class="kpis" v-if="variant">
        <div class="kpi kpiTint">
          <div class="kLbl">
            <CalendarDaysIcon class="ic" />
            / mois
          </div>
          <div class="kVal num">
            {{ n(mensuelTotal, 2) }} <span>DH/mois</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal num">{{ money(total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal num">{{ n(parM3, 2) }} <span>DH/m³</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">% CA</div>
          <div class="kVal num">{{ n(pctCa, 2) }} <span>%</span></div>
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
      <div class="card pad0">
        <div class="tableWrap">
          <table class="table">
            <colgroup>
              <col class="colLabel" />
              <col class="colMensuel" />
              <col class="colTotal" />
              <col class="colM3" />
              <col class="colPct" />
            </colgroup>

            <thead>
              <tr>
                <th class="th thL">Poste</th>
                <th class="th r">DH/mois</th>
                <th class="th r">Total</th>
                <th class="th r">DH/m³</th>
                <th class="th r">% CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="ln in visibleLines" :key="String(ln.key)">
                <td class="labelCell">
                  <div class="lblWrap">
                    <span class="designationText">{{ ln.label }}</span>
                    <span v-if="ln.locked" class="lockTag" title="Forcé à 0 par le contrat">
                      <LockClosedIcon class="lk" />
                      Contrat
                    </span>
                  </div>
                </td>

                <td class="r">
                  <div class="inCell">
                    <input
                      class="inputLg num"
                      type="number"
                      step="0.01"
                      min="0"
                      :disabled="ln.locked"
                      :title="ln.locked ? 'Forcé à 0 par le contrat' : ''"
                      :value="(edit as any)[ln.key]"
                      @input="setEdit(ln.key, ($event.target as HTMLInputElement).value)"
                    />
                    <span class="unit unitEdit">DH</span>
                  </div>
                </td>

                <td class="r val num">{{ money(ln.total, 2) }}</td>
                <td class="r val num">{{ n(ln.parM3, 2) }}</td>
                <td class="r val num">{{ n(ln.pctCa, 2) }}%</td>
              </tr>

              <tr>
                <td class="val">Total</td>
                <td class="r val num">{{ n(mensuelTotal, 2) }} <span class="unit">DH</span></td>
                <td class="r val num">{{ money(total, 2) }}</td>
                <td class="r val num">{{ n(parM3, 2) }}</td>
                <td class="r val num">{{ n(pctCa, 2) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot tiny muted">
          <InformationCircleIcon class="ic" style="vertical-align: -3px; margin-right: 6px" />
          Montants en <b>DH/mois</b> • Durée : <b>{{ dureeMois }}</b> mois • % calculé sur CA (CMP + Transport + MOMD).
        </div>
      </div>
    </template>

    <SectionImportModal v-model="impOpen" sectionLabel="Maintenance" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />

    <SectionTargetsGeneralizeModal v-model="genOpen" sectionLabel="Maintenance" :sourceVariantId="variant?.id ?? null" @apply="onApplyGeneralize" />

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
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.muted {
  color: rgba(15, 23, 42, 0.55);
}
.tiny {
  font-size: 10.5px;
}
* {
  box-sizing: border-box;
}

/* ✅ chiffres en police NORMALE (pas monospace), mais tabulaires */
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
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.left {
  display: flex;
  align-items: center;
  min-width: 220px;
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
.btn.pri:hover {
  background: rgba(2, 132, 199, 0.18);
}
.ic {
  width: 16px;
  height: 16px;
}

/* masque 0 */
.btn.on {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
.alert.lock {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
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
.card.pad0 {
  padding: 0;
}
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

/* table */
.tableWrap {
  overflow: hidden;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}

.colLabel {
  width: 34%;
}
.colMensuel {
  width: 20%;
}
.colTotal {
  width: 18%;
}
.colM3 {
  width: 14%;
}
.colPct {
  width: 14%;
}

.th,
.table td {
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  padding: 10px 10px;
  vertical-align: middle;
  overflow: hidden;
}
.th {
  background: #fafafa;
  color: rgba(15, 23, 42, 0.6);
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}
.thL {
  text-align: left;
}
.r {
  text-align: right;
}

.val {
  font-size: 12px;
  font-weight: 950;
}

.lblWrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.designationText {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #0f172a;
  font-size: 12.5px;
  font-weight: 950;
}

.lockTag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.95);
  background: rgba(2, 132, 199, 0.08);
  border: 1px solid rgba(2, 132, 199, 0.18);
  padding: 2px 8px;
  border-radius: 999px;
}
.lk {
  width: 14px;
  height: 14px;
}

.inCell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

/* Inputs */
.inputLg {
  border: 1px solid rgba(2, 132, 199, 0.25);
  border-radius: 12px;
  font-size: 12.5px;
  padding: 8px 10px;
  width: 100%;
  max-width: 150px;
  background: rgba(2, 132, 199, 0.08);
  font-weight: 950;
  outline: none;
  color: #0f172a;
  text-align: right;
}
.inputLg:focus {
  border-color: rgba(2, 132, 199, 0.7);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
  background: #fff;
}
.inputLg:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: rgba(15, 23, 42, 0.04);
  border-color: rgba(16, 24, 40, 0.1);
}

.unit {
  color: rgba(15, 23, 42, 0.55);
  font-size: 11px;
  min-width: 28px;
  text-align: right;
  font-weight: 950;
}
.unitEdit {
  color: rgba(2, 132, 199, 0.95);
}

.foot {
  padding: 8px 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.06);
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
  white-space: pre-wrap;
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
