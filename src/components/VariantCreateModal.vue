<!-- src/components/VariantCreateModal.vue -->
<script setup lang="ts">
import { computed, reactive, watch } from "vue";

export type VariantCreateModeUi = "ZERO" | "INITIEE" | "COMPOSEE";

export type VariantCreateBase = {
  contractId: string;
  title: string;
  description: string | null;
  status: string;
};

export type VariantCreateZeroPayload = VariantCreateBase & { createMode: "ZERO" };
export type VariantCreateNextPayload = VariantCreateBase & { createMode: "INITIEE" | "COMPOSEE" };

const props = defineProps<{
  modelValue: boolean;
  contractId: string | null;
  defaultTitle?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "save", payload: VariantCreateZeroPayload): void;
  (e: "next", payload: VariantCreateNextPayload): void;
}>();

const isOpen = computed(() => !!props.modelValue);

type Draft = {
  title: string;
  description: string;
  status: string;
  createMode: VariantCreateModeUi;
};

const draft = reactive<Draft>({
  title: props.defaultTitle ?? "Variante",
  description: "",
  status: "INITIALISEE",
  createMode: "ZERO",
});

function reset() {
  draft.title = props.defaultTitle ?? "Variante";
  draft.description = "";
  draft.status = "INITIALISEE";
  draft.createMode = "ZERO";
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) reset();
  }
);

const err = computed(() => {
  if (!props.contractId) return "contractId manquant : une variante doit être liée à un contrat.";
  if (!draft.title.trim()) return "Le titre est obligatoire.";
  return null;
});

function close() {
  emit("update:modelValue", false);
  emit("close");
}

function submit() {
  if (err.value) return;

  const base: VariantCreateBase = {
    contractId: String(props.contractId),
    title: draft.title.trim(),
    description: draft.description?.trim() ? draft.description.trim() : null,
    status: String(draft.status ?? "INITIALISEE"),
  };

  if (draft.createMode === "ZERO") {
    emit("save", { ...base, createMode: "ZERO" });
    return;
  }

  emit("next", { ...base, createMode: draft.createMode });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modalOverlay" @click.self="close()">
      <div class="modal">
        <div class="modalHead">
          <div class="modalTitle">
            <b>Créer une variante</b>
            <div class="modalSub">Choisis un mode de création</div>
          </div>
          <button class="xBtn" @click="close()">✕</button>
        </div>

        <div class="modalBody">
          <div v-if="err" class="alert"><b>Erreur :</b> {{ err }}</div>

          <div class="sectionBox">
            <div class="sectionTitle">Informations</div>

            <div class="formGrid">
              <div class="f f--full">
                <div class="k">Titre</div>
                <input class="in" v-model="draft.title" placeholder="Titre variante" />
              </div>

              <div class="f">
                <div class="k">Statut</div>
                <select class="in" v-model="draft.status">
                  <option value="INITIALISEE">INITIALISÉE</option>
                  <option value="ENCOURS">ENCOURS</option>
                  <option value="ANNULEE">ANNULÉE</option>
                  <option value="CLOTUREE">CLÔTURÉE</option>
                </select>
              </div>

              <div class="f f--full">
                <div class="k">Description (optionnelle)</div>
                <textarea class="in" rows="3" v-model="draft.description" placeholder="Description…"></textarea>
              </div>
            </div>
          </div>

          <div class="sectionBox">
            <div class="sectionTitle">Mode</div>

            <div class="modes">
              <label class="modeCard">
                <input type="radio" value="ZERO" v-model="draft.createMode" />
                <div class="modeText">
                  <b>Zéro</b>
                  <div class="muted">Toutes les sections à 0 / vides.</div>
                </div>
              </label>

              <label class="modeCard">
                <input type="radio" value="INITIEE" v-model="draft.createMode" />
                <div class="modeText">
                  <b>Initiée</b>
                  <div class="muted">Wizard → paramètres (volume, résistances, EBIT…).</div>
                </div>
              </label>

              <label class="modeCard">
                <input type="radio" value="COMPOSEE" v-model="draft.createMode" />
                <div class="modeText">
                  <b>Composée</b>
                  <div class="muted">Wizard → composer par sections depuis d’autres variantes.</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="modalFoot">
          <button class="btn btn--ghost" @click="close()">Annuler</button>
          <button class="btn btn--primary" :disabled="!!err" @click="submit()">
            {{ draft.createMode === "ZERO" ? "Créer" : "Suivant" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modalOverlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); display:flex; align-items:center; justify-content:center; padding:18px; z-index:9999; }
.modal { width:min(780px,100%); max-height:calc(100vh - 36px); background:#fff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.15); display:flex; flex-direction:column; }
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
.btn { border-radius:12px; padding:9px 12px; font-size:13px; border:1px solid #e6e8ee; background:#fff; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn--primary { background:#0b7a35; border-color:#0b7a35; color:#fff; }
.btn--primary:hover { background:#096a2e; }
.btn--ghost { background:transparent; }
.btn--ghost:hover { background:#ffffff; }
.modes { display:flex; flex-direction:column; gap:8px; }
.modeCard { display:flex; gap:10px; align-items:flex-start; border:1px solid #e5e7eb; border-radius:12px; padding:10px; background:#fff; cursor:pointer; }
.modeCard input { margin-top:3px; }
.modeText { display:flex; flex-direction:column; gap:2px; }
.muted { font-size:12px; color:#6b7280; }
@media (max-width: 900px) { .formGrid { grid-template-columns:1fr; } }
</style>
