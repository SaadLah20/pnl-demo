<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";

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
const titleRef = ref<HTMLInputElement | null>(null);

const draft = reactive<Draft>({
  contractId: "",
  title: props.defaultTitle ?? "Variante",
  description: null,
  status: "INITIALISEE",
  createMode: "ZERO",
});

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    draft.contractId = props.contractId ?? "";
    draft.title = props.defaultTitle ?? "Variante";
    draft.description = null;
    draft.status = "INITIALISEE";
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
  return !!contractId && !!title;
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

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSubmit.value) submit();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close()" @keydown="onKeydown" tabindex="-1">
      <div class="md" role="dialog" aria-modal="true" aria-label="Créer une variante">
        <!-- Sticky header -->
        <div class="hd">
          <div class="hd__l">
            <div class="hd__t">Créer une variante</div>
            <div class="hd__s">Titre + mode de création</div>
          </div>
          <button class="x" type="button" @click="close()" aria-label="Fermer">✕</button>
        </div>

        <div class="bd">
          <!-- Compact form -->
          <div class="grid">
            <div class="f">
              <div class="k">Titre</div>
              <input ref="titleRef" class="in in--strong" v-model="draft.title" placeholder="Variante…" />
              <div class="hint">Astuce : <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> pour valider.</div>
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
              <textarea class="in" rows="2" v-model="draft.description" placeholder="Optionnel"></textarea>
            </div>

            <div class="f f--full">
              <div class="k">Mode</div>

              <!-- Mode cards -->
              <div class="modes" role="radiogroup" aria-label="Mode de création">
                <button
                  v-for="m in (['ZERO','INITIEE','COMPOSEE'] as const)"
                  :key="m"
                  type="button"
                  class="mode"
                  :class="{ on: draft.createMode === m }"
                  @click="draft.createMode = m"
                >
                  <div class="mode__top">
                    <div class="mode__title">{{ modeMeta[m].title }}</div>
                    <span class="tag">{{ modeMeta[m].tag }}</span>
                  </div>
                  <div class="mode__desc">{{ modeMeta[m].desc }}</div>
                  <div class="mode__hint">{{ modeMeta[m].hint }}</div>
                </button>
              </div>
            </div>
          </div>

          <div v-if="!canSubmit" class="warn">
            Sélection invalide : <b>contractId</b> manquant ou <b>titre</b> vide.
          </div>
        </div>

        <!-- Sticky footer -->
        <div class="ft">
          <button class="btn btn--ghost" type="button" @click="close()">Annuler</button>

          <button
            class="btn btn--primary"
            type="button"
            :disabled="!canSubmit"
            @click="submit()"
          >
            <span v-if="draft.createMode === 'ZERO'">Créer</span>
            <span v-else>Suivant</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* overlay + modal frame */
.ov{
  position:fixed; inset:0;
  background:rgba(17,24,39,.45);
  display:flex; align-items:center; justify-content:center;
  padding:16px;
  z-index:9999;
}
.md{
  width:min(760px, 100%);
  max-height:calc(100vh - 32px);
  background:#fff;
  border:1px solid rgba(15,23,42,.12);
  border-radius:16px;
  box-shadow:0 20px 60px rgba(0,0,0,.15);
  overflow:hidden;
  display:flex; flex-direction:column;
}

/* header/footer sticky */
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

/* form */
.grid{display:grid; grid-template-columns:1fr 1fr; gap:10px}
.f{display:flex; flex-direction:column; gap:6px}
.f--full{grid-column:1 / -1}
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
  font-weight:900;
}
.hint{
  font-size:11px;
  color:rgba(15,23,42,.5);
}
kbd{
  font-size:10px;
  border:1px solid rgba(15,23,42,.16);
  border-bottom-width:2px;
  border-radius:8px;
  padding:1px 6px;
  background:#fff;
}

/* mode cards */
.modes{
  display:grid;
  grid-template-columns:repeat(3, minmax(0, 1fr));
  gap:8px;
}
.mode{
  text-align:left;
  border:1px solid rgba(15,23,42,.12);
  background:#fff;
  border-radius:14px;
  padding:10px;
  cursor:pointer;
  min-width:0;
}
.mode:hover{background:rgba(2,132,199,.04); border-color:rgba(2,132,199,.18)}
.mode.on{
  border-color:rgba(16,185,129,.35);
  box-shadow:0 0 0 3px rgba(16,185,129,.10);
  background:rgba(16,185,129,.04);
}
.mode__top{display:flex; align-items:center; justify-content:space-between; gap:8px}
.mode__title{font-size:12px; font-weight:950; color:#0f172a}
.tag{
  font-size:10px;
  font-weight:900;
  padding:2px 8px;
  border-radius:999px;
  border:1px solid rgba(15,23,42,.12);
  background:rgba(15,23,42,.03);
  color:rgba(15,23,42,.7);
}
.mode__desc{margin-top:4px; font-size:12px; color:rgba(15,23,42,.82); font-weight:800}
.mode__hint{margin-top:2px; font-size:11px; color:rgba(15,23,42,.55)}

/* warning */
.warn{
  margin-top:10px;
  font-size:12px;
  padding:10px;
  border-radius:12px;
  border:1px solid rgba(245,158,11,.28);
  background:rgba(245,158,11,.08);
  color:rgba(15,23,42,.85);
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

@media (max-width: 900px){
  .grid{grid-template-columns:1fr}
  .modes{grid-template-columns:1fr}
}
</style>
