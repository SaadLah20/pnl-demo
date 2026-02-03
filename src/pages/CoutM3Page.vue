<!-- src/pages/CoutM3Page.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

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

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);

/* =========================
   DRAFT (coutM3)
========================= */
type Draft = { eau: number; qualite: number; dechets: number };
const draft = reactive<Draft>({ eau: 0, qualite: 0, dechets: 0 });

function loadDraftFromVariant() {
  const v: any = variant.value ?? {};
  draft.eau = clamp(v?.coutM3?.eau, 0, 1e12);
  draft.qualite = clamp(v?.coutM3?.qualite, 0, 1e12);
  draft.dechets = clamp(v?.coutM3?.dechets, 0, 1e12);
}

watch(
  () => variant.value?.id,
  () => loadDraftFromVariant(),
  { immediate: true }
);

/* =========================
   FORMULES (read-only calc)
   -> CA Total pour calculer %
========================= */
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
const transportPrixMoyen = computed(() => toNum((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (((variant.value as any)?.mp?.items ?? []) as any[]).find(
    (x: any) => String(x.mpId) === String(mpId)
  );
  if (!vmp) return 0;
  if (vmp?.prix != null) return toNum(vmp.prix);
  return toNum(vmp?.mp?.prix);
}

type CompRow = { mpId: string; qty: number; prix: number; coutParM3: number };
function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty); // kg/m³
    const prix = mpPriceUsed(mpId); // DH/tonne
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + toNum(vf?.volumeM3), 0)
);

const caTotal = computed(() => {
  const t = transportPrixMoyen.value;
  return formules.value.reduce((s: number, vf: any) => {
    const vol = toNum(vf?.volumeM3);
    const momd = toNum(vf?.momd);
    const pv = cmpParM3For(vf) + momd + t; // ✅ PV formule = CMP + Transport + MOMD
    return s + pv * vol;
  }, 0);
});

/* =========================
   KPIs (COUT AU M³)
========================= */
const coutM3ParM3 = computed(() => toNum(draft.eau) + toNum(draft.qualite) + toNum(draft.dechets));
const coutM3Total = computed(() => coutM3ParM3.value * volumeTotal.value);

const dureeMois = computed(() => toNum(contract.value?.dureeMois));
const coutM3ParMois = computed(() => (dureeMois.value > 0 ? coutM3Total.value / dureeMois.value : 0));

const coutM3Pct = computed(() => (caTotal.value > 0 ? (coutM3Total.value / caTotal.value) * 100 : 0));

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
  const existing: any = (variant.value as any)?.coutM3 ?? {};
  return {
    category: existing?.category ?? "COUTS_CHARGES",
    eau: Number(clamp(draft.eau, 0, 1e12)),
    qualite: Number(clamp(draft.qualite, 0, 1e12)),
    dechets: Number(clamp(draft.dechets, 0, 1e12)),
  };
}

async function save() {
  if (!variant.value) return;

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { coutM3: buildPayload() });
    openInfo("Enregistré", "Coût au m³ mis à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement du coût au m³ ?", async () => {
    closeModal();
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadDraftFromVariant();
  });
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Coût au m³</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="contract?.dureeMois"> — Durée {{ contract.dureeMois }} mois</span>
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
    <div v-else-if="(store as any).error" class="panel error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="panel">
        <div class="muted">Sélectionne une variante puis reviens ici.</div>
      </div>

      <template v-else>
        <!-- KPIs (sans Volume/CA/PV affichés ailleurs, mais ici on reste "section-style") -->
        <div class="kpis">
          <div class="kpi">
            <div class="kLbl">Prix / m³</div>
            <div class="kVal">{{ n(coutM3ParM3, 2) }} <span>DH/m³</span></div>
          </div>

          <div class="kpi">
            <div class="kLbl">Total</div>
            <div class="kVal">{{ money(coutM3Total, 2) }}</div>
          </div>

          <div class="kpi">
            <div class="kLbl">/ mois</div>
            <div class="kVal">{{ money(coutM3ParMois, 2) }}</div>
          </div>

          <div class="kpi">
            <div class="kLbl">%</div>
            <div class="kVal">{{ n(coutM3Pct, 2) }} <span>%</span></div>
          </div>
        </div>

        <!-- Inputs -->
        <div class="panel">
          <div class="grid3">
            <div class="field">
              <div class="label">Eau (DH/m³)</div>
              <input class="input r" type="number" step="0.01" min="0" v-model.number="draft.eau" />
            </div>

            <div class="field">
              <div class="label">Qualité (DH/m³)</div>
              <input class="input r" type="number" step="0.01" min="0" v-model.number="draft.qualite" />
            </div>

            <div class="field">
              <div class="label">Déchets (DH/m³)</div>
              <input class="input r" type="number" step="0.01" min="0" v-model.number="draft.dechets" />
            </div>
          </div>

          <div class="note">
            <span class="muted">
              Calcul: Prix/m³ = Eau + Qualité + Déchets • Total = Prix/m³ × Volume total (des formules de la variante)
            </span>
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
          <button
            v-if="modal.mode === 'confirm'"
            class="btn primary"
            @click="modal.onConfirm && modal.onConfirm()"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }

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

/* KPIs: compact 4 cards */
.kpis{
  display:grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap:8px;
}
@media (max-width: 980px){ .kpis{ grid-template-columns: repeat(2, minmax(160px, 1fr)); } }
@media (max-width: 520px){ .kpis{ grid-template-columns: 1fr; } }

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
.kVal span{ font-weight:600; color:#6b7280; margin-left:6px; }

.grid3{
  display:grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap:10px;
}
@media (max-width: 980px){ .grid3{ grid-template-columns: 1fr; } }

.field { display:flex; flex-direction:column; gap:6px; }
.label { font-size:11px; color:#6b7280; }

.input{
  border:1px solid #d1d5db;
  border-radius:10px;
  font-size:13px;
  padding:7px 9px;
  width:100%;
}
.r { text-align:right; }

.note{
  margin-top:10px;
  padding-top:10px;
  border-top:1px dashed #e5e7eb;
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
