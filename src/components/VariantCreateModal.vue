<script setup lang="ts">
import { computed, reactive, watch } from "vue";

export type VariantCreateModeUi = "ZERO" | "INITIEE" | "COMPOSEE";

type BasePayload = {
  contractId: string;
  title: string;
  description: string | null;
  status: "INITIALISEE" | "ENCOURS" | "ANNULEE" | "CLOTUREE";
};

export type SavePayload = BasePayload & { createMode: "ZERO" };
export type NextPayload = BasePayload & { createMode: "INITIEE" | "COMPOSEE" };

const props = defineProps<{
  modelValue: boolean;
  contractId: string | null;
  defaultTitle?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "save", payload: SavePayload): void;
  (e: "next", payload: NextPayload): void;
}>();

const isOpen = computed(() => !!props.modelValue);

const draft = reactive({
  contractId: "",
  title: props.defaultTitle ?? "Variante",
  description: null as string | null,
  status: "INITIALISEE" as BasePayload["status"],
  createMode: "ZERO" as VariantCreateModeUi,
});

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    draft.contractId = props.contractId ?? "";
    draft.title = props.defaultTitle ?? "Variante";
    draft.description = null;
    draft.status = "INITIALISEE";
    draft.createMode = "ZERO";
  }
);

const canSubmit = computed(() => !!draft.contractId && !!draft.title.trim());

function close() {
  emit("update:modelValue", false);
  emit("close");
}

function submit() {
  if (!canSubmit.value) return;

  const base: BasePayload = {
    contractId: draft.contractId,
    title: draft.title.trim(),
    description: draft.description?.trim() ? draft.description.trim() : null,
    status: draft.status,
  };

  if (draft.createMode === "ZERO") {
    const payload: SavePayload = { ...base, createMode: "ZERO" };
    emit("save", payload);
  } else {
    const payload: NextPayload = {
      ...base,
      createMode: draft.createMode === "INITIEE" ? "INITIEE" : "COMPOSEE",
    };
    emit("next", payload);
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="vmodal__backdrop" @click.self="close">
      <div class="vmodal" role="dialog" aria-modal="true">
        <div class="vmodal__head">
          <div>
            <div class="vmodal__title">Créer une variante</div>
            <div class="vmodal__sub">Liée à un contrat (obligatoire)</div>
          </div>
          <button class="xbtn" @click="close">✕</button>
        </div>

        <div class="vmodal__body">
          <div class="grid">
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

          <div class="sep"></div>

          <div class="k">Mode de création</div>
          <div class="chips">
            <label class="chip" :class="{ 'chip--on': draft.createMode === 'ZERO' }">
              <input type="radio" value="ZERO" v-model="draft.createMode" />
              <span>Variante Zéro</span>
            </label>
            <label class="chip" :class="{ 'chip--on': draft.createMode === 'INITIEE' }">
              <input type="radio" value="INITIEE" v-model="draft.createMode" />
              <span>Variante Initiée</span>
            </label>
            <label class="chip" :class="{ 'chip--on': draft.createMode === 'COMPOSEE' }">
              <input type="radio" value="COMPOSEE" v-model="draft.createMode" />
              <span>Variante Composée</span>
            </label>
          </div>

          <div class="hint">
            • <b>Zéro</b> : Enregistrer direct<br />
            • <b>Initiée</b> : Suivant → infos d’initiation<br />
            • <b>Composée</b> : Suivant → composition par sections
          </div>
        </div>

        <div class="vmodal__foot">
          <button class="btn" @click="close">Annuler</button>
          <button class="btn btn--primary" :disabled="!canSubmit" @click="submit">
            {{ draft.createMode === "ZERO" ? "Enregistrer" : "Suivant" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* garde ton style existant si tu veux, ou recopie celui que tu avais */
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
  width: min(760px, 100%);
  max-height: calc(100vh - 36px);
  background: #0b1220;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
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
}
.vmodal__foot {
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
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
.sep {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 12px 0;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.chip {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
}
.chip--on {
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(59, 130, 246, 0.12);
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
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
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
