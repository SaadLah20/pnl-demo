<!-- ✅ src/pages/FormulesCataloguePage.vue (FICHIER COMPLET / pagination en bas uniquement, 10 par page) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

import {
  PlusIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  FunnelIcon,
  InformationCircleIcon,
} from "@heroicons/vue/24/outline";

import FormuleModal from "@/components/FormuleModal.vue";

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
const error = ref<string | null>(null);

const busy = reactive({
  reload: false,
  create: false,
  update: false,
  remove: false,
  saveItems: false,
});

/* =========================
   TOAST (light)
========================= */
const toastOpen = ref(false);
const toastMsg = ref<string>("");
function showToast(msg: string) {
  toastMsg.value = msg;
  toastOpen.value = true;
}
function closeToast() {
  toastOpen.value = false;
  toastMsg.value = "";
}

/* =========================
   DATA
========================= */
const formules = computed<any[]>(() => store.formulesCatalogue ?? []);
const mpOptions = computed<any[]>(() => store.mpCatalogue ?? []);

/* =========================
   FILTERS (popover)
========================= */
const q = ref("");
const filtersOpen = ref(false);

const fRes = ref<string>("");
const fCity = ref<string>("");
const fRegion = ref<string>("");
const fCimentMin = ref<number | null>(null);
const fCimentMax = ref<number | null>(null);

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toNum(v));
}
function liters(v: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(toNum(v));
}
function normKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const activeFiltersCount = computed(() => {
  let c = 0;
  if (q.value.trim()) c++;
  if (fRes.value) c++;
  if (fCity.value) c++;
  if (fRegion.value) c++;
  if (fCimentMin.value != null) c++;
  if (fCimentMax.value != null) c++;
  return c;
});

function resetFilters() {
  q.value = "";
  fRes.value = "";
  fCity.value = "";
  fRegion.value = "";
  fCimentMin.value = null;
  fCimentMax.value = null;
  filtersOpen.value = false;
}

/* close filters on outside click */
function closeFiltersOnOutside(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest?.(".filtersPop") || t.closest?.(".filtersBtn")) return;
  filtersOpen.value = false;
}
watch(filtersOpen, (v) => {
  if (v) window.addEventListener("mousedown", closeFiltersOnOutside);
  else window.removeEventListener("mousedown", closeFiltersOnOutside);
});

/* Options (unique values) */
const resistanceOptions = computed<string[]>(() => {
  const set = new Set<string>();
  for (const f of formules.value ?? []) {
    const v = String(f?.resistance ?? "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});
const cityOptions = computed<string[]>(() => {
  const set = new Set<string>();
  for (const f of formules.value ?? []) {
    const v = String(f?.city ?? "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});
const regionOptions = computed<string[]>(() => {
  const set = new Set<string>();
  for (const f of formules.value ?? []) {
    const v = String(f?.region ?? "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});

/* =========================
   OPEN / COLLAPSE
========================= */
const open = reactive<Record<string, boolean>>({});
function toggle(id: string) {
  open[id] = !open[id];
}
function isOpen(id: string) {
  return !!open[id];
}

/* =========================
   LOCAL DRAFTS PER FORMULE
========================= */
const draftsById = reactive<Record<string, ItemDraft[]>>({});

function getDraft(formuleId: string): ItemDraft[] {
  if (!draftsById[formuleId]) draftsById[formuleId] = [];
  return draftsById[formuleId];
}
function loadDraftFromRow(row: any) {
  const id = String(row?.id ?? "");
  const items = (row?.items ?? []) as Array<{ mpId: string; qty: number }>;
  draftsById[id] = items.map((it) => ({
    mpId: String(it?.mpId ?? ""),
    qty: Number(it?.qty ?? 0),
  }));
}
function ensureDraft(row: any) {
  const id = String(row?.id ?? "");
  if (!draftsById[id]) loadDraftFromRow(row);
}

/* =========================
   MP sorting: Ciment -> Granulats/Sable -> Adjuvant -> others
========================= */
function catRank(catRaw: any) {
  const c = normKey(catRaw);
  if (c.includes("ciment")) return 0;
  if (c.includes("granul") || c.includes("granula") || c.includes("granulas") || c.includes("sable")) return 1;
  if (c.includes("adjuvant")) return 2;
  return 9;
}

const mpSorted = computed<any[]>(() => {
  const arr = [...(mpOptions.value ?? [])];
  arr.sort((a, b) => {
    const ra = catRank(a?.categorie);
    const rb = catRank(b?.categorie);
    if (ra !== rb) return ra - rb;
    return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr");
  });
  return arr;
});

function mpById(mpId: string): any | null {
  const found = (mpOptions.value ?? []).find((x: any) => String(x?.id ?? "") === String(mpId));
  return found ?? null;
}

/* =========================
   Helpers: normalize, ciment constraint, duplicate MP constraint
========================= */
function normalizeItems(items: ItemDraft[] = []): ItemDraft[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const mpId = String(it.mpId ?? "").trim();
    if (!mpId) continue;
    map.set(mpId, (map.get(mpId) ?? 0) + Number(it.qty ?? 0));
  }
  return [...map.entries()].map(([mpId, qty]) => ({ mpId, qty }));
}
function isCimentMp(mpId: string): boolean {
  const mp = mpById(mpId);
  return catRank(mp?.categorie) === 0;
}
function countCiment(items: ItemDraft[] = []): number {
  let c = 0;
  for (const it of items) if (it?.mpId && isCimentMp(String(it.mpId))) c++;
  return c;
}
function countMp(items: ItemDraft[] = [], mpId: string): number {
  const id = String(mpId ?? "");
  if (!id) return 0;
  let c = 0;
  for (const it of items) if (String(it?.mpId ?? "") === id) c++;
  return c;
}

function cimentQty(items: ItemDraft[] = []): number {
  for (const it of items) {
    if (it?.mpId && isCimentMp(String(it.mpId))) return toNum(it.qty ?? 0);
  }
  return 0;
}
function cimentQtyFromRow(row: any): number {
  const items = (row?.items ?? []) as Array<{ mpId: string; qty: number }>;
  for (const it of items) {
    const mp = mpById(String(it?.mpId ?? ""));
    if (catRank(mp?.categorie) === 0) return toNum(it?.qty ?? 0);
  }
  return 0;
}

/* Forbid second ciment + forbid duplicate MP */
function onChangeMp(formuleId: string, idx: number, newMpId: string) {
  const d = getDraft(formuleId);
  const row = d[idx];
  if (!row) return;

  const prevMpId = String(row.mpId ?? "");
  const nextMpId = String(newMpId ?? "");

  row.mpId = nextMpId;

  if (nextMpId && countMp(d, nextMpId) > 1) {
    row.mpId = prevMpId;
    showToast("Interdit : une formule ne peut pas contenir 2 fois la même MP.");
    return;
  }
  if (countCiment(d) > 1) {
    row.mpId = prevMpId;
    showToast("Interdit : une formule ne peut pas contenir 2 MP de catégorie CIMENT.");
  }
}

/* =========================
   ✅ CMP (live in row)
========================= */
function cmpFromItems(items: ItemDraft[]): number {
  const cleaned = normalizeItems(items);
  if (!cleaned.length) return 0;

  let total = 0;
  for (const it of cleaned) {
    const mp = mpById(String(it.mpId ?? ""));
    const prixT = toNum((mp as any)?.prix ?? 0);
    const qtyKg = toNum(it.qty ?? 0);
    total += (qtyKg / 1000) * prixT;
  }
  return total;
}

function getCmpRow(row: any): number {
  const id = String(row?.id ?? "");
  const draft = draftsById[id];
  if (Array.isArray(draft) && draft.length) return cmpFromItems(draft);

  const raw = (row?.items ?? []) as Array<{ mpId: string; qty: number }>;
  const items: ItemDraft[] = raw.map((it) => ({
    mpId: String((it as any)?.mpId ?? ""),
    qty: Number((it as any)?.qty ?? 0),
  }));
  return cmpFromItems(items);
}

function fmtCmp(v: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(toNum(v));
}

/* =========================
   Composition Stats (volume verifier)
========================= */
function getRhoForMp(mp: any): number | null {
  const cat = normKey(mp?.categorie);
  if (cat === "ciment") return 3.1;

  if (cat === "granulats" || cat === "granulat" || cat === "granulas" || cat === "granula" || cat.includes("granul"))
    return 2.65;

  if (cat === "adjuvant") return 1.1;
  return null;
}

function compositionStatsFor(formuleId: string) {
  const cleaned = normalizeItems(getDraft(formuleId));
  let mCiment = 0;
  let vTotal = 0;
  const missing: Array<{ mpId: string; label: string }> = [];

  for (const it of cleaned) {
    const mp = mpById(String(it.mpId));
    const rho = getRhoForMp(mp);

    if (!rho) {
      missing.push({ mpId: String(it.mpId), label: `${mp?.categorie ?? "—"} — ${mp?.label ?? "—"}` });
      continue;
    }

    const m = toNum(it.qty ?? 0);
    vTotal += m / rho;

    if (normKey(mp?.categorie) === "ciment") mCiment += m;
  }

  const mEau = mCiment * 0.5;
  const vEau = mEau / 1.0;

  vTotal += vEau;
  vTotal += 15;

  const target = 1000;
  const deficitPct = target > 0 ? ((target - vTotal) / target) * 100 : 0;
  const isLow = vTotal < target * 0.97;

  return { vTotal, target, vEau, deficitPct, isLow, isOk: !isLow, missing };
}

function volumeLine(formuleId: string): string {
  const s = compositionStatsFor(formuleId);
  if (s.isLow) return `⚠️ Volume ${liters(s.vTotal)} L < cible ${s.target} L (déficit ${liters(s.deficitPct)}%).`;
  return `✅ Volume OK (±3%) — ${liters(s.vTotal)} L.`;
}

/* =========================
   FILTERED LIST
========================= */
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();

  return (formules.value ?? [])
    .filter((f) => {
      if (s) {
        const blob = `${f.label ?? ""} ${f.resistance ?? ""} ${f.city ?? ""} ${f.region ?? ""} ${f.comment ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }

      if (fRes.value && String(f?.resistance ?? "") !== fRes.value) return false;
      if (fCity.value && String(f?.city ?? "") !== fCity.value) return false;
      if (fRegion.value && String(f?.region ?? "") !== fRegion.value) return false;

      const cQty = cimentQtyFromRow(f);
      if (fCimentMin.value != null && cQty < fCimentMin.value) return false;
      if (fCimentMax.value != null && cQty > fCimentMax.value) return false;

      return true;
    })
    .sort((a, b) => String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr", { sensitivity: "base" }));
});

/* =========================
   ✅ PAGINATION (10 / page) - navigator en bas uniquement
========================= */
const pageSize = 10;
const currentPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil((filtered.value?.length ?? 0) / pageSize)));

const paginated = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return (filtered.value ?? []).slice(start, start + pageSize);
});

function goToPage(p: number) {
  if (p < 1) p = 1;
  if (p > totalPages.value) p = totalPages.value;
  currentPage.value = p;
}

/* reset page when filters change */
watch([q, fRes, fCity, fRegion, fCimentMin, fCimentMax], () => {
  currentPage.value = 1;
});

/* adjust page if total pages shrink (delete/filter) */
watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp;
});

/* =========================
   CRUD MODAL (create/edit)
========================= */
const showFormModal = ref(false);
const mode = ref<"create" | "edit">("create");
const activeEditId = ref<string | null>(null);

const modalError = ref<string | null>(null);
const formDraft = ref<FormuleDraft>({ label: "", resistance: "", city: "", region: "", comment: "" });

function openCreate() {
  mode.value = "create";
  activeEditId.value = null;
  modalError.value = null;
  formDraft.value = { label: "", resistance: "", city: "", region: "", comment: "" };
  showFormModal.value = true;
}
function openEdit(row: any) {
  mode.value = "edit";
  activeEditId.value = String(row?.id ?? "");
  modalError.value = null;
  formDraft.value = {
    label: String(row?.label ?? ""),
    resistance: String(row?.resistance ?? ""),
    city: String(row?.city ?? ""),
    region: String(row?.region ?? ""),
    comment: row?.comment ?? "",
  };
  showFormModal.value = true;
}
function closeFormModal() {
  showFormModal.value = false;
}

/* =========================
   DELETE (nice confirm)
========================= */
const showDeleteModal = ref(false);
const deleteId = ref<string | null>(null);
const deleteLabel = ref<string>("");

function askDelete(row: any) {
  deleteId.value = String(row?.id ?? "");
  deleteLabel.value = String(row?.label ?? "");
  showDeleteModal.value = true;
}
function closeDeleteModal() {
  showDeleteModal.value = false;
  deleteId.value = null;
  deleteLabel.value = "";
}

async function confirmDelete() {
  if (!deleteId.value) return;
  error.value = null;

  try {
    busy.remove = true;
    await store.deleteFormuleCatalogue(deleteId.value);
    await store.loadFormulesCatalogue();
    closeDeleteModal();
    // ✅ pagination safety (in case current page becomes empty)
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.remove = false;
  }
}

/* =========================
   Replace MP (by same category)
========================= */
const replaceOpen = ref(false);
const replaceCtx = reactive<{ formuleId: string; idx: number; oldMpId: string; category: string }>({
  formuleId: "",
  idx: -1,
  oldMpId: "",
  category: "",
});

const replaceOptions = computed(() => {
  if (!replaceCtx.formuleId || replaceCtx.idx < 0) return [];
  const old = mpById(replaceCtx.oldMpId);
  const rank = catRank(old?.categorie);
  const opts = (mpOptions.value ?? []).filter((mp: any) => catRank(mp?.categorie) === rank);
  return opts.filter((mp: any) => String(mp?.id ?? "") !== String(replaceCtx.oldMpId));
});

const selectedReplaceMpId = ref<string>("");

function openReplace(formuleId: string, idx: number) {
  const d = getDraft(formuleId);
  const row = d[idx];
  if (!row) return;

  const oldMpId = String(row.mpId ?? "");
  const old = mpById(oldMpId);

  replaceCtx.formuleId = formuleId;
  replaceCtx.idx = idx;
  replaceCtx.oldMpId = oldMpId;
  replaceCtx.category = String(old?.categorie ?? "—");

  const opts = replaceOptions.value;
  if (!opts.length) {
    showToast(`Aucune autre MP disponible dans la même catégorie (${replaceCtx.category}).`);
    return;
  }

  selectedReplaceMpId.value = String(opts[0]?.id ?? "");
  replaceOpen.value = true;
}

function closeReplace() {
  replaceOpen.value = false;
  selectedReplaceMpId.value = "";
}
function confirmReplace() {
  const formuleId = replaceCtx.formuleId;
  const idx = replaceCtx.idx;
  if (!formuleId || idx < 0) return;

  const newId = String(selectedReplaceMpId.value ?? "");
  onChangeMp(formuleId, idx, newId);

  closeReplace();
}

/* =========================
   Composition editing
========================= */
function addItem(formuleId: string) {
  const d = getDraft(formuleId);

  const used = new Set<string>();
  for (const it of d) {
    const id = String(it?.mpId ?? "").trim();
    if (id) used.add(id);
  }

  const pick = (mpSorted.value ?? []).find((mp: any) => {
    const id = String(mp?.id ?? "");
    if (!id) return false;
    if (used.has(id)) return false;
    if (catRank(mp?.categorie) === 0 && countCiment(d) >= 1) return false;
    return true;
  });

  if (!pick?.id) {
    showToast("Impossible d’ajouter : aucune MP disponible (déjà utilisées ou contrainte CIMENT).");
    return;
  }

  d.unshift({ mpId: String(pick.id), qty: 0 });
}

function removeItem(formuleId: string, idx: number) {
  const d = getDraft(formuleId);
  if (!d[idx]) return;
  d.splice(idx, 1);
}

/* =========================
   API
========================= */
async function reload() {
  busy.reload = true;
  loading.value = true;
  error.value = null;

  try {
    await Promise.all([store.loadFormulesCatalogue(), store.loadMpCatalogue()]);
    for (const f of store.formulesCatalogue ?? []) {
      const id = String((f as any)?.id ?? "");
      if (draftsById[id]) loadDraftFromRow(f);
    }
    // ✅ pagination safety after reload
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    busy.reload = false;
  }
}

async function saveForm(payload?: FormuleDraft) {
  modalError.value = null;
  const d = payload ?? formDraft.value;

  if (!String(d.label ?? "").trim()) {
    modalError.value = "Label obligatoire";
    return;
  }

  try {
    if (mode.value === "create") {
      busy.create = true;
      await store.createFormuleCatalogue({
        label: String(d.label).trim(),
        resistance: d.resistance ?? "",
        city: d.city ?? "",
        region: d.region ?? "",
        comment: d.comment ?? "",
      });
      await store.loadFormulesCatalogue();
      showFormModal.value = false;
      // ✅ go to last page to see newly created item (optional but handy)
      currentPage.value = totalPages.value;
    } else {
      const id = activeEditId.value;
      if (!id) throw new Error("Aucune formule sélectionnée");
      busy.update = true;
      await store.updateFormuleCatalogue(id, {
        label: String(d.label).trim(),
        resistance: d.resistance ?? "",
        city: d.city ?? "",
        region: d.region ?? "",
        comment: d.comment ?? "",
      });
      await store.loadFormulesCatalogue();
      showFormModal.value = false;
    }
  } catch (e: any) {
    modalError.value = e?.message ?? String(e);
  } finally {
    busy.create = false;
    busy.update = false;
  }
}

function patchEverywhereAfterFormuleUpdate(formuleId: string, cleaned: ItemDraft[]) {
  const list = store.formulesCatalogue ?? [];
  const row = list.find((x: any) => String(x?.id ?? "") === String(formuleId));
  if (row) (row as any).items = cleaned.map((x) => ({ mpId: x.mpId, qty: x.qty }));

  const v: any = (store as any).activeVariant;
  if (v) {
    const items = v?.formules?.items ?? v?.variantFormules ?? [];
    if (Array.isArray(items)) {
      for (const it of items) {
        const fid = String(it?.formuleId ?? it?.formule?.id ?? "");
        if (fid === String(formuleId)) {
          if (!it.formule) it.formule = {};
          it.formule.items = cleaned.map((x) => ({ mpId: x.mpId, qty: x.qty }));
        }
      }
    }
  }
}

async function saveItems(formuleId: string, row: any) {
  error.value = null;
  const cleaned = normalizeItems(getDraft(formuleId));

  const usedCount = Number((row as any)?.variantsCount ?? (row as any)?.usedByVariants ?? 0);
  if (usedCount > 0) {
    const ok = window.confirm(
      `Cette formule est utilisée par ${usedCount} variante(s).\n` +
        `En modifiant la composition, les variantes concernées doivent être mises à jour.\n\nConfirmer ?`
    );
    if (!ok) return;
  }

  try {
    busy.saveItems = true;

    await store.updateFormuleCatalogueItems(String(formuleId), cleaned);

    patchEverywhereAfterFormuleUpdate(String(formuleId), cleaned);
    showToast("Composition enregistrée ✅");
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg.includes("Cannot PUT /formules-catalogue/") && msg.includes("/items")) {
      showToast(
        "Erreur API : la route PUT /formules-catalogue/:id/items n’est pas atteignable (proxy/baseURL).\n" +
          "➡️ Vérifie que ton backend expose bien cette route, ou que ton store utilise l’URL API (pas le serveur Vite)."
      );
    } else {
      error.value = msg;
    }
  } finally {
    busy.saveItems = false;
  }
}

watch([q, fRes, fCity, fRegion, fCimentMin, fCimentMax], () => (error.value = null));

onMounted(reload);
</script>

<template>
  <div class="page">
    <!-- SUB HEADER sticky (under HeaderDashboard) -->
    <div class="subhdr">
      <div class="subhdrTop">
        <div class="ttl">
          Catalogue formules
          <span class="sep">•</span>
          <span class="muted">Résultats</span>
          <b class="n">{{ filtered.length }}</b>
          <span v-if="activeFiltersCount" class="pill">{{ activeFiltersCount }}</span>
        </div>

        <div class="actions">
          <button class="icon filtersBtn" type="button" :class="{ on: filtersOpen }" @click="filtersOpen = !filtersOpen" title="Filtres">
            <FunnelIcon class="ic" />
            <span v-if="activeFiltersCount" class="dot"></span>
          </button>

          <button class="icon" type="button" @click="reload" :disabled="busy.reload || loading" title="Recharger">
            <ArrowPathIcon class="ic" />
          </button>

          <button class="primary" type="button" @click="openCreate" :disabled="busy.create || busy.update" title="Nouvelle formule">
            <PlusIcon class="ic" />
            <span>Formule</span>
          </button>
        </div>
      </div>

      <div class="subhdrBottom">
        <input class="search" v-model="q" placeholder="Rechercher… (label, résistance, ville, région, commentaire)" />
      </div>

      <!-- Filters popover -->
      <div v-if="filtersOpen" class="filtersPop" role="dialog" aria-label="Filtres">
        <div class="filtersHead">
          <div class="fttl">
            <FunnelIcon class="fic" />
            <span>Filtres</span>
          </div>
          <button class="x" type="button" @click="filtersOpen = false" aria-label="Fermer">
            <XMarkIcon class="xic" />
          </button>
        </div>

        <div class="filtersGrid">
          <label class="f">
            <span class="l">Résistance</span>
            <select class="in" v-model="fRes">
              <option value="">Toutes</option>
              <option v-for="r in resistanceOptions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>

          <label class="f">
            <span class="l">Ville</span>
            <select class="in" v-model="fCity">
              <option value="">Toutes</option>
              <option v-for="c in cityOptions" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>

          <label class="f">
            <span class="l">Région</span>
            <select class="in" v-model="fRegion">
              <option value="">Toutes</option>
              <option v-for="r in regionOptions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>

          <div class="f span3">
            <span class="l">Dosage ciment (kg/m³)</span>
            <div class="range">
              <input class="in num" type="number" min="0" step="1" v-model.number="fCimentMin" placeholder="Min" />
              <span class="dash">—</span>
              <input class="in num" type="number" min="0" step="1" v-model.number="fCimentMax" placeholder="Max" />
              <button class="btnSm" type="button" @click="(fCimentMin = null), (fCimentMax = null)">Reset</button>
            </div>
          </div>
        </div>

        <div class="filtersFoot">
          <button class="btnSm" type="button" @click="resetFilters" :disabled="activeFiltersCount === 0">Réinitialiser</button>
          <button class="btnSm pri" type="button" @click="filtersOpen = false">OK</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="alert err">
      <ExclamationTriangleIcon class="aic" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- Cards list -->
    <div class="cards">
      <div v-for="f in paginated" :key="f.id" class="card">
        <button class="rowHead" type="button" @click="toggle(String(f.id)); ensureDraft(f)">
          <div class="left">
            <span class="chev">
              <ChevronDownIcon v-if="isOpen(String(f.id))" class="chIc" />
              <ChevronRightIcon v-else class="chIc" />
            </span>

            <div class="main">
              <div class="line1">
                <span class="name">{{ f.label || "—" }}</span>
                <span class="chip">{{ f.resistance || "—" }}</span>

                <span v-if="f.comment && String(f.comment).trim()" class="tipWrap" @click.stop>
                  <button class="tipBtn" type="button" aria-label="Commentaire">
                    <InformationCircleIcon class="tipIc" />
                  </button>
                  <span class="tip" role="tooltip">{{ f.comment }}</span>
                </span>
              </div>

              <div class="line2">
                <span class="sub">{{ f.city || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ f.region || "—" }}</span>
              </div>
            </div>
          </div>

          <div class="right" @click.stop>
            <div class="kpis" v-if="((draftsById as any)[String(f.id)]?.length ?? 0) || ((f as any)?.items?.length ?? 0)">
              <span class="kpi">
                <span class="kLbl">Ciment</span>
                <span class="kVal ciment">
                  {{
                    n(
                      ((draftsById as any)[String(f.id)]?.length ?? 0)
                        ? cimentQty(getDraft(String(f.id)))
                        : cimentQtyFromRow(f),
                      0
                    )
                  }}
                </span>
                <span class="kUnit">kg/m³</span>
              </span>

              <span class="kpi">
                <span class="kLbl">CMP</span>
                <span class="kVal">{{ fmtCmp(getCmpRow(f)) }}</span>
                <span class="kUnit">DH/m³</span>
              </span>
            </div>

            <div class="acts">
              <button class="iBtn" title="Modifier" @click="openEdit(f)">
                <PencilSquareIcon class="aic2" />
              </button>
              <button class="iBtn danger" title="Supprimer" @click="askDelete(f)">
                <TrashIcon class="aic2" />
              </button>
            </div>
          </div>
        </button>

        <div v-if="isOpen(String(f.id))" class="body">
          <div v-if="compositionStatsFor(String(f.id)).missing.length" class="banner warn">
            MP sans ρ :
            <span v-for="m in compositionStatsFor(String(f.id)).missing" :key="m.mpId" class="miniTag">
              {{ m.label }}
            </span>
          </div>

          <div class="volRow" :class="{ low: compositionStatsFor(String(f.id)).isLow, ok: compositionStatsFor(String(f.id)).isOk }">
            <div class="volMsg">{{ volumeLine(String(f.id)) }}</div>

            <div class="volBtns">
              <button class="btnSm" type="button" @click="addItem(String(f.id))">➕ MP</button>
              <button class="btnSm pri" type="button" @click="saveItems(String(f.id), f)" :disabled="busy.saveItems">
                {{ busy.saveItems ? "Enregistrement..." : "Enregistrer" }}
              </button>
            </div>
          </div>

          <div class="compBox">
            <div class="tableWrap">
              <table class="table">
                <colgroup>
                  <col class="cMp" />
                  <col class="cQty" />
                  <col class="cAct" />
                  <col class="cAct" />
                </colgroup>

                <thead>
                  <tr>
                    <th>MP</th>
                    <th class="r">kg/m³</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  <tr v-for="(it, idx) in getDraft(String(f.id))" :key="idx">
                    <td class="cellMp">
                      <select
                        class="inSel mpFont"
                        :value="it.mpId"
                        @change="onChangeMp(String(f.id), idx, String(($event.target as HTMLSelectElement).value))"
                      >
                        <option v-for="mp in mpSorted" :key="mp.id" :value="String(mp.id)">
                          {{ mp.categorie }} — {{ mp.label }}
                        </option>
                      </select>
                    </td>

                    <td class="r">
                      <input class="inNum" type="number" step="0.01" v-model.number="it.qty" />
                    </td>

                    <td class="r">
                      <button class="iBtn sm" type="button" title="Remplacer" @click="openReplace(String(f.id), idx)">
                        <ArrowsRightLeftIcon class="aic2 sm" />
                      </button>
                    </td>

                    <td class="r">
                      <button class="iBtn danger sm" type="button" title="Supprimer" @click="removeItem(String(f.id), idx)">
                        <TrashIcon class="aic2 sm" />
                      </button>
                    </td>
                  </tr>

                  <tr v-if="getDraft(String(f.id)).length === 0">
                    <td colspan="4" class="emptyRow">Aucune MP.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="note">
              ⚠️ Interdit : <b>2 MP CIMENT</b> et <b>2 fois la même MP</b>.
            </div>
          </div>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="emptyPanel">Aucune formule.</div>

      <!-- ✅ Pagination (EN BAS uniquement) -->
      <div v-if="filtered.length > 0 && totalPages > 1" class="pagination">
        <button class="pgBtn" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">◀</button>

        <button
          v-for="p in totalPages"
          :key="p"
          class="pgNum"
          type="button"
          :class="{ active: p === currentPage }"
          @click="goToPage(p)"
        >
          {{ p }}
        </button>

        <button class="pgBtn" type="button" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">▶</button>
      </div>
    </div>

    <!-- Create/Edit modal -->
    <FormuleModal
      :open="showFormModal"
      :mode="mode"
      :initial="formDraft"
      :busy="busy.create || busy.update"
      :error="modalError"
      @close="closeFormModal"
      @save="saveForm"
    />

    <!-- Toast -->
    <teleport to="body">
      <div v-if="toastOpen" class="toastOvl" @mousedown.self="closeToast" role="dialog" aria-modal="true">
        <div class="toastDlg">
          <div class="toastHead">
            <div class="toastTitle">Info</div>
            <button class="x2" type="button" @click="closeToast" aria-label="Fermer">
              <XMarkIcon class="xic2" />
            </button>
          </div>
          <div class="toastBody">
            <ExclamationTriangleIcon class="tIc" />
            <div class="tMsg">{{ toastMsg }}</div>
          </div>
          <div class="toastFoot">
            <button class="btnSm pri" type="button" @click="closeToast">OK</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Replace MP modal -->
    <teleport to="body">
      <div v-if="replaceOpen" class="ovl" @mousedown.self="closeReplace" role="dialog" aria-modal="true">
        <div class="dlg">
          <div class="hdr">
            <div class="hdr__t">
              <div class="ttl2">Remplacer MP</div>
              <div class="sub2">Catégorie : <b>{{ replaceCtx.category }}</b></div>
            </div>
            <button class="x2" type="button" @click="closeReplace" aria-label="Fermer">✕</button>
          </div>

          <div class="dlgBody">
            <label class="field">
              <span class="lab">Choisir une MP</span>
              <select v-model="selectedReplaceMpId" class="inSelBig">
                <option v-for="mp in replaceOptions" :key="mp.id" :value="String(mp.id)">
                  {{ mp.categorie }} — {{ mp.label }}
                </option>
              </select>
              <div class="hint">Seules les MP de la même catégorie sont proposées.</div>
            </label>
          </div>

          <div class="dlgFoot">
            <button class="btnSm" type="button" @click="closeReplace">Annuler</button>
            <button class="btnSm pri" type="button" @click="confirmReplace">Remplacer</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Delete confirm modal -->
    <teleport to="body">
      <div v-if="showDeleteModal" class="ovl" @mousedown.self="closeDeleteModal" role="dialog" aria-modal="true">
        <div class="dlg small">
          <div class="hdr">
            <div class="hdr__t">
              <div class="ttl2">Supprimer formule</div>
              <div class="sub2">Action irréversible</div>
            </div>
            <button class="x2" type="button" @click="closeDeleteModal" aria-label="Fermer">✕</button>
          </div>

          <div class="dangerBox">
            Supprimer : <b>{{ deleteLabel || "—" }}</b> ?
            <div class="muted2">La composition sera supprimée aussi.</div>
          </div>

          <div class="dlgFoot">
            <button class="btnSm" type="button" @click="closeDeleteModal" :disabled="busy.remove">Annuler</button>
            <button class="btnSm danger" type="button" @click="confirmDelete" :disabled="busy.remove">
              {{ busy.remove ? "Suppression..." : "Supprimer" }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page{ padding: 12px; display:flex; flex-direction:column; gap:10px; }

/* sticky subheader under HeaderDashboard */
.subhdr{
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248,250,252,0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 16px;
  padding: 10px;
}
.subhdrTop{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.subhdrBottom{ margin-top: 8px; }

.ttl{ font-size: 13px; font-weight: 950; color:#0f172a; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sep{ color: rgba(15,23,42,0.35); }
.muted{ color: rgba(15,23,42,0.55); font-weight:850; }
.n{ font-weight: 950; }
.pill{
  display:inline-flex; align-items:center; justify-content:center;
  min-width:22px; height:22px; padding:0 8px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  font-size:12px; font-weight:950;
}

.search{
  width:100%;
  height: 36px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  color:#0f172a;
  outline:none;
}
.search:focus{
  border-color: rgba(2,132,199,0.35);
  box-shadow: 0 0 0 4px rgba(2,132,199,0.10);
}

/* actions compact */
.actions{ display:flex; align-items:center; gap:8px; }
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

/* filters popover */
.filtersPop{
  position:absolute;
  right: 10px;
  top: calc(100% + 10px);
  width: min(560px, 94vw);
  background:#fff;
  border: 1px solid rgba(16,24,40,0.14);
  border-radius: 16px;
  padding: 10px;
  box-shadow: 0 18px 40px rgba(2,6,23,0.18);
}
.filtersHead{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(16,24,40,0.08);
}
.fttl{ display:flex; align-items:center; gap:8px; font-weight:950; font-size:12px; color:#0f172a; }
.fic{ width:18px; height:18px; }
.x{ width: 34px; height:34px; border-radius:12px; border:1px solid rgba(16,24,40,0.12); background: rgba(15,23,42,0.04); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.x:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.xic{ width:18px; height:18px; }

.filtersGrid{ padding-top: 10px; display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; }
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
  outline:none;
}
.in:focus{ border-color: rgba(2,132,199,0.35); box-shadow: 0 0 0 4px rgba(2,132,199,0.10); }
.span3{ grid-column: span 3; }

.range{ display:flex; align-items:center; gap:8px; flex-wrap:nowrap; }
.num{ width: 96px; }
.dash{ font-weight: 950; color: rgba(107,114,128,1); }

.filtersFoot{ display:flex; justify-content:flex-end; gap:8px; padding-top: 10px; }

/* alerts */
.alert{
  border:1px solid rgba(16,24,40,0.12);
  border-radius:14px;
  padding:10px 12px;
  background:#fff;
  color:#111827;
  font-size:13px;
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.alert.err{ border-color:#ef4444; background:#fff5f5; }
.aic{ width:18px; height:18px; margin-top: 1px; flex:0 0 auto; }

/* cards */
.cards{ display:flex; flex-direction:column; gap:8px; }
.card{ border:1px solid rgba(16,24,40,0.12); border-radius: 16px; background:#fff; overflow:hidden; }

.rowHead{
  width:100%;
  border:0;
  background:#fff;
  cursor:pointer;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  text-align:left;
}
.rowHead:hover{ background: rgba(15,23,42,0.03); }

.left{ display:flex; align-items:flex-start; gap:10px; min-width:0; flex:1 1 auto; overflow:hidden; }
.chev{ width:18px; display:inline-flex; align-items:center; justify-content:center; color: rgba(107,114,128,1); flex:0 0 auto; margin-top: 2px; }
.chIc{ width:18px; height:18px; }

.main{ min-width:0; flex:1 1 auto; overflow:hidden; }
.line1{ display:flex; align-items:center; gap:8px; min-width:0; }
.name{ font-weight:950; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.chip{
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-weight: 900;
  flex:0 0 auto;
}
.line2{ margin-top: 2px; display:flex; align-items:center; gap:8px; min-width:0; }
.sub{ font-size:11px; color: rgba(107,114,128,1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dot2{ opacity: 0.55; }

.right{ display:flex; align-items:center; gap:10px; flex:0 0 auto; }
.kpis{ display:flex; gap:8px; align-items:center; }
.kpi{
  display:inline-flex;
  align-items:baseline;
  gap:6px;
  padding: 6px 10px;
  border: 1px solid rgba(16,24,40,0.12);
  border-radius: 999px;
  background: rgba(15,23,42,0.03);
}
.kLbl{ font-size: 10.5px; font-weight: 950; color: rgba(107,114,128,1); }
.kVal{ font-size: 12.5px; font-weight: 950; color: rgba(15,23,42,1); }
.kVal.ciment{
  color: rgba(180,83,9,1);
  background: rgba(245,158,11,0.14);
  border-radius: 999px;
  padding: 1px 8px;
}
.kUnit{ font-size:10.5px; font-weight:950; color: rgba(107,114,128,1); }
.acts{ display:flex; gap:6px; align-items:center; }

.iBtn{
  width:34px; height:34px;
  border-radius:12px;
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer;
}
.iBtn:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.iBtn.danger{ border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); color: rgba(185,28,28,1); }
.iBtn.sm{ width:28px; height:28px; border-radius:10px; }
.aic2{ width:18px; height:18px; }
.aic2.sm{ width:15px; height:15px; }

/* tooltip comment */
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
  max-width: 360px;
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
.tipWrap:hover .tip{ opacity:1; transform: translateY(-50%) translateX(0px); }

/* body */
.body{ border-top: 1px solid rgba(16,24,40,0.10); padding: 10px 12px 12px; }
.banner{
  font-size:11.5px;
  border:1px solid rgba(16,24,40,0.12);
  border-radius:12px;
  padding: 7px 10px;
  margin-bottom: 8px;
}
.banner.warn{ border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.10); }
.miniTag{
  display:inline-flex;
  padding: 2px 8px;
  border-radius:999px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  font-size: 11px;
  margin-left: 6px;
}

/* volume row */
.volRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.10);
  margin-bottom: 10px;
}
.volRow.ok{ background: rgba(236,253,245,0.75); border-color: rgba(0,122,51,0.28); color: rgba(6,95,70,1); }
.volRow.low{ background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.28); color: rgba(127,29,29,0.95); }
.volMsg{ font-size: 12px; font-weight: 950; }
.volBtns{ display:inline-flex; gap:8px; align-items:center; flex-wrap:nowrap; }

/* compact buttons */
.btnSm{
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  padding: 0 10px;
  font-weight: 950;
  font-size: 11.5px;
  cursor:pointer;
  white-space:nowrap;
}
.btnSm:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.btnSm.pri{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.65); color:#fff; }
.btnSm.pri:hover{ background: rgba(24,64,112,1); }
.btnSm.danger{ background:#ef4444; border-color:#ef4444; color:#fff; }
.btnSm.danger:hover{ filter: brightness(0.95); }

/* comp box */
.compBox{
  border-radius: 16px;
  border: 1px solid rgba(24,64,112,0.14);
  background: linear-gradient(180deg, rgba(239,246,255,0.55) 0%, rgba(255,255,255,0.92) 45%);
  padding: 8px;
}
.tableWrap{ overflow: hidden; } /* ✅ no horizontal scroll */
.table{
  width:100%;
  border-collapse: collapse;
  table-layout: fixed; /* ✅ */
  font-size: 11.5px;
}
.table th, .table td{
  border-bottom: 1px solid rgba(16,24,40,0.10);
  padding: 5px 6px;
  vertical-align: middle;
}
.table th{
  background: rgba(24,64,112,0.05);
  color: rgba(55,65,81,1);
  font-size: 10.8px;
  font-weight: 950;
}
.r{ text-align:right; }

/* col widths sum <= 100% */
.cMp{ width: 70%; }
.cQty{ width: 18%; }
.cAct{ width: 6%; }

.inSel{
  width: 100%;
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 850;
  color:#0f172a;
  outline:none;
}
.inSel:focus{ border-color: rgba(2,132,199,0.35); box-shadow: 0 0 0 3px rgba(2,132,199,0.10); }

.inNum{
  width: 100%;
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(2,132,199,0.18);
  background: rgba(2,132,199,0.06); /* important input */
  padding: 0 8px;
  font-size: 11.5px;
  font-weight: 950;
  font-variant-numeric: tabular-nums;
  color:#0f172a;
  outline:none;
  text-align:right;
}
.inNum:focus{ border-color: rgba(2,132,199,0.35); box-shadow: 0 0 0 3px rgba(2,132,199,0.10); }

.mpFont{ letter-spacing: -0.1px; }
.emptyRow{ color: rgba(107,114,128,1); padding: 10px; text-align:center; }

.note{
  margin-top: 8px;
  background: rgba(15,23,42,0.03);
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 11.5px;
  color: rgba(107,114,128,1);
}

.emptyPanel{
  border: 1px dashed rgba(16,24,40,0.18);
  background: rgba(15,23,42,0.03);
  border-radius: 14px;
  padding: 12px;
  color: rgba(107,114,128,1);
  font-size: 12px;
}

/* overlays / dialogs minimal */
.ovl{
  position: fixed;
  inset: 0;
  background: rgba(2,6,23,0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
  z-index: 100000;
}
.dlg{
  width: min(820px, 96vw);
  background: #fff;
  border: 1px solid rgba(16,24,40,0.14);
  border-radius: 18px;
  overflow:hidden;
  box-shadow: 0 26px 80px rgba(15,23,42,0.35);
}
.dlg.small{ width: min(560px, 96vw); }
.hdr{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding: 12px 14px 10px; border-bottom: 1px solid rgba(16,24,40,0.10); }
.ttl2{ font-size: 14px; font-weight: 950; color:#0f172a; }
.sub2{ font-size: 11px; font-weight: 800; color: rgba(15,23,42,0.55); margin-top: 2px; }
.x2{
  width: 34px; height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
}
.x2:hover{ background: rgba(2,132,199,0.08); border-color: rgba(2,132,199,0.18); }
.xic2{ width:18px; height:18px; }

.dlgBody{ padding: 12px 14px 6px; }
.field{ display:flex; flex-direction:column; gap:6px; min-width:0; }
.lab{ font-size: 11px; font-weight: 950; color: rgba(15,23,42,0.70); }
.inSelBig{
  height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  color:#0f172a;
  outline:none;
}
.inSelBig:focus{ border-color: rgba(2,132,199,0.35); box-shadow: 0 0 0 4px rgba(2,132,199,0.10); }
.hint{ font-size: 10px; font-weight: 850; color: rgba(15,23,42,0.55); }

.dlgFoot{
  padding: 10px 14px 14px;
  display:flex;
  justify-content:flex-end;
  gap:10px;
  border-top: 1px solid rgba(16,24,40,0.10);
  background: rgba(15,23,42,0.02);
}
.dangerBox{
  margin: 10px 14px 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(127, 29, 29, 0.95);
  font-weight: 850;
  font-size: 12px;
}
.muted2{ margin-top: 6px; color: rgba(107,114,128,1); font-weight: 800; }

/* toast */
.toastOvl{
  position: fixed;
  inset: 0;
  background: rgba(2,6,23,0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
  z-index: 100000;
}
.toastDlg{
  width: min(520px, 96vw);
  background:#fff;
  border: 1px solid rgba(16,24,40,0.14);
  border-radius: 18px;
  overflow:hidden;
  box-shadow: 0 26px 80px rgba(15,23,42,0.35);
}
.toastHead{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 12px 14px; border-bottom: 1px solid rgba(16,24,40,0.10); }
.toastTitle{ font-size: 13px; font-weight: 950; color:#0f172a; }
.toastBody{ padding: 12px 14px; display:flex; gap:10px; align-items:flex-start; }
.tIc{ width:18px; height:18px; flex:0 0 auto; margin-top: 2px; color:#ef4444; }
.tMsg{ font-size: 12px; font-weight: 900; color: rgba(127,29,29,0.95); white-space: pre-line; }
.toastFoot{ padding: 12px 14px 14px; display:flex; justify-content:flex-end; border-top: 1px solid rgba(16,24,40,0.10); background: rgba(15,23,42,0.02); }

/* ✅ pagination */
.pagination{
  margin-top: 12px;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:6px;
  flex-wrap:wrap;
}
.pgBtn,
.pgNum{
  min-width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(16,24,40,0.12);
  background:#fff;
  font-size: 12px;
  font-weight: 900;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
}
.pgBtn:hover,
.pgNum:hover{
  background: rgba(2,132,199,0.08);
  border-color: rgba(2,132,199,0.18);
}
.pgNum.active{
  background: rgba(24,64,112,0.92);
  color:#fff;
  border-color: rgba(24,64,112,0.65);
}
.pgBtn:disabled{
  opacity: 0.4;
  cursor: default;
}

@media (max-width: 980px){
  .filtersGrid{ grid-template-columns: 1fr; }
  .span3{ grid-column:auto; }
  .kpis{ display:none; } /* compact mobile */
  .filtersPop{ right: 10px; left: 10px; width: auto; }
}
</style>
