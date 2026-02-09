<!-- src/pages/CoutMensuelPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
});

/* helpers */
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
function clamp(v: any, min = 0, max = 1e15) {
  const x = toNum(v);
  return Math.max(min, Math.min(max, x));
}

/* active */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => clamp(contract.value?.dureeMois));

/* volume + CA (for %) */
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
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find(
    (x: any) => String(x.mpId) === String(mpId)
  );
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

/* draft mensuel */
type Draft = {
  electricite: number;
  locationGroupes: number;
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

  // legacy
  location: number;
};

const draft = reactive<Draft>({
  electricite: 0,
  locationGroupes: 0,
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
  draft.locationGroupes = clamp(s.locationGroupes);
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
  draft.location = clamp(s.location); // legacy
}
watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

/* KPI mensuel */
const monthly = computed(() => {
  return (
    clamp(draft.electricite) +
    clamp(draft.locationGroupes) +
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
    clamp(draft.epi) +
    clamp(draft.location)
  );
});

const total = computed(() => monthly.value * clamp(dureeMois.value));
const perM3 = computed(() => (volumeTotal.value > 0 ? total.value / volumeTotal.value : 0));
const pct = computed(() => (caTotal.value > 0 ? (total.value / caTotal.value) * 100 : 0));

/* modal */
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

/* save/reset */
const saving = ref(false);
const err = ref<string | null>(null);

function buildPayload() {
  const existing: any = (variant.value as any)?.coutMensuel ?? {};
  return {
    category: existing.category ?? "COUTS_CHARGES",
    electricite: Number(clamp(draft.electricite)),
    locationGroupes: Number(clamp(draft.locationGroupes)),
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
    location: Number(clamp(draft.location)), // legacy
  };
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { coutMensuel: buildPayload() });
    openInfo("Enregistré", "Coûts mensuels mis à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadFromVariant();
  });
}

/* =========================
   ✅ GENERALISER (AJOUT UNIQUEMENT)
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
    openInfo("Généralisé", "La section Coûts mensuels a été généralisée sur les variantes ciblées.");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
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
    <div class="top">
      <div class="title">
        <div class="h1">Coûts mensuels</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> — Durée {{ dureeMois }} mois</span>
        </div>
        <div class="muted" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>

        <!-- ✅ AJOUT: bouton Généraliser -->
        <button class="btn" :disabled="!variant || saving || genBusy" @click="genOpen = true">
          {{ genBusy ? "..." : "Généraliser" }}
        </button>

        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="panel">Chargement…</div>
    <div v-else-if="(store as any).error" class="panel error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <!-- ✅ AJOUT: feedback généralisation -->
      <div v-if="genErr" class="panel error"><b>Généralisation :</b> {{ genErr }}</div>
      <div v-if="genBusy" class="panel"><b>Généralisation :</b> traitement…</div>

      <div v-if="!variant" class="panel"><div class="muted">Sélectionne une variante.</div></div>

      <template v-else>
        <!-- ✅ KPIs : "/ mois" spécial comme Maintenance -->
        <div class="kpis">
          <div class="kpi">
            <div class="kLbl">Prix / m³</div>
            <div class="kVal mono">{{ n(perM3, 2) }} <span>DH/m³</span></div>
          </div>

          <div class="kpi">
            <div class="kLbl">Total</div>
            <div class="kVal mono">{{ money(total, 2) }}</div>
          </div>

          <!-- ✅ spécial -->
          <div class="kpi kpiMonth">
            <div class="kLbl">/ mois</div>
            <div class="kVal mono">{{ money(monthly, 2) }} <span>DH/mois</span></div>
          </div>

          <div class="kpi">
            <div class="kLbl">%</div>
            <div class="kVal mono">{{ n(pct, 2) }} <span>%</span></div>
          </div>
        </div>

        <div class="panel">
          <!-- ✅ Inputs style Maintenance : label + champ alignés + champ pas trop large + aligné à gauche -->
          <div class="grid4">
            <div class="field">
              <div class="label">Électricité</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.electricite" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Location groupes</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.locationGroupes" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Gasoil</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.gasoil" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Hébergements</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.hebergements" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Location terrain</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.locationTerrain" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Téléphone</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.telephone" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">3G</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.troisG" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Taxe prof.</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.taxeProfessionnelle" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Sécurité</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.securite" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Loc. véhicule</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.locationVehicule" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Loc. ambulance</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.locationAmbulance" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">Loc. bungalows</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.locationBungalows" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label">EPI</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.epi" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>

            <div class="field">
              <div class="label muted">DB: location (legacy)</div>
              <div class="inCell">
                <input class="inputSm inputMonth" type="number" step="0.01" min="0" v-model.number="draft.location" />
                <span class="unit unitMonth">DH</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ✅ AJOUT: MODAL GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Coûts mensuels"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />

    <!-- MODAL -->
    <div v-if="modal.open" class="modalMask" @click.self="closeModal()">
      <div class="modal">
        <div class="modalTitle">{{ modal.title }}</div>
        <div class="modalMsg">{{ modal.message }}</div>
        <div class="modalActions">
          <button class="btn" @click="closeModal()">Fermer</button>
          <button v-if="modal.mode === 'confirm'" class="btn primary" @click="modal.onConfirm && modal.onConfirm()">
            Confirmer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.h1 {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.1;
  margin: 0;
}
.muted {
  color: #6b7280;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
}
.panel.error {
  border-color: #ef4444;
  background: #fff5f5;
}
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 13px;
  cursor: pointer;
}
.btn:hover {
  background: #f9fafb;
}
.btn.primary {
  background: #007a33;
  border-color: #007a33;
  color: #fff;
}
.btn.primary:hover {
  background: #046a2f;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 8px;
}
@media (max-width: 1050px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}
.kpi {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
}
.kLbl {
  font-size: 11px;
  color: #6b7280;
}
.kVal {
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}
.kVal span {
  font-weight: 700;
  color: #6b7280;
  margin-left: 6px;
}
.mono {
  font-variant-numeric: tabular-nums;
}

/* ✅ KPI /mois spécial exactement comme Maintenance */
.kpiMonth {
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.9);
}
.kpiMonth .kLbl {
  color: #1d4ed8;
  font-weight: 900;
}
.kpiMonth .kVal span {
  color: #1d4ed8;
  font-weight: 900;
}

/* Inputs (style Maintenance) */
.grid4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 10px;
}
@media (max-width: 980px) {
  .grid4 {
    grid-template-columns: 1fr;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-size: 11px;
  color: #6b7280;
}

/* ✅ même pattern que Maintenance : input + unité alignés, input pas large */
.inCell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
}
.inputSm {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 12px;
  padding: 5px 7px;
  width: 110px;
  text-align: right;
}
.unit {
  color: #6b7280;
  font-size: 11px;
  min-width: 20px;
  text-align: left;
}

/* ✅ champs /mois distingués (comme Maintenance) */
.inputMonth {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.8);
}
.inputMonth:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}
.unitMonth {
  color: #1d4ed8;
  font-weight: 900;
}

/* modal */
.modalMask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}
.modalTitle {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 6px;
}
.modalMsg {
  color: #374151;
  font-size: 13px;
  white-space: pre-wrap;
}
.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
