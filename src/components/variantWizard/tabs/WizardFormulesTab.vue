<!-- ✅ src/components/variantWizard/tabs/WizardFormulesTab.vue
     Onglet Formules (INITIEE)
     ✅ Catalogue miniaturisé (recherche)
     ✅ Sélection par clic
     ✅ Mode unique: Par formule (slider volume 0..50 000 m³)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { WizardFormulesState } from "../composables/useInitieeWizardState";

type FormuleCatalog = { id: string; title: string; code?: string | null };

const props = defineProps<{
  modelValue: WizardFormulesState;
  contractId: string | null;
  catalog?: FormuleCatalog[];
  apiBase?: string;
}>();

const emit = defineEmits<{ (e: "update:modelValue", v: WizardFormulesState): void }>();

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function clamp(x: any, a: number, b: number) {
  const v = n(x);
  return Math.min(b, Math.max(a, v));
}
function patch(p: Partial<WizardFormulesState>) {
  emit("update:modelValue", { ...props.modelValue, ...p });
}

const q = ref("");

/* =========================
   Catalogue (props OR fetched)
========================= */
const fetchedCatalog = ref<FormuleCatalog[]>([]);
const catalog = computed<FormuleCatalog[]>(() => (props.catalog?.length ? props.catalog : fetchedCatalog.value));

const filteredCatalog = computed(() => {
  const qq = String(q.value ?? "").toLowerCase().trim();
  if (!qq) return catalog.value;
  return catalog.value.filter((f) => {
    const s = `${f.title ?? ""} ${f.code ?? ""} ${f.id ?? ""}`.toLowerCase();
    return s.includes(qq);
  });
});

const selectedLines = computed(() => props.modelValue.lines ?? []);
const totalVolume = computed(() => selectedLines.value.reduce((s, l) => s + n(l.volumeM3), 0));

function hasLine(formuleId: string) {
  return selectedLines.value.some((x) => String(x.formuleId) === String(formuleId));
}

function addLine(formule: FormuleCatalog) {
  if (!formule?.id || hasLine(formule.id)) return;
  const lines = [...selectedLines.value, { formuleId: String(formule.id), volumeM3: 0 }];
  patch({ lines });
}

function removeLine(formuleId: string) {
  const id = String(formuleId);
  const lines = selectedLines.value.filter((x) => String(x.formuleId) !== id);
  patch({ lines });
}

function labelOf(formuleId: string) {
  const f = catalog.value.find((x) => String(x.id) === String(formuleId));
  if (!f) return `Formule ${String(formuleId).slice(0, 8)}…`;
  return f.code ? `${f.title} · ${f.code}` : f.title;
}

function setVolume(formuleId: string, v: any) {
  const id = String(formuleId);
  const lines = [...selectedLines.value];
  const i = lines.findIndex((x) => String(x.formuleId) === id);
  if (i === -1) return;

  const vol = clamp(v, 0, 50000);
  lines[i] = { ...lines[i]!, volumeM3: vol };
  patch({ lines });
}

/* =========================
   Fetch catalogue (fallback)
========================= */
const loading = ref(false);
const error = ref<string | null>(null);

async function loadCatalogue() {
  error.value = null;
  if (props.catalog?.length) {
    fetchedCatalog.value = [];
    return;
  }

  const id = String(props.contractId ?? "").trim();
  if (!id) {
    fetchedCatalog.value = [];
    return;
  }

  loading.value = true;
  try {
    const base = props.apiBase ?? (import.meta as any)?.env?.VITE_API_BASE ?? "http://localhost:3001";
    const res = await fetch(`${base}/formules-catalogue`, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const rows = (await res.json().catch(() => [])) as any[];
    fetchedCatalog.value = (rows ?? []).map((x) => ({
      id: String(x.id),
      title: String(x.label ?? "Formule"),
      code: x.resistance ? String(x.resistance) : null,
    }));
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : "Erreur chargement catalogue";
    fetchedCatalog.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.contractId,
  () => loadCatalogue(),
  { immediate: true }
);
</script>

<template>
  <div class="wrap">
    <div class="top">
      <div class="kpi mono">
        Total: {{ totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 }) }} m³
      </div>
      <div class="miniHint">Volumes par formule (0 → 50 000 m³).</div>
    </div>

    <div class="grid">
      <!-- Catalogue -->
      <div class="card">
        <div class="cardH">
          <div class="t">Catalogue</div>
          <div class="mini">
            <input class="q" :value="q" @input="q = ($event.target as HTMLInputElement).value" placeholder="Rechercher…" />
          </div>
        </div>

        <div v-if="loading" class="box">Chargement…</div>
        <div v-else-if="error" class="box box--err">{{ error }}</div>

        <div class="list">
          <button
            v-for="f in filteredCatalog"
            :key="f.id"
            type="button"
            class="item"
            :class="{ on: hasLine(f.id) }"
            @click="hasLine(f.id) ? removeLine(f.id) : addLine(f)"
          >
            <div class="name">{{ f.title }}</div>
            <div class="code mono" v-if="f.code">{{ f.code }}</div>
          </button>

          <div v-if="!filteredCatalog.length && !loading" class="box">Aucune formule</div>
        </div>
      </div>

      <!-- Sélection -->
      <div class="card">
        <div class="cardH">
          <div class="t">Sélection</div>
          <div class="mini mono">{{ selectedLines.length }} formules</div>
        </div>

        <div class="list">
          <div v-if="!selectedLines.length" class="box">
            Clique sur les formules du catalogue pour les ajouter.
          </div>

          <div v-for="l in selectedLines" :key="l.formuleId" class="sel">
            <div class="selH">
              <div class="name">{{ labelOf(l.formuleId) }}</div>
              <button class="x" type="button" @click="removeLine(l.formuleId)">Retirer</button>
            </div>

            <div class="ctrl">
              <input
                class="rng"
                type="range"
                min="0"
                max="50000"
                step="100"
                :value="l.volumeM3"
                @input="setVolume(l.formuleId, ($event.target as HTMLInputElement).value)"
              />
              <div class="val mono">
                {{ Number(l.volumeM3).toLocaleString(undefined, { maximumFractionDigits: 0 }) }} m³
              </div>
            </div>
          </div>
        </div>

        <div class="hint">
          Ajuste le volume de chaque formule. Le total est la somme des volumes.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap{display:flex;flex-direction:column;gap:10px}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.kpi{font-size:12px;opacity:.9;white-space:nowrap}
.miniHint{font-size:12px;opacity:.75;white-space:nowrap}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width: 980px){.grid{grid-template-columns:1fr}}

.card{background:var(--card,#0b1220);border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;min-height:240px}
.cardH{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.t{font-weight:700;font-size:13px}
.mini{font-size:12px;opacity:.85;white-space:nowrap}

.q{width:220px;max-width:100%;border:1px solid rgba(148,163,184,.22);background:rgba(2,6,23,.35);color:inherit;border-radius:999px;padding:6px 10px;font-size:12px;outline:none}

.list{display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto;padding-right:4px}

.item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px;border-radius:12px;border:1px solid rgba(148,163,184,.16);background:rgba(148,163,184,.06);cursor:pointer;text-align:left}
.item.on{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.25)}
.name{font-size:12.5px;line-height:1.15}
.code{font-size:12px;opacity:.8}

.box{font-size:12px;opacity:.8;padding:10px;border-radius:12px;border:1px dashed rgba(148,163,184,.22)}
.box--err{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.08)}

.sel{padding:8px;border-radius:12px;border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.18)}
.selH{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}

.x{border:none;background:transparent;color:rgba(148,163,184,.95);font-size:12px;cursor:pointer;text-decoration:underline}

.ctrl{display:grid;grid-template-columns:1fr 150px;gap:10px;align-items:center}
@media (max-width: 520px){.ctrl{grid-template-columns:1fr}}

.rng{width:100%}
.val{font-size:12px;text-align:right;white-space:nowrap}

.hint{margin-top:8px;font-size:12px;opacity:.8}

.mono{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
</style>