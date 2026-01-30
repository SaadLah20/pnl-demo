<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

const loading = ref(false);
const err = ref<string | null>(null);
const ok = ref(false);

onMounted(async () => {
  if (store.mpCatalogue.length === 0) {
    loading.value = true;
    try {
      await store.loadMpCatalogue();
    } catch (e: any) {
      err.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  }
});

const list = computed(() => store.mpCatalogue ?? []);

const draft = reactive<any>({
  id: null,
  categorie: "",
  label: "",
  unite: "kg",
  prix: 0,
  fournisseur: "",
  city: "",
  region: "",
  comment: "",
});

function resetDraft() {
  draft.id = null;
  draft.categorie = "";
  draft.label = "";
  draft.unite = "kg";
  draft.prix = 0;
  draft.fournisseur = "";
  draft.city = "";
  draft.region = "";
  draft.comment = "";
}

function editRow(r: any) {
  draft.id = r.id;
  draft.categorie = r.categorie ?? "";
  draft.label = r.label ?? "";
  draft.unite = r.unite ?? "kg";
  draft.prix = Number(r.prix ?? 0);
  draft.fournisseur = r.fournisseur ?? "";
  draft.city = r.city ?? "";
  draft.region = r.region ?? "";
  draft.comment = r.comment ?? "";
}

async function reload() {
  loading.value = true;
  err.value = null;
  try {
    await store.loadMpCatalogue();
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function save() {
  loading.value = true;
  err.value = null;
  ok.value = false;

  try {
    const payload = {
      categorie: String(draft.categorie),
      label: String(draft.label),
      unite: String(draft.unite),
      prix: Number(draft.prix ?? 0),
      fournisseur: String(draft.fournisseur),
      city: String(draft.city),
      region: String(draft.region),
      comment: draft.comment ? String(draft.comment) : null,
    };

    const API = "http://localhost:3001";
    const url = draft.id ? `${API}/mp-catalogue/${draft.id}` : `${API}/mp-catalogue`;
    const method = draft.id ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());

    await store.loadMpCatalogue();
    ok.value = true;
    resetDraft();
    setTimeout(() => (ok.value = false), 1200);
  } catch (e: any) {
    err.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function del(id: string) {
  if (!id) return;
  loading.value = true;
  err.value = null;

  try {
    const API = "http://localhost:3001";
    const res = await fetch(`${API}/mp-catalogue/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    await store.loadMpCatalogue();
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
        <h1>Répertoire MP</h1>
        <p class="subtitle">Ajouter / modifier / supprimer des matières premières</p>
      </div>

      <div class="actions">
        <button class="btn" @click="reload">🔄 Recharger</button>
        <span v-if="ok" class="ok">✅ Enregistré</span>
        <span v-if="err" class="err">❌ {{ err }}</span>
      </div>
    </div>

    <div class="card">
      <h2>{{ draft.id ? "Modifier MP" : "Nouvelle MP" }}</h2>

      <div class="grid">
        <div class="field"><div class="label">Catégorie</div><input class="input" v-model="draft.categorie" /></div>
        <div class="field"><div class="label">Libellé</div><input class="input" v-model="draft.label" /></div>
        <div class="field"><div class="label">Unité</div><input class="input" v-model="draft.unite" /></div>
        <div class="field"><div class="label">Prix</div><input class="input" type="number" v-model.number="draft.prix" /></div>
        <div class="field"><div class="label">Fournisseur</div><input class="input" v-model="draft.fournisseur" /></div>
        <div class="field"><div class="label">Ville</div><input class="input" v-model="draft.city" /></div>
        <div class="field"><div class="label">Région</div><input class="input" v-model="draft.region" /></div>
        <div class="field" style="grid-column: 1 / -1">
          <div class="label">Commentaire</div>
          <input class="input" v-model="draft.comment" />
        </div>
      </div>

      <div class="row">
        <button class="btn primary" :disabled="loading" @click="save">💾 Enregistrer</button>
        <button class="btn" :disabled="loading" @click="resetDraft">Annuler</button>
      </div>
    </div>

    <div class="card">
      <h2>Liste MP</h2>

      <div v-if="loading" class="muted">Chargement...</div>

      <div class="tableWrap" v-else>
        <table class="table">
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Libellé</th>
              <th>Unité</th>
              <th>Prix</th>
              <th>Fournisseur</th>
              <th>Ville</th>
              <th>Région</th>
              <th style="width: 160px"></th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="m in list" :key="m.id">
              <td>{{ m.categorie }}</td>
              <td>{{ m.label }}</td>
              <td>{{ m.unite }}</td>
              <td><b>{{ m.prix }}</b></td>
              <td>{{ m.fournisseur }}</td>
              <td>{{ m.city }}</td>
              <td>{{ m.region }}</td>
              <td class="actionsTd">
                <button class="btn" @click="editRow(m)">Modifier</button>
                <button class="btn danger" @click="del(m.id)">Suppr</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="muted" style="margin-top: 8px">
        ⚠️ Si une MP est utilisée dans des formules/variantes, Prisma peut refuser la suppression.
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
.row { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }

.label { font-size:12px; color:#6b7280; margin-bottom:6px; }
.field { display:flex; flex-direction:column; }
.input { padding:8px 10px; border:1px solid #d1d5db; border-radius:10px; width:100%; box-sizing:border-box; }

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
