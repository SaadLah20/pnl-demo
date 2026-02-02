<!-- src/pages/TransportPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

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

/* =========================
   ZONES FIXES (LIBELLÉS)
========================= */
type ZoneDef = { label: string; range: string };
const ZONES: ZoneDef[] = [
  { label: "Zone 1", range: "0–10 km" },
  { label: "Zone 2", range: "10–20 km" },
  { label: "Zone 3", range: "20–30 km" },
  { label: "Zone 4", range: "30–40 km" },
  { label: "Zone 5", range: "40–50 km" },
];

/* =========================
   STATE
========================= */
type TransportType = "MOYENNE" | "PAR_ZONE";
type UiZone = { pct: number; prix: number };

type TransportUi = {
  type: TransportType;

  // ✅ on sépare : manuel (mode MOYENNE) vs calculé (mode PAR_ZONE)
  prixMoyenManuel: number;

  zones: UiZone[];

  includePompage: boolean;
  volumePompePct: number;
  prixAchatPompe: number;
  prixVentePompe: number;
};

function emptyZones(): UiZone[] {
  return ZONES.map(() => ({ pct: 0, prix: 0 }));
}

const ui = reactive<TransportUi>({
  type: "MOYENNE",
  prixMoyenManuel: 0,
  zones: emptyZones(),

  includePompage: false,
  volumePompePct: 0,
  prixAchatPompe: 0,
  prixVentePompe: 0,
});

const variant = computed(() => store.activeVariant);

const saving = ref(false);
const err = ref<string | null>(null);

/* =========================
   MODAL (confirm)
========================= */
const modal = reactive({
  open: false,
  title: "Confirmer",
  message: "",
  onConfirm: null as null | (() => void),
});

function openConfirm(title: string, message: string, onConfirm: () => void) {
  modal.title = title;
  modal.message = message;
  modal.onConfirm = onConfirm;
  modal.open = true;
}
function closeConfirm() {
  modal.open = false;
  modal.onConfirm = null;
}

/* =========================
   COMPUTEDS
========================= */
const sumPct = computed(() => ui.zones.reduce((s, z) => s + toNum(z.pct), 0));
const prixMoyenCalcule = computed(() => ui.zones.reduce((s, z) => s + toNum(z.prix) * (toNum(z.pct) / 100), 0));
const pctOk = computed(() => Math.abs(sumPct.value - 100) <= 0.01);

// ✅ valeur affichée (mais pas écrasée)
const prixMoyenDisplay = computed(() => (ui.type === "PAR_ZONE" ? prixMoyenCalcule.value : ui.prixMoyenManuel));

const pompageMargeParM3 = computed(() => {
  if (!ui.includePompage) return 0;
  const marge = toNum(ui.prixVentePompe) - toNum(ui.prixAchatPompe);
  return marge * (toNum(ui.volumePompePct) / 100);
});

/* =========================
   SYNC FROM API
========================= */
function syncFromVariant() {
  const v: any = variant.value;
  const t: any = v?.transport ?? null;

  ui.type = t?.type === "PAR_ZONE" ? "PAR_ZONE" : "MOYENNE";

  // ✅ on récupère la "vraie" moyenne de la DB dans le manuel
  ui.prixMoyenManuel = toNum(t?.prixMoyen);

  const apiZones: any[] = Array.isArray(t?.zones) ? t.zones : [];
  const nextZones: UiZone[] = emptyZones();

  for (let i = 0; i < nextZones.length; i++) {
    const src = apiZones[i];
    if (src) nextZones[i] = { pct: toNum(src.pct), prix: toNum(src.prix) };
  }
  ui.zones = nextZones;

  ui.includePompage = Boolean(t?.volumePompePct != null || t?.prixAchatPompe != null || t?.prixVentePompe != null);
  ui.volumePompePct = toNum(t?.volumePompePct);
  ui.prixAchatPompe = toNum(t?.prixAchatPompe);
  ui.prixVentePompe = toNum(t?.prixVentePompe);
}

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
  syncFromVariant();
});

watch(
  () => variant.value?.id,
  () => syncFromVariant()
);

/* =========================
   MODE SWITCH LOGIC
========================= */
// ✅ Quand l'utilisateur bascule de PAR_ZONE vers MOYENNE,
// on force le manuel à reprendre la valeur DB de la variante active
watch(
  () => ui.type,
  (next, prev) => {
    if (prev === "PAR_ZONE" && next === "MOYENNE") {
      // reprend la moyenne réelle de la variante active (DB)
      const t: any = (variant.value as any)?.transport ?? null;
      ui.prixMoyenManuel = toNum(t?.prixMoyen);
    }
  }
);

watch(
  () => ui.includePompage,
  (on) => {
    if (!on) {
      ui.volumePompePct = 0;
      ui.prixAchatPompe = 0;
      ui.prixVentePompe = 0;
    }
  }
);

/* =========================
   SAVE
========================= */
function buildPayload() {
  const existing: any = (variant.value as any)?.transport ?? {};
  const payload: any = {
    category: existing?.category ?? "LOGISTIQUE_APPRO",
    type: ui.type,
    prixMoyen: Number(prixMoyenDisplay.value),
    zones:
      ui.type === "PAR_ZONE"
        ? ui.zones.map((z, i) => ({
            label: ZONES[i]?.label ?? `Zone ${i + 1}`,
            pct: Number(toNum(z.pct)),
            prix: Number(toNum(z.prix)),
          }))
        : [],
  };

  if (ui.includePompage) {
    payload.volumePompePct = Number(toNum(ui.volumePompePct));
    payload.prixAchatPompe = Number(toNum(ui.prixAchatPompe));
    payload.prixVentePompe = Number(toNum(ui.prixVentePompe));
  } else {
    payload.volumePompePct = null;
    payload.prixAchatPompe = null;
    payload.prixVentePompe = null;
  }

  return payload;
}

async function save() {
  err.value = null;
  if (!variant.value) return;

  if (ui.type === "PAR_ZONE" && !pctOk.value) {
    err.value = `La somme des pourcentages doit être 100%. Actuel: ${n(sumPct.value, 2)}%`;
    return;
  }

  saving.value = true;
  try {
    await store.updateVariant(variant.value.id, { transport: buildPayload() });
    syncFromVariant();
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

function resetParZone() {
  openConfirm("Réinitialiser", "Remettre tous les pourcentages et prix des zones à 0 ?", () => {
    ui.zones = emptyZones();
    closeConfirm();
  });
}
</script>

<template>
  <div class="page">
    <!-- header -->
    <div class="top">
      <div class="title">
        <div class="h1">Transport</div>
        <div class="muted">Paramétrage de la section Transport pour la variante active</div>
      </div>

      <div class="actions">
        <button class="btn" @click="store.loadPnls()">Recharger</button>
        <button class="btn primary" :disabled="saving || !variant" @click="save()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="store.loading" class="panel">Chargement…</div>
    <div v-else-if="store.error" class="panel error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div v-if="!variant" class="panel">
        <b>Aucune variante active</b>
        <div class="muted">Sélectionne une variante dans la sidebar.</div>
      </div>

      <div v-else>
        <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

        <!-- MODE -->
        <div class="panel">
          <div class="grid2">
            <div class="field">
              <div class="label">Type</div>
              <select class="select" v-model="ui.type">
                <option value="MOYENNE">Moyenne</option>
                <option value="PAR_ZONE">Par zone</option>
              </select>
            </div>

            <div class="field">
              <div class="label">Prix moyen (MAD/m³)</div>
              <input
                class="input r wPrice"
                type="number"
                step="0.01"
                v-model.number="ui.prixMoyenManuel"
                :disabled="ui.type === 'PAR_ZONE'"
              />
              <div v-if="ui.type === 'PAR_ZONE'" class="hint">
                Calculé automatiquement : <b>{{ n(prixMoyenCalcule) }}</b> MAD/m³
              </div>
            </div>
          </div>
        </div>

        <!-- PAR ZONE -->
        <div v-if="ui.type === 'PAR_ZONE'" class="panel">
          <div class="panelHead">
            <div>
              <b>Paramétrage par zone</b>
              <div class="muted small">Saisis uniquement <b>%</b> et <b>Prix</b>. Somme = <b>100%</b>.</div>
            </div>

            <button class="btn" @click="resetParZone()">Réinitialiser</button>
          </div>

          <div class="pctLine" :class="{ bad: !pctOk }">
            <span>Somme des % :</span>
            <b>{{ n(sumPct, 2) }}%</b>
            <span v-if="!pctOk" class="warn">→ Complète jusqu’à 100%</span>
          </div>

          <div class="zonesGrid">
            <div class="zoneCard" v-for="(z, i) in ui.zones" :key="i">
              <div class="zoneHead">
                <div class="zoneTitle">
                  <b>{{ ZONES[i]?.label }}</b>
                  <span class="muted">{{ ZONES[i]?.range }}</span>
                </div>
              </div>

              <div class="zoneRow">
                <div class="zr">
                  <div class="miniLabel">% Vol.</div>
                  <input class="inputSm r wPct" type="number" step="1" min="0" max="100" v-model.number="z.pct" />
                </div>

                <div class="zr">
                  <div class="miniLabel">Prix (MAD/m³)</div>
                  <input class="inputSm r wPrix" type="number" step="0.01" min="0" v-model.number="z.prix" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- POMPAGE -->
        <div class="panel">
          <div class="row">
            <label class="check">
              <input type="checkbox" v-model="ui.includePompage" />
              <span>Inclure pompage</span>
            </label>

            <div v-if="ui.includePompage" class="impact">
              <span class="muted">Impact pompage</span>
              <b>{{ n(pompageMargeParM3) }}</b>
              <span class="muted">MAD/m³</span>
            </div>
          </div>

          <div v-if="ui.includePompage" class="pompageGrid">
            <div class="field">
              <div class="label">% volume pompé</div>
              <input class="inputSm r wPct" type="number" step="1" min="0" max="100" v-model.number="ui.volumePompePct" />
            </div>

            <div class="field">
              <div class="label">Prix achat</div>
              <input class="inputSm r wPrix" type="number" step="0.01" min="0" v-model.number="ui.prixAchatPompe" />
            </div>

            <div class="field">
              <div class="label">Prix vente</div>
              <input class="inputSm r wPrix" type="number" step="0.01" min="0" v-model.number="ui.prixVentePompe" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal -->
    <div v-if="modal.open" class="modalOverlay" @click.self="closeConfirm()">
      <div class="modal">
        <div class="modalTitle">{{ modal.title }}</div>
        <div class="modalMsg">{{ modal.message }}</div>
        <div class="modalActions">
          <button class="btn" @click="closeConfirm()">Annuler</button>
          <button
            class="btn primary"
            @click="
              () => {
                const fn = modal.onConfirm;
                if (fn) fn();
              }
            "
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:12px; padding:12px; }

/* top */
.top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.title { display:flex; flex-direction:column; gap:2px; }
.h1 { font-size:16px; font-weight:800; line-height:1.1; margin:0; }
.muted { color:#6b7280; font-size:12px; }
.small { font-size:11px; }

.actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

/* panel */
.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
.panel.error { border-color:#ef4444; background:#fff5f5; }

.panelHead { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:10px; flex-wrap:wrap; }

.field { display:flex; flex-direction:column; gap:6px; }
.label { font-size:11px; color:#6b7280; }

.select, .input, .inputSm {
  border:1px solid #d1d5db;
  border-radius:10px;
  font-size:13px;
  padding:7px 9px;
  max-width: 100%;
}
.input { width: 100%; }
.inputSm { font-size:12px; padding:6px 8px; }
.r { text-align:right; }

/* buttons */
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

/* ✅ largeur inputs adaptées */
.wPct { width: 90px; }
.wPrix { width: 130px; }
.wPrice { max-width: 220px; }

.grid2 { display:grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap:10px; }
@media (max-width: 980px) { .grid2 { grid-template-columns: 1fr; } }

.hint { font-size:12px; margin-top:2px; color:#374151; }
.hint b { font-weight:800; }

.pctLine {
  display:flex; gap:8px; align-items:baseline;
  border:1px solid #e5e7eb;
  background:#fcfcfd;
  border-radius:10px;
  padding:8px 10px;
  margin-bottom:12px;
  font-size:12px;
  flex-wrap:wrap;
}
.pctLine.bad { border-color:#f59e0b; background:#fffbeb; }
.warn { color:#b45309; font-weight:700; }

/* zones */
.zonesGrid{
  display:grid;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  gap: 14px 14px;
}
@media (max-width: 860px) { .zonesGrid { grid-template-columns: 1fr; } }

.zoneCard{
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:10px;
  background:#fcfcfd;
}
.zoneHead{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap:10px;
  margin-bottom:10px;
}
.zoneTitle{ display:flex; flex-direction:column; gap:2px; }
.zoneTitle b{ font-size:13px; }

.zoneRow{
  display:flex;
  gap:14px;
  align-items:flex-end;
  flex-wrap:nowrap;
}
@media (max-width: 420px) { .zoneRow { flex-wrap:wrap; } }

.zr{ display:flex; flex-direction:column; gap:6px; }
.miniLabel{ font-size:11px; color:#6b7280; }

/* pompage */
.row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.check { display:flex; align-items:center; gap:8px; font-size:13px; user-select:none; }

.impact {
  margin-left: 16px;
  display:flex;
  align-items:baseline;
  gap:8px;
  padding:6px 10px;
  border:1px dashed #d1d5db;
  border-radius:999px;
  background:#fafafa;
}
.impact b { font-weight:900; }

.pompageGrid{
  margin-top:12px;
  display:grid;
  grid-template-columns: repeat(3, max-content);
  gap: 14px;
  align-items:end;
}
@media (max-width: 860px) {
  .pompageGrid { grid-template-columns: 1fr; }
  .wPct, .wPrix { width: 100%; }
}

/* modal */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17,24,39,0.35);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: 100%;
  max-width: 420px;
  background:#fff;
  border-radius: 14px;
  border:1px solid #e5e7eb;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18);
  padding: 14px;
}
.modalTitle { font-weight: 900; font-size: 14px; margin-bottom: 6px; }
.modalMsg { font-size: 13px; color:#374151; margin-bottom: 12px; }
.modalActions { display:flex; justify-content:flex-end; gap:8px; }
</style>
