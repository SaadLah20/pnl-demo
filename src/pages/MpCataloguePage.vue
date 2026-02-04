<!-- src/pages/MpCataloguePage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import {
  PencilSquareIcon,
  TrashIcon,
  InformationCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/vue/24/outline";

import MpModal from "@/components/MpModal.vue";

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

const store = usePnlStore();

const loading = ref(false);
const busy = reactive({ reload: false, save: false, remove: false });
const error = ref<string | null>(null);

const q = ref("");
const rows = computed<any[]>(() => store.mpCatalogue ?? []);

/* =========================
   ENUMS
========================= */
const CATEGORIES = ["CIMENT", "GRANULATS", "SABLE", "ADJUVANT", "EAU", "FILLER", "AUTRE"] as const;
const UNITS = ["T", "KG", "L", "M3", "U"] as const;

const UNITS_OPTIONS = computed<UnitOption[]>(() =>
  UNITS.map((u) => ({
    value: u,
    label: u,
    // Si tu veux re-bloquer tout sauf T, dé-commente:
    // disabled: u !== "T",
  }))
);

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
  if (num(d.prix) <= 0) return "Prix obligatoire et > 0";
  if (trim(d.label).length > 120) return "Label trop long (max 120)";
  if (trim(d.fournisseur).length > 120) return "Fournisseur trop long (max 120)";
  if (trim(d.city).length > 80) return "Ville trop longue (max 80)";
  if (trim(d.region).length > 80) return "Région trop longue (max 80)";
  if (trim(d.comment ?? "").length > 200) return "Commentaire trop long (max 200)";
  return null;
}

/* =========================
   FILTERS
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
   PAGINATION (10 / page) - footer style (FormulesCataloguePage)
========================= */
const PAGE_SIZE = 10;
const page = ref(1);

const total = computed(() => filtered.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const paged = computed<any[]>(() => {
  const p = Math.min(Math.max(1, page.value), totalPages.value);
  const start = (p - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

watch(filtered, () => {
  page.value = 1;
});
watch(totalPages, (tp) => {
  if (page.value > tp) page.value = tp;
});

function goToPage(p: number) {
  page.value = Math.min(Math.max(1, p), totalPages.value);
  nextTick(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

/* =========================
   FORMATTERS
========================= */
function price(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/* =========================
   MODAL create/edit (MpModal)
========================= */
const mpModalOpen = ref(false);
const mpModalMode = ref<"create" | "edit">("create");
const editId = ref<string | null>(null);
const mpModalError = ref<string | null>(null);

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
  mpModalMode.value = "create";
  editId.value = null;
  mpModalError.value = null;
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
  mpModalOpen.value = true;
}

function openEdit(row: any) {
  mpModalMode.value = "edit";
  editId.value = String(row.id);
  mpModalError.value = null;

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

  mpModalOpen.value = true;
}

function closeMpModal() {
  mpModalOpen.value = false;
  mpModalError.value = null;
}

/* =========================
   DELETE MODAL (teleport)
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

async function saveFromModal(payload: MpDraft) {
  mpModalError.value = null;
  error.value = null;

  // Normalisation + validation
  const d: MpDraft = {
    categorie: upperTrim(payload.categorie),
    label: trim(payload.label),
    unite: upperTrim(payload.unite),
    prix: clamp2(num(payload.prix)),
    fournisseur: trim(payload.fournisseur),
    city: trim(payload.city),
    region: upperTrim(payload.region),
    comment: trim(payload.comment ?? ""),
  };

  const err = validateDraft(d);
  if (err) {
    mpModalError.value = err;
    return;
  }

  busy.save = true;
  try {
    if (mpModalMode.value === "create") {
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
    closeMpModal();
  } catch (e: any) {
    mpModalError.value = e?.message ?? String(e);
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
    <div class="card cardTable">
      <div class="tableWrap">
        <table class="table">
          <!-- colgroup = alignement garanti titres/colonnes -->
          <colgroup>
            <col class="cCat" />
            <col class="cLabel" />
            <col class="cUnit" />
            <col class="cPrice" />
            <col class="cFourn" />
            <col class="cCity" />
            <col class="cRegion" />
            <col class="cActions" />
          </colgroup>

          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Label</th>
              <th>Unité</th>
              <th class="right thPrice">Prix MP</th>
              <th>Fournisseur</th>
              <th>Ville</th>
              <th>Région</th>
              <th class="right">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="r in paged" :key="r.id">
              <td class="ell">{{ r.categorie }}</td>

              <td class="ell cellWithOverflow">
                <div class="labelCell">
                  <b class="ell">{{ r.label }}</b>

                  <span v-if="r.comment && String(r.comment).trim()" class="cmtWrap">
                    <!-- IMPORTANT: pas de title => pas de mini popup navigateur -->
                    <button class="cmtBtn" type="button" aria-label="Commentaire">
                      <InformationCircleIcon class="cmtIc" />
                    </button>

                    <span class="cmtTip" role="tooltip">
                      {{ r.comment }}
                    </span>
                  </span>
                </div>
              </td>

              <td class="ell">{{ r.unite }}</td>

              <td class="right tdPrice">
                <span class="priceBadge">
                  {{ price(r.prix) }}
                  <span class="dh">DH</span>
                </span>
              </td>

              <td class="ell">{{ r.fournisseur }}</td>
              <td class="ell">{{ r.city }}</td>
              <td class="ell">{{ r.region }}</td>

              <td class="right">
                <div class="rowActions">
                  <button class="iconBtn" aria-label="Modifier" @click="openEdit(r)">
                    <PencilSquareIcon class="actIc" />
                  </button>
                  <button class="iconBtn danger" aria-label="Supprimer" @click="askDelete(r)">
                    <TrashIcon class="actIc" />
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filtered.length === 0">
              <td colspan="8" class="emptyRow">Aucune MP.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ✅ pager bottom (same style as FormulesCataloguePage) -->
      <div class="pager" v-if="filtered.length > 0">
        <button class="pbtn" :disabled="page <= 1" @click="goToPage(page - 1)">
          <ChevronLeftIcon class="pico" /> Précédent
        </button>

        <div class="pnums">
          <button
            v-for="p in totalPages"
            :key="p"
            class="pnum"
            :class="{ on: p === page }"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>
        </div>

        <button class="pbtn" :disabled="page >= totalPages" @click="goToPage(page + 1)">
          Suivant <ChevronRightIcon class="pico" />
        </button>
      </div>
    </div>

    <!-- ✅ CREATE/EDIT (réutilisable) -->
    <MpModal
      :open="mpModalOpen"
      :mode="mpModalMode"
      :initial="draft"
      :categories="CATEGORIES"
      :units="UNITS_OPTIONS"
      :regions="REGIONS_MA"
      :cities="options.cities"
      :busy="busy.save"
      :error="mpModalError"
      @close="closeMpModal"
      @save="saveFromModal"
    />

    <!-- ✅ CONFIRM DELETE (teleport + z-index > header) -->
    <teleport to="body">
      <div v-if="confirmDelete.open" class="ovlDel" @mousedown.self="closeDelete" role="dialog" aria-modal="true">
        <div class="dlgDel">
          <div class="hdrDel">
            <div class="ttlDel">Confirmer suppression</div>
            <button class="xDel" type="button" @click="closeDelete" aria-label="Fermer">✕</button>
          </div>

          <div class="bodyDel">
            <div class="muted">Tu vas supprimer définitivement :</div>
            <div class="dangerLine">• <b>{{ confirmDelete.label || confirmDelete.id }}</b></div>
          </div>

          <div class="ftrDel">
            <button class="btn" @click="closeDelete" :disabled="busy.remove">Annuler</button>
            <button class="btn dangerBtn" @click="confirmRemove" :disabled="busy.remove">
              {{ busy.remove ? "Suppression..." : "Supprimer" }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page { padding: 14px; display:flex; flex-direction:column; gap:12px; }

.top { display:flex; justify-content:space-between; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.tleft { display:flex; flex-direction:column; gap:4px; }
.title { font-size:18px; font-weight:900; color:#111827; }
.tright { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.search { min-width: 280px; flex: 1; }

.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:13px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:12px; }
.cardTable { overflow: visible; }

.btn { border:1px solid #d1d5db; background:#fff; border-radius:12px; padding:8px 10px; font-size:12px; font-weight:900; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { filter: brightness(0.95); }

.input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:12px; font-size:13px; background:#fff; }
.right { text-align:right; }
.muted { color:#6b7280; font-size:12px; }

/* Tooltips: éviter clipping */
.tableWrap {
  position: relative;
  overflow-x: auto;
  overflow-y: visible;
}
.table {
  width:100%;
  border-collapse:collapse;
  font-size:12px;
  table-layout: fixed;
}
.table th, .table td {
  border-bottom:1px solid #e5e7eb;
  padding:8px;
  text-align:left;
  vertical-align:top;
}
.table th {
  font-size:11px;
  color:#6b7280;
  background:#fafafa;
  white-space: nowrap;
}
.emptyRow { color:#6b7280; padding:10px; }

.ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Colonnes - 1 seule source de vérité */
.cCat { width: 12%; }
.cLabel { width: 26%; }
.cUnit { width: 7%; }
.cPrice { width: 12%; }
.cFourn { width: 16%; }
.cCity { width: 11%; }
.cRegion { width: 11%; }
.cActions { width: 120px; }

.cellWithOverflow { overflow: visible; position: relative; }

.labelCell { display:flex; align-items:center; gap:8px; min-width:0; }
.labelCell > b { min-width:0; }

.cmtWrap { position: relative; display:inline-flex; align-items:center; z-index: 5; }
.cmtBtn{
  width: 26px;
  height: 26px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background:#fff;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor: default;
}
.cmtIc{ width: 16px; height: 16px; color:#6b7280; }

.cmtTip{
  position:absolute;
  left: 34px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 220px;
  max-width: 340px;
  background: rgba(17,24,39,0.95);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.25;
  box-shadow: 0 18px 40px rgba(0,0,0,0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
  transform: translateY(-50%) translateX(-4px);
  z-index: 9999;
}
.cmtWrap:hover .cmtTip{
  opacity: 1;
  transform: translateY(-50%) translateX(0px);
}

.thPrice { color:#111827; font-weight:1000; }
.tdPrice { padding-right: 14px; }
.priceBadge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid #bbf7d0;
  background:#f0fdf4;
  color:#065f46;
  font-weight:1000;
  font-size:13px;
  letter-spacing:0.2px;
  white-space:nowrap;
  max-width: 100%;
  box-sizing: border-box;
}
.priceBadge .dh{
  font-size:11px;
  font-weight:900;
  opacity:0.85;
}

/* Actions */
.rowActions { display:flex; gap:6px; justify-content:flex-end; }
.iconBtn{
  border:1px solid #e5e7eb;
  background:#fff;
  border-radius:12px;
  width:34px;
  height:34px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.iconBtn:hover{ background:#f9fafb; }
.iconBtn.danger{ border-color:#ef4444; color:#b91c1c; }
.actIc{ width:18px; height:18px; }

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

/* ✅ pager (same as FormulesCataloguePage) */
.pager{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding-top:10px; }
.pbtn{
  height:34px;
  border-radius:14px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  padding:0 12px;
  font-weight:950;
  font-size:12px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  cursor:pointer;
}
.pbtn:disabled{ opacity:0.45; cursor:not-allowed; }
.pico{ width:16px; height:16px; }
.pnums{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:center; }
.pnum{
  width:34px; height:34px;
  border-radius:14px;
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  font-weight:950;
  font-size:12px;
  cursor:pointer;
}
.pnum.on{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }

/* ✅ DELETE MODAL (au-dessus du header: header = 9999) */
.ovlDel{
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
  z-index: 100000; /* ✅ > 9999 */
}
.dlgDel{
  width: min(520px, 96vw);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
  overflow:hidden;
}
.hdrDel{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
}
.ttlDel{ font-size: 13px; font-weight: 950; color:#0f172a; }
.xDel{
  width: 34px; height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  cursor:pointer;
}
.xDel:hover{ background: rgba(32, 184, 232, 0.12); border-color: rgba(32, 184, 232, 0.18); }
.bodyDel{ padding: 12px 14px; display:flex; flex-direction:column; gap:8px; }
.dangerLine{ color:#b91c1c; }
.ftrDel{
  padding: 12px 14px;
  display:flex;
  justify-content:flex-end;
  gap:10px;
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(255, 255, 255, 0.72);
}
.dangerBtn { border-color:#ef4444; background:#ef4444; color:#fff; }
.dangerBtn:hover { filter: brightness(0.95); }

/* Responsive: hide fournisseur on small screens */
@media (max-width: 980px) {
  col.cFourn { width: 0 !important; }
  th:nth-child(5), td:nth-child(5) { display:none; }
  col.cLabel { width: 34%; }
}
</style>
