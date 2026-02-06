<script setup lang="ts">
import { computed, reactive, watch } from "vue";

export type VariantCreateModeUi = "ZERO" | "INITIEE" | "COMPOSEE";

export type VariantCreateZeroPayload = {
  contractId: string;
  title: string;
  description: string | null;
  status: "INITIALISEE" | "ENCOURS" | "ANNULEE" | "CLOTUREE";
  createMode: "ZERO";
};

export type VariantCreateNextPayload = {
  contractId: string;
  title: string;
  description: string | null;
  status: "INITIALISEE" | "ENCOURS" | "ANNULEE" | "CLOTUREE";
  createMode: "INITIEE" | "COMPOSEE";
};

type Draft = {
  contractId: string;
  title: string;
  description: string | null;
  status: "INITIALISEE" | "ENCOURS" | "ANNULEE" | "CLOTUREE";
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

const draft = reactive<Draft>({
  contractId: "",
  title: props.defaultTitle ?? "Variante",
  description: null,
  status: "INITIALISEE",
  createMode: "ZERO",
});

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    draft.contractId = props.contractId ?? "";
    draft.title = props.defaultTitle ?? "Variante";
    draft.description = null;
    draft.status = "INITIALISEE";
    draft.createMode = "ZERO";
  },
  { immediate: true }
);

function close() {
  emit("close");
}

function submit() {
  const contractId = String(props.contractId ?? "").trim();
  if (!contractId) return;

  const base = {
    contractId,
    title: String(draft.title ?? "").trim() || "Variante",
    description: draft.description && String(draft.description).trim() ? String(draft.description).trim() : null,
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
  <Teleport to="body">
    <div v-if="isOpen" class="overlay" @click.self="close()">
      <div class="modal">
        <div class="head">
          <div class="ttl">
            <b>Créer une variante</b>
            <div class="sub">Choisis le mode de création</div>
          </div>
          <button class="x" @click="close()">✕</button>
        </div>

        <div class="body">
          <div class="grid">
            <div class="f">
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
              <div class="k">Description</div>
              <textarea class="in" rows="3" v-model="draft.description" placeholder="Optionnel"></textarea>
            </div>

            <div class="f f--full">
              <div class="k">Mode de création</div>

              <div class="modes">
                <label class="mode">
                  <input type="radio" value="ZERO" v-model="draft.createMode" />
                  <div class="txt">
                    <b>Zéro</b>
                    <div class="muted">Toutes les sections à 0 / vides.</div>
                  </div>
                </label>

                <label class="mode">
                  <input type="radio" value="INITIEE" v-model="draft.createMode" />
                  <div class="txt">
                    <b>Initiée</b>
                    <div class="muted">Wizard → paramètres obligatoires, puis init.</div>
                  </div>
                </label>

                <label class="mode">
                  <input type="radio" value="COMPOSEE" v-model="draft.createMode" />
                  <div class="txt">
                    <b>Composée</b>
                    <div class="muted">Wizard → composer section par section.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="foot">
          <button class="btn btn--ghost" @click="close()">Annuler</button>

          <button v-if="draft.createMode === 'ZERO'" class="btn btn--primary" @click="submit()">
            Enregistrer
          </button>

          <button v-else class="btn btn--primary" @click="submit()">
            Suivant
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay{position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999}
.modal{width:min(760px,100%);max-height:calc(100vh - 36px);background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.15);display:flex;flex-direction:column}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 14px;background:#fafafa;border-bottom:1px solid #eef2f7}
.ttl{display:flex;flex-direction:column;gap:3px}
.sub{color:#9ca3af;font-size:11px}
.x{border:1px solid #e5e7eb;background:#fff;border-radius:12px;width:34px;height:34px;cursor:pointer}
.x:hover{background:#f9fafb}
.body{padding:14px;overflow:auto;flex:1 1 auto}
.foot{padding:12px 14px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #eef2f7;background:#fcfcfd}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.f{display:flex;flex-direction:column;gap:6px}
.f--full{grid-column:1/-1}
.k{font-size:12px;color:#6b7280;font-weight:700}
.in{border:1px solid #e5e7eb;border-radius:12px;padding:9px 10px;font-size:13px;outline:none;background:#fff}
.in:focus{border-color:#c7d2fe;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
.modes{display:flex;flex-direction:column;gap:8px}
.mode{display:flex;gap:10px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff;cursor:pointer}
.mode input{margin-top:3px}
.txt{display:flex;flex-direction:column;gap:2px}
.muted{font-size:12px;color:#6b7280}
.btn{border-radius:12px;padding:9px 12px;font-size:13px;border:1px solid #e6e8ee;background:#fff;cursor:pointer}
.btn:hover{background:#f9fafb}
.btn--primary{background:#0b7a35;border-color:#0b7a35;color:#fff}
.btn--primary:hover{background:#096a2e}
.btn--ghost{background:transparent}
.btn--ghost:hover{background:#ffffff}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
</style>
