<!-- ✅ src/pages/CoutMensuelPage.vue (FICHIER COMPLET / compact + sticky subheader + KPIs + toast + generalize + ✅ masquer 0) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";

// Heroicons
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
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
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => clamp(contract.value?.dureeMois));

const variantLabel = computed(() => {
  const v = variant.value;
  if (!v) return "—";
  return v.title ?? v.name ?? v.id?.slice?.(0, 8) ?? "Variante";
});

/* =========================
   VOLUME + CA (for %)
   (on garde la logique pour pct, mais pas d'affichage KPI Volume/CA)
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

function loadFromVariant() {
  const s: any = (variant.value as any)?.coutMensuel ?? {};
  draft.electricite = clamp(s.electricite);

  // ✅ on ne garde plus s.locationGroupes côté UI
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

  // ✅ legacy utilisé comme "Location groupes"
  draft.location = clamp(s.location);
}
watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

/* =========================
   KPI
========================= */
const monthly = computed(() => {
  return (
    clamp(draft.electricite) +
    // ✅ Location groupes = DB: location (legacy)
    clamp(draft.location) +
    clamp(draft.gasoil) +
    clamp(draft.hebergements) +
    clamp(draft.locationTerrain) +
    clamp(draft.telephone) +
    clamp(draft.troisG) +
    clamp(draft.taxeProfessionnelle) +
    clamp(draft.securite) +
    clamp(draft.locationVehicule) +
    clamp(draft.locationAmbulance) +
    clamp(draft.locationBungalows) +
    clamp(draft.epi)
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
  return {
    category: existing.category ?? "COUTS_CHARGES",
    electricite: Number(clamp(draft.electricite)),
    // ✅ on force l'ancienne colonne DB `location` (legacy) comme "Location groupes"
    location: Number(clamp(draft.location)),
    gasoil: Number(clamp(draft.gasoil)),
    hebergements: Number(clamp(draft.hebergements)),
    locationTerrain: Number(clamp(draft.locationTerrain)),
    telephone: Number(clamp(draft.telephone)),
    troisG: Number(clamp(draft.troisG)),
    taxeProfessionnelle: Number(clamp(draft.taxeProfessionnelle)),
    securite: Number(clamp(draft.securite)),
    locationVehicule: Number(clamp(draft.locationVehicule)),
    locationAmbulance: Number(clamp(draft.locationAmbulance)),
    locationBungalows: Number(clamp(draft.locationBungalows)),
    epi: Number(clamp(draft.epi)),
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
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Coûts mensuels sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Coûts mensuels sur ${ids.length} variante(s) ?`;

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
          <!-- ✅ bouton Masquer 0 -->
          <button class="btn" :disabled="!variant || saving" @click="hideZeros = !hideZeros">
            {{ hideZeros ? "Afficher 0" : "Masquer 0" }}
          </button>

          <button class="btn" :disabled="!variant || saving" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <button class="btn" :disabled="!variant || saving || genBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="!variant || saving" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <!-- ✅ KPIs (sans Volume total + CA estimé) -->
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

        <!-- ✅ compact grid -->
        <div class="grid6">
          <div class="field" v-if="!hideZeros || !isZero(draft.electricite)">
            <div class="label">Électricité</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.electricite" />
              <span class="u">DH</span>
            </div>
          </div>

          <!-- ✅ Location groupes = DB legacy: location -->
          <div class="field" v-if="!hideZeros || !isZero(draft.location)">
            <div class="label">Location groupes</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.location" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.gasoil)">
            <div class="label">Gasoil</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.gasoil" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.hebergements)">
            <div class="label">Hébergements</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.hebergements" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.locationTerrain)">
            <div class="label">Location terrain</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationTerrain" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.telephone)">
            <div class="label">Téléphone</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.telephone" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.troisG)">
            <div class="label">3G</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.troisG" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.taxeProfessionnelle)">
            <div class="label">Taxe prof.</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.taxeProfessionnelle" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.securite)">
            <div class="label">Sécurité</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.securite" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.locationVehicule)">
            <div class="label">Loc. véhicule</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationVehicule" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.locationAmbulance)">
            <div class="label">Loc. ambulance</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationAmbulance" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.locationBungalows)">
            <div class="label">Loc. bungalows</div>
            <div class="inCell">
              <input class="in mono" type="number" step="0.01" min="0" v-model.number="draft.locationBungalows" />
              <span class="u">DH</span>
            </div>
          </div>

          <div class="field" v-if="!hideZeros || !isZero(draft.epi)">
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
/* ✅ more compact overall */
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
  height: 32px; /* ✅ compact */
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

/* ✅ KPIs compact */
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
  padding: 8px 10px; /* ✅ compact */
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

/* alerts compact */
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

/* card compact */
.card {
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: #fff;
  overflow: hidden;
}
.cardHdr {
  padding: 8px 10px; /* ✅ compact */
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

/* ✅ dense fields grid */
.grid6 {
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(6, minmax(170px, 1fr));
  gap: 8px;
}
@media (max-width: 1400px) {
  .grid6 {
    grid-template-columns: repeat(3, minmax(200px, 1fr));
  }
}
@media (max-width: 980px) {
  .grid6 {
    grid-template-columns: 1fr;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.label {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.65);
}
.inCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ✅ smaller inputs */
.in {
  width: 120px;
  height: 30px;
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
.u {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(2, 132, 199, 0.9);
  white-space: nowrap;
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
