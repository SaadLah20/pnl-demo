<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";

export type VariantCreateMode = "INITIEE" | "COMPOSEE";

export type InitieePayload = {
  volumeEstimeM3: number;
  resistances: string[]; // up to 5
  ebitCiblePct: number;
  etatCentrale: "EXISTANTE" | "NEUVE";
};

export type ComposeSectionKey =
  | "transport"
  | "cab"
  | "maintenance"
  | "coutM3"
  | "coutMensuel"
  | "coutOccasionnel"
  | "employes"
  | "autresCouts"
  | "formules"
  | "majorations"
  | "devis";

export type ComposePayload = {
  baseVariantId: string;
  bySection: Record<ComposeSectionKey, string | null>;
};

const props = defineProps<{
  open: boolean;
  mode: VariantCreateMode;
  allVariants?: Array<{
    id: string;
    title: string;
    contractTitle?: string | null;
    pnlTitle?: string | null;
  }>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit-initiee", payload: InitieePayload): void;
  (e: "submit-composee", payload: ComposePayload): void;
}>();

const isOpen = computed(() => !!props.open);

const RESISTANCES = [
  "C8/10","C12/15","C16/20","C20/25","C25/30","C30/37","C35/45","C40/50","C45/55","C50/60","BSS",
];

/* =========================
   INITIÉE
========================= */
const initiee = reactive<InitieePayload>({
  volumeEstimeM3: 54300,
  resistances: ["C20/25", "C25/30", "C30/37", "C35/45", "C40/50"],
  ebitCiblePct: 12,
  etatCentrale: "NEUVE",
});

function toggleResistance(r: string) {
  const i = initiee.resistances.indexOf(r);
  if (i >= 0) {
    initiee.resistances.splice(i, 1);
    return;
  }
  if (initiee.resistances.length >= 5) return;
  initiee.resistances.push(r);
}

const initValid = computed(() => {
  const vol = Number(initiee.volumeEstimeM3);
  const ebit = Number(initiee.ebitCiblePct);
  return Number.isFinite(vol) && vol > 0 && Number.isFinite(ebit) && ebit >= 0 && initiee.resistances.length > 0;
});

/* =========================
   COMPOSÉE
========================= */
const sectionLabels = ref<Array<{ key: ComposeSectionKey; label: string }>>([
  { key: "transport", label: "Transport" },
  { key: "cab", label: "CAB (Capex)" },
  { key: "maintenance", label: "Maintenance" },
  { key: "coutM3", label: "Coûts /m³" },
  { key: "coutMensuel", label: "Coûts mensuels" },
  { key: "coutOccasionnel", label: "Coûts occasionnels" },
  { key: "employes", label: "Employés" },
  { key: "autresCouts", label: "Autres coûts" },
  { key: "formules", label: "Formules" },
  { key: "majorations", label: "Majorations" },
  { key: "devis", label: "Devis" },
]);

const compose = reactive<ComposePayload>({
  baseVariantId: "",
  bySection: {
    transport: null,
    cab: null,
    maintenance: null,
    coutM3: null,
    coutMensuel: null,
    coutOccasionnel: null,
    employes: null,
    autresCouts: null,
    formules: null,
    majorations: null,
    devis: null,
  },
});

const composeQuery = ref("");
const composeOnlySameContract = ref(false);

const allVariantChoices = computed(() => {
  const rows = props.allVariants ?? [];
  const q = String(composeQuery.value ?? "").toLowerCase().trim();

  const base = compose.baseVariantId
    ? rows.find((r) => String(r.id) === String(compose.baseVariantId))
    : null;

  return rows
    .filter((r) => {
      if (!q) return true;
      const s = `${r.pnlTitle ?? ""} ${r.contractTitle ?? ""} ${r.title ?? ""}`.toLowerCase();
      return s.includes(q) || String(r.id).toLowerCase().includes(q);
    })
    .filter((r) => {
      if (!composeOnlySameContract.value) return true;
      if (!base) return true;
      return String(r.contractTitle ?? "") === String(base.contractTitle ?? "");
    });
});

function labelV(v: { id: string; title: string; contractTitle?: string | null; pnlTitle?: string | null }) {
  return `${v.pnlTitle ?? "P&L"} · ${v.contractTitle ?? "Contrat"} · ${v.title ?? "Variante"}`;
}

function setAllSectionsFromVariant(variantId: string) {
  for (const k of Object.keys(compose.bySection) as ComposeSectionKey[]) compose.bySection[k] = variantId || null;
}
function setAllSectionsZero() {
  for (const k of Object.keys(compose.bySection) as ComposeSectionKey[]) compose.bySection[k] = null;
}

function moveSection(idx: number, dir: -1 | 1) {
  const arr = sectionLabels.value;
  const j = idx + dir;
  if (idx < 0 || idx >= arr.length) return;
  if (j < 0 || j >= arr.length) return;
  const next = [...arr];
  const a = next[idx];
  const b = next[j];
  if (!a || !b) return;
  next[idx] = b;
  next[j] = a;
  sectionLabels.value = next;
}

const composeValid = computed(() => !!String(compose.baseVariantId ?? "").trim());

/* =========================
   Lifecycle
========================= */
watch(
  () => props.open,
  async (v) => {
    if (!v) return;

    if (props.mode === "INITIEE") {
      initiee.volumeEstimeM3 = 54300;
      initiee.resistances = ["C20/25", "C25/30", "C30/37", "C35/45", "C40/50"];
      initiee.ebitCiblePct = 12;
      initiee.etatCentrale = "NEUVE";
    }

    if (props.mode === "COMPOSEE") {
      compose.baseVariantId = "";
      setAllSectionsZero();
      composeQuery.value = "";
      composeOnlySameContract.value = false;
    }

    await nextTick();
  }
);

function close() {
  emit("close");
}

function submit() {
  if (props.mode === "INITIEE") {
    if (!initValid.value) return;
    emit("submit-initiee", {
      volumeEstimeM3: Number(initiee.volumeEstimeM3),
      resistances: [...initiee.resistances].slice(0, 5),
      ebitCiblePct: Number(initiee.ebitCiblePct),
      etatCentrale: initiee.etatCentrale,
    });
    return;
  }

  if (!composeValid.value) return;
  emit("submit-composee", { baseVariantId: String(compose.baseVariantId), bySection: { ...compose.bySection } });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close()" @keydown="onKeydown" tabindex="-1">
      <div class="md" role="dialog" aria-modal="true" aria-label="Assistant création variante">
        <!-- Sticky header -->
        <div class="hd">
          <div class="hd__l">
            <div class="hd__t">
              <span v-if="mode === 'INITIEE'">Assistant · Variante initiée</span>
              <span v-else>Assistant · Variante composée</span>
            </div>
            <div class="hd__s">Paramétrage rapide avant initialisation</div>
          </div>
          <button class="x" type="button" @click="close()" aria-label="Fermer">✕</button>
        </div>

        <div class="bd">
          <!-- INITIÉE -->
          <div v-if="mode === 'INITIEE'" class="layout2">
            <div class="box">
              <div class="boxT">Paramètres clés</div>

              <div class="grid">
                <div class="f">
                  <div class="k">Volume estimé (m³)</div>
                  <input class="in in--strong r" type="number" step="1" v-model.number="initiee.volumeEstimeM3" />
                  <div class="mini">Champ clé · utilisé pour l’init.</div>
                </div>

                <div class="f">
                  <div class="k">EBIT cible (%)</div>
                  <input class="in in--strong r" type="number" step="0.1" v-model.number="initiee.ebitCiblePct" />
                  <div class="mini">Objectif marge.</div>
                </div>

                <div class="f f--full">
                  <div class="k">État de centrale</div>
                  <div class="seg" role="group" aria-label="État de centrale">
                    <button
                      class="segBtn"
                      :class="{ on: initiee.etatCentrale === 'NEUVE' }"
                      type="button"
                      @click="initiee.etatCentrale = 'NEUVE'"
                    >NEUVE</button>
                    <button
                      class="segBtn"
                      :class="{ on: initiee.etatCentrale === 'EXISTANTE' }"
                      type="button"
                      @click="initiee.etatCentrale = 'EXISTANTE'"
                    >EXISTANTE</button>
                  </div>
                </div>
              </div>

              <div v-if="!initValid" class="warn">
                Vérifie : volume &gt; 0, EBIT ≥ 0, et au moins 1 résistance.
              </div>
            </div>

            <div class="box">
              <div class="boxT">Résistances (max 5)</div>

              <div class="chips">
                <button
                  v-for="r in RESISTANCES"
                  :key="r"
                  type="button"
                  class="chip"
                  :class="{ on: initiee.resistances.includes(r) }"
                  @click="toggleResistance(r)"
                >
                  {{ r }}
                </button>
              </div>

              <div class="hint">
                Sélection : <b>{{ initiee.resistances.join(", ") || "—" }}</b>
              </div>
              <div class="mini">Astuce : <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> pour lancer.</div>
            </div>
          </div>

          <!-- COMPOSÉE -->
          <div v-else class="stack">
            <div class="box">
              <div class="boxT">Base + filtres</div>

              <div class="grid">
                <div class="f f--full">
                  <div class="k">Variante de base</div>
                  <select class="in in--strong" v-model="compose.baseVariantId">
                    <option value="">— Sélectionner —</option>
                    <option v-for="v in allVariantChoices" :key="v.id" :value="v.id">
                      {{ labelV(v) }}
                    </option>
                  </select>
                </div>

                <div class="f">
                  <div class="k">Recherche</div>
                  <input class="in" v-model="composeQuery" placeholder="P&L / Contrat / Variante…" />
                </div>

                <div class="f">
                  <div class="k">Filtre</div>
                  <label class="ck">
                    <input type="checkbox" v-model="composeOnlySameContract" />
                    Même contrat que la base
                  </label>
                </div>

                <div class="f f--full">
                  <div class="rowBtns">
                    <button class="btn btn--soft" type="button" :disabled="!compose.baseVariantId" @click="setAllSectionsFromVariant(compose.baseVariantId)">
                      Tout importer
                    </button>
                    <button class="btn btn--soft" type="button" @click="setAllSectionsZero()">
                      Tout à zéro
                    </button>
                    <div class="sp"></div>
                    <div class="mini">Tu peux réordonner les sections (↑/↓) si besoin.</div>
                  </div>
                </div>

                <div v-if="!composeValid" class="warn f--full">
                  Sélectionne une <b>variante de base</b> pour continuer.
                </div>
              </div>
            </div>

            <div class="box">
              <div class="boxT">Composer section par section</div>

              <div class="secWrap">
                <div class="secHdr">
                  <div>Section</div>
                  <div>Source</div>
                  <div class="right">Ordre</div>
                </div>

                <div class="secList">
                  <div v-for="(s, idx) in sectionLabels" :key="s.key" class="secRow">
                    <div class="secLeft">
                      <div class="secName">{{ s.label }}</div>
                      <div class="secKey">{{ s.key }}</div>
                    </div>

                    <div class="secMid">
                      <select class="in in--compact" v-model="compose.bySection[s.key]">
                        <option :value="null">ZERO</option>
                        <option v-for="v in allVariantChoices" :key="v.id" :value="v.id">
                          Importer: {{ labelV(v) }}
                        </option>
                      </select>
                    </div>

                    <div class="secRight">
                      <button class="miniBtn" type="button" @click="moveSection(idx, -1)" :disabled="idx === 0">↑</button>
                      <button class="miniBtn" type="button" @click="moveSection(idx, 1)" :disabled="idx === sectionLabels.length - 1">↓</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="hint2">
                Envoi: <code>baseVariantId</code> + <code>bySection</code> (copie section par section ou ZERO).
              </div>
            </div>
          </div>
        </div>

        <!-- Sticky footer -->
        <div class="ft">
          <button class="btn btn--ghost" type="button" @click="close()">Annuler</button>
          <button
            class="btn btn--primary"
            type="button"
            :disabled="mode === 'INITIEE' ? !initValid : !composeValid"
            @click="submit()"
          >
            Lancer
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* overlay + modal */
.ov{
  position:fixed; inset:0;
  background:rgba(17,24,39,.45);
  display:flex; align-items:center; justify-content:center;
  padding:16px;
  z-index:9999;
}
.md{
  width:min(940px, 100%);
  max-height:calc(100vh - 32px);
  background:#fff;
  border:1px solid rgba(15,23,42,.12);
  border-radius:16px;
  box-shadow:0 20px 60px rgba(0,0,0,.15);
  overflow:hidden;
  display:flex; flex-direction:column;
}

/* sticky header/footer */
.hd{
  position:sticky; top:0; z-index:2;
  display:flex; align-items:flex-start; justify-content:space-between;
  gap:10px;
  padding:10px 12px;
  background:linear-gradient(180deg,#fafafa,#f6f7f9);
  border-bottom:1px solid rgba(15,23,42,.08);
}
.hd__t{font-size:13px; font-weight:950; color:#0f172a; letter-spacing:.2px}
.hd__s{font-size:11px; color:rgba(15,23,42,.55); margin-top:2px}
.x{
  border:1px solid rgba(15,23,42,.12);
  background:#fff;
  border-radius:12px;
  width:34px; height:34px;
  cursor:pointer;
}
.x:hover{background:#f9fafb}

.bd{
  padding:12px;
  overflow:auto;
  flex:1 1 auto;
}
.ft{
  position:sticky; bottom:0; z-index:2;
  padding:10px 12px;
  border-top:1px solid rgba(15,23,42,.08);
  background:linear-gradient(180deg,#ffffff,#fcfcfd);
  display:flex; justify-content:flex-end; gap:10px;
}

/* common */
.stack{display:flex; flex-direction:column; gap:12px}
.layout2{display:grid; grid-template-columns:1fr 1fr; gap:12px}
.box{
  border:1px solid rgba(15,23,42,.10);
  border-radius:14px;
  background:#fcfcfd;
  padding:10px;
}
.boxT{font-size:12px; font-weight:950; color:#0f172a; margin-bottom:8px}
.grid{display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px}
.f{display:flex; flex-direction:column; gap:6px}
.f--full{grid-column:1/-1}
.k{font-size:11px; font-weight:900; color:rgba(15,23,42,.62)}

.in{
  border:1px solid rgba(15,23,42,.14);
  border-radius:12px;
  padding:8px 10px;
  font-size:13px;
  outline:none;
  background:#fff;
}
.in:focus{
  border-color:rgba(2,132,199,.35);
  box-shadow:0 0 0 3px rgba(2,132,199,.12);
}
.in--strong{
  background:rgba(2,132,199,.04);
  border-color:rgba(2,132,199,.22);
  font-weight:950;
}
.in--compact{padding:7px 10px; font-size:12.5px}
.r{text-align:right}

.mini{
  font-size:11px;
  color:rgba(15,23,42,.52);
}
kbd{
  font-size:10px;
  border:1px solid rgba(15,23,42,.16);
  border-bottom-width:2px;
  border-radius:8px;
  padding:1px 6px;
  background:#fff;
}

/* warning blocks */
.warn{
  margin-top:8px;
  font-size:12px;
  padding:10px;
  border-radius:12px;
  border:1px solid rgba(245,158,11,.28);
  background:rgba(245,158,11,.08);
  color:rgba(15,23,42,.85);
}

/* init chips */
.chips{display:flex; flex-wrap:wrap; gap:8px}
.chip{
  border:1px solid rgba(15,23,42,.12);
  background:#fff;
  border-radius:999px;
  padding:6px 10px;
  font-size:12px;
  cursor:pointer;
}
.chip:hover{background:rgba(2,132,199,.04); border-color:rgba(2,132,199,.18)}
.chip.on{
  border-color:rgba(16,185,129,.35);
  background:rgba(16,185,129,.06);
  color:rgba(5,150,105,.98);
  font-weight:900;
}
.hint{margin-top:8px; font-size:12px; color:rgba(15,23,42,.65)}

/* segmented */
.seg{display:flex; gap:8px; flex-wrap:wrap}
.segBtn{
  border:1px solid rgba(15,23,42,.12);
  background:#fff;
  border-radius:12px;
  padding:8px 10px;
  font-size:12.5px;
  cursor:pointer;
}
.segBtn:hover{background:rgba(2,132,199,.04)}
.segBtn.on{
  border-color:rgba(16,185,129,.35);
  background:rgba(16,185,129,.06);
  color:rgba(5,150,105,.98);
  font-weight:950;
}

/* compose list */
.rowBtns{display:flex; gap:10px; flex-wrap:wrap; align-items:center}
.sp{flex:1 1 auto}

.secWrap{
  border:1px solid rgba(15,23,42,.08);
  border-radius:14px;
  overflow:hidden;
  background:#fff;
}
.secHdr{
  display:grid;
  grid-template-columns:220px 1fr 88px;
  gap:10px;
  align-items:center;
  padding:8px 10px;
  background:linear-gradient(180deg,#fafafa,#f6f7f9);
  border-bottom:1px solid rgba(15,23,42,.08);
  font-size:11px;
  font-weight:950;
  color:rgba(15,23,42,.65);
}
.secHdr .right{text-align:right}

.secList{
  max-height:340px; /* ✅ scroll interne = modal reste compact */
  overflow:auto;
  padding:8px;
  display:flex;
  flex-direction:column;
  gap:8px;
}

.secRow{
  display:grid;
  grid-template-columns:220px 1fr 88px;
  gap:10px;
  align-items:center;
  border:1px solid rgba(15,23,42,.10);
  border-radius:12px;
  background:#fff;
  padding:8px 10px;
}
.secLeft{min-width:0}
.secName{font-weight:950; font-size:12.5px; color:#0f172a}
.secKey{font-size:11px; color:rgba(15,23,42,.45)}
.secRight{display:flex; gap:8px; justify-content:flex-end}

.miniBtn{
  border:1px solid rgba(15,23,42,.12);
  background:#fff;
  border-radius:10px;
  width:34px; height:34px;
  cursor:pointer;
}
.miniBtn:hover{background:#f9fafb}
.miniBtn:disabled{opacity:.5; cursor:not-allowed}

/* hint footer */
.hint2{
  margin-top:10px;
  font-size:12px;
  color:rgba(15,23,42,.6);
  background:#fafafa;
  border:1px dashed rgba(15,23,42,.16);
  border-radius:12px;
  padding:10px;
}

/* buttons */
.btn{
  border-radius:12px;
  padding:9px 12px;
  font-size:13px;
  border:1px solid rgba(15,23,42,.12);
  background:#fff;
  cursor:pointer;
}
.btn:hover{background:#f9fafb}
.btn:disabled{opacity:.55; cursor:not-allowed}
.btn--primary{
  background:#0b7a35;
  border-color:#0b7a35;
  color:#fff;
  font-weight:900;
}
.btn--primary:hover{background:#096a2e}
.btn--ghost{background:transparent}
.btn--ghost:hover{background:#ffffff}
.btn--soft{background:#f6f7f9}
.btn--soft:hover{background:#eef0f4}

@media (max-width: 980px){
  .layout2{grid-template-columns:1fr}
}
@media (max-width: 900px){
  .grid{grid-template-columns:1fr}
  .secHdr{grid-template-columns:1fr; display:none} /* ✅ simplifie mobile */
  .secRow{grid-template-columns:1fr; gap:8px}
  .secRight{justify-content:flex-start}
}
</style>
