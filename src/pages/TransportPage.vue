<!-- src/pages/TransportPage.vue -->
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
function clamp(x: any, min: number, max: number) {
  const v = toNum(x);
  return Math.max(min, Math.min(max, v));
}
function nearlyEqual(a: number, b: number, eps = 0.001) {
  return Math.abs(a - b) <= eps;
}

/* =========================
   ACTIVE VARIANT ONLY
========================= */
const variant = computed<any>(() => (store as any).activeVariant);
const contract = computed<any>(() => (store as any).activeContract);
const dureeMois = computed(() => toNum(contract.value?.dureeMois));

/* =========================
   TRANSPORT EDIT MODEL
========================= */
type TransportType = "MOYENNE" | "PAR_ZONE";
type ZoneRow = { key: string; label: string; pct: number; prix: number };

const DEFAULT_ZONES: ZoneRow[] = [
  { key: "Z1", label: "Z1 — 0–10 km", pct: 0, prix: 0 },
  { key: "Z2", label: "Z2 — 10–20 km", pct: 0, prix: 0 },
  { key: "Z3", label: "Z3 — 20–30 km", pct: 0, prix: 0 },
  { key: "Z4", label: "Z4 — 30–40 km", pct: 0, prix: 0 },
  { key: "Z5", label: "Z5 — 40–50 km", pct: 0, prix: 0 },
];

const edit = reactive({
  type: "MOYENNE" as TransportType,
  prixMoyen: 0,
  zones: DEFAULT_ZONES.map((z) => ({ ...z })) as ZoneRow[],

  includePompage: false,
  volumePompePct: 0,
  prixAchatPompe: 0,
  prixVentePompe: 0,
});

const manualPrixMoyen = ref<number>(0);

/* =========================
   UI
========================= */
const zonesOpen = ref(true);
const overMsg = ref<string>("");

/* =========================
   LOAD FROM VARIANT
========================= */
function loadFromVariant() {
  const t = variant.value?.transport ?? {};

  const type = (t?.type as TransportType) ?? "MOYENNE";
  edit.type = type === "PAR_ZONE" ? "PAR_ZONE" : "MOYENNE";

  const pm = toNum(t?.prixMoyen);
  manualPrixMoyen.value = pm;
  edit.prixMoyen = pm;

  const zones = Array.isArray(t?.zones) ? t.zones : null;
  if (zones && zones.length) {
    const byKey = new Map<string, any>();
    for (const z of zones) byKey.set(String(z?.key ?? ""), z);

    edit.zones = DEFAULT_ZONES.map((base) => {
      const z = byKey.get(base.key);
      return {
        key: base.key,
        label: base.label,
        pct: clamp(z?.pct, 0, 100),
        prix: clamp(z?.prix, 0, 1e9),
      };
    });
  } else {
    edit.zones = DEFAULT_ZONES.map((z) => ({ ...z }));
  }

  const hasPompe =
    t?.volumePompePct != null || t?.prixAchatPompe != null || t?.prixVentePompe != null;

  edit.includePompage =
    Boolean(hasPompe) &&
    (toNum(t?.volumePompePct) > 0 || toNum(t?.prixVentePompe) > 0 || toNum(t?.prixAchatPompe) > 0);

  edit.volumePompePct = clamp(t?.volumePompePct, 0, 100);
  edit.prixAchatPompe = clamp(t?.prixAchatPompe, 0, 1e9);
  edit.prixVentePompe = clamp(t?.prixVentePompe, 0, 1e9);

  overMsg.value = "";
}
watch(() => variant.value?.id, () => loadFromVariant(), { immediate: true });

/* =========================
   COMPUTEDS
========================= */
const pctSum = computed(() => edit.zones.reduce((s, z) => s + toNum(z.pct), 0));
const pctOk = computed(() => nearlyEqual(pctSum.value, 100));
const remainingPct = computed(() => Math.max(0, 100 - pctSum.value));

const prixMoyenParZone = computed(() => {
  return edit.zones.reduce((s, z) => s + toNum(z.prix) * (toNum(z.pct) / 100), 0);
});
const prixMoyenUsed = computed(() => (edit.type === "PAR_ZONE" ? prixMoyenParZone.value : edit.prixMoyen));

const margePompageParM3 = computed(() => {
  if (!edit.includePompage) return 0;
  const marge = toNum(edit.prixVentePompe) - toNum(edit.prixAchatPompe);
  const pct = toNum(edit.volumePompePct) / 100;
  return marge * pct;
});

const canSave = computed(() => {
  if (!variant.value) return false;
  if (edit.type === "PAR_ZONE" && !pctOk.value) return false;
  return true;
});

/* =========================
   PREVENT >100%
========================= */
function setPct(z: ZoneRow, raw: any) {
  overMsg.value = "";
  const next = clamp(raw, 0, 100);

  const sumWithoutThis = pctSum.value - toNum(z.pct);
  const maxForThis = clamp(100 - sumWithoutThis, 0, 100);

  if (next > maxForThis + 1e-9) {
    z.pct = maxForThis;
    overMsg.value = `Somme max = 100%. Pour "${z.label}", max autorisé = ${n(maxForThis, 2)}%.`;
    return;
  }
  z.pct = next;
}

function normalizeZones() {
  edit.zones = edit.zones.map((z) => ({
    ...z,
    pct: clamp(z.pct, 0, 100),
    prix: clamp(z.prix, 0, 1e9),
  }));
}
watch(
  () => edit.zones.map((z) => [z.pct, z.prix]),
  () => normalizeZones(),
  { deep: true }
);

watch(
  () => edit.type,
  (t) => {
    if (t === "MOYENNE") edit.prixMoyen = manualPrixMoyen.value;
    if (t === "PAR_ZONE") zonesOpen.value = true;
  }
);
watch(
  () => edit.prixMoyen,
  (v) => {
    if (edit.type === "MOYENNE") manualPrixMoyen.value = toNum(v);
  }
);

/* =========================
   POMPAGE RESET
========================= */
watch(
  () => edit.includePompage,
  (on) => {
    if (!on) {
      edit.volumePompePct = 0;
      edit.prixAchatPompe = 0;
      edit.prixVentePompe = 0;
    }
  }
);

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
async function confirmModal() {
  const fn = modal.onConfirm;
  closeModal();
  if (modal.mode === "confirm" && fn) await fn();
}

/* =========================
   SAVE
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function buildPayload(): any {
  const tExisting: any = variant.value?.transport ?? {};
  return {
    category: tExisting.category ?? "LOGISTIQUE_APPRO",
    type: edit.type,
    prixMoyen: Number(prixMoyenUsed.value),
    zones:
      edit.type === "PAR_ZONE"
        ? edit.zones.map((z) => ({
            key: z.key,
            pct: Number(clamp(z.pct, 0, 100)),
            prix: Number(clamp(z.prix, 0, 1e9)),
          }))
        : [],
    volumePompePct: Number(edit.includePompage ? clamp(edit.volumePompePct, 0, 100) : 0),
    prixAchatPompe: Number(edit.includePompage ? clamp(edit.prixAchatPompe, 0, 1e9) : 0),
    prixVentePompe: Number(edit.includePompage ? clamp(edit.prixVentePompe, 0, 1e9) : 0),
  };
}

async function save() {
  if (!variant.value) return;

  if (!canSave.value) {
    openInfo("Impossible d’enregistrer", "La somme des % doit être exactement 100%.");
    return;
  }

  err.value = null;
  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, { transport: buildPayload() });

    const t = (store as any).activeVariant?.transport ?? {};
    manualPrixMoyen.value = toNum(t?.prixMoyen);
    if (edit.type === "MOYENNE") edit.prixMoyen = manualPrixMoyen.value;

    openInfo("Enregistré", "La section transport a été mise à jour.");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    openInfo("Erreur", String(err.value ?? e?.message ?? e));
  } finally {
    saving.value = false;
  }
}
function askSave() {
  openConfirm("Enregistrer Transport", "Confirmer la mise à jour de la section Transport pour la variante active ?", async () => {
    await save();
  });
}
function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base (annule les modifications non enregistrées) ?", () => {
    loadFromVariant();
  });
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Transport</div>
        <div class="muted" v-if="variant">
          Variante active : <b>{{ variant.title ?? variant.id?.slice?.(0, 6) }}</b>
          <span v-if="dureeMois"> — Durée {{ dureeMois }} mois</span>
        </div>
        <div class="muted" v-else>Aucune variante active.</div>
      </div>

      <div class="actions">
        <button class="btn" type="button" :disabled="!variant || saving" @click="askReset()">Réinitialiser</button>
        <button class="btn primary" type="button" :disabled="!canSave || saving" @click="askSave()">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="panel">Chargement…</div>
    <div v-else-if="(store as any).error" class="panel error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <div v-if="!variant" class="panel">
        <div class="muted">Sélectionne une variante (via ta page Mes P&L) puis reviens ici.</div>
      </div>

      <template v-else>
        <div class="panel">
          <div class="headGrid">
            <div class="field">
              <div class="label">Type</div>
              <select class="select" v-model="edit.type">
                <option value="MOYENNE">Moyenne</option>
                <option value="PAR_ZONE">Par zone</option>
              </select>
            </div>

            <div class="field">
              <div class="label">Prix moyen (MAD/m³)</div>
              <input
                class="input r num"
                type="number"
                step="0.01"
                :disabled="edit.type === 'PAR_ZONE'"
                :value="edit.type === 'PAR_ZONE' ? Number(prixMoyenParZone.toFixed(2)) : Number(toNum(edit.prixMoyen).toFixed(2))"
                @input="
                  (e) => {
                    if (edit.type !== 'PAR_ZONE') {
                      edit.prixMoyen = toNum((e.target as HTMLInputElement).value);
                    }
                  }
                "
              />
            </div>

            <div class="impactBox">
              <div class="label">Impact pompage (marge/m³)</div>
              <div class="impactVal">
                <b>{{ n(margePompageParM3, 2) }}</b>
                <span class="muted">MAD/m³</span>
              </div>
            </div>
          </div>
        </div>

        <!-- CALCULATEUR PAR ZONE -->
        <div class="panel" v-if="edit.type === 'PAR_ZONE'">
          <button class="collHead" type="button" @click="zonesOpen = !zonesOpen">
            <div class="collLeft">
              <b>Calculateur par zone</b>
              <span class="muted small">Zone · % · Prix · Contrib.</span>
            </div>

            <div class="sumBadge" :class="{ ok: pctOk, bad: !pctOk }" aria-live="polite">
              <div class="sumLine">
                <span class="sumLbl">Somme</span>
                <b>{{ n(pctSum, 2) }}%</b>
              </div>
              <div class="sumState">
                <span v-if="pctOk" class="good">OK : 100%</span>
                <span v-else class="warn">Reste {{ n(remainingPct, 2) }}%</span>
              </div>
            </div>

            <div class="chev" :class="{ open: zonesOpen }">⌄</div>
          </button>

          <div v-show="zonesOpen" class="collBody">
            <div class="sumSticky" :class="{ ok: pctOk, bad: !pctOk }">
              <div class="sumStickyLeft">
                <b>Somme</b>
                <span>{{ n(pctSum, 2) }}%</span>
              </div>
              <div class="sumStickyRight">
                <span v-if="pctOk" class="good">OK : 100%</span>
                <span v-else class="warn">Répartition incomplète</span>
              </div>
            </div>

            <div v-if="overMsg" class="overMsg"><b>Limite 100% :</b> {{ overMsg }}</div>

            <!-- ✅ 5 tuiles sur 1 ligne (écran desktop) -->
            <div class="zonesWrap">
              <div class="zoneTile" v-for="z in edit.zones" :key="z.key">
                <div class="tileTitle">{{ z.label }}</div>

                <div class="tileInputs">
                  <div class="inCol">
                    <div class="miniLbl">%</div>
                    <div class="inWrap">
                      <input
                        class="tileInput r"
                        type="number"
                        step="0.01"
                        :value="z.pct"
                        placeholder="Pourcentage"
                        @input="(e) => setPct(z, (e.target as HTMLInputElement).value)"
                      />
                      <span class="unitR">%</span>
                    </div>
                  </div>

                  <div class="inCol">
                    <div class="miniLbl">Prix</div>
                    <div class="inWrap">
                      <input
                        class="tileInput r"
                        type="number"
                        step="0.01"
                        v-model.number="z.prix"
                        placeholder="Prix"
                      />
                      <span class="unitR">DH</span>
                    </div>
                  </div>
                </div>

                <div class="tileFoot">
                  <span class="muted small">Contrib.</span>
                  <b>{{ n(toNum(z.prix) * (toNum(z.pct) / 100), 2) }}</b>
                </div>
              </div>
            </div>

            <div v-if="!pctOk" class="alert">
              <b>Action requise :</b> Ajuste la répartition pour atteindre <b>100%</b> (sinon enregistrement bloqué).
            </div>
          </div>
        </div>

        <!-- POMPAGE -->
        <div class="panel">
          <div class="row">
            <label class="check">
              <input type="checkbox" v-model="edit.includePompage" />
              <span><b>Inclure pompage</b></span>
            </label>
            <div class="muted small">Si décoché : valeurs remises à 0 (et envoyées à 0 au backend au save).</div>
          </div>

          <div v-if="edit.includePompage" class="pumpGrid">
            <div class="field">
              <div class="label">% pompé</div>
              <input class="input r num" type="number" step="0.01" v-model.number="edit.volumePompePct" />
            </div>
            <div class="field">
              <div class="label">Achat</div>
              <input class="input r num" type="number" step="0.01" v-model.number="edit.prixAchatPompe" />
            </div>
            <div class="field">
              <div class="label">Vente</div>
              <input class="input r num" type="number" step="0.01" v-model.number="edit.prixVentePompe" />
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- MODAL -->
    <div v-if="modal.open" class="modalMask" @click.self="closeModal()">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modalTitle">{{ modal.title }}</div>
        <div class="modalMsg">{{ modal.message }}</div>

        <div class="modalActions">
          <button class="btn" type="button" @click="closeModal()">Fermer</button>
          <button v-if="modal.mode === 'confirm'" class="btn primary" type="button" @click="confirmModal()">
            Confirmer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:8px; padding:10px; }

/* top */
.top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.title { display:flex; flex-direction:column; gap:2px; }
.h1 { font-size:16px; font-weight:800; line-height:1.1; margin:0; }
.muted { color:#6b7280; font-size:12px; }
.small { font-size:11px; }
.actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

/* panel */
.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px; }
.panel.error { border-color:#ef4444; background:#fff5f5; }

/* controls */
.row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.field { display:flex; flex-direction:column; gap:5px; }
.label { font-size:11px; color:#6b7280; }
.r { text-align:right; }

.select, .input {
  border:1px solid #d1d5db;
  border-radius:10px;
  font-size:13px;
  padding:7px 9px;
  width:100%;
}

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
.btn:disabled { opacity: .6; cursor: not-allowed; }

/* header compact */
.headGrid{
  display:grid;
  grid-template-columns: 180px 260px 1fr;
  gap:10px;
  align-items:end;
}
@media (max-width: 980px){
  .headGrid{ grid-template-columns: 1fr; }
}
.num { max-width: 190px; }
.input:disabled { background:#f3f4f6; color:#111827; }

.impactBox{
  padding-left: 14px;
  border-left: 1px dashed #e5e7eb;
}
@media (max-width: 980px){
  .impactBox{ padding-left: 0; border-left: none; }
}
.impactVal{ display:flex; gap:8px; align-items:baseline; }
.impactVal b{ font-weight:800; }

/* collapsible */
.collHead{
  width:100%;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  border:1px solid #eef2f7;
  background:#fcfcfd;
  border-radius:12px;
  padding:8px 10px;
  cursor:pointer;
}
.collHead:hover{ background:#fafafa; }
.collLeft{ display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
.chev{ width:22px; text-align:center; transition: transform .15s ease; color:#6b7280; }
.chev.open{ transform: rotate(180deg); }

.sumBadge{
  border:1px solid #e5e7eb;
  border-radius:10px;
  padding:6px 8px;
  min-width: 165px;
  display:flex;
  flex-direction:column;
  gap:2px;
  text-align:right;
}
.sumBadge.ok{ border-color:#16a34a33; background:#16a34a0f; }
.sumBadge.bad{ border-color:#ef444433; background:#ef44440f; }
.sumLbl{ color:#6b7280; font-size:11px; margin-right:6px; }
.sumLine{ display:flex; justify-content:flex-end; gap:6px; align-items:baseline; }
.sumState{ font-size:11px; }
.good { color:#166534; }
.warn { color:#b91c1c; }

.collBody{ margin-top:8px; }

/* sticky sum */
.sumSticky{
  position: sticky;
  top: 0;
  z-index: 2;
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:center;
  padding:6px 10px;
  border:1px solid #e5e7eb;
  border-radius:10px;
  background:#fff;
  margin-bottom:8px;
}
.sumSticky.ok{ border-color:#16a34a33; background:#16a34a0f; }
.sumSticky.bad{ border-color:#ef444433; background:#ef44440f; }
.sumStickyLeft{ display:flex; gap:8px; align-items:baseline; }
.sumStickyLeft b{ font-weight:900; }
.sumStickyRight{ font-size:12px; }

.overMsg{
  border:1px solid #f59e0b33;
  background:#f59e0b0f;
  border-radius:12px;
  padding:8px 10px;
  margin-bottom:8px;
  font-size:12px;
  color:#92400e;
}

/* ✅ 5 tuiles en 1 ligne sur desktop */
.zonesWrap{
  display:grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap:8px;
}
@media (max-width: 1250px){
  .zonesWrap{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 860px){
  .zonesWrap{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px){
  .zonesWrap{ grid-template-columns: 1fr; }
}

.zoneTile{
  border:1px solid #eef2f7;
  background:#fff;
  border-radius:12px;
  padding:8px;
  display:flex;
  flex-direction:column;
  gap:8px;
  min-width: 0; /* important pour grid */
}

.tileTitle{ font-weight:900; font-size:12px; color:#111827; }

.tileInputs{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:8px;
}

.inCol{ display:flex; flex-direction:column; gap:4px; min-width:0; }
.miniLbl{ font-size:10px; color:#6b7280; line-height:1; }

/* ✅ unités à droite */
.inWrap{ position:relative; display:flex; align-items:center; min-width:0; }
.unitR{
  position:absolute;
  right:8px;
  font-size:11px;
  color:#6b7280;
  pointer-events:none;
}
.tileInput{
  width:100%;
  border:1px solid #d1d5db;
  border-radius:10px;
  padding:7px 26px 7px 8px; /* espace à droite pour unité */
  font-size:13px;
  min-width:0;
}
.tileInput:focus{ outline:none; border-color:#9ca3af; }

.tileFoot{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  border-top: 1px dashed #e5e7eb;
  padding-top:7px;
}
.tileFoot b{ font-weight:900; }

/* alert */
.alert {
  margin-top:8px;
  border:1px solid #ef444433;
  background:#ef44440f;
  border-radius:12px;
  padding:8px 10px;
  font-size:13px;
}

/* checkbox */
.check { display:flex; gap:8px; align-items:center; cursor:pointer; user-select:none; }
.check input { width:16px; height:16px; }

/* pompage */
.pumpGrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(160px, 220px));
  gap:10px;
  margin-top:10px;
  align-items:end;
}
@media (max-width: 980px){ .pumpGrid{ grid-template-columns: 1fr; } }

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
