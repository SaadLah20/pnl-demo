<!-- src/components/VariantWizardModal.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

export type VariantCreateMode = "INITIEE" | "COMPOSEE";

export type InitieePayload = {
  volumeEstimeM3: number;
  resistances: string[]; // max 5
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
  | "formules"
  | "mps";

export type ComposeSectionAction =
  | { mode: "IMPORT"; fromVariantId: string }
  | { mode: "ZERO" };

export type ComposePayload = {
  importAllFromVariantId?: string | null; // si défini => ignore bySection
  bySection?: Partial<Record<ComposeSectionKey, ComposeSectionAction>>;
};

const props = defineProps<{
  modelValue: boolean;
  mode: VariantCreateMode;
  allVariants?: Array<{ id: string; label: string }>;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "submitInitiee", payload: InitieePayload): void;
  (e: "submitComposee", payload: ComposePayload): void;
}>();

const isOpen = computed(() => !!props.modelValue);

function close() {
  emit("update:modelValue", false);
  emit("close");
}

/* =========================
   INITIÉE
========================= */
const initDraft = reactive<InitieePayload>({
  volumeEstimeM3: 50000,
  resistances: [],
  ebitCiblePct: 10,
  etatCentrale: "EXISTANTE",
});

const resistanceQuery = ref("");

const resistanceOptions = computed(() => {
  const common = ["C16/20", "C20/25", "C25/30", "C30/37", "C35/45", "C40/50", "C45/55", "C50/60", "BSS", "BPE", "GBA/DBA"];
  const q = resistanceQuery.value.trim().toLowerCase();
  const base = q ? common.filter((x) => x.toLowerCase().includes(q)) : common;
  return base.slice(0, 20);
});

function toggleResistance(label: string) {
  const v = String(label);
  const idx = initDraft.resistances.findIndex((x) => x === v);
  if (idx >= 0) initDraft.resistances.splice(idx, 1);
  else {
    if (initDraft.resistances.length >= 5) return;
    initDraft.resistances.push(v);
  }
}

const initErr = computed(() => {
  if (props.mode !== "INITIEE") return null;
  if (!Number.isFinite(initDraft.volumeEstimeM3) || initDraft.volumeEstimeM3 <= 0) return "Volume estimé invalide.";
  if (!Number.isFinite(initDraft.ebitCiblePct) || initDraft.ebitCiblePct < 0) return "EBIT cible invalide.";
  return null;
});

function submitInitiee() {
  if (initErr.value) return;
  emit("submitInitiee", {
    volumeEstimeM3: Number(initDraft.volumeEstimeM3),
    resistances: [...initDraft.resistances],
    ebitCiblePct: Number(initDraft.ebitCiblePct),
    etatCentrale: initDraft.etatCentrale,
  });
}

/* =========================
   COMPOSÉE
========================= */
const sectionDefs: Array<{ key: ComposeSectionKey; label: string }> = [
  { key: "transport", label: "Transport" },
  { key: "cab", label: "CAB" },
  { key: "maintenance", label: "Maintenance" },
  { key: "coutM3", label: "Coût /m³" },
  { key: "coutMensuel", label: "Coût mensuel" },
  { key: "coutOccasionnel", label: "Coût occasionnel" },
  { key: "employes", label: "Employés" },
  { key: "autresCouts", label: "Autres coûts" },
  { key: "devis", label: "Devis" },
  { key: "majorations", label: "Majorations" },
  { key: "formules", label: "Formules" },
  { key: "mps", label: "MP (overrides)" },
];

function defaultBySection(): Record<ComposeSectionKey, ComposeSectionAction> {
  const out = {} as Record<ComposeSectionKey, ComposeSectionAction>;
  for (const s of sectionDefs) out[s.key] = { mode: "ZERO" };
  return out;
}

const composeDraft = reactive({
  importAll: true,
  importAllFromVariantId: "",
  bySection: defaultBySection(),
});

const composeErr = computed(() => {
  if (props.mode !== "COMPOSEE") return null;

  const all = props.allVariants ?? [];
  if (!all.length) return "Aucune variante disponible pour composer.";

  if (composeDraft.importAll) {
    if (!composeDraft.importAllFromVariantId) return "Choisis une variante source.";
    return null;
  }

  for (const s of sectionDefs) {
    const act = composeDraft.bySection[s.key];
    if (act.mode === "IMPORT" && !act.fromVariantId) return `Section "${s.label}" : variante source requise.`;
  }
  return null;
});

function setSectionMode(key: ComposeSectionKey, mode: "ZERO" | "IMPORT") {
  if (mode === "ZERO") {
    composeDraft.bySection[key] = { mode: "ZERO" };
  } else {
    const cur = composeDraft.bySection[key];
    composeDraft.bySection[key] = { mode: "IMPORT", fromVariantId: cur.mode === "IMPORT" ? cur.fromVariantId : "" };
  }
}

function submitComposee() {
  if (composeErr.value) return;

  if (composeDraft.importAll) {
    emit("submitComposee", { importAllFromVariantId: composeDraft.importAllFromVariantId });
    return;
  }

  const bySection: Partial<Record<ComposeSectionKey, ComposeSectionAction>> = {};
  for (const s of sectionDefs) bySection[s.key] = composeDraft.bySection[s.key];
  emit("submitComposee", { bySection });
}

/* reset à l’ouverture */
watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;

    initDraft.volumeEstimeM3 = 50000;
    initDraft.resistances = [];
    initDraft.ebitCiblePct = 10;
    initDraft.etatCentrale = "EXISTANTE";
    resistanceQuery.value = "";

    composeDraft.importAll = true;
    composeDraft.importAllFromVariantId = "";
    composeDraft.bySection = defaultBySection();
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modalOverlay" @click.self="close()">
      <div class="modal">
        <div class="modalHead">
          <div class="modalTitle">
            <b v-if="mode === 'INITIEE'">Variante Initiée — Paramètres</b>
            <b v-else>Variante Composée — Composer</b>
            <div class="modalSub">Étape suivante</div>
          </div>
          <button class="xBtn" @click="close()">✕</button>
        </div>

        <div class="modalBody">
          <!-- INITIEE -->
          <div v-if="mode === 'INITIEE'">
            <div v-if="initErr" class="alert"><b>Erreur :</b> {{ initErr }}</div>

            <div class="sectionBox">
              <div class="sectionTitle">Données obligatoires</div>

              <div class="formGrid">
                <div class="f">
                  <div class="k">Volume estimé (m³)</div>
                  <input class="in r" type="number" step="1" v-model.number="initDraft.volumeEstimeM3" />
                </div>

                <div class="f">
                  <div class="k">EBIT cible (%)</div>
                  <input class="in r" type="number" step="0.1" v-model.number="initDraft.ebitCiblePct" />
                </div>

                <div class="f">
                  <div class="k">État de centrale</div>
                  <select class="in" v-model="initDraft.etatCentrale">
                    <option value="EXISTANTE">Existante</option>
                    <option value="NEUVE">Neuve</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="sectionBox">
              <div class="sectionTitle">Classes de résistance (max 5)</div>

              <div class="chipRow">
                <div v-for="r in initDraft.resistances" :key="r" class="chip" @click="toggleResistance(r)">
                  {{ r }} <span class="chipX">✕</span>
                </div>
                <div v-if="initDraft.resistances.length === 0" class="muted">Aucune sélection.</div>
              </div>

              <div class="searchMini">
                <span class="icon">⌕</span>
                <input class="input" v-model="resistanceQuery" placeholder="Rechercher (C30/37, BSS, …)" />
              </div>

              <div class="chips">
                <button
                  v-for="o in resistanceOptions"
                  :key="o"
                  class="chipBtn"
                  :class="{ on: initDraft.resistances.includes(o) }"
                  @click="toggleResistance(o)"
                >
                  {{ o }}
                </button>
              </div>
            </div>
          </div>

          <!-- COMPOSEE -->
          <div v-else>
            <div v-if="composeErr" class="alert"><b>Erreur :</b> {{ composeErr }}</div>

            <div class="sectionBox">
              <div class="sectionTitle">Mode</div>

              <label class="radioLine">
                <input type="radio" :checked="composeDraft.importAll" @change="composeDraft.importAll = true" />
                <div>
                  <b>Importer tout</b>
                  <div class="muted">Copier toutes les sections depuis une variante source.</div>
                </div>
              </label>

              <div v-if="composeDraft.importAll" class="formGrid" style="margin-top:8px">
                <div class="f f--full">
                  <div class="k">Variante source</div>
                  <select class="in" v-model="composeDraft.importAllFromVariantId">
                    <option value="">— Sélectionner —</option>
                    <option v-for="v in (allVariants ?? [])" :key="v.id" :value="v.id">{{ v.label }}</option>
                  </select>
                </div>
              </div>

              <label class="radioLine" style="margin-top:10px">
                <input type="radio" :checked="!composeDraft.importAll" @change="composeDraft.importAll = false" />
                <div>
                  <b>Composer par section</b>
                  <div class="muted">Pour chaque section: importer ou remettre à 0.</div>
                </div>
              </label>
            </div>

            <div v-if="!composeDraft.importAll" class="sectionBox">
              <div class="sectionTitle">Composition</div>

              <div class="composeGrid">
                <div v-for="s in sectionDefs" :key="s.key" class="composeRow">
                  <div class="lbl"><b>{{ s.label }}</b></div>

                  <div class="tog">
                    <button class="btn btn--mini" :class="{ btnOn: composeDraft.bySection[s.key].mode === 'IMPORT' }" @click="setSectionMode(s.key, 'IMPORT')">Importer</button>
                    <button class="btn btn--mini" :class="{ btnOn: composeDraft.bySection[s.key].mode === 'ZERO' }" @click="setSectionMode(s.key, 'ZERO')">0</button>
                  </div>

                  <div class="src" v-if="composeDraft.bySection[s.key].mode === 'IMPORT'">
                    <select class="in" v-model="(composeDraft.bySection[s.key] as any).fromVariantId">
                      <option value="">— Variante —</option>
                      <option v-for="v in (allVariants ?? [])" :key="v.id" :value="v.id">{{ v.label }}</option>
                    </select>
                  </div>
                  <div class="src muted" v-else>—</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modalFoot">
          <button class="btn btn--ghost" @click="close()">Annuler</button>
          <button v-if="mode === 'INITIEE'" class="btn btn--primary" :disabled="!!initErr" @click="submitInitiee()">Créer</button>
          <button v-else class="btn btn--primary" :disabled="!!composeErr" @click="submitComposee()">Créer</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modalOverlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); display:flex; align-items:center; justify-content:center; padding:18px; z-index:9999; }
.modal { width:min(900px,100%); max-height:calc(100vh - 36px); background:#fff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.15); display:flex; flex-direction:column; }
.modalHead { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:12px 14px; background:#fafafa; border-bottom:1px solid #eef2f7; }
.modalTitle { display:flex; flex-direction:column; gap:3px; }
.modalSub { color:#9ca3af; font-size:11px; }
.xBtn { border:1px solid #e5e7eb; background:#fff; border-radius:12px; width:34px; height:34px; cursor:pointer; }
.xBtn:hover { background:#f9fafb; }
.modalBody { padding:14px; overflow:auto; flex:1 1 auto; }
.modalFoot { padding:12px 14px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eef2f7; background:#fcfcfd; }
.alert { border:1px solid #fecaca; background:#fff5f5; color:#991b1b; border-radius:12px; padding:10px; margin-bottom:12px; }
.sectionBox { border:1px solid #eef0f4; border-radius:14px; background:#fcfcfd; padding:10px; margin-bottom:12px; }
.sectionTitle { font-size:12px; font-weight:900; color:#111827; margin-bottom:8px; }
.formGrid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
.f { display:flex; flex-direction:column; gap:6px; }
.f--full { grid-column:1 / -1; }
.k { font-size:12px; color:#6b7280; font-weight:700; }
.in { border:1px solid #e5e7eb; border-radius:12px; padding:9px 10px; font-size:13px; outline:none; background:#fff; }
.in:focus { border-color:#c7d2fe; box-shadow:0 0 0 3px rgba(99,102,241,0.10); }
.r { text-align:right; }
.btn { border-radius:12px; padding:9px 12px; font-size:13px; border:1px solid #e6e8ee; background:#fff; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn--primary { background:#0b7a35; border-color:#0b7a35; color:#fff; }
.btn--primary:hover { background:#096a2e; }
.btn--ghost { background:transparent; }
.btn--ghost:hover { background:#ffffff; }
.btn--mini { padding: 6px 9px; border-radius: 10px; font-size: 12px; line-height: 16px; }
.btnOn { background:#0b7a35; border-color:#0b7a35; color:#fff; }
.muted { font-size:12px; color:#6b7280; }

.searchMini { margin-top:10px; display:flex; align-items:center; gap:6px; border:1px solid #e6e8ee; border-radius:10px; padding:4px 8px; background:#fafbfc; }
.icon { font-size:11px; line-height:1; color:#6b7280; }
.input { min-width:0; border:0; outline:0; background:transparent; width:100%; font-size:12.5px; line-height:16px; padding:0; }
.chipRow { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.chip { display:inline-flex; gap:6px; align-items:center; padding:4px 8px; border-radius:999px; border:1px solid #dbeafe; background:#eff6ff; color:#1d4ed8; font-size:12px; cursor:pointer; }
.chipX { color:#1e40af; font-size:11px; }
.chips { margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
.chipBtn { border:1px solid #e5e7eb; background:#fff; border-radius:999px; padding:6px 10px; font-size:12px; cursor:pointer; }
.chipBtn:hover { background:#f9fafb; }
.chipBtn.on { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }

.radioLine { display:flex; gap:10px; align-items:flex-start; padding:8px 8px; border:1px solid #e5e7eb; border-radius:12px; background:#fff; }
.radioLine input { margin-top:3px; }

.composeGrid { display:flex; flex-direction:column; gap:8px; }
.composeRow { display:grid; grid-template-columns: 180px 180px 1fr; gap:10px; align-items:center; border:1px solid #eef0f4; border-radius:12px; padding:8px; background:#fff; }
.lbl { font-size:12.5px; color:#111827; }
.tog { display:flex; gap:6px; }
.src { min-width:0; }
@media (max-width: 900px) { .formGrid { grid-template-columns:1fr; } .composeRow { grid-template-columns: 1fr; } }
</style>
