<!-- src/components/modals/CreateVariantModal.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { buildVariantInitPayload, type VariantInitMode } from "@/services/VariantInit";

const props = defineProps<{
  open: boolean;
  contractId: string | null;
  apiBase?: string; // default http://localhost:3001
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", variant: any): void;
}>();

const API = computed(() => props.apiBase ?? "http://localhost:3001");

async function apiJson(url: string, opts?: RequestInit) {
  const res = await fetch(API.value + url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });

  if (!res.ok) {
    let msg = `API error: ${res.status}`;
    try {
      const j = await res.clone().json();
      if (typeof j?.error === "string") msg = j.error;
      else if (typeof j?.message === "string") msg = j.message;
    } catch {
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {}
    }
    throw new Error(msg);
  }
  return res.json().catch(() => null);
}

const step = ref<1 | 2>(1);
const busy = ref(false);
const err = ref<string | null>(null);

const model = reactive({
  title: "Variante",
  description: "",
  status: "INITIALISEE",
  mode: "ZERO" as VariantInitMode,
});

function reset() {
  step.value = 1;
  busy.value = false;
  err.value = null;
  model.title = "Variante";
  model.description = "";
  model.status = "INITIALISEE";
  model.mode = "ZERO";
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

function next() {
  err.value = null;
  if (!model.title.trim()) {
    err.value = "Le titre est obligatoire.";
    return;
  }
  step.value = 2;
}

function back() {
  err.value = null;
  step.value = 1;
}

async function create() {
  err.value = null;

  if (!props.contractId) {
    err.value = "contractId manquant : une variante doit être liée à un contrat.";
    return;
  }

  busy.value = true;
  try {
    const created = await apiJson("/variants", {
      method: "POST",
      body: JSON.stringify({
        contractId: props.contractId,
        title: model.title.trim(),
        description: model.description?.trim() ? model.description.trim() : null,
        status: model.status,
      }),
    });

    const variantId = String(created?.id ?? "");
    if (!variantId) throw new Error("Réponse API invalide: id variante manquant.");

    // Init sections according to mode
    const initBody = buildVariantInitPayload(model.mode);

    const updated = await apiJson(`/variants/${variantId}`, {
      method: "PUT",
      body: JSON.stringify(initBody),
    });

    emit("created", updated ?? created);
    close();
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modalOverlay" @click.self="close()">
      <div class="modal">
        <div class="modalHead">
          <div class="modalTitle">
            <b>Créer une variante</b>
            <div class="modalSub">Liée à un contrat (obligatoire)</div>
          </div>
          <button class="xBtn" @click="close()">✕</button>
        </div>

        <div class="modalBody">
          <div v-if="err" class="alert"><b>Erreur :</b> {{ err }}</div>

          <div v-if="step === 1" class="stack">
            <div class="sectionBox">
              <div class="sectionTitle">Informations variante</div>

              <div class="formGrid">
                <div class="f f--full">
                  <div class="k">Titre</div>
                  <input class="in" v-model="model.title" placeholder="Titre variante" />
                </div>

                <div class="f">
                  <div class="k">Statut</div>
                  <select class="in" v-model="model.status">
                    <option value="INITIALISEE">INITIALISÉE</option>
                    <option value="ENCOURS">ENCOURS</option>
                    <option value="ANNULEE">ANNULÉE</option>
                    <option value="CLOTUREE">CLÔTURÉE</option>
                  </select>
                </div>

                <div class="f f--full">
                  <div class="k">Description (optionnelle)</div>
                  <textarea class="in" rows="4" v-model="model.description" placeholder="Description…"></textarea>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="stack">
            <div class="sectionBox">
              <div class="sectionTitle">Mode de création</div>

              <div class="modes">
                <label class="modeCard">
                  <input type="radio" value="ZERO" v-model="model.mode" />
                  <div class="modeText">
                    <b>Variante Zéro</b>
                    <div class="muted">Toutes les sections initialisées à 0 / vide.</div>
                  </div>
                </label>

                <label class="modeCard">
                  <input type="radio" value="INITIEE" v-model="model.mode" />
                  <div class="modeText">
                    <b>Variante Initiée</b>
                    <div class="muted">(Temporaire) initialisation aléatoire de toutes les sections.</div>
                  </div>
                </label>

                <label class="modeCard modeCard--disabled" title="Phase suivante">
                  <input type="radio" value="COMPOSEE" v-model="model.mode" disabled />
                  <div class="modeText">
                    <b>Variante Composée</b>
                    <div class="muted">Prochaine étape : composer section par section + validation “toutes sections”.</div>
                  </div>
                </label>
              </div>

              <div class="note">
                ⚠️ Formules : ton endpoint PUT ne peut modifier des formules que si des items existent déjà (par ID).
                On laissera “Formules” vide pour l’instant.
              </div>
            </div>
          </div>
        </div>

        <div class="modalFoot">
          <button v-if="step === 2" class="btn btn--ghost" :disabled="busy" @click="back()">Retour</button>
          <button v-else class="btn btn--ghost" :disabled="busy" @click="close()">Annuler</button>

          <button v-if="step === 1" class="btn btn--primary" :disabled="busy" @click="next()">Continuer</button>
          <button v-else class="btn btn--primary" :disabled="busy" @click="create()">
            {{ busy ? "Création…" : "Créer" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modalOverlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); display:flex; align-items:center; justify-content:center; padding:18px; z-index:9999; }
.modal { width:min(760px,100%); max-height:calc(100vh - 36px); background:#fff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.15); display:flex; flex-direction:column; }
.modalHead { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:12px 14px; background:#fafafa; border-bottom:1px solid #eef2f7; }
.modalTitle { display:flex; flex-direction:column; gap:3px; }
.modalSub { color:#9ca3af; font-size:11px; }
.xBtn { border:1px solid #e5e7eb; background:#fff; border-radius:12px; width:34px; height:34px; cursor:pointer; }
.xBtn:hover { background:#f9fafb; }
.modalBody { padding:14px; overflow:auto; flex:1 1 auto; }
.modalFoot { padding:12px 14px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eef2f7; background:#fcfcfd; }

.alert { border:1px solid #fecaca; background:#fff5f5; color:#991b1b; border-radius:12px; padding:10px; margin-bottom:12px; }
.stack { display:flex; flex-direction:column; gap:12px; }
.sectionBox { border:1px solid #eef0f4; border-radius:14px; background:#fcfcfd; padding:10px; }
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
.modeCard--disabled { opacity:0.6; cursor:not-allowed; }

.note { margin-top:10px; font-size:12px; color:#6b7280; background:#fafafa; border:1px dashed #e5e7eb; border-radius:12px; padding:10px; }

@media (max-width: 900px) { .formGrid { grid-template-columns:1fr; } }
</style>
