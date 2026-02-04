<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

/* =========================
   STORE / STATE
========================= */
const store = usePnlStore();

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const variant = computed<any | null>(() => (store as any).activeVariant ?? null);

/* =========================
   DRAFT MAJORATIONS (UI)
========================= */
const draft = reactive<{ map: Record<string, number> }>({
  map: {},
});

/* =========================
   HELPERS
========================= */
function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clampPct(v: any): number {
  const x = n(v);
  return Math.max(-100, Math.min(1000, x));
}

function pctOf(key: string): number {
  return n(draft.map[key]);
}

function setPct(key: string, v: any) {
  draft.map[key] = clampPct(v);
}

function safeParse(raw: any): Record<string, number> {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/* =========================
   BUILD DRAFT FROM VARIANT
========================= */
function rebuildDraft() {
  const v = variant.value;
  const persisted = safeParse(v?.autresCouts?.majorations);
  draft.map = { ...persisted };

  // IMPORTANT: pas de preview automatique
  (store as any).clearHeaderMajorationsPreview();
}

onMounted(async () => {
  if ((store as any).pnls?.length === 0) {
    loading.value = true;
    await (store as any).loadPnls();
    loading.value = false;
  }
  rebuildDraft();
});

watch(
  () => variant.value?.id,
  () => rebuildDraft()
);

/* =========================
   CLEANUP (QUIT PAGE)
========================= */
onBeforeUnmount(() => {
  // Si on quitte sans enregistrer → retour KPIs originaux
  (store as any).clearHeaderMajorationsPreview();
});

/* =========================
   ACTIONS
========================= */
function applyPreview() {
  (store as any).setHeaderMajorationsPreview({ ...draft.map });
}

async function save() {
  if (!variant.value?.id) return;

  saving.value = true;
  error.value = null;

  try {
    await (store as any).saveMajorations(String(variant.value.id), {
      ...draft.map,
    });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

function resetAll() {
  draft.map = {};
  (store as any).setHeaderMajorationsPreview({});
}

/* =========================
   UI STRUCTURE
========================= */
type Row = { key: string; label: string };
type Group = { title: string; rows: Row[] };

const groups = computed<Group[]>(() => {
  const v = variant.value;
  if (!v) return [];

  const res: Group[] = [];

  /* ---------- MP ---------- */
  const mpRows: Row[] = (v?.mp?.items ?? []).map((x: any) => ({
    key: `mp:${x.mpId}`,
    label: x?.mp?.label ?? "MP",
  }));
  if (mpRows.length) res.push({ title: "Matières premières (MP)", rows: mpRows });

  /* ---------- Transport ---------- */
  res.push({
    title: "Transport",
    rows: [{ key: "transport.prixMoyen", label: "Transport moyen (DH/m³)" }],
  });

  /* ---------- Coût m3 ---------- */
  res.push({
    title: "Coûts par m³",
    rows: [
      { key: "coutM3.eau", label: "Eau" },
      { key: "coutM3.qualite", label: "Qualité" },
      { key: "coutM3.dechets", label: "Déchets" },
    ],
  });

  /* ---------- Maintenance ---------- */
  res.push({
    title: "Maintenance",
    rows: [
      { key: "maintenance.elec", label: "Électricité" },
      { key: "maintenance.chargeur", label: "Chargeur" },
      { key: "maintenance.cab", label: "CAB" },
      { key: "maintenance.generale", label: "Générale" },
      { key: "maintenance.bassins", label: "Bassins" },
      { key: "maintenance.preventive", label: "Préventive" },
    ],
  });

  /* ---------- Coûts mensuels ---------- */
  res.push({
    title: "Coûts mensuels",
    rows: [
      { key: "coutMensuel.locationTerrain", label: "Location terrain" },
      { key: "coutMensuel.electricite", label: "Électricité" },
      { key: "coutMensuel.gasoil", label: "Gasoil" },
      { key: "coutMensuel.telephone", label: "Téléphone" },
      { key: "coutMensuel.securite", label: "Sécurité" },
    ],
  });

  /* ---------- Autres coûts (items) ---------- */
  const autresRows: Row[] = (v?.autresCouts?.items ?? [])
    .filter((x: any) => !String(x.unite ?? "").includes("POURCENT"))
    .map((x: any) => ({
      key: `autresCoutsItem:${x.id}`,
      label: x.label,
    }));

  if (autresRows.length) {
    res.push({ title: "Autres coûts", rows: autresRows });
  }

  return res;
});
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-lg font-semibold">Majorations</h1>
        <p class="text-sm text-slate-500">
          Saisie de majorations (%) par coût/charge.
          <br />
          <b>Appliquer</b> : preview KPIs (non enregistré).
          <b>Enregistrer</b> : appliqué définitivement.
        </p>
      </div>

      <div class="flex gap-2">
        <button class="btn-secondary" @click="resetAll">Réinitialiser</button>
        <button class="btn-primary" @click="applyPreview">Appliquer</button>
        <button class="btn-success" :disabled="saving" @click="save">
          {{ saving ? "Enregistrement..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="text-red-600 text-sm">{{ error }}</div>

    <div v-if="loading">Chargement…</div>

    <div v-else class="space-y-4">
      <div
        v-for="g in groups"
        :key="g.title"
        class="border rounded-lg bg-white"
      >
        <div class="px-4 py-2 border-b font-medium">
          {{ g.title }}
        </div>

        <table class="w-full text-sm">
          <tbody>
            <tr
              v-for="r in g.rows"
              :key="r.key"
              class="border-t"
            >
              <td class="px-4 py-2">{{ r.label }}</td>
              <td class="px-4 py-2 w-[160px]">
                <input
                  type="number"
                  step="0.1"
                  class="w-full border rounded px-2 py-1"
                  :value="pctOf(r.key)"
                  @input="setPct(r.key, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="px-2 text-xs text-slate-500">%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="text-xs text-slate-500">
        Quitter la page sans enregistrer annule le preview.
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-primary {
  @apply px-3 py-2 rounded bg-slate-900 text-white text-sm;
}
.btn-secondary {
  @apply px-3 py-2 rounded border text-sm;
}
.btn-success {
  @apply px-3 py-2 rounded bg-emerald-600 text-white text-sm;
}
</style>
