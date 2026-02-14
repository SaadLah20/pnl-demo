<!-- ✅ src/pages/CoutMensuelPage.vue (FICHIER COMPLET / compact + sticky subheader + KPIs + toast + generalize + ✅ masquer 0 + ✅ importer + ✅ règles contrat (force 0 + lock)) -->
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
const dureeMois = computed(() => clamp(contract.value?.dureeMois));

const variantLabel = computed(() => {
  const v = variant.value;
  if (!v) return "—";
  return v.title ?? v.name ?? v.id?.slice?.(0, 8) ?? "Variante";
});

/* =========================
   ✅ CONTRAT → LOCK FLAGS
   - consoElec à charge client => electricite + locationGroupes (legacy: location) forcés à 0
   - terrain à charge client => locationTerrain forcé à 0
========================= */
const lockElecAndGroups = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  return isChargeClient(c?.consoElec);
});
const lockTerrain = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  return isChargeClient(c?.terrain);
});

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
  locationAmbulance: number;
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
  locationAmbulance: 0,
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
  draft.locationAmbulance = clamp(s.locationAmbulance);
  draft.locationBungalows = clamp(s.locationBungalows);
  draft.epi = clamp(s.epi);
  draft.location = clamp(s.location); // legacy: "Location groupes"
}

/** ✅ enforce contract rules on draft (immediate KPI correctness) */
function enforceContractLocksOnDraft(): { changed: boolean; notes: string[] } {
  let changed = false;
  const notes: string[] = [];

  if (lockElecAndGroups.value) {
    if (clamp(draft.electricite) !== 0) {
      draft.electricite = 0;
      changed = true;
    }
    if (clamp(draft.location) !== 0) {
      draft.location = 0;
      changed = true;
    }
    if (changed) notes.push("Électricité + Location groupes forcées à 0 (charge client).");
  }

  if (lockTerrain.value) {
    if (clamp(draft.locationTerrain) !== 0) {
      draft.locationTerrain = 0;
      changed = true;
      notes.push("Location terrain forcée à 0 (charge client).");
    }
  }

  return { changed, notes };
}

function loadFromVariant() {
  applyFromVariant(variant.value);
  enforceContractLocksOnDraft();
}

watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });
watch(
  () => [lockElecAndGroups.value, lockTerrain.value],
  () => {
    // si contrat change, on force immédiatement le draft à 0
    enforceContractLocksOnDraft();
  },
  { immediate: true }
);

/* =========================
   ✅ EFFECTIVE VALUES (for KPI + save)
========================= */
const effective = computed(() => {
  return {
    electricite: lockElecAndGroups.value ? 0 : clamp(draft.electricite),
    location: lockElecAndGroups.value ? 0 : clamp(draft.location), // location groupes
    locationTerrain: lockTerrain.value ? 0 : clamp(draft.locationTerrain),

    gasoil: clamp(draft.gasoil),
    hebergements: clamp(draft.hebergements),
    telephone: clamp(draft.telephone),
    troisG: clamp(draft.troisG),
    taxeProfessionnelle: clamp(draft.taxeProfessionnelle),
    securite: clamp(draft.securite),
    locationVehicule: clamp(draft.locationVehicule),
    locationAmbulance: clamp(draft.locationAmbulance),
    locationBungalows: clamp(draft.locationBungalows),
    epi: clamp(draft.epi),
  };
});

/* =========================
   KPI
========================= */
const monthly = computed(() => {
  const e = effective.value;
  return (
    e.electricite +
    e.location +
    e.gasoil +
    e.hebergements +
    e.locationTerrain +
    e.telephone +
    e.troisG +
    e.taxeProfessionnelle +
    e.securite +
    e.locationVehicule +
    e.locationAmbulance +
    e.locationBungalows +
    e.epi
  );
});
const total = computed(() => monthly.value * clamp(dureeMois.value));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

/* =========================
   ✅ MASQUER 0 (UI uniquement)
========================= */
const hideZeros = ref(false);

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

    applyFromVariant(src2);
    const { changed, notes } = enforceContractLocksOnDraft();

    if (changed) showToast(`Import OK. Ajustements contrat: ${notes.join(" ")}`, "ok");
    else showToast("Coûts mensuels importés. Pense à enregistrer.", "ok");

    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   TOAST (non bloquant)
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
    locationAmbulance: Number(e.locationAmbulance),
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
</script>

<template>
  <div class="page">
    <!-- ✅ Sticky subheader -->
    <div class="subhdr">
      <div class="row">
        <div class="left">
          <div class="ttlRow">
            <div class="ttl">Coûts mensuels</div>
            <span v-if="variant" class="badge">Variante active</span>
          </div>

          <div class="meta" v-if="variant">
            <span class="clip"><b>{{ variantLabel }}</b></span>
            <span class="sep" v-if="dureeMois">•</span>
            <span v-if="dureeMois">Durée <b>{{ n(dureeMois, 0) }}</b> mois</span>
          </div>
          <div class="meta" v-else>Aucune variante active.</div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="!variant || saving || genBusy || impBusy" @click="hideZeros = !hideZeros">
            {{ hideZeros ? "Afficher 0" : "Masquer 0" }}
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

      <!-- ✅ Contract locks info -->
      <div v-if="variant && (lockElecAndGroups || lockTerrain)" class="lockInfo">
        <LockClosedIcon class="lic" />
        <div class="ltext">
          <b>Contrat :</b>
          <span v-if="lockElecAndGroups"> Électricité + Location groupes figées à 0 (charge client).</span>
          <span v-if="lockTerrain"> Location terrain figée à 0 (charge client).</span>
        </div>
      </div>

      <!-- ✅ KPIs -->
      <div class="kpis" v-if="variant">
        <div class="kpi main">
          <div class="kLbl">
            <CalendarDaysIcon class="ic2" />
            / mois
          </div>
          <div class="kVal mono">
            {{ money(monthly, 2) }}
            <span class="unit">DH/mois</span>
          </div>
        </div>

        <div class="kpi">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(total, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">Prix / m³</div>
          <div class="kVal mono">{{ n(perM3, 2) }} <span class="unit">DH/m³</span></div>
        </div>

        <div class="kpi">
          <div class="kLbl">%</div>
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
        <div class="cardHdr">
          <div class="cardTtl">
            <CalendarDaysIcon class="ic3" />
            <div>
              <div class="h">Saisie des coûts mensuels</div>
              <div class="p">Montants exprimés en DH/mois.</div>
            </div>
          </div>
        </div>

        <div class="gridDense">
          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.electricite)">
            <div class="label">
              Électricité
              <span v-if="lockElecAndGroups" class="lockTag"><LockClosedIcon class="lk" /> Contrat</span>
            </div>
            <div class="inCell">
              <input
                class="in mono"
                type="number"
                step="0.01"
                min="0"
                v-model.number="draft.electricite"
                :disabled="lockElecAndGroups"
              />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.location)">
            <div class="label">
              Location groupes
              <span v-if="lockElecAndGroups" class="lockTag"><LockClosedIcon class="lk" /> Contrat</span>
            </div>
            <div class="inCell">
              <input
                class="in mono"
                type="number"
                step="0.01"
                min="0"
                v-model.number="draft.location"
                :disabled="lockElecAndGroups"
              />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.gasoil)">
            <div class="label">Gasoil</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.gasoil" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.hebergements)">
            <div class="label">Hébergements</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.hebergements" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.locationTerrain)">
            <div class="label">
              Location terrain
              <span v-if="lockTerrain" class="lockTag"><LockClosedIcon class="lk" /> Contrat</span>
            </div>
            <div class="inCell">
              <input
                class="in mono"
                type="number"
                step="0.01"
                min="0"
                v-model.number="draft.locationTerrain"
                :disabled="lockTerrain"
              />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.telephone)">
            <div class="label">Téléphone</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.telephone" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.troisG)">
            <div class="label">3G</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.troisG" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.taxeProfessionnelle)">
            <div class="label">Taxe prof.</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.taxeProfessionnelle" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.securite)">
            <div class="label">Sécurité</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.securite" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.locationVehicule)">
            <div class="label">Loc. véhicule</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationVehicule" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.locationAmbulance)">
            <div class="label">Loc. ambulance</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationAmbulance" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.locationBungalows)">
            <div class="label">Loc. bungalows</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationBungalows" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="fieldRow" v-if="!hideZeros || !isZero(effective.epi)">
            <div class="label">EPI</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.epi" />
              <span class="u">DH</span>
            </div>
          </div>
        </div>

        <div class="note">
          Total = (Somme mensuelle) × Durée • Prix/m³ = Total ÷ Volume total • % = Total ÷ CA estimé.
        </div>
      </div>
    </template>

    <!-- ✅ IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Coûts mensuels"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ Generalize Modal -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coûts mensuels"
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
.ic2 {
  width: 16px;
  height: 16px;
  opacity: 0.85;
  margin-right: 6px;
}
.ic3 {
  width: 18px;
  height: 18px;
  color: rgba(15, 23, 42, 0.75);
}

.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

/* ✅ lock info line */
.lockInfo {
  margin-top: 8px;
  border-radius: 14px;
  padding: 8px 10px;
  border: 1px solid rgba(2, 132, 199, 0.18);
  background: rgba(2, 132, 199, 0.06);
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.lic {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin-top: 1px;
}
.ltext {
  font-size: 11.5px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.75);
  line-height: 1.35;
}

/* KPIs */
.kpis {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 8px;
}
@media (max-width: 900px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(160px, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.kpi.main {
  border-color: rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.06);
}
.kLbl {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  display: inline-flex;
  align-items: center;
}
.kVal {
  font-size: 12.5px;
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
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
.cardHdr {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.cardTtl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.h {
  font-weight: 950;
  color: #0f172a;
  font-size: 13px;
}
.p {
  font-weight: 750;
  color: rgba(15, 23, 42, 0.55);
  font-size: 12px;
}

/* grid */
.gridDense {
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 8px;
}
.fieldRow {
  display: grid;
  grid-template-columns: 1fr 170px;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.012);
}
.fieldRow .label {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.68);
  line-height: 1.1;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.in {
  width: 100%;
  height: 28px;
  border-radius: 12px;
  border: 1px solid rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
  padding: 0 9px;
  font-weight: 950;
  color: #0f172a;
  outline: none;
  text-align: right;
}
.in:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.in:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: rgba(15, 23, 42, 0.04);
  border-color: rgba(16, 24, 40, 0.1);
}

.u {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
}

@media (max-width: 520px) {
  .fieldRow {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .inCell {
    justify-content: flex-start;
  }
  .in {
    max-width: 240px;
  }
}

.note {
  padding: 8px 10px;
  border-top: 1px dashed rgba(16, 24, 40, 0.14);
  font-size: 11.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.65);
}

.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
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
