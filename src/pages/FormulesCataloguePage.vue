<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

const loading = ref(false);
const err = ref<string | null>(null);
const ok = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    if (store.mpCatalogue.length === 0) await store.loadMpCatalogue();
    if (store.formulesCatalogue.length === 0) await store.loadFormulesCatalogue();
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});

const formules = computed(() => store.formulesCatalogue ?? []);
const mpList = computed(() => store.mpCatalogue ?? []);

type DraftItem = { mpId: string; qty: number };

const draft = reactive<{
  id: string | null;
  label: string;
  resistance: string;
  city: string;
  region: string;
  comment: string;
  items: DraftItem[];
}>({
  id: null,
  label: "",
  resistance: "",
  city: "",
  region: "",
  comment: "",
  items: [],
});

function resetDraft() {
  draft.id = null;
  draft.label = "";
  draft.resistance = "";
  draft.city = "";
  draft.region = "";
  draft.comment = "";
  draft.items = [];
}

function editFormule(f: any) {
  draft.id = f.id;
  draft.label = f.label ?? "";
  draft.resistance = f.resistance ?? "";
  draft.city = f.city ?? "";
  draft.region = f.region ?? "";
  draft.comment = f.comment ?? "";
  draft.items = (f.items ?? []).map((it: any) => ({ mpId: String(it.mpId), qty: Number(it.qty ?? 0) }));
}

async function reload() {
  loading.value = true;
  err.value = null;
  try {
    await store.loadFormulesCatalogue();
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function saveMeta() {
  loading.value = true;
  err.value = null;
  ok.value = false;

  try {
    const payload = {
      label: String(draft.label),
      resistance: String(draft.resistance),
      city: String(draft.city),
      region: String(draft.region),
      comment: draft.comment ? String(draft.comment) : null,
    };

    const API = "http://localhost:3001";
    const url = draft.id ? `${API}/formules-catalogue/${draft.id}` : `${API}/formules-catalogue`;
    const method = draft.id ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());

    const createdOrUpdated = await res.json();

    if (!draft.id) draft.id = createdOrUpdated.id;

    await store.loadFormulesCatalogue();
    ok.value = true;
    setTimeout(() => (ok.value = false), 1200);
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

function addItem() {
  const firstMp = mpList.value[0];
  if (!firstMp) return;
  draft.items.push({ mpId: String(firstMp.id), qty: 0 });
}

// ✅ FIX TS: idx est number
function removeItem(idx: number) {
  draft.items.splice(Number(idx), 1);
}

async function saveItems() {
  if (!draft.id) {
    err.value = "Crée la formule d'abord (Enregistrer) avant d'éditer la composition.";
    return;
  }

  loading.value = true;
  err.value = null;
  ok.value = false;

  try {
    const API = "http://localhost:3001";
    const res = await fetch(`${API}/formules-catalogue/${draft.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: (draft.items ?? []).map((x: DraftItem) => ({
          mpId: String(x.mpId),
          qty: Number(x.qty ?? 0),
        })),
      }),
    });

    if (!res.ok) throw new Error(await res.text());

    await store.loadFormulesCatalogue();
    ok.value = true;
    setTimeout(() => (ok.value = false), 1200);
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function del(id: string) {
  loading.value = true;
  err.value = null;

  try {
    const API = "http://localhost:3001";
    const res = await fetch(`${API}/formules-catalogue/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    await store.loadFormulesCatalogue();
    if (draft.id === id) resetDraft();
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Catalogue Formules</h1>
        <p class="subtitle">CRUD formules + composition (qty par MP)</p>
      </div>

      <div class="actions">
        <button class="btn" @click="reload">🔄 Recharger</button>
        <span v-if="ok" class="ok">✅ Enregistré</span>
        <span v-if="err" class="err">❌ {{ err }}</span>
      </div>
    </div>

    <div class="card">
      <h2>{{ draft.id ? "Modifier formule" : "Nouvelle formule" }}</h2>

      <div class="grid">
        <div class="field"><div class="label">Label</div><input class="input" v-model="draft.label" /></div>
        <div class="field"><div class="label">Résistance</div><input class="input" v-model="draft.resistance" /></div>
        <div class="field"><div class="label">Ville</div><input class="input" v-model="draft.city" /></div>
        <div class="field"><div class="label">Région</div><input class="input" v-model="draft.region" /></div>
        <div class="field" style="grid-column: 1 / -1">
          <div class="label">Commentaire</div>
          <input class="input" v-model="draft.comment" />
        </div>
      </div>

      <div class="row">
        <button class="btn primary" :disabled="loading" @click="saveMeta">💾 Enregistrer</button>
        <button class="btn" :disabled="loading" @click="resetDraft">Annuler</button>
      </div>
    </div>

    <div class="card">
      <div class="between">
        <h2>Composition (qty)</h2>
        <div class="row" style="gap: 8px">
          <button class="btn" @click="addItem">+ Ajouter MP</button>
          <button class="btn primary" :disabled="loading || !draft.id" @click="saveItems">
            💾 Enregistrer composition
          </button>
        </div>
      </div>

      <div v-if="!draft.id" class="muted">Crée / sélectionne une formule pour modifier la composition.</div>

      <div v-else class="tableWrap">
        <table class="table">
          <thead>
            <tr>
              <th>MP</th>
              <th>Qty / m³</th>
              <th style="width: 80px"></th>
            </tr>
          </thead>

          <tbody>
            <!-- ✅ FIX TS: idx forcé en number via "as number" -->
            <tr v-for="(it, idx) in draft.items" :key="Number(idx)">
              <td>
                <select class="select" v-model="it.mpId">
                  <option v-for="m in mpList" :key="m.id" :value="String(m.id)">
                    {{ m.categorie }} - {{ m.label }}
                  </option>
                </select>
              </td>
              <td>
                <input class="input" type="number" v-model.number="it.qty" />
              </td>
              <td>
                <button class="btn danger" @click="removeItem(Number(idx))">Suppr</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="muted" style="margin-top: 8px">
        Le CMP est recalculé automatiquement à partir des qty et des prix MP (catalogue/variante).
      </div>
    </div>

    <div class="card">
      <h2>Liste Formules</h2>

      <div class="tableWrap">
        <table class="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Résistance</th>
              <th>Ville</th>
              <th>Région</th>
              <th>MP items</th>
              <th style="width: 180px"></th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="f in formules" :key="f.id">
              <td><b>{{ f.label }}</b></td>
              <td>{{ f.resistance }}</td>
              <td>{{ f.city }}</td>
              <td>{{ f.region }}</td>
              <td>{{ f.items?.length ?? 0 }}</td>
              <td class="actionsTd">
                <button class="btn" @click="editFormule(f)">Modifier</button>
                <button class="btn danger" @click="del(f.id)">Suppr</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="muted" style="margin-top: 8px">
        ⚠️ Supprimer une formule peut échouer si elle est utilisée dans des variantes.
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:14px; padding:16px; }
.topbar { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
h1 { margin:0; font-size:22px; }
.subtitle { margin:4px 0 0 0; color:#6b7280; font-size:13px; }
.actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

.card { background:white; border:1px solid #e5e7eb; border-radius:14px; padding:14px; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
@media (max-width:950px){ .grid{ grid-template-columns:1fr; } }
.row { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center; }
.between { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }

.label { font-size:12px; color:#6b7280; margin-bottom:6px; }
.field { display:flex; flex-direction:column; }
.input { padding:8px 10px; border:1px solid #d1d5db; border-radius:10px; width:100%; box-sizing:border-box; }
.select { padding:8px 10px; border:1px solid #d1d5db; border-radius:10px; width:100%; box-sizing:border-box; }

.btn { border:1px solid #d1d5db; padding:8px 10px; border-radius:10px; background:white; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.primary { background:#111827; color:white; border-color:#111827; }
.primary:hover { background:#0b1020; }
.danger { border-color:#fecaca; background:#fff5f5; }
.danger:hover { background:#ffecec; }

.tableWrap { overflow:auto; margin-top:10px; }
.table { width:100%; border-collapse:collapse; font-size:13px; }
.table th, .table td { border-bottom:1px solid #e5e7eb; padding:8px 10px; text-align:left; }
.table th { font-size:12px; color:#6b7280; background:#fafafa; }
.actionsTd { display:flex; gap:6px; justify-content:flex-end; }

.muted { color:#6b7280; font-size:13px; }
.ok { color:#16a34a; font-size:13px; }
.err { color:#dc2626; font-size:13px; }
</style>
