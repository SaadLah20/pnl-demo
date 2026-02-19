<!-- ✅ src/components/FormuleModal.vue
     - Villes + Régions en listes déroulantes (comme MpModal)
     - Résistance via liste imposée
     - ✅ Fix: aucune validation affichée lors du 1er clic Fermer/Annuler (fermeture immédiate)
     - Validation affichée uniquement après tentative d'enregistrement
     - ✅ Robust: accepte cities/regions en string[] OU objets; fallback input si liste vide
-->
<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { XMarkIcon, CheckIcon, ExclamationTriangleIcon } from "@heroicons/vue/24/outline";

type FormuleDraft = {
  label: string;
  resistance: string;
  city: string;
  region: string;
  comment?: string | null;
};

const RESISTANCE_OPTS = [
  "C8/10","C12/15","C16/20","C20/25","C25/30","C30/37","C35/45","C40/50","C45/55","C50/60","C55/67","C60/75",
  "C70/85","C80/95","C90/105","C100/115",
  "ARTEVIA","HYDROMEDIA","AGILIA","CHRONOLIA","CHAPE",
] as const;

type OptLike = string | { label?: string; name?: string; value?: string; id?: string };

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  title?: string;
  initial: FormuleDraft;

  // ✅ accepte string[] ou objets (robuste)
  regions?: readonly OptLike[];
  cities?: readonly OptLike[];

  busy?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", payload: FormuleDraft): void;
}>();

const local = reactive<FormuleDraft>({
  label: "",
  resistance: "",
  city: "",
  region: "",
  comment: null,
});

const triedSubmit = ref(false);

// ✅ anti-flicker: empêcher l’affichage des erreurs juste parce qu’un blur se produit lors du clic sur fermer
const suppressValidation = ref(false);

/* =========================
   NORMALISATION OPTIONS
========================= */
function normOpt(x: OptLike): string {
  if (typeof x === "string") return x.trim();
  const v = String(x?.label ?? x?.name ?? x?.value ?? x?.id ?? "").trim();
  return v;
}
function uniqSorted(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = String(s ?? "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  // tri doux (fr)
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}

const regions = computed(() => {
  const raw = (props.regions ?? []) as readonly OptLike[];
  return uniqSorted(raw.map(normOpt));
});
const cities = computed(() => {
  const raw = (props.cities ?? []) as readonly OptLike[];
  return uniqSorted(raw.map(normOpt));
});

const hasRegions = computed(() => regions.value.length > 0);
const hasCities = computed(() => cities.value.length > 0);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    triedSubmit.value = false;
    suppressValidation.value = false;

    Object.assign(local, {
      label: String(props.initial?.label ?? ""),
      resistance: String(props.initial?.resistance ?? ""),
      city: String(props.initial?.city ?? ""),
      region: String(props.initial?.region ?? ""),
      comment: props.initial?.comment ?? null,
    });

    nextTick(() => {
      const el = document.getElementById("formuleLabelInput") as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  },
  { immediate: true }
);

const labelOk = computed(() => String(local.label ?? "").trim().length >= 2);
const resistanceOk = computed(() => String(local.resistance ?? "").trim().length > 0);
const cityOk = computed(() => String(local.city ?? "").trim().length > 0);
const regionOk = computed(() => String(local.region ?? "").trim().length > 0);

const canSubmit = computed(() => labelOk.value && resistanceOk.value && cityOk.value && regionOk.value);
const showErrs = computed(() => triedSubmit.value && !suppressValidation.value);

function beginClose() {
  suppressValidation.value = true;
}

function close() {
  triedSubmit.value = false;
  emit("close");
  nextTick(() => {
    suppressValidation.value = false;
  });
}

function submit() {
  triedSubmit.value = true;
  if (!canSubmit.value) return;

  emit("save", {
    label: String(local.label ?? "").trim(),
    resistance: String(local.resistance ?? "").trim(),
    city: String(local.city ?? "").trim(),
    region: String(local.region ?? "").trim(),
    comment: String(local.comment ?? "").trim() || null,
  });
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    close();
  }
  if (e.key === "Enter") {
    const t = e.target as HTMLElement | null;
    if (t && t.tagName?.toLowerCase() === "textarea") return;
    e.preventDefault();
    submit();
  }
}

onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="ovl" @mousedown.self="beginClose(); close()">
      <div class="dlg" role="dialog" aria-modal="true">
        <div class="hdr">
          <div>
            <div class="ttl">
              {{ title ?? (mode === "edit" ? "Modifier la formule" : "Nouvelle formule") }}
            </div>
            <div class="sub">Renseigne les champs requis (*)</div>
          </div>

          <button class="x" type="button" @mousedown.prevent="beginClose()" @click="close" :disabled="busy" aria-label="Fermer">
            <XMarkIcon class="ic" />
          </button>
        </div>

        <div v-if="error" class="err">
          <ExclamationTriangleIcon class="err__ic" />
          <div>{{ error }}</div>
        </div>

        <div class="grid">
          <label class="field span2">
            <span class="lab">Libellé *</span>
            <input
              id="formuleLabelInput"
              v-model="local.label"
              class="in"
              placeholder="Ex: Béton pompe 350"
              :class="{ bad: showErrs && !labelOk }"
              :disabled="busy"
            />
            <span v-if="showErrs && !labelOk" class="hintBad">Libellé obligatoire (min 2 caractères).</span>
          </label>

          <label class="field">
            <span class="lab">Résistance *</span>
            <select v-model="local.resistance" class="in" :class="{ bad: showErrs && !resistanceOk }" :disabled="busy">
              <option value="" disabled>Sélectionner…</option>
              <option v-for="r in RESISTANCE_OPTS" :key="r" :value="r">{{ r }}</option>
            </select>
            <span v-if="showErrs && !resistanceOk" class="hintBad">Résistance obligatoire.</span>
          </label>

          <!-- ✅ Ville: select si liste dispo, sinon input -->
          <label class="field">
            <span class="lab">Ville *</span>

            <select
              v-if="hasCities"
              v-model="local.city"
              class="in"
              :class="{ bad: showErrs && !cityOk }"
              :disabled="busy"
            >
              <option value="" disabled>Sélectionner une ville…</option>
              <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
            </select>

            <input
              v-else
              v-model="local.city"
              class="in"
              placeholder="Saisir la ville…"
              :class="{ bad: showErrs && !cityOk }"
              :disabled="busy"
            />

            <span v-if="showErrs && !cityOk" class="hintBad">Ville obligatoire.</span>
            <span v-if="!hasCities" class="hintInfo">Liste des villes non fournie → saisie manuelle.</span>
          </label>

          <!-- ✅ Région: select si liste dispo, sinon input -->
          <label class="field">
            <span class="lab">Région *</span>

            <select
              v-if="hasRegions"
              v-model="local.region"
              class="in"
              :class="{ bad: showErrs && !regionOk }"
              :disabled="busy"
            >
              <option value="" disabled>Sélectionner une région…</option>
              <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
            </select>

            <input
              v-else
              v-model="local.region"
              class="in"
              placeholder="Saisir la région…"
              :class="{ bad: showErrs && !regionOk }"
              :disabled="busy"
            />

            <span v-if="showErrs && !regionOk" class="hintBad">Région obligatoire.</span>
            <span v-if="!hasRegions" class="hintInfo">Liste des régions non fournie → saisie manuelle.</span>
          </label>

          <label class="field span3">
            <span class="lab">Commentaire</span>
            <textarea v-model="local.comment" class="in ta" rows="3" placeholder="Optionnel" :disabled="busy"></textarea>
          </label>
        </div>

        <div class="ftr">
          <button class="btn ghost" type="button" @mousedown.prevent="beginClose()" @click="close" :disabled="busy">
            Annuler
          </button>

          <button class="btn primary" type="button" @click="submit" :disabled="busy">
            <CheckIcon class="btnic" />
            <span>{{ busy ? "Enregistrement..." : "Enregistrer" }}</span>
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.ovl{ position: fixed; inset: 0; background: rgba(2, 6, 23, 0.55); display:flex; align-items:center; justify-content:center; padding:16px; z-index:100000; }
.dlg{ width:min(860px, 96vw); background:#fff; border:1px solid rgba(16,24,40,0.14); border-radius:18px; overflow:hidden; }
.hdr{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:12px 14px 10px; border-bottom:1px solid rgba(16,24,40,0.1); }
.ttl{ font-size:14px; font-weight:950; color:#0f172a; }
.sub{ font-size:11px; font-weight:800; color:rgba(15,23,42,0.55); margin-top:2px; }
.x{ width:34px; height:34px; border-radius:12px; border:1px solid rgba(16,24,40,0.12); background:rgba(15,23,42,0.04); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
.ic{ width:18px; height:18px; color:rgba(15,23,42,0.75); }
.x:hover{ background:rgba(2,132,199,0.08); border-color:rgba(2,132,199,0.18); }

.err{ margin:10px 14px 0; padding:10px 12px; border-radius:14px; border:1px solid rgba(239,68,68,0.35); background:rgba(239,68,68,0.08); color:rgba(127,29,29,0.95); font-weight:850; font-size:12px; display:flex; gap:8px; align-items:flex-start; }
.err__ic{ width:18px; height:18px; flex:0 0 auto; margin-top:1px; }

.grid{ padding:12px 14px 8px; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
.field{ display:flex; flex-direction:column; gap:6px; min-width:0; }
.lab{ font-size:11px; font-weight:950; color:rgba(15,23,42,0.72); }

.in{ height:36px; border-radius:14px; border:1px solid rgba(16,24,40,0.12); background:#fff; padding:0 12px; font-size:12px; font-weight:850; color:#0f172a; outline:none; }
.in:focus{ border-color:rgba(2,132,199,0.35); box-shadow:0 0 0 4px rgba(2,132,199,0.10); }
.in.bad{ border-color:rgba(239,68,68,0.35); box-shadow:0 0 0 4px rgba(239,68,68,0.10); }
.ta{ height:auto; padding-top:10px; padding-bottom:10px; }

.hintBad{ font-size:10px; font-weight:850; color:rgba(185,28,28,0.95); }
.hintInfo{ font-size:10px; font-weight:850; color:rgba(15,23,42,0.55); }

.span3{ grid-column: span 3; }
.span2{ grid-column: span 2; }

.ftr{ padding:10px 14px 14px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid rgba(16,24,40,0.1); background:rgba(15,23,42,0.02); }
.btn{ height:36px; padding:0 14px; border-radius:14px; border:1px solid rgba(16,24,40,0.12); background:rgba(15,23,42,0.04); font-weight:950; font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
.btn:hover{ background:rgba(2,132,199,0.08); border-color:rgba(2,132,199,0.18); }
.btn.primary{ background:rgba(24,64,112,0.92); border-color:rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover{ background:rgba(24,64,112,1); }
.btn.ghost{ background:rgba(255,255,255,0.8); }
.btn:disabled{ opacity:0.6; cursor:not-allowed; }
.btnic{ width:16px; height:16px; }

@media (max-width: 760px){
  .grid{ grid-template-columns: 1fr; }
  .span3, .span2{ grid-column: auto; }
}
</style>
