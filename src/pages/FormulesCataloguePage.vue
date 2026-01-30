<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

type FormuleDraft = {
  id?: string;
  label: string;
  resistance: string;
  city: string;
  region: string;
  comment?: string | null;
};

type ItemDraft = {
  mpId: string;
  qty: number;
};

const store = usePnlStore();

const loading = ref(false);
const error = ref<string | null>(null);

const creating = ref(false);
const newFormule = ref<FormuleDraft>({
  label: "",
  resistance: "",
  city: "",
  region: "",
  comment: "",
});

const editId = ref<string | null>(null);
const editDraft = ref<FormuleDraft | null>(null);

// composition editor (pour une formule sélectionnée)
const selectedFormuleId = ref<string | null>(null);
const itemsDraft = ref<ItemDraft[]>([]);
const savingItems = ref(false);

onMounted(async () => {
  await reload();
});

const formules = computed(() => store.formulesCatalogue ?? []);
const mpOptions = computed(() => store.mpCatalogue ?? []);

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    // besoin MP catalogue pour dropdown composition
    await Promise.all([store.loadFormulesCatalogue(), store.loadMpCatalogue()]);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

/* =========================
   CRUD FORMULE
========================= */

function startCreate() {
  creating.value = true;
  newFormule.value = { label: "", resistance: "", city: "", region: "", comment: "" };
}
function cancelCreate() {
  creating.value = false;
}

async function saveCreate() {
  try {
    if (!newFormule.value.label.trim()) throw new Error("Label obligatoire");
    await store.createFormuleCatalogue({
      label: newFormule.value.label,
      resistance: newFormule.value.resistance,
      city: newFormule.value.city,
      region: newFormule.value.region,
      comment: newFormule.value.comment ?? "",
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
    label: String(row.label ?? ""),
    resistance: String(row.resistance ?? ""),
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
    await store.updateFormuleCatalogue(editId.value, {
      label: editDraft.value.label,
      resistance: editDraft.value.resistance,
      city: editDraft.value.city,
      region: editDraft.value.region,
      comment: editDraft.value.comment ?? "",
    });
    cancelEdit();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

async function removeFormule(id: string) {
  if (!confirm("Supprimer cette formule du catalogue ?")) return;
  try {
    await store.deleteFormuleCatalogue(id);
    if (selectedFormuleId.value === id) {
      selectedFormuleId.value = null;
      itemsDraft.value = [];
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

/* =========================
   COMPOSITION EDITOR
========================= */

function selectFormule(row: any) {
  selectedFormuleId.value = String(row.id);
  const items = (row.items ?? []) as Array<{ mpId: string; qty: number }>;
  itemsDraft.value = items.map((it) => ({
    mpId: String(it.mpId),
    qty: Number(it.qty ?? 0),
  }));
}

function addItem() {
  // default mp = first option if exists
  const firstMpId = mpOptions.value?.[0]?.id ? String(mpOptions.value[0].id) : "";
  itemsDraft.value.push({ mpId: firstMpId, qty: 0 });
}

function removeItem(idx: number) {
  itemsDraft.value.splice(idx, 1);
}

function mpLabel(mpId: string) {
  const mp = mpOptions.value.find((x: any) => String(x.id) === String(mpId));
  if (!mp) return mpId;
  return `${mp.categorie} — ${mp.label}`;
}

async function saveItems() {
  if (!selectedFormuleId.value) return;
  savingItems.value = true;
  error.value = null;
  try {
    // nettoyer doublons / valeurs
    const cleaned: ItemDraft[] = (itemsDraft.value ?? [])
      .filter((it) => it.mpId && String(it.mpId).length > 0)
      .map((it) => ({ mpId: String(it.mpId), qty: Number(it.qty ?? 0) }));

    await store.updateFormuleCatalogueItems(selectedFormuleId.value, cleaned);

    // resync local itemsDraft from store (source of truth)
    const f = store.formulesCatalogue.find((x: any) => String(x.id) === selectedFormuleId.value);
    if (f) selectFormule(f);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    savingItems.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Catalogue formules</h1>
        <p class="subtitle">CRUD + composition (MP / qty)</p>
      </div>

      <div class="actions">
        <button class="btn" @click="reload" :disabled="loading">🔄 Recharger</button>
        <button class="btn primary" @click="startCreate" :disabled="creating">➕ Nouvelle formule</button>
      </div>
    </div>

    <div v-if="error" class="card error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="card">Chargement…</div>

    <!-- CREATE -->
    <div v-if="creating" class="card">
      <h2>➕ Ajouter une formule</h2>

      <div class="grid">
        <label>Label <input v-model="newFormule.label" class="input" /></label>
        <label>Résistance <input v-model="newFormule.resistance" class="input" /></label>
        <label>Ville <input v-model="newFormule.city" class="input" /></label>
        <label>Région <input v-model="newFormule.region" class="input" /></label>
        <label>Comment <input v-model="newFormule.comment" class="input" /></label>
      </div>

      <div class="actionsRow">
        <button class="btn" @click="cancelCreate">Annuler</button>
        <button class="btn primary" @click="saveCreate">Enregistrer</button>
      </div>
    </div>

    <div class="grid2">
      <!-- LIST -->
      <div class="card">
        <h2>Liste formules</h2>

        <div class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Résistance</th>
                <th>Ville</th>
                <th>Région</th>
                <th style="width: 220px">Actions</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="f in formules" :key="f.id">
                <template v-if="editId === f.id">
                  <td><input v-model="editDraft!.label" class="input sm" /></td>
                  <td><input v-model="editDraft!.resistance" class="input sm" /></td>
                  <td><input v-model="editDraft!.city" class="input sm" /></td>
                  <td><input v-model="editDraft!.region" class="input sm" /></td>
                  <td>
                    <div class="btnRow">
                      <button class="btn" @click="cancelEdit">Annuler</button>
                      <button class="btn primary" @click="saveEdit">OK</button>
                    </div>
                  </td>
                </template>

                <template v-else>
                  <td><b>{{ f.label }}</b></td>
                  <td>{{ f.resistance }}</td>
                  <td>{{ f.city }}</td>
                  <td>{{ f.region }}</td>
                  <td>
                    <div class="btnRow">
                      <button class="btn" @click="selectFormule(f)">🧩 Composition</button>
                      <button class="btn" @click="startEdit(f)">✏️</button>
                      <button class="btn danger" @click="removeFormule(String(f.id))">🗑️</button>
                    </div>
                  </td>
                </template>
              </tr>

              <tr v-if="formules.length === 0">
                <td colspan="5" class="muted">Aucune formule.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- COMPOSITION -->
      <div class="card">
        <h2>Composition</h2>

        <div v-if="!selectedFormuleId" class="muted">
          Sélectionne une formule puis clique sur “Composition”.
        </div>

        <template v-else>
          <div class="muted" style="margin-bottom: 10px">
            Formule: <b>{{ formules.find(x => String(x.id) === selectedFormuleId)?.label }}</b>
          </div>

          <div class="actionsRow" style="justify-content: space-between">
            <button class="btn" @click="addItem">➕ Ajouter MP</button>
            <button class="btn primary" @click="saveItems" :disabled="savingItems">
              {{ savingItems ? "Enregistrement..." : "Enregistrer composition" }}
            </button>
          </div>

          <div class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>MP</th>
                  <th style="width: 140px">Qty / m³</th>
                  <th style="width: 90px"></th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="(it, i) in itemsDraft" :key="i">
                  <td>
                    <select class="input" v-model="it.mpId">
                      <option v-for="mp in mpOptions" :key="mp.id" :value="String(mp.id)">
                        {{ mp.categorie }} — {{ mp.label }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <input
                      class="input"
                      type="number"
                      step="0.01"
                      v-model.number="it.qty"
                    />
                  </td>
                  <td>
                    <button class="btn danger" @click="removeItem(i)">🗑️</button>
                  </td>
                </tr>

                <tr v-if="itemsDraft.length === 0">
                  <td colspan="3" class="muted">Aucune MP dans la composition.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="muted" style="margin-top: 10px">
            Rappel: l’enregistrement remplace toute la composition côté DB.
          </div>
        </template>
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
.btnRow { display: flex; gap: 6px; flex-wrap: wrap; }
.actionsRow { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.grid2 { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; }
@media (max-width: 1100px) { .grid2 { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #6b7280; }
.input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 13px; color: #111827; background: white; width: 100%; }
.input.sm { padding: 6px 8px; border-radius: 8px; font-size: 12px; }
.tableWrap { overflow: auto; margin-top: 10px; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { border-bottom: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
.table th { font-size: 12px; color: #6b7280; background: #fafafa; }
.muted { color: #6b7280; font-size: 13px; }
</style>
