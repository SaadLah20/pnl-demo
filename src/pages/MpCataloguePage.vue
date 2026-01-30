<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

type MpDraft = {
  id?: string;
  categorie: string;
  label: string;
  unite: string;
  prix: number;
  fournisseur: string;
  city: string;
  region: string;
  comment?: string | null;
};

const store = usePnlStore();

const loading = ref(false);
const error = ref<string | null>(null);

const creating = ref(false);
const newMp = ref<MpDraft>({
  categorie: "CIMENT",
  label: "",
  unite: "kg",
  prix: 0,
  fournisseur: "",
  city: "",
  region: "",
  comment: "",
});

const editId = ref<string | null>(null);
const editDraft = ref<MpDraft | null>(null);

onMounted(async () => {
  await reload();
});

const rows = computed(() => store.mpCatalogue ?? []);

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    await store.loadMpCatalogue();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

function startCreate() {
  creating.value = true;
  newMp.value = {
    categorie: "CIMENT",
    label: "",
    unite: "kg",
    prix: 0,
    fournisseur: "",
    city: "",
    region: "",
    comment: "",
  };
}

function cancelCreate() {
  creating.value = false;
}

async function saveCreate() {
  try {
    if (!newMp.value.label.trim()) throw new Error("Label obligatoire");
    await store.createMpCatalogue({
      categorie: newMp.value.categorie,
      label: newMp.value.label,
      unite: newMp.value.unite,
      prix: Number(newMp.value.prix ?? 0),
      fournisseur: newMp.value.fournisseur,
      city: newMp.value.city,
      region: newMp.value.region,
      comment: newMp.value.comment ?? "",
    });
    creating.value = false;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

function startEdit(row: any) {
  editId.value = String(row.id);
  editDraft.value = {
    id: String(row.id),
    categorie: String(row.categorie ?? ""),
    label: String(row.label ?? ""),
    unite: String(row.unite ?? ""),
    prix: Number(row.prix ?? 0),
    fournisseur: String(row.fournisseur ?? ""),
    city: String(row.city ?? ""),
    region: String(row.region ?? ""),
    comment: row.comment ?? "",
  };
}

function cancelEdit() {
  editId.value = null;
  editDraft.value = null;
}

async function saveEdit() {
  if (!editId.value || !editDraft.value) return;
  try {
    if (!editDraft.value.label.trim()) throw new Error("Label obligatoire");
    await store.updateMpCatalogue(editId.value, {
      categorie: editDraft.value.categorie,
      label: editDraft.value.label,
      unite: editDraft.value.unite,
      prix: Number(editDraft.value.prix ?? 0),
      fournisseur: editDraft.value.fournisseur,
      city: editDraft.value.city,
      region: editDraft.value.region,
      comment: editDraft.value.comment ?? "",
    });
    cancelEdit();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

async function removeRow(id: string) {
  if (!confirm("Supprimer cette MP du répertoire ?")) return;
  try {
    await store.deleteMpCatalogue(id);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Répertoire MP</h1>
        <p class="subtitle">CRUD sur MpCatalogue</p>
      </div>

      <div class="actions">
        <button class="btn" @click="reload" :disabled="loading">🔄 Recharger</button>
        <button class="btn primary" @click="startCreate" :disabled="creating">➕ Nouvelle MP</button>
      </div>
    </div>

    <div v-if="error" class="card error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="card">Chargement…</div>

    <!-- CREATE -->
    <div v-if="creating" class="card">
      <h2>➕ Ajouter une MP</h2>

      <div class="grid">
        <label>Catégorie <input v-model="newMp.categorie" class="input" /></label>
        <label>Label <input v-model="newMp.label" class="input" /></label>
        <label>Unité <input v-model="newMp.unite" class="input" /></label>
        <label>Prix <input v-model.number="newMp.prix" type="number" step="0.01" class="input" /></label>
        <label>Fournisseur <input v-model="newMp.fournisseur" class="input" /></label>
        <label>Ville <input v-model="newMp.city" class="input" /></label>
        <label>Région <input v-model="newMp.region" class="input" /></label>
        <label>Comment <input v-model="newMp.comment" class="input" /></label>
      </div>

      <div class="actionsRow">
        <button class="btn" @click="cancelCreate">Annuler</button>
        <button class="btn primary" @click="saveCreate">Enregistrer</button>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card">
      <h2>Liste</h2>

      <div class="tableWrap">
        <table class="table">
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Label</th>
              <th>Unité</th>
              <th>Prix</th>
              <th>Fournisseur</th>
              <th>Ville</th>
              <th>Région</th>
              <th>Comment</th>
              <th style="width: 190px">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <template v-if="editId === r.id">
                <td><input v-model="editDraft!.categorie" class="input sm" /></td>
                <td><input v-model="editDraft!.label" class="input sm" /></td>
                <td><input v-model="editDraft!.unite" class="input sm" /></td>
                <td><input v-model.number="editDraft!.prix" type="number" step="0.01" class="input sm" /></td>
                <td><input v-model="editDraft!.fournisseur" class="input sm" /></td>
                <td><input v-model="editDraft!.city" class="input sm" /></td>
                <td><input v-model="editDraft!.region" class="input sm" /></td>
                <td><input v-model="editDraft!.comment" class="input sm" /></td>
                <td>
                  <div class="btnRow">
                    <button class="btn" @click="cancelEdit">Annuler</button>
                    <button class="btn primary" @click="saveEdit">OK</button>
                  </div>
                </td>
              </template>

              <template v-else>
                <td>{{ r.categorie }}</td>
                <td><b>{{ r.label }}</b></td>
                <td>{{ r.unite }}</td>
                <td>{{ r.prix }}</td>
                <td>{{ r.fournisseur }}</td>
                <td>{{ r.city }}</td>
                <td>{{ r.region }}</td>
                <td>{{ r.comment }}</td>
                <td>
                  <div class="btnRow">
                    <button class="btn" @click="startEdit(r)">✏️</button>
                    <button class="btn danger" @click="removeRow(String(r.id))">🗑️</button>
                  </div>
                </td>
              </template>
            </tr>

            <tr v-if="rows.length === 0">
              <td colspan="9" class="muted">Aucune MP dans le répertoire.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; padding: 16px; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
h1 { margin: 0; font-size: 22px; }
.subtitle { margin: 4px 0 0 0; color: #6b7280; font-size: 13px; }
.actions { display: flex; gap: 8px; }
.card { background: white; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
.error { border-color: #ef4444; background: #fff5f5; }
.btn { border: 1px solid #d1d5db; padding: 8px 10px; border-radius: 10px; background: white; cursor: pointer; }
.btn:hover { background: #f9fafb; }
.btn.primary { background: #007a33; border-color: #007a33; color: white; }
.btn.primary:hover { filter: brightness(0.95); }
.btn.danger { border-color: #ef4444; color: #ef4444; }
.btnRow { display: flex; gap: 6px; }
.actionsRow { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #6b7280; }
.input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 13px; color: #111827; }
.input.sm { padding: 6px 8px; border-radius: 8px; font-size: 12px; }
.tableWrap { overflow: auto; margin-top: 10px; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { border-bottom: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
.table th { font-size: 12px; color: #6b7280; background: #fafafa; }
.muted { color: #6b7280; font-size: 13px; }
</style>
