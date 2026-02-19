<!-- ✅ src/pages/CoutMensuelPage.vue (FICHIER COMPLET)
     ✅ UI type Maintenance (1 ligne = 1 poste) + colonnes Total / m³ / %
     ✅ Masquer 0 auto
     ✅ Locks contrat (charge client) appliqués (+ Location chargeur)
     ✅ Modals au-dessus HeaderDashboard (z-index)
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
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  LockClosedIcon,
  InformationCircleIcon,
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
const dureeMois = computed(() => clamp(contract.value?.dureeMois, 0, 1e9));

/* =========================
   ✅ CONTRAT → LOCK FLAGS
   - consoElec à charge client => electricite + locationGroupes (legacy: location) forcés à 0
   - terrain à charge client => locationTerrain forcé à 0
   - chargeuse à charge client => locationChargeur forcé à 0
========================= */
const lockElecAndGroups = computed<boolean>(() => isChargeClient((contract.value ?? {})?.consoElec));
const lockTerrain = computed<boolean>(() => isChargeClient((contract.value ?? {})?.terrain));
const lockChargeur = computed<boolean>(() => isChargeClient((contract.value ?? {})?.chargeuse));

/* =========================
   VOLUME + CA (for %)
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
   DRAFT MENSUEL
========================= */
type Draft = {
  electricite: number;
  gasoil: number;
  hebergements: number;
  locationTerrain: number;
  telephone: number;
  troisG: number;
  taxeProfessionnelle: number;
  securite: number;
  locationVehicule: number;
  locationChargeur: number;
  locationBungalows: number;
  epi: number;
  // legacy (utilisé comme "Location groupes")
  location: number;
};

const draft = reactive<Draft>({
  electricite: 0,
  gasoil: 0,
  hebergements: 0,
  locationTerrain: 0,
  telephone: 0,
  troisG: 0,
  taxeProfessionnelle: 0,
  securite: 0,
  locationVehicule: 0,
  locationChargeur: 0,
  locationBungalows: 0,
  epi: 0,
  location: 0,
});

function applyFromVariant(v: any) {
  const s: any = (v as any)?.coutMensuel ?? {};
  draft.electricite = clamp(s.electricite);
  draft.gasoil = clamp(s.gasoil);
  draft.hebergements = clamp(s.hebergements);
  draft.locationTerrain = clamp(s.locationTerrain);
  draft.telephone = clamp(s.telephone);
  draft.troisG = clamp(s.troisG);
  draft.taxeProfessionnelle = clamp(s.taxeProfessionnelle);
  draft.securite = clamp(s.securite);
  draft.locationVehicule = clamp(s.locationVehicule);
  draft.locationChargeur = clamp(s.locationChargeur);
  draft.locationBungalows = clamp(s.locationBungalows);
  draft.epi = clamp(s.epi);
  draft.location = clamp(s.location); // legacy: "Location groupes"
}

/** ✅ enforce contract rules on draft (immediate KPI correctness) */
function enforceContractLocksOnDraft(): { changed: boolean; notes: string[] } {
  let changed = false;
  const notes: string[] = [];

  if (lockElecAndGroups.value) {
    let any = false;
    if (clamp(draft.electricite) !== 0) {
      draft.electricite = 0;
      changed = true;
      any = true;
    }
    if (clamp(draft.location) !== 0) {
      draft.location = 0;
      changed = true;
      any = true;
    }
    if (any) notes.push("Électricité + Location groupes forcées à 0 (charge client).");
  }

  if (lockTerrain.value) {
    if (clamp(draft.locationTerrain) !== 0) {
      draft.locationTerrain = 0;
      changed = true;
      notes.push("Location terrain forcée à 0 (charge client).");
    }
  }

  if (lockChargeur.value) {
    if (clamp(draft.locationChargeur) !== 0) {
      draft.locationChargeur = 0;
      changed = true;
      notes.push("Location chargeur forcée à 0 (charge client).");
    }
  }

  return { changed, notes };
}

/* =========================
   ✅ EFFECTIVE VALUES (for KPI + save + rows)
========================= */
const effective = computed(() => {
  return {
    electricite: lockElecAndGroups.value ? 0 : clamp(draft.electricite),
    location: lockElecAndGroups.value ? 0 : clamp(draft.location), // location groupes
    locationTerrain: lockTerrain.value ? 0 : clamp(draft.locationTerrain),
    locationChargeur: lockChargeur.value ? 0 : clamp(draft.locationChargeur),

    gasoil: clamp(draft.gasoil),
    hebergements: clamp(draft.hebergements),
    telephone: clamp(draft.telephone),
    troisG: clamp(draft.troisG),
    taxeProfessionnelle: clamp(draft.taxeProfessionnelle),
    securite: clamp(draft.securite),
    locationVehicule: clamp(draft.locationVehicule),
    locationBungalows: clamp(draft.locationBungalows),
    epi: clamp(draft.epi),
  };
});

function anyEffectiveNonZero(): boolean {
  const e: any = effective.value as any;
  const keys = Object.keys(e);
  for (const k of keys) if (!isZero(e[k])) return true;
  return false;
}

/* =========================
   ✅ MASQUER 0 (AUTO + USER OVERRIDE)
========================= */
const hideZeros = ref(false);
const hideZerosUserToggled = ref(false);

function syncHideZerosAuto() {
  const anyNZ = anyEffectiveNonZero();

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
   LOAD & AUTO (page access)
========================= */
function loadFromVariant() {
  applyFromVariant(variant.value);
  enforceContractLocksOnDraft();

  hideZerosUserToggled.value = false;
  syncHideZerosAuto();
}

watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

watch(
  () => [lockElecAndGroups.value, lockTerrain.value, lockChargeur.value],
  () => {
    enforceContractLocksOnDraft();
    syncHideZerosAuto();
  },
  { immediate: true }
);

watch(
  () => ({ ...effective.value }),
  () => syncHideZerosAuto()
);

/* =========================
   KPI (global)
========================= */
const monthly = computed(() => {
  const e: any = effective.value as any;
  return Object.keys(e).reduce((s, k) => s + clamp(e[k]), 0);
});
const total = computed(() => monthly.value * clamp(dureeMois.value));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

/* =========================
   LINES
========================= */
type LineKey = keyof Draft; // inclut "location" legacy
type Line = {
  key: LineKey;
  label: string;
  locked: boolean;
  mensuel: number;
  total: number;
  parM3: number;
  pctCa: number;
};

function mensuelForKey(key: LineKey): number {
  const e: any = effective.value as any;
  if (key === "location") return clamp(e.location);
  if (key === "electricite") return clamp(e.electricite);
  if (key === "locationTerrain") return clamp(e.locationTerrain);
  if (key === "locationChargeur") return clamp(e.locationChargeur);
  return clamp(e[key]);
}

const lines = computed<Line[]>(() => {
  const mk = (key: LineKey, label: string, locked = false): Line => {
    const mensuel = mensuelForKey(key);
    const total = mensuel * clamp(dureeMois.value);
    const parM3 = volumeTotal.value > 0 ? total / volumeTotal.value : 0;
    const pctCa = caTotal.value > 0 ? (total / caTotal.value) * 100 : 0;
    return { key, label, locked, mensuel, total, parM3, pctCa };
  };

  return [
    mk("electricite", "Électricité", lockElecAndGroups.value),
    mk("location", "Location groupes", lockElecAndGroups.value),
    mk("gasoil", "Gasoil"),
    mk("hebergements", "Hébergements"),
    mk("locationTerrain", "Location terrain", lockTerrain.value),
    mk("telephone", "Téléphone"),
    mk("troisG", "3G"),
    mk("taxeProfessionnelle", "Taxe professionnelle"),
    mk("securite", "Sécurité"),
    mk("locationVehicule", "Location véhicule"),
    mk("locationChargeur", "Location chargeur", lockChargeur.value),
    mk("locationBungalows", "Location bungalows"),
    mk("epi", "EPI"),
  ];
});

const visibleLines = computed(() => {
  const arr = lines.value ?? [];
  if (!hideZeros.value) return arr;

  // ✅ garder visibles les lignes verrouillées même à 0
  return arr.filter((ln) => !isZero(ln.mensuel) || ln.locked);
});

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
    const { changed, notes } = enforceContractLocksOnDraft();

    hideZerosUserToggled.value = false;
    syncHideZerosAuto();

    showToast(changed ? `Import OK. ${notes.join(" ")}` : "Coûts mensuels importés. Pense à enregistrer.", "ok");
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
  const existing: any = (variant.value as any)?.coutMensuel ?? {};
  const e = effective.value;

  return {
    category: existing.category ?? "COUTS_CHARGES",
    electricite: Number(e.electricite),
    location: Number(e.location), // legacy = Location groupes
    gasoil: Number(e.gasoil),
    hebergements: Number(e.hebergements),
    locationTerrain: Number(e.locationTerrain),
    telephone: Number(e.telephone),
    troisG: Number(e.troisG),
    taxeProfessionnelle: Number(e.taxeProfessionnelle),
    securite: Number(e.securite),
    locationVehicule: Number(e.locationVehicule),
    locationChargeur: Number(e.locationChargeur),
    locationBungalows: Number(e.locationBungalows),
    epi: Number(e.epi),
  };
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { coutMensuel: buildPayload() });
    showToast("Coûts mensuels enregistrés.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des coûts mensuels ?", async () => {
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
   GENERALISER (avec warning contrats)
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
    if (isChargeClient(c?.consoElec)) {
      if (toNum(payload?.electricite) !== 0) fields.push("Électricité");
      if (toNum(payload?.location) !== 0) fields.push("Location groupes");
    }
    if (isChargeClient(c?.terrain)) {
      if (toNum(payload?.locationTerrain) !== 0) fields.push("Location terrain");
    }
    if (isChargeClient(c?.chargeuse)) {
      if (toNum(payload?.locationChargeur) !== 0) fields.push("Location chargeur");
    }

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
      await (store as any).updateVariant(targetId, { coutMensuel: payload });
    }
    showToast("Section Coûts mensuels généralisée.", "ok");
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
      ? "Confirmer la généralisation de la section Coûts mensuels sur TOUTES les variantes ?" + warn
      : `Confirmer la généralisation de la section Coûts mensuels sur ${ids.length} variante(s) ?` + warn;

  openConfirm("Généraliser Coûts mensuels", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}

/* =========================
   INPUT HANDLERS
========================= */
function setDraft(key: LineKey, value: any) {
  const v = clamp(value, 0, 1e15);

  if (key === "electricite" && lockElecAndGroups.value) return;
  if (key === "location" && lockElecAndGroups.value) return;
  if (key === "locationTerrain" && lockTerrain.value) return;
  if (key === "locationChargeur" && lockChargeur.value) return;

  (draft as any)[key] = v;
}
</script>

<template>
  <div class="page">
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttl">Coûts mensuels</div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="toggleHideZeros()" :class="{ on: hideZeros }">
            <span class="dot" aria-hidden="true"></span>
            {{ hideZeros ? "Afficher tout" : "Masquer 0" }}
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

      <!-- ✅ lock info -->
      <div v-if="variant && (lockElecAndGroups || lockTerrain || lockChargeur)" class="alert lock">
        <LockClosedIcon class="aic" />
        <div>
          <b>Contrat :</b>
          <span v-if="lockElecAndGroups"> Électricité + Location groupes forcées à 0 (charge client).</span>
          <span v-if="lockTerrain"> Location terrain forcée à 0 (charge client).</span>
          <span v-if="lockChargeur"> Location chargeur forcée à 0 (charge client).</span>
        </div>
      </div>

      <!-- ✅ KPIs compacts -->
      <div class="kpis" v-if="variant">
        <div class="kpi kpiTint">
          <div class="kLbl"><CalendarDaysIcon class="ic" /> / mois</div>
          <div class="kVal num">{{ money(monthly, 2) }} <span>DH/mois</span></div>
        </div>

        <div class="kpi">
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
              <col class="colDesignation" />
              <col class="colIn" />
              <col class="colNumCa" />
              <col class="colNum" />
              <col class="colNum" />
            </colgroup>

            <thead>
              <tr>
                <th class="th thL">Poste</th>
                <th class="th thC">DH/mois</th>
                <th class="th r">Total</th>
                <th class="th r">DH/m³</th>
                <th class="th r">% CA</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="ln in visibleLines" :key="String(ln.key)">
                <td>
                  <div class="lblWrap">
                    <span class="designationText">{{ ln.label }}</span>
                    <span v-if="ln.locked" class="lockTag" title="Forcé à 0 par le contrat">
                      <LockClosedIcon class="lk" />
                      Contrat
                    </span>
                  </div>
                </td>

                <td class="thC">
                  <div class="inCell">
                    <input
                      class="inputLg num"
                      type="number"
                      step="0.01"
                      min="0"
                      :disabled="ln.locked"
                      :title="ln.locked ? 'Forcé à 0 par le contrat' : ''"
                      :value="(draft as any)[ln.key]"
                      @input="setDraft(ln.key, ($event.target as HTMLInputElement).value)"
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
                <td class="thC val num">{{ n(monthly, 2) }} <span class="unit">DH</span></td>
                <td class="r val num">{{ money(total, 2) }}</td>
                <td class="r val num">{{ n(perM3, 2) }}</td>
                <td class="r val num">{{ n(pct, 2) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="foot tiny muted">
          <InformationCircleIcon class="ic" style="vertical-align: -3px; margin-right: 6px" />
          Durée : <b class="num">{{ n(dureeMois, 0) }}</b> mois • Volume total :
          <b class="num">{{ n(volumeTotal, 2) }}</b> m³ • CA estimé :
          <b class="num">{{ money(caTotal, 2) }}</b>
        </div>
      </div>
    </template>

    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Coûts mensuels"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coûts mensuels"
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
      <div
        v-if="toastOpen"
        class="toast"
        :class="{ err: toastKind === 'err', info: toastKind === 'info' }"
        role="status"
        aria-live="polite"
      >
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

/* ✅ chiffres en police NORMALE + tabulaires */
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
.colDesignation {
  width: 30%;
}
.colIn {
  width: 22%;
}
.colNumCa {
  width: 24%;
}
.colNum {
  width: 12%;
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
.thC {
  text-align: center;
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
  justify-content: center;
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
</style>
