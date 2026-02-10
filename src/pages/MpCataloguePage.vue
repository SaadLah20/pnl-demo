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
  FunnelIcon,
  ArrowPathIcon,
  PlusIcon,
  XMarkIcon,
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
   FILTERS (compact popover)
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
  showFilters.value = false;
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

  const list = rows.value.filter((r) => {
    if (s) {
      const blob =
        `${r.categorie ?? ""} ${r.label ?? ""} ${r.unite ?? ""} ${r.prix ?? ""} ${r.fournisseur ?? ""} ${r.city ?? ""} ${r.region ?? ""} ${r.comment ?? ""}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    if (filters.categorie && norm(r.categorie) !== filters.categorie) return false;
    if (filters.city && norm(r.city) !== filters.city) return false;
    if (filters.region && norm(r.region) !== filters.region) return false;
    return true;
  });

  list.sort((a, b) =>
    String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr", { sensitivity: "base" })
  );

  return list;
});

/* =========================
   PAGINATION
========================= */
const PAGE_SIZE = 12;
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
  // pas de scroll forcé : page compacte, UX stable
}

/* =========================
   FORMATTERS
========================= */
function money2(v: any) {
  const n = Number(v ?? 0);
  const x = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
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
   DELETE MODAL
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

function closeFiltersOnOutside(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest?.(".filtersPop") || t.closest?.(".filtersBtn")) return;
  showFilters.value = false;
}

watch(showFilters, (v) => {
  if (v) window.addEventListener("mousedown", closeFiltersOnOutside);
  else window.removeEventListener("mousedown", closeFiltersOnOutside);
});

onMounted(reload);
</script>

<template>
  <div class="page">
    <!-- SUB HEADER (sticky under HeaderDashboard) -->
    <div class="subhdr">
      <div class="subhdr__left">
        <div class="ttlRow">
          <div class="ttl">Répertoire MP</div>
          <div class="kpi">
            <span class="muted">Résultats</span>
            <b class="n">{{ filtered.length }}</b>
            <span v-if="activeFiltersCount" class="pill">{{ activeFiltersCount }}</span>
          </div>
        </div>

        <div class="searchRow">
          <input
            class="searchIn"
            v-model="q"
            placeholder="Rechercher… (catégorie, label, fournisseur, ville, commentaire)"
          />

          <div class="toolbar">
            <button
              class="icon filtersBtn"
              type="button"
              :class="{ on: showFilters }"
              @click="showFilters = !showFilters"
              title="Filtres"
              aria-label="Filtres"
            >
              <FunnelIcon class="ic" />
              <span v-if="activeFiltersCount" class="dot" />
            </button>

            <button class="icon" type="button" @click="reload" :disabled="busy.reload || loading" title="Recharger">
              <ArrowPathIcon class="ic" />
            </button>

            <button class="primary" type="button" @click="openCreate" :disabled="busy.save" title="Nouvelle MP">
              <PlusIcon class="ic" />
              <span>MP</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Filters popover (compact) -->
      <div v-if="showFilters" class="filtersPop" role="dialog" aria-label="Filtres">
        <div class="filtersTop">
          <div class="fttl">
            <FunnelIcon class="fic" />
            <span>Filtres</span>
          </div>
          <button class="x" type="button" @click="showFilters = false" aria-label="Fermer">
            <XMarkIcon class="xic" />
          </button>
        </div>

        <div class="filtersGrid">
          <label class="f">
            <span class="l">Catégorie</span>
            <select class="in" v-model="filters.categorie">
              <option value="">Toutes</option>
              <option v-for="c in options.categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>

          <label class="f">
            <span class="l">Ville</span>
            <select class="in" v-model="filters.city">
              <option value="">Toutes</option>
              <option v-for="c in options.cities" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>

          <label class="f">
            <span class="l">Région</span>
            <select class="in" v-model="filters.region">
              <option value="">Toutes</option>
              <option v-for="r in options.regions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
        </div>

        <div class="filtersActions">
          <button class="btn" type="button" @click="resetFilters" :disabled="activeFiltersCount === 0">
            Réinitialiser
          </button>
          <button class="btn pri" type="button" @click="showFilters = false">OK</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="alert err"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- TABLE (no horizontal scroll) -->
    <div class="card">
      <div class="tableWrap">
        <table class="table">
          <colgroup>
            <col class="cCat" />
            <col class="cLabel" />
            <col class="cLoc" />
            <col class="cPrice" />
            <col class="cActions" />
          </colgroup>

          <thead>
            <tr>
              <th>Catégorie</th>
              <th>MP</th>
              <th>Localisation</th>
              <th class="right">Prix</th>
              <th class="right">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="r in paged" :key="r.id">
              <td class="ell">
                <span class="cat">{{ r.categorie }}</span>
              </td>

              <td class="cellMain">
                <div class="mainLine">
                  <b class="ell">{{ r.label }}</b>

                  <span v-if="r.comment && String(r.comment).trim()" class="tipWrap">
                    <button class="tipBtn" type="button" aria-label="Commentaire">
                      <InformationCircleIcon class="tipIc" />
                    </button>
                    <span class="tip" role="tooltip">{{ r.comment }}</span>
                  </span>
                </div>

                <div v-if="r.fournisseur && String(r.fournisseur).trim()" class="sub ell">
                  Fournisseur : <b>{{ r.fournisseur }}</b>
                </div>
              </td>

              <td class="cellMain">
                <div class="mainLine">
                  <span class="ell"><b>{{ r.city || "—" }}</b></span>
                </div>
                <div class="sub ell">{{ r.region || "—" }}</div>
              </td>

              <td class="right">
                <span class="price">
                  <span class="mono">{{ money2(r.prix) }}</span>
                  <span class="dh">DH</span>
                  <span class="u">/ {{ r.unite }}</span>
                </span>
              </td>

              <td class="right">
                <div class="acts">
                  <button class="iBtn" aria-label="Modifier" @click="openEdit(r)" title="Modifier">
                    <PencilSquareIcon class="aic" />
                  </button>
                  <button class="iBtn danger" aria-label="Supprimer" @click="askDelete(r)" title="Supprimer">
                    <TrashIcon class="aic" />
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filtered.length === 0">
              <td colspan="5" class="empty">Aucune MP.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager" v-if="filtered.length > 0">
        <button class="pbtn" :disabled="page <= 1" @click="goToPage(page - 1)">
          <ChevronLeftIcon class="pico" /> Précédent
        </button>

        <div class="pnums">
          <button v-for="p in totalPages" :key="p" class="pnum" :class="{ on: p === page }" @click="goToPage(p)">
            {{ p }}
          </button>
        </div>

        <button class="pbtn" :disabled="page >= totalPages" @click="goToPage(page + 1)">
          Suivant <ChevronRightIcon class="pico" />
        </button>
      </div>
    </div>

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

    <!-- DELETE MODAL -->
    <teleport to="body">
      <div v-if="confirmDelete.open" class="ovlDel" @mousedown.self="closeDelete" role="dialog" aria-modal="true">
        <div class="dlgDel">
          <div class="hdrDel">
            <div class="ttlDel">Confirmer suppression</div>
            <button class="xDel" type="button" @click="closeDelete" aria-label="Fermer">✕</button>
          </div>

          <div class="bodyDel">
            <div class="muted">Suppression définitive :</div>
            <div class="dangerLine">• <b>{{ confirmDelete.label || confirmDelete.id }}</b></div>
          </div>

          <div class="ftrDel">
            <button class="btn2" @click="closeDelete" :disabled="busy.remove">Annuler</button>
            <button class="btn2 dangerBtn" @click="confirmRemove" :disabled="busy.remove">
              {{ busy.remove ? "Suppression..." : "Supprimer" }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* Page: compact */
.page { padding: 12px; display:flex; flex-direction:column; gap:10px; }

/* Sticky sub-header under HeaderDashboard
   -> ajuste top si ton HeaderDashboard a une autre hauteur.
   -> idéal: HeaderDashboard définit --hdrdash-h au root. */
.subhdr{
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248,250,252,0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 16px;
  padding: 10px 10px;
}
.subhdr__left{ display:flex; flex-direction:column; gap:8px; }

.ttlRow{ display:flex; align-items:flex-end; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.ttl{ font-size:16px; font-weight:950; color:#0f172a; }
.kpi{ display:flex; align-items:center; gap:8px; font-size:12px; }
.muted{ color: rgba(15,23,42,0.55); font-weight:800; }
.n{ font-weight:950; color:#0f172a; }
.pill{
  display:inline-flex; align-items:center; justify-content:center;
  min-width:22px; height:22px; padding:0 8px;
  border-radius:999px; border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-weight:950; font-size:12px; color:#0f172a;
}

.searchRow{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.searchIn{
  flex:1;
  min-width: 260px;
  height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  color:#0f172a;
}
.searchIn:focus{
  outline:none;
  border-color: rgba(2,132,199,0.35);
  box-shadow: 0 0 0 4px rgba(2,132,199,0.10);
}

.toolbar{ display:flex; gap:8px; align-items:center; }

.icon{
  width: 38px; height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.9);
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer;
  position: relative;
}
.icon:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.icon.on{ background: rgba(2,132,199,0.10); border-color: rgba(2,132,199,0.22); }
.ic{ width:18px; height:18px; color: rgba(15,23,42,0.78); }
.dot{
  position:absolute;
  top: 7px; right: 7px;
  width: 8px; height: 8px;
  border-radius:999px;
  background: #ef4444;
  border: 2px solid rgba(248,250,252,0.92);
}

.primary{
  height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(24,64,112,0.65);
  background: rgba(24,64,112,0.92);
  color:#fff;
  font-weight:950;
  font-size: 12px;
  padding: 0 12px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  cursor:pointer;
}
.primary:hover{ background: rgba(24,64,112,1); }
.primary .ic{ color:#fff; }

/* Filters popover */
.filtersPop{
  position: absolute;
  margin-top: 10px;
  right: 14px;
  width: min(520px, 92vw);
  background:#fff;
  border: 1px solid rgba(16,24,40,0.14);
  border-radius: 16px;
  padding: 10px;
  box-shadow: 0 18px 40px rgba(2,6,23,0.18);
}
.filtersTop{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding: 2px 2px 8px;
  border-bottom: 1px solid rgba(16,24,40,0.08);
}
.fttl{ display:flex; align-items:center; gap:8px; font-weight:950; color:#0f172a; font-size:12px; }
.fic{ width:18px; height:18px; }
.x{
  width: 34px; height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
}
.x:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.xic{ width:18px; height:18px; }

.filtersGrid{ display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:10px; padding-top:10px; }
.f{ display:flex; flex-direction:column; gap:6px; min-width:0; }
.l{ font-size:11px; font-weight:900; color: rgba(15,23,42,0.62); }
.in{
  height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  color:#0f172a;
}
.in:focus{
  outline:none;
  border-color: rgba(2,132,199,0.35);
  box-shadow: 0 0 0 4px rgba(2,132,199,0.10);
}

.filtersActions{
  display:flex; justify-content:flex-end; gap:8px;
  padding-top: 10px;
}
.btn{
  height: 34px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  padding: 0 12px;
  font-weight: 950;
  font-size: 12px;
  cursor:pointer;
}
.btn:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.btn.pri{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.65); color:#fff; }
.btn.pri:hover{ background: rgba(24,64,112,1); }

.alert{
  border:1px solid rgba(16,24,40,0.12);
  border-radius:14px;
  padding:10px 12px;
  background:#fff;
  color:#111827;
  font-size:13px;
}
.alert.err{ border-color:#ef4444; background:#fff5f5; }

/* Card + table (no horizontal scroll) */
.card{ background:#fff; border:1px solid rgba(16,24,40,0.10); border-radius:16px; padding:10px 12px; }
.tableWrap{ overflow: visible; }
.table{
  width:100%;
  border-collapse:collapse;
  font-size:12px;
  table-layout: fixed;
}
.table th, .table td{
  border-bottom:1px solid rgba(16,24,40,0.10);
  padding: 7px 8px;
  text-align:left;
  vertical-align: middle;
}
.table th{
  font-size:11px;
  color: rgba(15,23,42,0.60);
  background: rgba(15,23,42,0.03);
  white-space: nowrap;
  font-weight: 950;
}
.right{ text-align:right; }
.ell{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.empty{ color:#6b7280; padding:10px; text-align:center; }

/* Columns sum <= 100% */
.cCat{ width: 14%; }
.cLabel{ width: 42%; }
.cLoc{ width: 18%; }
.cPrice{ width: 16%; }
.cActions{ width: 10%; }

/* Category */
.cat{
  display:inline-flex; align-items:center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-weight: 950;
  font-size: 11px;
  color:#0f172a;
  max-width: 100%;
  box-sizing: border-box;
}

/* Main cells */
.cellMain{ overflow: visible; }
.mainLine{ display:flex; align-items:center; gap:8px; min-width:0; }
.sub{ margin-top: 2px; font-size: 11px; color: rgba(15,23,42,0.60); }

/* Tooltip */
.tipWrap{ position: relative; display:inline-flex; align-items:center; z-index: 5; }
.tipBtn{
  width: 26px; height: 26px;
  border-radius: 10px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor: default;
}
.tipIc{ width: 16px; height: 16px; color: rgba(15,23,42,0.55); }
.tip{
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
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
  transform: translateY(-50%) translateX(-4px);
  z-index: 9999;
}
.tipWrap:hover .tip{
  opacity: 1;
  transform: translateY(-50%) translateX(0px);
}

/* Price highlight (important numeric field) */
.price{
  display:inline-flex;
  align-items:center;
  justify-content:flex-end;
  gap: 6px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(2,132,199,0.22);
  background: rgba(2,132,199,0.08);
  color:#0b3b63;
  font-weight:1000;
  font-size:13px;
  white-space:nowrap;
  max-width: 100%;
  box-sizing: border-box;
}
.mono{ font-variant-numeric: tabular-nums; }
.dh{ font-size:11px; font-weight:900; opacity:0.9; }
.u{
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.65);
  background: rgba(255,255,255,0.65);
  border: 1px solid rgba(16,24,40,0.10);
  padding: 2px 8px;
  border-radius: 999px;
}

/* actions compact */
.acts{ display:flex; gap:6px; justify-content:flex-end; }
.iBtn{
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  border-radius:12px;
  width:34px;
  height:34px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.iBtn:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.iBtn.danger{ border-color:#ef4444; color:#b91c1c; }
.aic{ width:18px; height:18px; }

/* pager */
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
.pnum.on{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.65); color:#fff; }

/* DELETE MODAL */
.ovlDel{
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
  z-index: 100000;
}
.dlgDel{
  width: min(520px, 96vw);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
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
.xDel:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.bodyDel{ padding: 12px 14px; display:flex; flex-direction:column; gap:8px; }
.dangerLine{ color:#b91c1c; }
.ftrDel{
  padding: 12px 14px;
  display:flex;
  justify-content:flex-end;
  gap:10px;
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
}
.btn2{
  height: 36px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  font-weight: 950;
  font-size: 12px;
  cursor:pointer;
}
.btn2:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.dangerBtn { border-color:#ef4444; background:#ef4444; color:#fff; }
.dangerBtn:hover { filter: brightness(0.95); }

@media (max-width: 980px){
  .filtersGrid{ grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .cCat { width: 18%; }
  .cLabel { width: 46%; }
  .cLoc { width: 0%; }
  th:nth-child(3), td:nth-child(3) { display:none; }
  .cPrice { width: 24%; }
  .cActions { width: 12%; }

  .filtersPop{ right: 10px; left: 10px; width: auto; }
}
</style>
