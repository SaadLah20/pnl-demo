<!-- src/pages/MpCataloguePage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

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

const store = usePnlStore();

const loading = ref(false);
const busy = reactive({ reload: false, save: false, remove: false });
const error = ref<string | null>(null);

const q = ref("");
const rows = computed<any[]>(() => store.mpCatalogue ?? []);

/* =========================
   ENUMS + VALIDATION
========================= */
const CATEGORIES = [
  "CIMENT",
  "GRANULATS",
  "SABLE",
  "ADJUVANT",
  "EAU",
  "FILLER",
  "AUTRE",
] as const;

const UNITS = ["T", "KG", "L", "M3", "U"] as const;

const REGIONS_MA = [
  "ORIENTAL",
  "TANGER-TETOUAN-AL HOCEIMA",
  "FES-MEKNES",
  "RABAT-SALE-KENITRA",
  "BENI MELLAL-KHENIFRA",
  "CASABLANCA-SETTAT",
  "MARRAKECH-SAFI",
  "DRAA-TAFILALET",
  "SOUSS-MASSA",
  "GUELMIM-OUED NOUN",
  "LAAYOUNE-SAKIA EL HAMRA",
  "DAKHLA-OUED EDDAHAB",
] as const;

function upperTrim(s: any) {
  return String(s ?? "").trim().toUpperCase();
}
function trim(s: any) {
  return String(s ?? "").trim();
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clamp2(v: number) {
  return Math.round(v * 100) / 100;
}

function validateDraft(d: MpDraft): string | null {
  if (!trim(d.label)) return "Label obligatoire";
  if (!trim(d.categorie)) return "Catégorie obligatoire";
  if (!trim(d.unite)) return "Unité obligatoire";
  if (num(d.prix) < 0) return "Prix doit être ≥ 0";
  if (trim(d.label).length > 120) return "Label trop long (max 120)";
  if (trim(d.fournisseur).length > 120) return "Fournisseur trop long (max 120)";
  if (trim(d.city).length > 80) return "Ville trop longue (max 80)";
  if (trim(d.region).length > 80) return "Région trop longue (max 80)";
  if (trim(d.comment ?? "").length > 200) return "Commentaire trop long (max 200)";
  return null;
}

/* =========================
   FILTERS (collapsible)
========================= */
const showFilters = ref(false);
const filters = reactive({ categorie: "", city: "", region: "" });

function norm(v: any) {
  return String(v ?? "").trim();
}

const options = computed(() => {
  const uniq = (arr: string[]) =>
    [...new Set(arr.filter((x) => x.trim() !== ""))].sort((a, b) => a.localeCompare(b));
  const data = rows.value;
  return {
    categories: uniq(data.map((r) => norm(r.categorie))),
    cities: uniq(data.map((r) => norm(r.city))),
    regions: uniq(data.map((r) => norm(r.region))),
  };
});

function resetFilters() {
  q.value = "";
  filters.categorie = "";
  filters.city = "";
  filters.region = "";
}

const activeFiltersCount = computed(() => {
  let n = 0;
  if (q.value.trim()) n++;
  if (filters.categorie) n++;
  if (filters.city) n++;
  if (filters.region) n++;
  return n;
});

const filtered = computed<any[]>(() => {
  const s = q.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (s) {
      const blob = `${r.categorie ?? ""} ${r.label ?? ""} ${r.unite ?? ""} ${r.prix ?? ""} ${r.fournisseur ?? ""} ${r.city ?? ""} ${r.region ?? ""} ${r.comment ?? ""}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    if (filters.categorie && norm(r.categorie) !== filters.categorie) return false;
    if (filters.city && norm(r.city) !== filters.city) return false;
    if (filters.region && norm(r.region) !== filters.region) return false;
    return true;
  });
});

/* =========================
   MODAL (create/edit)
========================= */
const showModal = ref(false);
const mode = ref<"create" | "edit">("create");
const editId = ref<string | null>(null);

const draft = ref<MpDraft>({
  categorie: "CIMENT",
  label: "",
  unite: "T",
  prix: 0,
  fournisseur: "",
  city: "",
  region: "ORIENTAL",
  comment: "",
});

function openCreate() {
  mode.value = "create";
  editId.value = null;
  draft.value = {
    categorie: "CIMENT",
    label: "",
    unite: "T",
    prix: 0,
    fournisseur: "",
    city: "",
    region: "ORIENTAL",
    comment: "",
  };
  showModal.value = true;
}

function openEdit(row: any) {
  mode.value = "edit";
  editId.value = String(row.id);

  draft.value = {
    categorie: String(row.categorie ?? ""),
    label: String(row.label ?? ""),
    unite: String(row.unite ?? ""),
    prix: Number(row.prix ?? 0),
    fournisseur: String(row.fournisseur ?? ""),
    city: String(row.city ?? ""),
    region: String(row.region ?? ""),
    comment: row.comment ?? "",
  };

  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

/* Normalisation live (compact + safe) */
watch(
  () => draft.value.categorie,
  (v) => (draft.value.categorie = upperTrim(v))
);
watch(
  () => draft.value.unite,
  (v) => (draft.value.unite = upperTrim(v))
);
watch(
  () => draft.value.region,
  (v) => (draft.value.region = upperTrim(v))
);
watch(
  () => draft.value.prix,
  (v) => (draft.value.prix = clamp2(num(v)))
);

/* =========================
   CONFIRM DELETE MODAL
========================= */
const confirmDelete = reactive({
  open: false,
  id: "" as string,
  label: "" as string,
});

function askDelete(row: any) {
  confirmDelete.open = true;
  confirmDelete.id = String(row.id);
  confirmDelete.label = String(row.label ?? "");
}

function closeDelete() {
  confirmDelete.open = false;
  confirmDelete.id = "";
  confirmDelete.label = "";
}

/* =========================
   API
========================= */
async function reload() {
  loading.value = true;
  busy.reload = true;
  error.value = null;
  try {
    await store.loadMpCatalogue();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    busy.reload = false;
  }
}

async function save() {
  error.value = null;

  // normalize (final)
  const d = draft.value;
  d.categorie = upperTrim(d.categorie);
  d.unite = upperTrim(d.unite);
  d.label = trim(d.label);
  d.fournisseur = trim(d.fournisseur);
  d.city = trim(d.city);
  d.region = upperTrim(d.region);
  d.comment = trim(d.comment ?? "");

  const err = validateDraft(d);
  if (err) {
    error.value = err;
    return;
  }

  busy.save = true;
  try {
    if (mode.value === "create") {
      await store.createMpCatalogue({
        categorie: d.categorie,
        label: d.label,
        unite: d.unite,
        prix: Number(d.prix ?? 0),
        fournisseur: d.fournisseur,
        city: d.city,
        region: d.region,
        comment: d.comment ?? "",
      });
    } else {
      if (!editId.value) throw new Error("Aucune MP sélectionnée");
      await store.updateMpCatalogue(editId.value, {
        categorie: d.categorie,
        label: d.label,
        unite: d.unite,
        prix: Number(d.prix ?? 0),
        fournisseur: d.fournisseur,
        city: d.city,
        region: d.region,
        comment: d.comment ?? "",
      });
    }

    await store.loadMpCatalogue();
    closeModal();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.save = false;
  }
}

async function confirmRemove() {
  error.value = null;
  if (!confirmDelete.id) return;

  busy.remove = true;
  try {
    await store.deleteMpCatalogue(confirmDelete.id);
    await store.loadMpCatalogue();
    closeDelete();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.remove = false;
  }
}

onMounted(reload);
</script>

<template>
  <div class="page">
    <!-- TOP -->
    <div class="top">
      <div class="tleft">
        <div class="title">Répertoire MP</div>
        <div class="sub">CRUD + recherche + filtres (catégorie/ville/région)</div>
      </div>

      <div class="tright">
        <div class="search">
          <input class="input" v-model="q" placeholder="Rechercher (catégorie, label, fournisseur, ville…)" />
        </div>

        <button class="btn" @click="reload" :disabled="busy.reload || loading">🔄</button>
        <button class="btn primary" @click="openCreate" :disabled="busy.save">➕ Nouvelle</button>
      </div>
    </div>

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- FILTERS -->
    <div class="card filtersCard">
      <div class="filtersTop">
        <div class="filtersLeft">
          <button class="btn" @click="showFilters = !showFilters">
            {{ showFilters ? "▲" : "▼" }} Filtres
            <span v-if="activeFiltersCount" class="badge">{{ activeFiltersCount }}</span>
          </button>

          <div class="muted">Résultats : <b>{{ filtered.length }}</b></div>
        </div>

        <div class="filtersRight">
          <button class="btn" @click="resetFilters" :disabled="activeFiltersCount === 0">Réinitialiser</button>
        </div>
      </div>

      <div v-if="showFilters" class="filtersBody">
        <div class="filtersGrid">
          <div class="f">
            <div class="l">Catégorie</div>
            <select class="input" v-model="filters.categorie">
              <option value="">Toutes</option>
              <option v-for="c in options.categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>

          <div class="f">
            <div class="l">Ville</div>
            <select class="input" v-model="filters.city">
              <option value="">Toutes</option>
              <option v-for="c in options.cities" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>

          <div class="f">
            <div class="l">Région</div>
            <select class="input" v-model="filters.region">
              <option value="">Toutes</option>
              <option v-for="r in options.regions" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card">
      <div class="tableWrap">
        <table class="table">
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Label</th>
              <th>Unité</th>
              <th class="right">Prix</th>
              <th>Fournisseur</th>
              <th>Ville</th>
              <th>Région</th>
              <th>Comment</th>
              <th style="width: 160px; text-align:right">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td>{{ r.categorie }}</td>
              <td><b>{{ r.label }}</b></td>
              <td>{{ r.unite }}</td>
              <td class="right">{{ Number(r.prix ?? 0).toFixed(2) }}</td>
              <td>{{ r.fournisseur }}</td>
              <td>{{ r.city }}</td>
              <td>{{ r.region }}</td>
              <td class="muted">{{ r.comment }}</td>
              <td style="text-align:right">
                <div class="rowActions">
                  <button class="icon" title="Modifier" @click="openEdit(r)">✏️</button>
                  <button class="icon danger" title="Supprimer" @click="askDelete(r)">🗑️</button>
                </div>
              </td>
            </tr>

            <tr v-if="filtered.length === 0">
              <td colspan="9" class="emptyRow">Aucune MP.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL CREATE/EDIT (compact + rules) -->
    <div v-if="showModal" class="modal">
      <div class="modalCard">
        <div class="modalHead">
          <div class="mh">{{ mode === "create" ? "Nouvelle MP" : "Modifier MP" }}</div>
          <button class="icon" @click="closeModal">✕</button>
        </div>

        <div class="formGridCompact">
          <div class="f span2">
            <div class="l">Label *</div>
            <input class="input" v-model="draft.label" maxlength="120" placeholder="Ex: Ciment normal CPJ55" />
          </div>

          <div class="f">
            <div class="l">Catégorie *</div>
            <select class="input" v-model="draft.categorie">
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>

          <div class="f">
            <div class="l">Unité *</div>
            <select class="input" v-model="draft.unite">
              <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>

          <div class="f">
            <div class="l">Prix *</div>
            <input class="input right" type="number" inputmode="decimal" step="0.01" min="0" v-model.number="draft.prix" />
          </div>

          <div class="f">
            <div class="l">Fournisseur</div>
            <input class="input" v-model="draft.fournisseur" maxlength="120" placeholder="Ex: SIKA" />
          </div>

          <div class="f">
            <div class="l">Ville</div>
            <input class="input" v-model="draft.city" maxlength="80" placeholder="Ex: Nador" />
          </div>

          <div class="f">
            <div class="l">Région</div>
            <select class="input" v-model="draft.region">
              <option v-for="r in REGIONS_MA" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>

          <div class="f span2">
            <div class="l">Commentaire</div>
            <input class="input" v-model="draft.comment" maxlength="200" placeholder="Ex: LH FES" />
          </div>
        </div>

        <div class="modalActions">
          <button class="btn" @click="closeModal">Annuler</button>
          <button class="btn primary" @click="save" :disabled="busy.save">
            {{ busy.save ? "Enregistrement..." : "Enregistrer" }}
          </button>
        </div>
      </div>
    </div>

    <!-- CONFIRM DELETE POPUP -->
    <div v-if="confirmDelete.open" class="modal">
      <div class="confirmCard">
        <div class="modalHead">
          <div class="mh">Confirmer suppression</div>
          <button class="icon" @click="closeDelete">✕</button>
        </div>

        <div class="confirmBody">
          <div class="muted">Tu vas supprimer définitivement :</div>
          <div class="dangerLine">• <b>{{ confirmDelete.label || confirmDelete.id }}</b></div>
        </div>

        <div class="modalActions">
          <button class="btn" @click="closeDelete" :disabled="busy.remove">Annuler</button>
          <button class="btn dangerBtn" @click="confirmRemove" :disabled="busy.remove">
            {{ busy.remove ? "Suppression..." : "Supprimer" }}
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

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:13px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:12px; }

.btn { border:1px solid #d1d5db; background:#fff; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:900; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { filter: brightness(0.95); }

.icon { border:1px solid #e5e7eb; background:#fff; border-radius:12px; width:34px; height:34px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.icon:hover { background:#f9fafb; }
.icon.danger { border-color:#ef4444; color:#b91c1c; }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; }
.right { text-align:right; }
.muted { color:#6b7280; font-size:12px; }

.tableWrap { overflow:auto; }
.table { width:100%; border-collapse:collapse; font-size:12px; }
.table th, .table td { border-bottom:1px solid #e5e7eb; padding:8px; text-align:left; vertical-align:top; }
.table th { font-size:11px; color:#6b7280; background:#fafafa; }
.rowActions { display:flex; gap:6px; justify-content:flex-end; }
.emptyRow { color:#6b7280; padding:10px; }

/* Filters */
.filtersCard { padding: 10px 12px; }
.filtersTop { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.filtersLeft { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.filtersRight { display:flex; align-items:center; gap:8px; }
.filtersBody { margin-top:10px; border-top:1px solid #e5e7eb; padding-top:10px; }
.filtersGrid { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
@media (max-width: 980px) { .filtersGrid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .filtersGrid { grid-template-columns: 1fr; } }
.f { display:flex; flex-direction:column; gap:6px; }
.f .l { font-size:11px; color:#6b7280; font-weight:800; }
.badge {
  margin-left:8px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:22px;
  height:22px;
  padding:0 8px;
  border-radius:999px;
  border:1px solid #e5e7eb;
  background:#fafafa;
  font-size:12px;
  font-weight:900;
  color:#111827;
}

/* Modal */
.modal { position:fixed; inset:0; background:rgba(17,24,39,0.35); display:flex; align-items:center; justify-content:center; padding:16px; z-index:100; }
.modalCard { width:min(760px, 100%); background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:12px; }
.modalHead { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
.mh { font-weight:900; color:#111827; }

/* Compact form */
.formGridCompact {
  display:grid;
  grid-template-columns: 1.2fr 1fr;
  gap:10px;
}
@media (max-width: 820px) { .formGridCompact { grid-template-columns: 1fr; } }
.span2 { grid-column: span 2; }
@media (max-width: 820px) { .span2 { grid-column: span 1; } }

.modalActions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }

/* Confirm card */
.confirmCard { width:min(520px, 100%); background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:12px; }
.confirmBody { display:flex; flex-direction:column; gap:8px; padding:6px 2px; }
.dangerLine { color:#b91c1c; }
.dangerBtn { border-color:#ef4444; background:#ef4444; color:#fff; }
.dangerBtn:hover { filter: brightness(0.95); }
</style>
