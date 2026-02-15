<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { VARIANT_STATUS_OPTS, type VariantStatusUi } from "@/constants/variantStatus";


export type VariantCreateModeUi = "ZERO" | "INITIEE" | "COMPOSEE";



export type VariantCreateZeroPayload = {
  contractId: string;
  title: string;
  description: string | null;
  status: VariantStatusUi;
  createMode: "ZERO";
};

export type VariantCreateNextPayload = {
  contractId: string;
  title: string;
  description: string | null;
  status: VariantStatusUi;
  createMode: "INITIEE" | "COMPOSEE";
};

type Draft = {
  contractId: string;
  title: string;
  description: string | null;
  status: VariantStatusUi;
  createMode: VariantCreateModeUi;
};

const props = defineProps<{
  open: boolean;
  contractId: string | null;
  defaultTitle?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", payload: VariantCreateZeroPayload): void;
  (e: "next", payload: VariantCreateNextPayload): void;
}>();

const isOpen = computed(() => !!props.open);
const titleRef = ref<HTMLInputElement | null>(null);

const draft = reactive<Draft>({
  contractId: "",
  title: props.defaultTitle ?? "Variante",
  description: null,
  status: "ENCOURS",
  createMode: "ZERO",
});

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    draft.contractId = props.contractId ?? "";
    draft.title = props.defaultTitle ?? "Variante";
    draft.description = null;
    draft.status = "ENCOURS";
    draft.createMode = "ZERO";
    await nextTick();
    titleRef.value?.focus();
    titleRef.value?.select?.();
  },
  { immediate: true }
);

const canSubmit = computed(() => {
  const contractId = String(props.contractId ?? "").trim();
  const title = String(draft.title ?? "").trim();
  return !!contractId && !!title && !!draft.status;
});

const modeMeta: Record<
  VariantCreateModeUi,
  { title: string; desc: string; hint: string; tag: string }
> = {
  ZERO: {
    title: "Zéro",
    desc: "Tout initialiser à 0 / vide",
    hint: "Le plus rapide pour démarrer.",
    tag: "Instant",
  },
  INITIEE: {
    title: "Initiée",
    desc: "Assistant (paramètres) → init",
    hint: "EBIT cible + résistances.",
    tag: "Guidé",
  },
  COMPOSEE: {
    title: "Composée",
    desc: "Composer par section",
    hint: "Importer certaines sections.",
    tag: "Avancé",
  },
};

function close() {
  emit("close");
}

function submit() {
  const contractId = String(props.contractId ?? "").trim();
  if (!contractId) return;

  const title = String(draft.title ?? "").trim();
  if (!title) return;

  const base = {
    contractId,
    title,
    description:
      draft.description && String(draft.description).trim()
        ? String(draft.description).trim()
        : null,
    status: draft.status,
  };

  if (draft.createMode === "ZERO") {
    emit("save", { ...base, createMode: "ZERO" });
    return;
  }

  emit("next", { ...base, createMode: draft.createMode });
}
</script>

<template>
  <teleport to="body">
    <div v-if="isOpen" class="ovl" role="dialog" aria-modal="true" @mousedown.self="close()">
      <div class="dlg">
        <div class="hdr">
          <div class="ttl">
            <b>Créer une variante</b>
            <div class="sub">Choisis un mode + statut, puis continue.</div>
          </div>
          <button class="x" type="button" @click="close()" aria-label="Fermer">✕</button>
        </div>

        <div class="body">
          <div class="grid">
            <div class="f">
              <div class="k">Titre</div>
              <input ref="titleRef" class="in" v-model="draft.title" placeholder="Titre de la variante" />
            </div>

            <div class="f">
              <div class="k">Statut</div>
              <select class="in" v-model="draft.status">
                <option v-for="s in VARIANT_STATUS_OPTS" :key="s.value" :value="s.value">
                  {{ s.label }}
                </option>
              </select>
            </div>

            <div class="f f--full">
              <div class="k">Description (optionnelle)</div>
              <textarea class="in" rows="3" v-model="draft.description" placeholder="Description…"></textarea>
            </div>
          </div>

          <div class="modes">
            <button
              v-for="m in (['ZERO','INITIEE','COMPOSEE'] as const)"
              :key="m"
              class="mode"
              :class="{ on: draft.createMode === m }"
              type="button"
              @click="draft.createMode = m"
            >
              <div class="mTop">
                <b>{{ modeMeta[m].title }}</b>
                <span class="tag">{{ modeMeta[m].tag }}</span>
              </div>
              <div class="mDesc">{{ modeMeta[m].desc }}</div>
              <div class="mHint">{{ modeMeta[m].hint }}</div>
            </button>
          </div>
        </div>

        <div class="ftr">
          <button class="btn" type="button" @click="close()">Annuler</button>
          <button class="btn pri" type="button" :disabled="!canSubmit" @click="submit()">
            Continuer
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  z-index: 20000; /* ✅ au-dessus du header + autres */
}

.dlg {
  width: min(780px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
}

.hdr {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.03);
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}

.ttl .sub {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
}

.x {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  cursor: pointer;
}

.body {
  padding: 14px;
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
  font-weight: 900;
  color: rgba(15, 23, 42, 0.6);
}

.in {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 800;
  outline: none;
}

.in:focus {
  border-color: rgba(32, 184, 232, 0.45);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.14);
}

.modes {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.mode {
  text-align: left;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 10px;
  cursor: pointer;
}

.mode.on {
  border-color: rgba(24, 64, 112, 0.35);
  background: rgba(24, 64, 112, 0.08);
  box-shadow: 0 0 0 4px rgba(24, 64, 112, 0.10);
}

.mTop {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.tag {
  font-size: 10px;
  font-weight: 950;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 999px;
  padding: 3px 8px;
  background: #fff;
  color: rgba(15, 23, 42, 0.7);
}

.mDesc {
  margin-top: 6px;
  font-weight: 900;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.86);
}

.mHint {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
}

.ftr {
  padding: 12px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.02);
}

.btn {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  font-weight: 950;
  cursor: pointer;
}

.btn.pri {
  background: rgba(24, 64, 112, 0.12);
  border-color: rgba(24, 64, 112, 0.28);
  color: rgba(24, 64, 112, 1);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .modes {
    grid-template-columns: 1fr;
  }
}
</style>
