<!-- src/components/modals/FormuleModal.vue -->
<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { XMarkIcon } from "@heroicons/vue/24/outline";

type FormuleDraft = {
  label: string;
  resistance: string;
  city: string;
  region: string;
  comment?: string | null;
};

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  modelValue: FormuleDraft;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "update:modelValue", v: FormuleDraft): void;
  (e: "save"): void;
}>();

const local = reactive<FormuleDraft>({
  label: "",
  resistance: "",
  city: "",
  region: "",
  comment: "",
});

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    Object.assign(local, props.modelValue ?? {});
  },
  { immediate: true }
);

watch(
  () => ({ ...local }),
  (v) => emit("update:modelValue", { ...v }),
  { deep: true }
);

const title = computed(() => (props.mode === "create" ? "Nouvelle formule" : "Modifier formule"));

function close() {
  emit("update:open", false);
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) close();
}
</script>

<template>
  <!-- ✅ IMPORTANT: Teleport -> body -->
  <teleport to="body">
    <div v-if="open" class="modal" @mousedown="onBackdrop">
      <div class="modalCard" role="dialog" aria-modal="true">
        <div class="modalHead">
          <div class="mh">{{ title }}</div>
          <button class="iconBtn" @click="close" aria-label="Fermer">
            <XMarkIcon class="actIc" />
          </button>
        </div>

        <div class="formGrid">
          <div class="f span2">
            <div class="l">Label *</div>
            <input class="input" v-model="local.label" placeholder="Ex: B25 S3" />
          </div>

          <div class="f">
            <div class="l">Résistance</div>
            <input class="input" v-model="local.resistance" placeholder="Ex: B25" />
          </div>

          <div class="f">
            <div class="l">Ville</div>
            <input class="input" v-model="local.city" placeholder="Ex: Casablanca" />
          </div>

          <div class="f">
            <div class="l">Région</div>
            <input class="input" v-model="local.region" placeholder="Ex: CASABLANCA-SETTAT" />
          </div>

          <div class="f span2">
            <div class="l">Commentaire</div>
            <input class="input" v-model="local.comment" placeholder="Optionnel" />
          </div>
        </div>

        <div class="modalActions">
          <button class="btn" @click="close">Annuler</button>
          <button class="btn primary" @click="$emit('save')" :disabled="saving">
            {{ saving ? "Enregistrement..." : "Enregistrer" }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
/* ✅ Toujours au-dessus de TOUT */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 2147483647;
}

.modalCard {
  width: min(760px, 100%);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  padding: 12px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
}

.modalHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.mh {
  font-weight: 950;
  color: #0f172a;
}

.formGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 760px) {
  .formGrid {
    grid-template-columns: 1fr;
  }
}

.f {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.f .l {
  font-size: 11px;
  color: #6b7280;
  font-weight: 900;
}

.span2 {
  grid-column: span 2;
}
@media (max-width: 760px) {
  .span2 {
    grid-column: span 1;
  }
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 12px;
  font-size: 13px;
  background: #fff;
}

.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  height: 34px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  border-radius: 14px;
  padding: 0 12px;
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.18);
}

.btn.primary {
  background: rgba(24, 64, 112, 0.92);
  border-color: rgba(24, 64, 112, 0.6);
  color: #fff;
}
.btn.primary:hover {
  background: rgba(24, 64, 112, 1);
}

.iconBtn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.iconBtn:hover {
  background: #f9fafb;
}
.actIc {
  width: 18px;
  height: 18px;
}
</style>
