<!-- src/components/MpModal.vue (FICHIER COMPLET - inchangé fonctionnellement) -->
<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick } from "vue";
import {
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/vue/24/outline";

type MpDraft = {
  categorie: string;
  label: string;
  unite: string;
  prix: number;
  fournisseur: string;
  city: string;
  region: string;
  comment?: string | null;
};

type UnitOption = { value: string; label: string; disabled?: boolean };

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  title?: string;
  initial: MpDraft;

  categories: readonly string[];
  units: readonly UnitOption[];
  regions: readonly string[];
  cities: readonly string[];

  busy?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", payload: MpDraft): void;
}>();

const local = reactive<MpDraft>({
  categorie: "",
  label: "",
  unite: "",
  prix: 0,
  fournisseur: "",
  city: "",
  region: "",
  comment: null,
});

const showMore = ref(false);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    Object.assign(local, {
      categorie: props.initial?.categorie ?? "",
      label: props.initial?.label ?? "",
      unite: props.initial?.unite ?? "",
      prix: Number(props.initial?.prix ?? 0),
      fournisseur: props.initial?.fournisseur ?? "",
      city: props.initial?.city ?? "",
      region: props.initial?.region ?? "",
      comment: props.initial?.comment ?? null,
    });
    showMore.value = Boolean(local.fournisseur || local.comment);
    nextTick(() => {
      const el = document.getElementById("mpLabelInput") as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  },
  { immediate: true }
);

const canSubmit = computed(() => {
  const labelOk = String(local.label ?? "").trim().length >= 2;
  const catOk = String(local.categorie ?? "").trim().length > 0;
  const uniteOk = String(local.unite ?? "").trim().length > 0;
  const priceOk = Number.isFinite(Number(local.prix)) && Number(local.prix) > 0;
  const cityOk = String(local.city ?? "").trim().length > 0;
  const regionOk = String(local.region ?? "").trim().length > 0;
  return labelOk && catOk && uniteOk && priceOk && cityOk && regionOk && !props.busy;
});

function close() {
  emit("close");
}

function submit() {
  if (!canSubmit.value) return;
  emit("save", {
    categorie: String(local.categorie ?? "").trim(),
    label: String(local.label ?? "").trim(),
    unite: String(local.unite ?? "").trim(),
    prix: Number(local.prix ?? 0),
    fournisseur: String(local.fournisseur ?? "").trim(),
    city: String(local.city ?? "").trim(),
    region: String(local.region ?? "").trim(),
    comment: String(local.comment ?? "").trim() || null,
  });
}
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="ovl" @mousedown.self="close">
      <div class="dlg" role="dialog" aria-modal="true">
        <div class="hdr">
          <div>
            <div class="ttl">{{ title ?? (mode === "edit" ? "Modifier MP" : "Nouvelle MP") }}</div>
            <div class="sub">Champs requis (*)</div>
          </div>

          <button class="x" type="button" @click="close" :disabled="busy" aria-label="Fermer">
            <XMarkIcon class="ic" />
          </button>
        </div>

        <div v-if="error" class="err">
          <ExclamationTriangleIcon class="err__ic" />
          <div>{{ error }}</div>
        </div>

        <div class="grid">
          <label class="field">
            <span class="lab">Catégorie *</span>
            <select v-model="local.categorie" class="in" required>
              <option value="" disabled>Sélectionner…</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>

          <label class="field span2">
            <span class="lab">Libellé *</span>
            <input id="mpLabelInput" v-model="local.label" class="in" placeholder="Ex: Ciment CPJ 45" />
            <span class="hint">Min 2 caractères</span>
          </label>

          <label class="field">
            <span class="lab">Unité *</span>
            <select v-model="local.unite" class="in" required>
              <option value="" disabled>Sélectionner…</option>
              <option v-for="u in units" :key="u.value" :value="u.value" :disabled="u.disabled">{{ u.label }}</option>
            </select>
          </label>

          <label class="field">
            <span class="lab">Prix *</span>
            <input v-model.number="local.prix" class="in numIn" type="number" min="0" step="0.01" />
            <span class="hint mono">MAD</span>
          </label>

          <label class="field">
            <span class="lab">Ville *</span>
            <select v-model="local.city" class="in" required>
              <option value="" disabled>Sélectionner une ville…</option>
              <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>

          <label class="field">
            <span class="lab">Région *</span>
            <select v-model="local.region" class="in" required>
              <option value="" disabled>Sélectionner une région…</option>
              <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>

          <div class="more span3">
            <button class="moreBtn" type="button" @click="showMore = !showMore">
              <span>Options (fournisseur / commentaire)</span>
              <component :is="showMore ? ChevronUpIcon : ChevronDownIcon" class="moreIc" />
            </button>

            <div v-if="showMore" class="moreGrid">
              <label class="field">
                <span class="lab">Fournisseur</span>
                <input v-model="local.fournisseur" class="in" placeholder="Optionnel" />
              </label>

              <label class="field span2">
                <span class="lab">Commentaire</span>
                <input v-model="local.comment" class="in" placeholder="Optionnel (max 200)" />
              </label>
            </div>
          </div>
        </div>

        <div class="ftr">
          <button class="btn ghost" type="button" @click="close" :disabled="busy">Annuler</button>

          <button class="btn primary" type="button" @click="submit" :disabled="!canSubmit">
            <CheckIcon class="btnic" />
            <span>{{ busy ? "Enregistrement..." : "Enregistrer" }}</span>
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.ovl{
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 100000;
}
.dlg{
  width: min(860px, 96vw);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  overflow: hidden;
}
.hdr{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
}
.ttl{ font-size: 14px; font-weight: 950; color: #0f172a; }
.sub{ font-size: 11px; font-weight: 800; color: rgba(15, 23, 42, 0.55); margin-top: 2px; }
.x{
  width: 34px; height: 34px; border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.ic{ width: 18px; height: 18px; color: rgba(15, 23, 42, 0.75); }
.x:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }

.err{
  margin: 10px 14px 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(127, 29, 29, 0.95);
  font-weight: 850;
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.err__ic{ width: 18px; height: 18px; flex: 0 0 auto; margin-top: 1px; }

.grid{
  padding: 12px 14px 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.field{ display:flex; flex-direction:column; gap:6px; min-width:0; }
.lab{ font-size:11px; font-weight:950; color: rgba(15, 23, 42, 0.72); }

.in{
  height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  color: #0f172a;
  outline: none;
}
.in:focus{
  border-color: rgba(2, 132, 199, 0.35);
  box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.10);
}

.numIn{
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
  font-variant-numeric: tabular-nums;
}

.hint{ font-size:10px; font-weight:850; color: rgba(15, 23, 42, 0.55); }
.mono{ font-variant-numeric: tabular-nums; }

.span3{ grid-column: span 3; }
.span2{ grid-column: span 2; }

.more{ padding-top: 2px; }
.moreBtn{
  width: 100%;
  height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  font-weight: 950;
  font-size: 12px;
  color: #0f172a;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding: 0 12px;
  cursor:pointer;
}
.moreBtn:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.moreIc{ width:18px; height:18px; }
.moreGrid{
  margin-top: 10px;
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ftr{
  padding: 10px 14px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
}
.btn{
  height: 36px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  font-weight: 950;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.btn:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.btn.primary{ background: rgba(24, 64, 112, 0.92); border-color: rgba(24, 64, 112, 0.6); color: #fff; }
.btn.primary:hover{ background: rgba(24, 64, 112, 1); }
.btn.ghost{ background: rgba(255, 255, 255, 0.8); }
.btnic{ width: 16px; height: 16px; }

@media (max-width: 760px){
  .grid{ grid-template-columns: 1fr; }
  .span3, .span2{ grid-column: auto; }
  .moreGrid{ grid-template-columns: 1fr; }
}
</style>
