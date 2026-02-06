<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

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
  /** null => section à zéro ; string => importer cette section depuis la variante id */
  bySection: Record<ComposeSectionKey, string | null>;
};

const props = defineProps<{
  open: boolean;
  mode: VariantCreateMode;
  /** Pour le compose: liste de variantes disponibles */
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
  "C8/10",
  "C12/15",
  "C16/20",
  "C20/25",
  "C25/30",
  "C30/37",
  "C35/45",
  "C40/50",
  "C45/55",
  "C50/60",
  "BSS",
];

/* =========================
   INITIÉE FORM
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

/* =========================
   COMPOSÉE FORM
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
  const q = String(composeQuery.value ?? "")
    .toLowerCase()
    .trim();

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
  for (const k of Object.keys(compose.bySection) as ComposeSectionKey[]) {
    compose.bySection[k] = variantId || null;
  }
}

function setAllSectionsZero() {
  for (const k of Object.keys(compose.bySection) as ComposeSectionKey[]) {
    compose.bySection[k] = null;
  }
}

function moveSection(idx: number, dir: -1 | 1) {
  const arr = sectionLabels.value;
  const j = idx + dir;

  // guards
  if (idx < 0 || idx >= arr.length) return;
  if (j < 0 || j >= arr.length) return;

  const next = [...arr];
  const a = next[idx];
  const b = next[j];

  // TS safety (au cas où)
  if (!a || !b) return;

  next[idx] = b;
  next[j] = a;

  sectionLabels.value = next;
}


/* =========================
   LIFECYCLE
========================= */
watch(
  () => props.open,
  (v) => {
    if (!v) return;

    // Reset light defaults each open
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
  }
);

function close() {
  emit("close");
}

function submit() {
  if (props.mode === "INITIEE") {
    const vol = Number(initiee.volumeEstimeM3);
    const ebit = Number(initiee.ebitCiblePct);
    if (!Number.isFinite(vol) || vol <= 0) return;
    if (!Number.isFinite(ebit) || ebit < 0) return;
    if (!initiee.resistances?.length) return;

    emit("submit-initiee", {
      volumeEstimeM3: vol,
      resistances: [...initiee.resistances].slice(0, 5),
      ebitCiblePct: ebit,
      etatCentrale: initiee.etatCentrale,
    });
    return;
  }

  const baseId = String(compose.baseVariantId ?? "").trim();
  if (!baseId) return;

  emit("submit-composee", {
    baseVariantId: baseId,
    bySection: { ...compose.bySection },
  });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="overlay" @click.self="close()">
      <div class="modal">
        <div class="head">
          <div class="ttl">
            <b v-if="mode === 'INITIEE'">Assistant — Variante initiée</b>
            <b v-else>Assistant — Variante composée</b>
            <div class="sub">Étape obligatoire avant initialisation</div>
          </div>
          <button class="x" @click="close()">✕</button>
        </div>

        <div class="body">
          <!-- INITIÉE -->
          <div v-if="mode === 'INITIEE'" class="stack">
            <div class="box">
              <div class="boxT">Paramètres</div>

              <div class="grid">
                <div class="f">
                  <div class="k">Volume estimé (m³)</div>
                  <input class="in r" type="number" step="1" v-model.number="initiee.volumeEstimeM3" />
                </div>

                <div class="f">
                  <div class="k">EBIT cible (%)</div>
                  <input class="in r" type="number" step="0.1" v-model.number="initiee.ebitCiblePct" />
                </div>

                <div class="f f--full">
                  <div class="k">État de centrale</div>
                  <div class="seg">
                    <button
                      class="segBtn"
                      :class="{ on: initiee.etatCentrale === 'NEUVE' }"
                      @click="initiee.etatCentrale = 'NEUVE'"
                      type="button"
                    >
                      NEUVE
                    </button>
                    <button
                      class="segBtn"
                      :class="{ on: initiee.etatCentrale === 'EXISTANTE' }"
                      @click="initiee.etatCentrale = 'EXISTANTE'"
                      type="button"
                    >
                      EXISTANTE
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="box">
              <div class="boxT">Classes de résistance (max 5)</div>
              <div class="chips">
                <button
                  v-for="r in RESISTANCES"
                  :key="r"
                  type="button"
                  class="chip"
                  :class="{ on: initiee.resistances.includes(r), off: !initiee.resistances.includes(r) }"
                  @click="toggleResistance(r)"
                >
                  {{ r }}
                </button>
              </div>
              <div class="hint">Sélection : {{ initiee.resistances.join(", ") || "—" }}</div>
            </div>

            <div class="hint2">
              L’API recevra ces paramètres via <code>initiee</code>. Le backend peut ensuite appeler ton initVariant pour
              remplir toutes les sections et tendre vers l’EBIT cible.
            </div>
          </div>

          <!-- COMPOSÉE -->
          <div v-else class="stack">
            <div class="box">
              <div class="boxT">Base</div>

              <div class="grid">
                <div class="f f--full">
                  <div class="k">Variante de base</div>
                  <select class="in" v-model="compose.baseVariantId">
                    <option value="">— Sélectionner —</option>
                    <option v-for="v in allVariantChoices" :key="v.id" :value="v.id">
                      {{ labelV(v) }}
                    </option>
                  </select>
                </div>

                <div class="f">
                  <div class="k">Recherche</div>
                  <input class="in" v-model="composeQuery" placeholder="P&L / Contrat / Variante..." />
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
                    <button class="btn" type="button" :disabled="!compose.baseVariantId" @click="setAllSectionsFromVariant(compose.baseVariantId)">
                      Tout importer depuis la base
                    </button>
                    <button class="btn" type="button" @click="setAllSectionsZero()">Tout mettre à ZERO</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="box">
              <div class="boxT">Composer section par section</div>

              <div class="secList">
                <div v-for="(s, idx) in sectionLabels" :key="s.key" class="secRow">
                  <div class="secLeft">
                    <div class="secName">{{ s.label }}</div>
                    <div class="secKey">{{ s.key }}</div>
                  </div>

                  <div class="secMid">
                    <select class="in" v-model="compose.bySection[s.key]">
                      <option :value="null">ZERO (initialiser à 0)</option>
                      <option v-for="v in allVariantChoices" :key="v.id" :value="v.id">
                        Importer: {{ labelV(v) }}
                      </option>
                    </select>
                  </div>

                  <div class="secRight">
                    <button class="mini" type="button" @click="moveSection(idx, -1)" :disabled="idx === 0">↑</button>
                    <button class="mini" type="button" @click="moveSection(idx, 1)" :disabled="idx === sectionLabels.length - 1">↓</button>
                  </div>
                </div>
              </div>

              <div class="hint2">
                Ce wizard envoie <code>composee.baseVariantId</code> + <code>composee.bySection</code>. Ton backend doit ensuite
                créer la nouvelle variante et copier chaque section depuis la bonne source (ou zéro).
              </div>
            </div>
          </div>
        </div>

        <div class="foot">
          <button class="btn btn--ghost" @click="close()">Annuler</button>
          <button class="btn btn--primary" @click="submit()">Lancer</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay{position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999}
.modal{width:min(920px,100%);max-height:calc(100vh - 36px);background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.15);display:flex;flex-direction:column}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 14px;background:#fafafa;border-bottom:1px solid #eef2f7}
.ttl{display:flex;flex-direction:column;gap:3px}
.sub{color:#9ca3af;font-size:11px}
.x{border:1px solid #e5e7eb;background:#fff;border-radius:12px;width:34px;height:34px;cursor:pointer}
.x:hover{background:#f9fafb}
.body{padding:14px;overflow:auto;flex:1 1 auto}
.foot{padding:12px 14px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #eef2f7;background:#fcfcfd}
.stack{display:flex;flex-direction:column;gap:12px}
.box{border:1px solid #eef0f4;border-radius:14px;background:#fcfcfd;padding:10px}
.boxT{font-size:12px;font-weight:900;color:#111827;margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.f{display:flex;flex-direction:column;gap:6px}
.f--full{grid-column:1/-1}
.k{font-size:12px;color:#6b7280;font-weight:700}
.in{border:1px solid #e5e7eb;border-radius:12px;padding:9px 10px;font-size:13px;outline:none;background:#fff}
.in:focus{border-color:#c7d2fe;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.r{text-align:right}
.btn{border-radius:12px;padding:9px 12px;font-size:13px;border:1px solid #e6e8ee;background:#fff;cursor:pointer}
.btn:hover{background:#f9fafb}
.btn--primary{background:#0b7a35;border-color:#0b7a35;color:#fff}
.btn--primary:hover{background:#096a2e}
.btn--ghost{background:transparent}
.btn--ghost:hover{background:#ffffff}

.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:6px 10px;font-size:12px;cursor:pointer}
.chip.on{border-color:#bbf7d0;background:#f0fdf4;color:#166534}
.chip.off{color:#374151}
.hint{margin-top:8px;font-size:12px;color:#6b7280}
.hint2{font-size:12px;color:#6b7280;background:#fafafa;border:1px dashed #e5e7eb;border-radius:12px;padding:10px}

.seg{display:flex;gap:8px;flex-wrap:wrap}
.segBtn{border:1px solid #e6e8ee;background:#fff;border-radius:12px;padding:8px 10px;font-size:12.5px;cursor:pointer}
.segBtn.on{border-color:#bbf7d0;background:#f0fdf4;color:#166534}

.ck{display:flex;gap:8px;align-items:center;font-size:12.5px;color:#374151}
.rowBtns{display:flex;gap:10px;flex-wrap:wrap}

.secList{display:flex;flex-direction:column;gap:8px}
.secRow{display:grid;grid-template-columns:220px 1fr 76px;gap:10px;align-items:center;border:1px solid #eef0f4;border-radius:12px;background:#fff;padding:10px}
.secLeft{min-width:0}
.secName{font-weight:900;font-size:12.5px;color:#111827}
.secKey{font-size:11px;color:#9ca3af}
.secMid{min-width:0}
.secRight{display:flex;gap:8px;justify-content:flex-end}
.mini{border:1px solid #e5e7eb;background:#fff;border-radius:10px;width:34px;height:34px;cursor:pointer}
.mini:hover{background:#f9fafb}
.mini:disabled{opacity:.5;cursor:not-allowed}

@media (max-width:900px){
  .grid{grid-template-columns:1fr}
  .secRow{grid-template-columns:1fr;gap:8px}
  .secRight{justify-content:flex-start}
}
</style>
