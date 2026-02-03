<!-- src/pages/CoutEmployesPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0) await (store as any).loadPnls();
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

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => toNum(contract.value?.dureeMois));

/* =========================
   DRAFT (Employés)
========================= */
type Draft = {
  responsableNb: number;
  responsableCout: number;

  centralistesNb: number;
  centralistesCout: number;

  manoeuvreNb: number;
  manoeuvreCout: number;

  coordinateurExploitationNb: number;
  coordinateurExploitationCout: number;

  technicienLaboNb: number;
  technicienLaboCout: number;

  femmeMenageNb: number;
  femmeMenageCout: number;

  gardienNb: number;
  gardienCout: number;

  maintenancierNb: number;
  maintenancierCout: number;

  panierRepasNb: number;
  panierRepasCout: number;
};

const draft = reactive<Draft>({
  responsableNb: 0,
  responsableCout: 0,

  centralistesNb: 0,
  centralistesCout: 0,

  manoeuvreNb: 0,
  manoeuvreCout: 0,

  coordinateurExploitationNb: 0,
  coordinateurExploitationCout: 0,

  technicienLaboNb: 0,
  technicienLaboCout: 0,

  femmeMenageNb: 0,
  femmeMenageCout: 0,

  gardienNb: 0,
  gardienCout: 0,

  maintenancierNb: 0,
  maintenancierCout: 0,

  panierRepasNb: 0,
  panierRepasCout: 0,
});

const GROUPS = [
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

function loadFromVariant() {
  const s: any = (variant.value as any)?.employes ?? {};

  for (const g of GROUPS) {
    (draft as any)[`${g.key}Nb`] = clamp(s?.[`${g.key}Nb`], 0, 1e12);
    (draft as any)[`${g.key}Cout`] = clamp(s?.[`${g.key}Cout`], 0, 1e12);
  }
}

watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

/* =========================
   KPIs
========================= */
// ✅ total mensuel = somme(nb * cout) pour chaque poste
const mensuelTotal = computed(() => {
  return GROUPS.reduce((sum, g) => {
    const nb = toNum((draft as any)[`${g.key}Nb`]);
    const cout = toNum((draft as any)[`${g.key}Cout`]);
    return sum + nb * cout;
  }, 0);
});

const total = computed(() => mensuelTotal.value * dureeMois.value);

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
  const existing: any = (variant.value as any)?.employes ?? {};
  const payload: any = { category: existing?.category ?? "COUTS_CHARGES" };

  for (const g of GROUPS) {
    payload[`${g.key}Nb`] = Number(toNum((draft as any)[`${g.key}Nb`]));
    payload[`${g.key}Cout`] = Number(toNum((draft as any)[`${g.key}Cout`]));
  }
  return payload;
}

async function save() {
  if (!variant.value) return;
  err.value = null;
  saving.value = true;

  try {
    await (store as any).updateVariant(variant.value.id, { employes: buildPayload() });
    openInfo("Enregistré", "La section Coût employés a été mise à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
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
  });
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Coût employés</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> — Durée {{ n(dureeMois, 0) }} mois</span>
        </div>
        <div class="muted" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>
        <button class="btn primary" :disabled="!variant || saving" @click="askSave()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="panel">Chargement…</div>
    <div v-else-if="(store as any).error" class="panel error">
      <b>Erreur :</b> {{ (store as any).error }}
    </div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="panel">
        <div class="muted">Sélectionne une variante puis reviens ici.</div>
      </div>

      <template v-else>
        <!-- ✅ KPI TOP -->
        <div class="kpis">
          <div class="kpi">
            <div class="kLbl">Mensuel</div>
            <div class="kVal">{{ money(mensuelTotal) }}</div>
          </div>

          <div class="kpi">
            <div class="kLbl">Durée</div>
            <div class="kVal">{{ n(dureeMois, 0) }} <span>mois</span></div>
          </div>

          <div class="kpi">
            <div class="kLbl">Total</div>
            <div class="kVal">{{ money(total) }}</div>
          </div>
        </div>

        <!-- ✅ TABLE/GRID -->
        <div class="panel">
          <div class="grid">
            <template v-for="g in GROUPS" :key="g.key">
              <div class="card">
                <div class="cardHead">
                  <b class="cardTitle">{{ g.label }}</b>
                  <span class="cardMini">
                    Mensuel :
                    <b>{{ money(toNum((draft as any)[`${g.key}Nb`]) * toNum((draft as any)[`${g.key}Cout`])) }}</b>
                  </span>
                </div>

                <div class="row2">
                  <div class="field">
                    <div class="label">Nb</div>
                    <input class="input r" type="number" step="0.1" min="0" v-model.number="(draft as any)[`${g.key}Nb`]" />
                  </div>

                  <div class="field">
                    <div class="label">Coût / pers / mois</div>
                    <input class="input r" type="number" step="0.01" min="0" v-model.number="(draft as any)[`${g.key}Cout`]" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </template>

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
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }

/* top */
.top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.title { display:flex; flex-direction:column; gap:2px; }
.h1 { font-size:16px; font-weight:800; line-height:1.1; margin:0; }
.muted { color:#6b7280; font-size:12px; }
.actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px; }
.panel.error { border-color:#ef4444; background:#fff5f5; }

.btn {
  border:1px solid #d1d5db;
  background:#fff;
  border-radius:10px;
  padding:7px 10px;
  font-size:13px;
  cursor:pointer;
}
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { background:#046a2f; }
.btn:disabled { opacity:.6; cursor:not-allowed; }

.kpis{
  display:grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap:8px;
}
@media (max-width: 900px){
  .kpis{ grid-template-columns: 1fr; }
}

.kpi{
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:8px 10px;
  display:flex;
  flex-direction:column;
  gap:4px;
}
.kLbl{ font-size:11px; color:#6b7280; }
.kVal{ font-size:13px; font-weight:900; white-space:nowrap; }
.kVal span{ font-weight:700; color:#6b7280; margin-left:6px; }

/* cards */
.grid{
  display:grid;
  grid-template-columns: repeat(3, minmax(240px, 1fr));
  gap:10px;
}
@media (max-width: 1200px){
  .grid{ grid-template-columns: repeat(2, minmax(240px, 1fr)); }
}
@media (max-width: 750px){
  .grid{ grid-template-columns: 1fr; }
}

.card{
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:10px;
  background:#fcfcfd;
}

.cardHead{
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:baseline;
  margin-bottom:8px;
}
.cardTitle{ font-size:13px; }
.cardMini{ font-size:11px; color:#6b7280; white-space:nowrap; }

.row2{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:10px;
}

.field{ display:flex; flex-direction:column; gap:6px; }
.label{ font-size:11px; color:#6b7280; }
.r{ text-align:right; }

.input{
  border:1px solid #d1d5db;
  border-radius:10px;
  font-size:13px;
  padding:7px 9px;
  width:100%;
}

/* modal */
.modalMask {
  position:fixed; inset:0;
  background:rgba(0,0,0,.35);
  display:flex; align-items:center; justify-content:center;
  padding:16px;
  z-index: 50;
}
.modal {
  width:min(520px, 100%);
  background:#fff;
  border:1px solid #e5e7eb;
  border-radius:16px;
  padding:14px;
  box-shadow: 0 10px 30px rgba(0,0,0,.15);
}
.modalTitle { font-weight:900; font-size:14px; margin-bottom:6px; }
.modalMsg { color:#374151; font-size:13px; white-space:pre-wrap; }
.modalActions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
</style>
