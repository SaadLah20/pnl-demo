<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

export type InitieePayload = {
  volumeEstimeM3: number;
  resistances: string[]; // labels (<= 5)
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
  | "devis"
  | "majorations"
  | "formules";

export type ComposePayload = {
  importAllFromVariantId: string | null;
  bySection: Record<
    ComposeSectionKey,
    {
      fromVariantId: string | null;
      initZero: boolean;
    }
  >;
};

const props = defineProps<{
  open: boolean;
  mode: "INITIEE" | "COMPOSEE";
  base: { contractId: string; title: string; description: string | null; status: string } | null;
  allVariants?: Array<{ id: string; title: string; contractTitle?: string | null; pnlTitle?: string | null }>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saveInitiee", payload: { base: any; init: InitieePayload }): void;
  (e: "saveComposee", payload: { base: any; compose: ComposePayload }): void;
}>();

const isOpen = computed(() => props.open);
const isInitiee = computed(() => props.mode === "INITIEE");
const isComposee = computed(() => props.mode === "COMPOSEE");

const busy = ref(false);
const err = ref<string | null>(null);

/* ===== Initiée form ===== */
const init = reactive<InitieePayload>({
  volumeEstimeM3: 30000,
  resistances: [],
  ebitCiblePct: 12,
  etatCentrale: "NEUVE",
});

const resistancePick = ref("");
const maxRes = 5;
const suggestedResistances = computed(() => {
  const list = (props.allVariants ?? [])
    .flatMap((v: any) => (v?.formules?.items ?? []).map((x: any) => String(x?.formule?.resistance ?? "")))
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0, 20);
});

/* ===== Composée form ===== */
const composeDraft = reactive<ComposePayload>({
  importAllFromVariantId: null,
  bySection: {
    transport: { fromVariantId: null, initZero: true },
    cab: { fromVariantId: null, initZero: true },
    maintenance: { fromVariantId: null, initZero: true },
    coutM3: { fromVariantId: null, initZero: true },
    coutMensuel: { fromVariantId: null, initZero: true },
    coutOccasionnel: { fromVariantId: null, initZero: true },
    employes: { fromVariantId: null, initZero: true },
    autresCouts: { fromVariantId: null, initZero: true },
    devis: { fromVariantId: null, initZero: true },
    majorations: { fromVariantId: null, initZero: true },
    formules: { fromVariantId: null, initZero: true },
  },
});

const sectionsOrder: Array<{ key: ComposeSectionKey; label: string }> = [
  { key: "transport", label: "Transport" },
  { key: "cab", label: "CAB" },
  { key: "maintenance", label: "Maintenance" },
  { key: "coutM3", label: "Coût / m³" },
  { key: "coutMensuel", label: "Coûts mensuels" },
  { key: "coutOccasionnel", label: "Coûts occasionnels" },
  { key: "employes", label: "Employés" },
  { key: "autresCouts", label: "Autres coûts" },
  { key: "devis", label: "Devis" },
  { key: "majorations", label: "Majorations" },
  { key: "formules", label: "Formules" },
];

function reset() {
  err.value = null;
  busy.value = false;

  init.volumeEstimeM3 = 30000;
  init.resistances = [];
  init.ebitCiblePct = 12;
  init.etatCentrale = "NEUVE";
  resistancePick.value = "";

  composeDraft.importAllFromVariantId = null;
  for (const s of sectionsOrder) {
    composeDraft.bySection[s.key].fromVariantId = null;
    composeDraft.bySection[s.key].initZero = true;
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) reset();
  }
);

function close() {
  emit("close");
}

function addResistance(val: string) {
  const r = (val ?? "").trim();
  if (!r) return;
  if (init.resistances.includes(r)) return;
  if (init.resistances.length >= maxRes) return;
  init.resistances.push(r);
  resistancePick.value = "";
}

function removeResistance(r: string) {
  init.resistances = init.resistances.filter((x) => x !== r);
}

const composeComplete = computed(() => {
  if (!isComposee.value) return true;
  if (composeDraft.importAllFromVariantId) return true;

  // every section must be either initZero OR imported from some variant
  for (const s of sectionsOrder) {
    const st = composeDraft.bySection[s.key];
    if (!st.initZero && !st.fromVariantId) return false;
  }
  return true;
});

async function save() {
  err.value = null;
  if (!props.base) {
    err.value = "Base variante manquante.";
    return;
  }

  busy.value = true;
  try {
    if (isInitiee.value) {
      emit("saveInitiee", { base: props.base, init: { ...init } });
      return;
    }

    if (isComposee.value) {
      if (!composeComplete.value) {
        err.value = "En mode Composée : tu dois choisir toutes les sections (ou importer tout).";
        return;
      }
      emit("saveComposee", {
        base: props.base,
        compose: {
          importAllFromVariantId: composeDraft.importAllFromVariantId,
          bySection: JSON.parse(JSON.stringify(composeDraft.bySection)),
        },
      });
      return;
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="vmodal__backdrop" @click.self="close">
    <div class="vmodal vmodal--tall" role="dialog" aria-modal="true">
      <div class="vmodal__head">
        <div>
          <div class="vmodal__title">
            {{ isInitiee ? "Créer variante initiée" : "Créer variante composée" }}
          </div>
          <div class="vmodal__sub">
            Étape 2/2 — {{ isInitiee ? "Paramètres d’initiation" : "Composition des sections" }}
          </div>
        </div>
        <button class="xbtn" @click="close">✕</button>
      </div>

      <div class="vmodal__body">
        <div v-if="err" class="alert"><b>Erreur :</b> {{ err }}</div>

        <!-- INITIEE -->
        <div v-if="isInitiee" class="stack">
          <div class="box">
            <div class="box__title">Paramètres obligatoires</div>

            <div class="grid">
              <div class="f">
                <div class="k">Volume estimé (m³)</div>
                <input class="in" type="number" v-model.number="init.volumeEstimeM3" min="0" />
              </div>

              <div class="f">
                <div class="k">EBIT cible (%)</div>
                <input class="in" type="number" v-model.number="init.ebitCiblePct" min="0" max="100" step="0.1" />
              </div>

              <div class="f">
                <div class="k">État centrale</div>
                <select class="in" v-model="init.etatCentrale">
                  <option value="NEUVE">NEUVE</option>
                  <option value="EXISTANTE">EXISTANTE</option>
                </select>
              </div>

              <div class="f f--full">
                <div class="k">Classes de résistance (max {{ maxRes }})</div>

                <div class="row">
                  <select class="in" v-model="resistancePick">
                    <option value="">— choisir —</option>
                    <option v-for="r in suggestedResistances" :key="r" :value="r">{{ r }}</option>
                  </select>
                  <button class="btn" type="button" @click="addResistance(resistancePick)">Ajouter</button>
                </div>

                <div class="chips">
                  <span v-for="r in init.resistances" :key="r" class="chip">
                    {{ r }}
                    <button class="chipx" @click="removeResistance(r)">✕</button>
                  </span>
                </div>

                <div class="hint">
                  Si aucune résistance trouvée/choisie, l’init fera un choix aléatoire puis étalera le volume.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- COMPOSEE -->
        <div v-else class="stack">
          <div class="cols">
            <div class="col box">
              <div class="box__title">Importer tout</div>
              <div class="k">Variante source</div>
              <select class="in" v-model="composeDraft.importAllFromVariantId">
                <option :value="null">— (non) —</option>
                <option v-for="v in (allVariants ?? [])" :key="v.id" :value="v.id">
                  {{ v.title }}
                  <template v-if="v.contractTitle"> — {{ v.contractTitle }}</template>
                  <template v-if="v.pnlTitle"> — {{ v.pnlTitle }}</template>
                </option>
              </select>

              <div class="hint">
                Si tu choisis “Importer tout”, les choix section par section seront ignorés.
              </div>
            </div>

            <div class="col box">
              <div class="box__title">Sections (toutes obligatoires)</div>
              <div class="table">
                <div v-for="s in sectionsOrder" :key="s.key" class="tr">
                  <div class="td td--label">{{ s.label }}</div>

                  <div class="td td--controls">
                    <label class="toggle">
                      <input type="checkbox" v-model="composeDraft.bySection[s.key].initZero" />
                      <span>Init 0</span>
                    </label>

                    <select
                      class="in in--sm"
                      v-model="composeDraft.bySection[s.key].fromVariantId"
                      :disabled="composeDraft.bySection[s.key].initZero || !!composeDraft.importAllFromVariantId"
                    >
                      <option :value="null">— importer —</option>
                      <option v-for="v in (allVariants ?? [])" :key="v.id" :value="v.id">
                        {{ v.title }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="hint" :class="{ bad: !composeComplete }">
                {{ composeComplete ? "OK — toutes sections couvertes." : "Il manque des sections." }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="vmodal__foot">
        <button class="btn" @click="close">Annuler</button>
        <button class="btn btn--primary" :disabled="busy || (isComposee && !composeComplete)" @click="save">
          {{ isInitiee ? "Enregistrer" : "Enregistrer" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vmodal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 99999;
}
.vmodal {
  width: min(1020px, 100%);
  max-height: calc(100vh - 36px);
  background: #0b1220;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
}
.vmodal--tall {
  width: min(1100px, 100%);
}
.vmodal__head {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}
.vmodal__title {
  font-weight: 900;
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
}
.vmodal__sub {
  font-size: 11px;
  opacity: 0.75;
  margin-top: 2px;
}
.xbtn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  width: 34px;
  height: 34px;
  cursor: pointer;
}
.vmodal__body {
  padding: 14px;
  overflow: auto;
  flex: 1 1 auto;
}
.vmodal__foot {
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}
.alert {
  border: 1px solid rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.10);
  color: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 12px;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.box {
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  padding: 10px;
}
.box__title {
  font-size: 12px;
  font-weight: 900;
  opacity: 0.85;
  margin-bottom: 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.f {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.f--full {
  grid-column: 1 / -1;
}
.k {
  font-size: 12px;
  font-weight: 800;
  opacity: 0.75;
}
.in {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  padding: 9px 10px;
  outline: none;
  font-size: 13px;
}
.in:focus {
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}
.in--sm {
  padding: 7px 9px;
  border-radius: 10px;
  font-size: 12px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}
.chipx {
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
}
.hint.bad {
  color: rgba(239, 68, 68, 0.95);
  opacity: 1;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
}
.table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tr {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.td--label {
  font-weight: 800;
  font-size: 12px;
}
.td--controls {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
}
.toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  opacity: 0.85;
}
.btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.9);
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
}
.btn--primary {
  border-color: rgba(59, 130, 246, 0.75);
  background: rgba(59, 130, 246, 0.16);
}
</style>
