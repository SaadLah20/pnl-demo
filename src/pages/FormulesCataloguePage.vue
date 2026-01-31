<!-- src/pages/FormulesCataloguePage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

type FormuleDraft = {
  label: string;
  resistance: string;
  city: string;
  region: string;
  comment?: string | null;
};

type ItemDraft = { mpId: string; qty: number };

const store = usePnlStore();

const loading = ref(false);
const busy = reactive({
  create: false,
  update: false,
  remove: false,
  saveItems: false,
  reload: false,
});

const error = ref<string | null>(null);

/* =========================
   DATA
========================= */
const formules = computed<any[]>(() => store.formulesCatalogue ?? []);
const mpOptions = computed<any[]>(() => store.mpCatalogue ?? []);

const q = ref("");
const selectedId = ref<string | null>(null);

const selected = computed<any | null>(() => {
  const id = selectedId.value;
  if (!id) return null;
  return formules.value.find((x) => String(x.id) === id) ?? null;
});

const filtered = computed<any[]>(() => {
  const s = q.value.trim().toLowerCase();
  if (!s) return formules.value;
  return formules.value.filter((f) => {
    const blob = `${f.label ?? ""} ${f.resistance ?? ""} ${f.city ?? ""} ${f.region ?? ""}`.toLowerCase();
    return blob.includes(s);
  });
});

/* =========================
   MODALS (simple panel)
========================= */
const showFormModal = ref(false);
const mode = ref<"create" | "edit">("create");

const formDraft = ref<FormuleDraft>({
  label: "",
  resistance: "",
  city: "",
  region: "",
  comment: "",
});

function openCreate() {
  mode.value = "create";
  formDraft.value = { label: "", resistance: "", city: "", region: "", comment: "" };
  showFormModal.value = true;
}

function openEdit(row: any) {
  mode.value = "edit";
  formDraft.value = {
    label: String(row.label ?? ""),
    resistance: String(row.resistance ?? ""),
    city: String(row.city ?? ""),
    region: String(row.region ?? ""),
    comment: row.comment ?? "",
  };
  selectedId.value = String(row.id);
  showFormModal.value = true;
}

function closeFormModal() {
  showFormModal.value = false;
}

/* =========================
   COMPOSITION EDITOR
========================= */
const itemsDraft = ref<ItemDraft[]>([]);

function selectRow(row: any) {
  selectedId.value = String(row.id);
  const items = (row.items ?? []) as Array<{ mpId: string; qty: number }>;
  itemsDraft.value = items.map((it) => ({
    mpId: String(it.mpId),
    qty: Number(it.qty ?? 0),
  }));
}

function resetCompositionFromSelected() {
  if (!selected.value) return;
  const items = (selected.value.items ?? []) as Array<{ mpId: string; qty: number }>;
  itemsDraft.value = items.map((it) => ({
    mpId: String(it.mpId),
    qty: Number(it.qty ?? 0),
  }));
}

function addItem() {
  const firstMpId = mpOptions.value?.[0]?.id ? String(mpOptions.value[0].id) : "";
  itemsDraft.value.push({ mpId: firstMpId, qty: 0 });
}

function removeItem(idx: number) {
  itemsDraft.value.splice(idx, 1);
}

function normalizeItems(items: ItemDraft[]): ItemDraft[] {
  const map = new Map<string, number>();
  for (const it of items ?? []) {
    const mpId = String(it.mpId ?? "").trim();
    if (!mpId) continue;
    const qty = Number(it.qty ?? 0);
    map.set(mpId, (map.get(mpId) ?? 0) + qty);
  }
  return [...map.entries()].map(([mpId, qty]) => ({ mpId, qty }));
}

const compositionStats = computed(() => {
  // info utile: nb MP + somme qty (kg/m3 typiquement)
  const cleaned = normalizeItems(itemsDraft.value);
  const nb = cleaned.length;
  const sumQty = cleaned.reduce((s, x) => s + Number(x.qty ?? 0), 0);
  return { nb, sumQty };
});

/* =========================
   API
========================= */
async function reload() {
  busy.reload = true;
  loading.value = true;
  error.value = null;
  try {
    await Promise.all([store.loadFormulesCatalogue(), store.loadMpCatalogue()]);
    if (selectedId.value) {
      const row = store.formulesCatalogue.find((x: any) => String(x.id) === String(selectedId.value));
      if (row) selectRow(row);
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    busy.reload = false;
  }
}

async function saveForm() {
  error.value = null;
  const d = formDraft.value;

  if (!d.label?.trim()) {
    error.value = "Label obligatoire";
    return;
  }

  try {
    if (mode.value === "create") {
      busy.create = true;
      await store.createFormuleCatalogue({
        label: d.label.trim(),
        resistance: d.resistance ?? "",
        city: d.city ?? "",
        region: d.region ?? "",
        comment: d.comment ?? "",
      });
      await store.loadFormulesCatalogue();
      closeFormModal();
    } else {
      const id = selectedId.value;
      if (!id) throw new Error("Aucune formule sélectionnée");
      busy.update = true;
      await store.updateFormuleCatalogue(id, {
        label: d.label.trim(),
        resistance: d.resistance ?? "",
        city: d.city ?? "",
        region: d.region ?? "",
        comment: d.comment ?? "",
      });
      await store.loadFormulesCatalogue();
      // resync selection
      const row = store.formulesCatalogue.find((x: any) => String(x.id) === String(id));
      if (row) selectRow(row);
      closeFormModal();
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.create = false;
    busy.update = false;
  }
}

async function removeFormule(id: string) {
  error.value = null;
  if (!confirm("Supprimer cette formule du catalogue ?")) return;

  try {
    busy.remove = true;
    await store.deleteFormuleCatalogue(id);
    await store.loadFormulesCatalogue();
    if (selectedId.value === id) {
      selectedId.value = null;
      itemsDraft.value = [];
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.remove = false;
  }
}

async function saveItems() {
  if (!selectedId.value) return;
  error.value = null;

  try {
    busy.saveItems = true;
    const cleaned = normalizeItems(itemsDraft.value);
    await store.updateFormuleCatalogueItems(selectedId.value, cleaned);
    await store.loadFormulesCatalogue();

    const row = store.formulesCatalogue.find((x: any) => String(x.id) === String(selectedId.value));
    if (row) selectRow(row);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.saveItems = false;
  }
}

function clearSelection() {
  selectedId.value = null;
  itemsDraft.value = [];
}

onMounted(async () => {
  await reload();
});
</script>

<template>
  <div class="page">
    <!-- TOP BAR -->
    <div class="top">
      <div class="tleft">
        <div class="title">Catalogue formules</div>
        <div class="sub">CRUD + composition (MP / qty)</div>
      </div>

      <div class="tright">
        <div class="search">
          <input class="input" v-model="q" placeholder="Rechercher (label, résistance, ville…)" />
        </div>
        <button class="btn" @click="reload" :disabled="busy.reload || loading">🔄</button>
        <button class="btn primary" @click="openCreate" :disabled="busy.create || busy.update">➕ Nouvelle</button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <div class="grid">
      <!-- LIST -->
      <div class="card">
        <div class="cardHead">
          <div class="h">Formules ({{ filtered.length }})</div>
          <div class="mini">
            <span class="pill" v-if="selected">Sélection: <b>{{ selected.label }}</b></span>
          </div>
        </div>

        <div class="list">
          <button
            v-for="f in filtered"
            :key="f.id"
            class="row"
            :class="{ active: selectedId === String(f.id) }"
            @click="selectRow(f)"
          >
            <div class="main">
              <div class="l1">
                <b class="lab">{{ f.label }}</b>
                <span class="tag">{{ f.resistance || "—" }}</span>
              </div>
              <div class="l2">
                <span class="muted">{{ f.city || "—" }}</span>
                <span class="dot">•</span>
                <span class="muted">{{ f.region || "—" }}</span>
              </div>
            </div>

            <div class="rowActions" @click.stop>
              <button class="icon" title="Edit" @click="openEdit(f)">✏️</button>
              <button class="icon danger" title="Delete" @click="removeFormule(String(f.id))">🗑️</button>
            </div>
          </button>

          <div v-if="filtered.length === 0" class="empty">Aucune formule.</div>
        </div>
      </div>

      <!-- DETAILS -->
      <div class="card">
        <div class="cardHead">
          <div class="h">Détails</div>
          <div class="rowBtns">
            <button class="btn" @click="clearSelection" :disabled="!selected">Désélectionner</button>
            <button class="btn" @click="resetCompositionFromSelected" :disabled="!selected || busy.saveItems">Reset</button>
            <button class="btn primary" @click="saveItems" :disabled="!selected || busy.saveItems">
              {{ busy.saveItems ? "Enregistrement..." : "Enregistrer composition" }}
            </button>
          </div>
        </div>

        <div v-if="!selected" class="empty big">
          Sélectionne une formule à gauche.
        </div>

        <template v-else>
          <div class="summary">
            <div class="sLine">
              <div class="sK">Formule</div>
              <div class="sV"><b>{{ selected.label }}</b></div>
            </div>
            <div class="sLine">
              <div class="sK">Résistance</div>
              <div class="sV">{{ selected.resistance || "—" }}</div>
            </div>
            <div class="sLine">
              <div class="sK">Ville / Région</div>
              <div class="sV">{{ selected.city || "—" }} — {{ selected.region || "—" }}</div>
            </div>
          </div>

          <div class="compHead">
            <div class="h2">Composition</div>
            <div class="mini">
              <span class="pill">MP: <b>{{ compositionStats.nb }}</b></span>
              <span class="pill">Σ Qty: <b>{{ compositionStats.sumQty }}</b></span>
            </div>
            <div class="spacer"></div>
            <button class="btn" @click="addItem">➕ Ajouter MP</button>
          </div>

          <div class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>MP</th>
                  <th style="width: 160px">Qty / m³</th>
                  <th style="width: 70px"></th>
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
                    <input class="input right" type="number" step="0.01" v-model.number="it.qty" />
                  </td>
                  <td style="text-align:right">
                    <button class="icon danger" @click="removeItem(i)" title="Supprimer">🗑️</button>
                  </td>
                </tr>

                <tr v-if="itemsDraft.length === 0">
                  <td colspan="3" class="emptyRow">Aucune MP.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="note">
            L’enregistrement remplace toute la composition côté DB.
          </div>
        </template>
      </div>
    </div>

    <!-- MODAL -->
    <div v-if="showFormModal" class="modal">
      <div class="modalCard">
        <div class="modalHead">
          <div class="mh">{{ mode === "create" ? "Nouvelle formule" : "Modifier formule" }}</div>
          <button class="icon" @click="closeFormModal">✕</button>
        </div>

        <div class="formGrid">
          <div class="f">
            <div class="l">Label</div>
            <input class="input" v-model="formDraft.label" />
          </div>
          <div class="f">
            <div class="l">Résistance</div>
            <input class="input" v-model="formDraft.resistance" />
          </div>
          <div class="f">
            <div class="l">Ville</div>
            <input class="input" v-model="formDraft.city" />
          </div>
          <div class="f">
            <div class="l">Région</div>
            <input class="input" v-model="formDraft.region" />
          </div>
          <div class="f span2">
            <div class="l">Commentaire</div>
            <input class="input" v-model="formDraft.comment" />
          </div>
        </div>

        <div class="modalActions">
          <button class="btn" @click="closeFormModal">Annuler</button>
          <button class="btn primary" @click="saveForm" :disabled="busy.create || busy.update">
            {{ mode === "create" ? (busy.create ? "Création..." : "Créer") : (busy.update ? "Enreg..." : "Enregistrer") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 14px; display:flex; flex-direction:column; gap:12px; }
.top { display:flex; justify-content:space-between; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.tleft { display:flex; flex-direction:column; gap:4px; }
.title { font-size:18px; font-weight:900; color:#111827; }
.sub { font-size:12px; color:#6b7280; }
.tright { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.search { min-width: 280px; flex: 1; }

.grid { display:grid; grid-template-columns: 360px 1fr; gap:12px; }
@media (max-width: 980px) { .grid { grid-template-columns: 1fr; } .search{min-width: 100%;} }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:12px; }
.cardHead { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
.h { font-weight:900; font-size:13px; color:#111827; }
.rowBtns { display:flex; gap:8px; flex-wrap:wrap; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:13px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

.btn { border:1px solid #d1d5db; background:#fff; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:900; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { filter: brightness(0.95); }

.icon { border:1px solid #e5e7eb; background:#fff; border-radius:12px; width:34px; height:34px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.icon:hover { background:#f9fafb; }
.icon.danger { border-color:#ef4444; color:#b91c1c; }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; }
.right { text-align:right; }

.list { display:flex; flex-direction:column; gap:8px; max-height: 68vh; overflow:auto; padding-right:4px; }
.row { width:100%; display:flex; justify-content:space-between; gap:10px; padding:10px; border-radius:14px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; text-align:left; }
.row:hover { background:#f9fafb; }
.row.active { border-color: rgba(0,122,51,0.55); background: rgba(236,253,245,0.55); }
.main { min-width:0; display:flex; flex-direction:column; gap:4px; }
.l1 { display:flex; gap:8px; align-items:center; }
.lab { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 230px; }
.tag { font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; color:#374151; font-weight:800; }
.l2 { font-size:11px; color:#6b7280; display:flex; gap:6px; align-items:center; }
.dot { opacity: 0.6; }
.rowActions { display:flex; gap:6px; align-items:center; flex:0 0 auto; }

.empty { color:#6b7280; font-size:12px; padding:10px; border:1px dashed #d1d5db; border-radius:14px; background:#fafafa; }
.empty.big { padding:18px; }
.pill { padding:4px 10px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; font-size:11px; color:#374151; font-weight:800; display:inline-flex; gap:6px; align-items:center; }

.summary { display:grid; grid-template-columns: 140px 1fr; gap:8px 10px; padding:10px; border:1px solid #e5e7eb; border-radius:14px; background:#fcfcfd; }
.sLine { display:contents; }
.sK { font-size:11px; color:#6b7280; font-weight:900; }
.sV { font-size:12px; color:#111827; font-weight:800; }

.compHead { margin-top:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.h2 { font-size:13px; font-weight:900; }
.spacer { flex:1; }

.tableWrap { overflow:auto; margin-top:10px; }
.table { width:100%; border-collapse:collapse; font-size:12px; }
.table th, .table td { border-bottom:1px solid #e5e7eb; padding:8px; text-align:left; vertical-align:top; }
.table th { font-size:11px; color:#6b7280; background:#fafafa; }
.emptyRow { color:#6b7280; padding:10px; }

.note { margin-top:10px; font-size:11px; color:#6b7280; }

.modal { position:fixed; inset:0; background:rgba(17,24,39,0.35); display:flex; align-items:center; justify-content:center; padding:16px; z-index:100; }
.modalCard { width:min(760px, 100%); background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:12px; }
.modalHead { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
.mh { font-weight:900; color:#111827; }
.formGrid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
@media (max-width: 720px) { .formGrid { grid-template-columns: 1fr; } }
.f { display:flex; flex-direction:column; gap:6px; }
.f .l { font-size:11px; color:#6b7280; font-weight:800; }
.span2 { grid-column: span 2; }
@media (max-width: 720px) { .span2 { grid-column: span 1; } }
.modalActions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
</style>
