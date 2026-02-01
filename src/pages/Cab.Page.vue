<!-- src/pages/CabPage.vue -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
});

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: any) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(toNum(v));
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => store.activeVariant as any);
const contract = computed<any>(() => store.activeContract as any);
const cab = computed<any>(() => (variant.value as any)?.cab ?? null);

/**
 * Si la CAB est à la charge du client pour le contrat de la variante active,
 * la page n'affiche qu'un message.
 *
 * NOTE: j'ai mis plusieurs clés possibles pour éviter de te bloquer.
 * Garde uniquement celle qui correspond à ton modèle.
 */
const cabChargeClient = computed<boolean>(() => {
  const c: any = contract.value ?? {};
  const v: any = variant.value ?? {};

  const candidates = [
    c.cabChargeClient,
    c.cabAChargeClient,
    c.cabPrisEnChargeParClient,
    c.cabCharge, // ex: "CLIENT" | "NOUS"
    v.cabChargeClient,
    v.cabAChargeClient,
    v.cabPrisEnChargeParClient,
    v.cabCharge,
  ];

  for (const x of candidates) {
    if (typeof x === "boolean") return x;
  }
  for (const x of candidates) {
    if (typeof x === "string") {
      const s = x.toUpperCase();
      if (s === "CLIENT" || s === "CUSTOMER") return true;
      if (s === "NOUS" || s === "MIASMO" || s === "OWNER") return false;
    }
  }
  return false;
});

/* =========================
   UI STATE (edit-on-click)
========================= */
type CabDraft = {
  etat: string;
  mode: string;
  capaciteM3: number;
  amortMois: number;
};

const draft = reactive<CabDraft>({
  etat: "NEUVE",
  mode: "ACHAT",
  capaciteM3: 0,
  amortMois: 0,
});

const activeField = ref<keyof CabDraft | null>(null);
const dirty = ref(false);

function resetFromVariant() {
  const c: any = cab.value ?? {};
  draft.etat = String(c.etat ?? "NEUVE");
  draft.mode = String(c.mode ?? "ACHAT");
  draft.capaciteM3 = toNum(c.capaciteM3);
  draft.amortMois = toNum(c.amortMois);
  activeField.value = null;
  dirty.value = false;
}

watch(
  () => variant.value?.id,
  () => resetFromVariant(),
  { immediate: true }
);

function startEdit(k: keyof CabDraft) {
  activeField.value = k;
}
function stopEdit() {
  activeField.value = null;
}
function markDirty() {
  dirty.value = true;
}

/* click ailleurs => déverrouille */
function onDocPointerDown(e: PointerEvent) {
  if (!activeField.value) return;
  const el = e.target as HTMLElement | null;
  if (!el) return;
  if (el.closest("[data-editor='1']")) return;
  stopEdit();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, { capture: true } as any);
});

/* =========================
   SAVE (local only)
========================= */
function saveLocalOnly() {
  if (!variant.value) return;

  const anyStore: any = store as any;
  const v: any = anyStore.activeVariant;
  if (!v) return;

  if (!v.cab) v.cab = {};
  v.cab.etat = draft.etat;
  v.cab.mode = draft.mode;
  v.cab.capaciteM3 = toNum(draft.capaciteM3);
  v.cab.amortMois = toNum(draft.amortMois);

  activeField.value = null;
  dirty.value = false;
}

/* =========================
   INDICATEUR UNIQUE
========================= */
const dureeMois = computed<number>(() => Math.max(1, toNum(contract.value?.dureeMois) || 1));
const amortTotal = computed<number>(() => toNum(draft.amortMois) * dureeMois.value);

// % du CA (si dispo via formules/transport/mp synchronisés)
const formules = computed<any[]>(() => (variant.value?.formules?.items ?? []) as any[]);
const volumeTotal = computed<number>(() => formules.value.reduce((s, vf) => s + toNum(vf?.volumeM3), 0));
const transportPrixMoyen = computed<number>(() => toNum(variant.value?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const vmp = (variant.value?.mp?.items ?? []).find((x: any) => x.mpId === mpId);
  if (!vmp) return 0;
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);
  return toNum(vmp?.mp?.prix);
}
function cmpParM3For(vf: any): number {
  const items = (vf?.formule?.items ?? []) as any[];
  return items.reduce((s: number, it: any) => {
    const qty = toNum(it.qty);
    const prix = mpPriceUsed(String(it.mpId));
    return s + (qty / 1000) * prix;
  }, 0);
}
const pvParM3Moy = computed<number>(() => {
  const vol = volumeTotal.value;
  if (vol === 0) return 0;
  const total = formules.value.reduce((s, vf) => {
    const v = toNum(vf?.volumeM3);
    const pv = cmpParM3For(vf) + toNum(vf?.momd) + transportPrixMoyen.value;
    return s + pv * v;
  }, 0);
  return total / vol;
});
const caTotal = computed<number>(() => pvParM3Moy.value * volumeTotal.value);

const amortPctCa = computed<number>(() => {
  const ca = caTotal.value;
  if (ca <= 0) return 0;
  return (amortTotal.value / ca) * 100;
});
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1>CAB</h1>
        <div class="muted">
          Variante active : <b>{{ variant?.title ?? "—" }}</b>
        </div>
      </div>

      <div class="actions" v-if="variant && !cabChargeClient">
        <button class="btn" :disabled="!dirty" @click="resetFromVariant()">Annuler</button>
        <button class="btn primary" :disabled="!dirty" @click="saveLocalOnly()">Enregistrer (local)</button>
      </div>
    </div>

    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card error"><b>Erreur :</b> {{ store.error }}</div>
    <div v-else-if="!variant" class="card muted">Aucune variante active.</div>

    <template v-else>
      <!-- ✅ SI CAB A LA CHARGE DU CLIENT => MESSAGE UNIQUEMENT -->
      <div v-if="cabChargeClient" class="card clientOnly">
        <div class="bigMsg">✅ Dans ce contrat, la CAB est à la charge du client.</div>
      </div>

      <!-- ✅ SINON: UI CAB NORMAL -->
      <template v-else>
        <!-- KPI unique -->
        <div class="card kpiCard">
          <div class="kpiLabel">Amortissement total</div>
          <div class="kpiValue">
            {{ money(amortTotal) }}
            <span class="tag">{{ n(amortPctCa, 2) }}%</span>
          </div>
          <div class="muted small">
            Total = amortissement/mois × durée contrat ({{ dureeMois }} mois). % = part du CA (si CA dispo).
          </div>
        </div>

        <!-- CAB core -->
        <div class="card">
          <div class="cardTitle">🏗️ Données CAB</div>
          <div class="muted small" style="margin-top: 4px">
            Clique sur une valeur pour modifier. Clique ailleurs pour sortir du champ.
          </div>

          <div class="rows">
            <!-- Etat -->
            <div class="row">
              <div class="label">État</div>
              <div class="value">
                <template v-if="activeField === 'etat'">
                  <select class="input" v-model="draft.etat" @change="markDirty()" data-editor="1">
                    <option value="NEUVE">NEUVE</option>
                    <option value="OCCASION">OCCASION</option>
                  </select>
                </template>
                <template v-else>
                  <span class="click" @click="startEdit('etat')">{{ draft.etat }}</span>
                </template>
              </div>
            </div>

            <!-- Mode -->
            <div class="row">
              <div class="label">Mode</div>
              <div class="value">
                <template v-if="activeField === 'mode'">
                  <select class="input" v-model="draft.mode" @change="markDirty()" data-editor="1">
                    <option value="ACHAT">ACHAT</option>
                    <option value="LOCATION">LOCATION</option>
                    <option value="LEASING">LEASING</option>
                  </select>
                </template>
                <template v-else>
                  <span class="click" @click="startEdit('mode')">{{ draft.mode }}</span>
                </template>
              </div>
            </div>

            <!-- Capacite -->
            <div class="row">
              <div class="label">Capacité (m³)</div>
              <div class="value">
                <template v-if="activeField === 'capaciteM3'">
                  <input
                    class="input right"
                    type="number"
                    step="0.1"
                    v-model.number="draft.capaciteM3"
                    @input="markDirty()"
                    data-editor="1"
                  />
                </template>
                <template v-else>
                  <span class="click" @click="startEdit('capaciteM3')">{{ n(draft.capaciteM3, 1) }}</span>
                </template>
              </div>
            </div>

            <!-- Amort -->
            <div class="row">
              <div class="label">Amortissement / mois</div>
              <div class="value">
                <template v-if="activeField === 'amortMois'">
                  <input
                    class="input right"
                    type="number"
                    step="0.01"
                    v-model.number="draft.amortMois"
                    @input="markDirty()"
                    data-editor="1"
                  />
                </template>
                <template v-else>
                  <span class="click" @click="startEdit('amortMois')"><b>{{ money(draft.amortMois) }}</b></span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }

.topbar { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
h1 { margin:0; font-size:18px; }
.muted { color:#6b7280; font-size:12px; }
.small { font-size: 11px; }

.actions { display:flex; gap:8px; align-items:center; }
.btn { border:1px solid #d1d5db; background:#fff; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn:disabled { opacity:.5; cursor:not-allowed; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { background:#046a2f; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
.error { border-color:#ef4444; background:#fff5f5; }

/* KPI */
.kpiCard { background:#fcfcfd; }
.kpiLabel { font-size:11px; color:#6b7280; }
.kpiValue { font-size:16px; font-weight:950; margin-top:4px; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
.tag { border:1px solid #e5e7eb; background:#fff; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:800; color:#111827; }

/* CAB */
.cardTitle { font-weight:900; font-size:13px; }

.rows { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
.row { display:grid; grid-template-columns: 180px 1fr; gap:10px; align-items:center; }
@media (max-width: 980px) { .row { grid-template-columns: 1fr; } }

.label { font-size:11px; color:#6b7280; }
.value { min-height: 34px; display:flex; align-items:center; }
.click { cursor:pointer; padding:4px 6px; border-radius:8px; }
.click:hover { background:#f3f4f6; }

.input { padding:7px 9px; border:1px solid #d1d5db; border-radius:10px; font-size:13px; width:100%; }
.right { text-align:right; }

/* Client message */
.clientOnly { padding: 20px; background:#fcfcfd; }
.bigMsg { font-size: 18px; font-weight: 900; line-height: 1.3; text-align: center; padding: 26px 18px; }
</style>
