<!-- ✅ src/pages/FormulesCataloguePage.vue (FICHIER COMPLET) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

import {
  PlusCircleIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  FunnelIcon,
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
   TOAST / POPUP (user errors)
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
   FILTERS
========================= */
const q = ref("");

const filtersOpen = ref(false);
function toggleFilters() {
  filtersOpen.value = !filtersOpen.value;
}

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
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
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

/* =========================
   ✅ CMP (live in row)
   - même logique que FormulesPage: Σ((kg/m³ ÷ 1000) × DH/t)
   - fallback sur row.items tant que le draft n’est pas initialisé
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

  // draft si déjà initialisé (après ouverture / édition)
  const draft = draftsById[id];
  if (Array.isArray(draft) && draft.length) return cmpFromItems(draft);

  // fallback sur les items “persistés” (catalogue)
  const raw = (row?.items ?? []) as Array<{ mpId: string; qty: number }>;
  const items: ItemDraft[] = raw.map((it) => ({
    mpId: String((it as any)?.mpId ?? ""),
    qty: Number((it as any)?.qty ?? 0),
  }));
  return cmpFromItems(items);
}

function fmtCmp(v: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNum(v));
}

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

/* ✅ NEW: forbid duplicate MP (same mpId) */
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

  // ✅ Interdit: même MP 2 fois
  if (nextMpId && countMp(d, nextMpId) > 1) {
    row.mpId = prevMpId;
    showToast("Interdit : une formule ne peut pas contenir 2 fois la même MP.");
    return;
  }

  // ✅ Interdit: 2 ciments
  if (countCiment(d) > 1) {
    row.mpId = prevMpId;
    showToast("Interdit : une formule ne peut pas contenir 2 MP de catégorie CIMENT.");
  }
}

/* =========================
   Composition Stats (volume verifier)
========================= */
function getRhoForMp(mp: any): number | null {
  const cat = normKey(mp?.categorie);
  if (cat === "ciment") return 3.1;

  if (
    cat === "granulats" ||
    cat === "granulat" ||
    cat === "granulas" ||
    cat === "granula" ||
    cat.includes("granul")
  )
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
      missing.push({
        mpId: String(it.mpId),
        label: `${mp?.categorie ?? "—"} — ${mp?.label ?? "—"}`,
      });
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
  if (s.isLow) {
    return `⚠️ Volume ${liters(s.vTotal)} L < cible ${s.target} L (déficit ${liters(s.deficitPct)}%).`;
  }
  return `✅ Volume OK (±3%) — ${liters(s.vTotal)} L.`;
}

/* =========================
   FILTERED LIST
========================= */
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();

  return (formules.value ?? []).filter((f) => {
    if (s) {
      const blob = `${f.label ?? ""} ${f.resistance ?? ""} ${f.city ?? ""} ${f.region ?? ""} ${
        f.comment ?? ""
      }`.toLowerCase();
      if (!blob.includes(s)) return false;
    }

    if (fRes.value && String(f?.resistance ?? "") !== fRes.value) return false;
    if (fCity.value && String(f?.city ?? "") !== fCity.value) return false;
    if (fRegion.value && String(f?.region ?? "") !== fRegion.value) return false;

    const cQty = cimentQtyFromRow(f);
    if (fCimentMin.value != null && cQty < fCimentMin.value) return false;
    if (fCimentMax.value != null && cQty > fCimentMax.value) return false;

    return true;
  });
});

/* =========================
   CRUD MODAL (create/edit)
========================= */
const showFormModal = ref(false);
const mode = ref<"create" | "edit">("create");
const activeEditId = ref<string | null>(null);

const modalError = ref<string | null>(null);
const formDraft = ref<FormuleDraft>({
  label: "",
  resistance: "",
  city: "",
  region: "",
  comment: "",
});

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
   DELETE
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
const replaceCtx = reactive<{
  formuleId: string;
  idx: number;
  oldMpId: string;
  category: string;
}>({ formuleId: "", idx: -1, oldMpId: "", category: "" });

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

  // ✅ used mpIds (forbid duplicates)
  const used = new Set<string>();
  for (const it of d) {
    const id = String(it?.mpId ?? "").trim();
    if (id) used.add(id);
  }

  // ✅ pick first available mp not already used, and respecting ciment constraint
  const pick = (mpSorted.value ?? []).find((mp: any) => {
    const id = String(mp?.id ?? "");
    if (!id) return false;
    if (used.has(id)) return false; // forbid duplicates
    if (catRank(mp?.categorie) === 0 && countCiment(d) >= 1) return false; // keep ciment rule
    return true;
  });

  if (!pick?.id) {
    showToast("Impossible d’ajouter : aucune MP disponible (déjà utilisées ou contrainte CIMENT).");
    return;
  }

  // ✅ add at top
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

    // ⚠️ this fails for you with "Cannot PUT /formules-catalogue/:id/items"
    await store.updateFormuleCatalogueItems(String(formuleId), cleaned);

    patchEverywhereAfterFormuleUpdate(String(formuleId), cleaned);
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    // ✅ clearer diagnosis for this specific backend/proxy issue
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

onMounted(async () => {
  await reload();
});
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="head">
      <div class="hTitle">
        Catalogue formules <span class="sep">•</span>
        <span class="hRes">Résultats : <b>{{ filtered.length }}</b></span>
      </div>

      <div class="hSearch">
        <input class="hInput" v-model="q" placeholder="Rechercher (label, résistance, ville…)" />
      </div>

      <!-- filter toggle next to search -->
      <button
        class="btn ghost"
        type="button"
        @click="toggleFilters"
        :title="filtersOpen ? 'Masquer filtres' : 'Afficher filtres'"
      >
        <FunnelIcon class="btnic" />
        <span class="hideSm">Filtres</span>
      </button>

      <div class="hRight">
        <button class="btn ghost" @click="reload" :disabled="busy.reload || loading" title="Recharger">
          <ArrowPathIcon class="btnic" />
        </button>
        <button class="btn primary" @click="openCreate" :disabled="busy.create || busy.update">
          <PlusCircleIcon class="btnic" />
          <span>Nouvelle</span>
        </button>
      </div>
    </div>

    <!-- Filters: ✅ one single line, Min/Max side by side -->
    <div v-if="filtersOpen" class="filters">
      <div class="f">
        <div class="fl">Résistance</div>
        <select class="fin" v-model="fRes">
          <option value="">Toutes</option>
          <option v-for="r in resistanceOptions" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>

      <div class="f">
        <div class="fl">Ville</div>
        <select class="fin" v-model="fCity">
          <option value="">Toutes</option>
          <option v-for="c in cityOptions" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <div class="f">
        <div class="fl">Région</div>
        <select class="fin" v-model="fRegion">
          <option value="">Toutes</option>
          <option v-for="r in regionOptions" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>

      <div class="f fC">
        <div class="fl">Dosage ciment (kg/m³)</div>
        <div class="range">
          <input class="fin rIn" type="number" min="0" step="1" v-model.number="fCimentMin" placeholder="Min" />
          <span class="dash">—</span>
          <input class="fin rIn" type="number" min="0" step="1" v-model.number="fCimentMax" placeholder="Max" />
          <button class="btnSm" type="button" @click="(fCimentMin = null), (fCimentMax = null)">Reset</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="alert error">
      <ExclamationTriangleIcon class="aic" />
      <div><b>Erreur :</b> {{ error }}</div>
    </div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- cards -->
    <div class="cards">
      <div v-for="f in filtered" :key="f.id" class="card">
        <button class="rowHead" type="button" @click="toggle(String(f.id)); ensureDraft(f)">
          <div class="left">
            <span class="chev">
              <ChevronDownIcon v-if="isOpen(String(f.id))" class="chIc" />
              <ChevronRightIcon v-else class="chIc" />
            </span>

            <span class="name">{{ f.label || "—" }}</span>
            <span class="chip">{{ f.resistance || "—" }}</span>
            <span class="dot">•</span>
            <span class="sub">{{ f.city || "—" }}</span>
            <span class="dot">•</span>
            <span class="sub">{{ f.region || "—" }}</span>
          </div>

          <div class="right">
            <div class="miniKpi" v-if="((draftsById as any)[String(f.id)]?.length ?? 0) || ((f as any)?.items?.length ?? 0)">
              <span class="kLbl">Ciment</span>
              <span class="kVal ciment">{{ n(((draftsById as any)[String(f.id)]?.length ?? 0) ? cimentQty(getDraft(String(f.id))) : cimentQtyFromRow(f), 0) }}</span>
              <span class="kUnit">kg/m³</span>
            </div>

            <div class="miniKpi" v-if="((draftsById as any)[String(f.id)]?.length ?? 0) || ((f as any)?.items?.length ?? 0)">
              <span class="kLbl">CMP</span>
              <span class="kVal">{{ fmtCmp(getCmpRow(f)) }}</span>
              <span class="kUnit">DH/m³</span>
            </div>

            <div class="actions" @click.stop>
              <button class="iconBtn" title="Modifier" @click="openEdit(f)">
                <PencilSquareIcon class="actIc" />
              </button>
              <button class="iconBtn danger" title="Supprimer" @click="askDelete(f)">
                <TrashIcon class="actIc" />
              </button>
            </div>
          </div>
        </button>

        <div v-if="isOpen(String(f.id))" class="body">
          <!-- Missing rho banner (kept) -->
          <div v-if="compositionStatsFor(String(f.id)).missing.length" class="banner warn">
            MP sans ρ :
            <span v-for="m in compositionStatsFor(String(f.id)).missing" :key="m.mpId" class="miniTag">
              {{ m.label }}
            </span>
          </div>

          <!-- ✅ ONLY ONE LINE (banner message + buttons on the right) -->
          <div
            class="volRow"
            :class="{ low: compositionStatsFor(String(f.id)).isLow, ok: compositionStatsFor(String(f.id)).isOk }"
          >
            <div class="volMsg">
              {{ volumeLine(String(f.id)) }}
            </div>

            <div class="volBtns">
              <button class="btnSm" type="button" @click="addItem(String(f.id))">➕ MP</button>
              <button class="btnSm primary" type="button" @click="saveItems(String(f.id), f)" :disabled="busy.saveItems">
                {{ busy.saveItems ? "Enregistrement..." : "Enregistrer composition" }}
              </button>
            </div>
          </div>

          <!-- composition box -->
          <div class="compBox">
            <div class="tableWrap">
              <table class="table compTable">
                <colgroup>
                  <col />
                  <col style="width: 120px" />
                  <col style="width: 34px" />
                  <col style="width: 34px" />
                </colgroup>

                <thead>
                  <tr>
                    <th>MP ({{ f.label || "—" }})</th>
                    <th class="r">kg/m³</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  <tr v-for="(it, idx) in getDraft(String(f.id))" :key="idx">
                    <td class="cellMp">
                      <select
                        class="in mpSel mpFont"
                        :value="it.mpId"
                        @change="onChangeMp(String(f.id), idx, String(($event.target as HTMLSelectElement).value))"
                      >
                        <option v-for="mp in mpSorted" :key="mp.id" :value="String(mp.id)">
                          {{ mp.categorie }} — {{ mp.label }}
                        </option>
                      </select>
                    </td>

                    <td class="cellQty r">
                      <input class="in qty r" type="number" step="0.01" v-model.number="it.qty" />
                    </td>

                    <td class="cellAct r">
                      <button class="iconBtn sm" type="button" title="Remplacer MP" @click="openReplace(String(f.id), idx)">
                        <ArrowsRightLeftIcon class="actIc sm" />
                      </button>
                    </td>

                    <td class="cellAct r">
                      <button class="iconBtn danger sm" type="button" title="Supprimer" @click="removeItem(String(f.id), idx)">
                        <TrashIcon class="actIc sm" />
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
              ⚠️ Interdit : <b>2 MP de catégorie CIMENT</b> et <b>2 fois la même MP</b> dans une même formule.
            </div>
          </div>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="panelEmpty">Aucune formule.</div>
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

    <!-- Toast popup -->
    <teleport to="body">
      <div v-if="toastOpen" class="toastOvl" @mousedown.self="closeToast" role="dialog" aria-modal="true">
        <div class="toastDlg">
          <div class="toastHead">
            <div class="toastTitle">Erreur</div>
            <button class="x" type="button" @click="closeToast" aria-label="Fermer">
              <XMarkIcon class="xIc" />
            </button>
          </div>
          <div class="toastBody">
            <ExclamationTriangleIcon class="tIc" />
            <div class="tMsg">{{ toastMsg }}</div>
          </div>
          <div class="toastFoot">
            <button class="btnSm primary" type="button" @click="closeToast">OK</button>
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
              <div class="ttl">Remplacer MP</div>
              <div class="sub">Catégorie: <b>{{ replaceCtx.category }}</b></div>
            </div>
            <button class="x" type="button" @click="closeReplace" aria-label="Fermer">✕</button>
          </div>

          <div class="grid">
            <label class="field span2">
              <span class="lab">Choisir une MP</span>
              <select v-model="selectedReplaceMpId" class="inSel">
                <option v-for="mp in replaceOptions" :key="mp.id" :value="String(mp.id)">
                  {{ mp.categorie }} — {{ mp.label }}
                </option>
              </select>
              <div class="hint">Seules les MP de la même catégorie sont proposées.</div>
            </label>
          </div>

          <div class="ftr">
            <button class="btn ghost" type="button" @click="closeReplace">Annuler</button>
            <button class="btn primary" type="button" @click="confirmReplace">Remplacer</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Delete confirm modal -->
    <teleport to="body">
      <div v-if="showDeleteModal" class="ovl" @mousedown.self="closeDeleteModal" role="dialog" aria-modal="true">
        <div class="dlg" style="width: min(560px, 96vw);">
          <div class="hdr">
            <div class="hdr__t">
              <div class="ttl">Supprimer formule</div>
              <div class="sub">Action irréversible</div>
            </div>
            <button class="x" type="button" @click="closeDeleteModal" aria-label="Fermer">✕</button>
          </div>

          <div class="delBox">
            Tu es sûr de vouloir supprimer : <b>{{ deleteLabel || "—" }}</b> ?
            <div class="muted" style="margin-top: 6px;">
              La composition sera supprimée aussi. Si la formule est utilisée dans une variante, la suppression sera refusée.
            </div>
          </div>

          <div class="ftr">
            <button class="btn ghost" type="button" @click="closeDeleteModal" :disabled="busy.remove">Annuler</button>
            <button class="btn primary" type="button" @click="confirmDelete" :disabled="busy.remove">
              {{ busy.remove ? "Suppression..." : "Supprimer" }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

/* header */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 55%);
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  padding: 8px 10px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}
.hTitle {
  font-size: 13px;
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
}
.sep {
  margin: 0 6px;
  color: rgba(15, 23, 42, 0.35);
}
.hRes {
  color: rgba(15, 23, 42, 0.75);
}
.hSearch {
  flex: 1 1 520px;
  min-width: 220px;
}
.hInput {
  width: 100%;
  height: 34px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.95);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  outline: none;
}
.hInput:focus {
  border-color: rgba(32, 184, 232, 0.35);
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.12);
}
.hRight {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.hideSm {
  display: inline;
}
@media (max-width: 980px) {
  .hideSm {
    display: none;
  }
}

/* filters: ✅ one line */
.filters {
  display: grid;
  grid-template-columns: 170px 170px 170px 1fr;
  gap: 10px;
  align-items: end;
  padding: 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.85);
}
.f {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.fl {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.7);
}
.fin {
  height: 34px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.96);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 1);
  outline: none;
  min-width: 0;
}
.fin:focus {
  border-color: rgba(32, 184, 232, 0.35);
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.12);
}
.fC {
  min-width: 0;
}
.range {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap; /* ✅ never stack Min/Max */
}
.rIn {
  width: 82px; /* ✅ reduced width */
}
.dash {
  color: rgba(107, 114, 128, 1);
  font-weight: 900;
}

/* alert */
.alert {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 14px;
  padding: 10px 12px;
  background: #fff;
  color: #111827;
  font-size: 13px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.alert.error {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
}
.aic {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  flex: 0 0 auto;
}

/* buttons */
.btn {
  height: 34px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  border-radius: 14px;
  padding: 0 12px;
  font-weight: 950;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.18);
}
.btn.primary {
  background: rgba(24, 64, 112, 0.92);
  border-color: rgba(24, 64, 112, 0.6);
  color: #fff;
}
.btn.primary:hover {
  background: rgba(24, 64, 112, 1);
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.75);
  padding: 0 10px;
}
.btnic {
  width: 16px;
  height: 16px;
}

.btnSm {
  height: 30px; /* ✅ tighter */
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  border-radius: 12px;
  padding: 0 10px;
  font-weight: 950;
  font-size: 11.5px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.btnSm:hover {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.18);
}
.btnSm.primary {
  background: rgba(24, 64, 112, 0.92);
  border-color: rgba(24, 64, 112, 0.6);
  color: #fff;
}
.btnSm.primary:hover {
  background: rgba(24, 64, 112, 1);
}

.iconBtn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.iconBtn:hover {
  background: rgba(32, 184, 232, 0.08);
  border-color: rgba(32, 184, 232, 0.18);
}
.iconBtn.danger {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
}
.iconBtn.sm {
  width: 28px; /* ✅ smaller */
  height: 28px;
  border-radius: 10px;
}
.actIc {
  width: 18px;
  height: 18px;
  color: rgba(15, 23, 42, 0.85);
}
.actIc.sm {
  width: 15px;
  height: 15px;
}

/* cards */
.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
}

/* row header */
.rowHead {
  width: 100%;
  border: 0;
  background: #fff;
  cursor: pointer;
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
  text-align: left;
}
.rowHead:hover {
  background: rgba(15, 23, 42, 0.03);
}
.left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.chev {
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: rgba(107, 114, 128, 1);
}
.chIc {
  width: 18px;
  height: 18px;
}
.name {
  font-weight: 950;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 520px;
}
.chip {
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  color: rgba(55, 65, 81, 1);
  font-weight: 900;
  flex: 0 0 auto;
}
.dot {
  opacity: 0.5;
  flex: 0 0 auto;
}
.sub {
  font-size: 11px;
  color: rgba(107, 114, 128, 1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

/* right */
.right {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
}
.actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.miniKpi {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.03);
}
.kLbl {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(107, 114, 128, 1);
}
.kVal {
  font-size: 12.5px;
  font-weight: 950;
  color: rgba(15, 23, 42, 1);
}
.kVal.ciment {
  color: rgba(180, 83, 9, 1);
  background: rgba(245, 158, 11, 0.14);
  border-radius: 999px;
  padding: 1px 8px;
}
.kUnit {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(107, 114, 128, 1);
}

/* body */
.body {
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  padding: 10px 12px 12px;
}

/* compact banners */
.banner {
  font-size: 11.5px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 12px;
  padding: 7px 10px;
  margin-bottom: 8px;
}
.banner.warn {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.1);
}
.miniTag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  font-size: 11px;
  margin-left: 6px;
}

/* ✅ volume row + buttons aligned right */
.volRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  margin-bottom: 10px;
}
.volRow.ok {
  background: rgba(236, 253, 245, 0.75);
  border-color: rgba(0, 122, 51, 0.28);
  color: rgba(6, 95, 70, 1);
}
.volRow.low {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
  color: rgba(127, 29, 29, 0.95);
}
.volMsg {
  font-size: 12px;
  font-weight: 950;
}
.volBtns {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
}

/* composition box */
.compBox {
  border-radius: 16px;
  border: 1px solid rgba(24, 64, 112, 0.14);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.55) 0%, rgba(255, 255, 255, 0.92) 45%);
  padding: 8px; /* ✅ tighter */
}

/* table: ✅ very compact */
.tableWrap {
  overflow-x: hidden;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px; /* ✅ smaller */
  table-layout: fixed;
}
.table th,
.table td {
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
  padding: 5px 6px; /* ✅ smaller vertical padding */
  vertical-align: middle;
}
.table th {
  background: rgba(24, 64, 112, 0.05);
  color: rgba(55, 65, 81, 1);
  font-size: 10.8px;
  font-weight: 950;
}
.r {
  text-align: right;
}
.in {
  width: 100%;
  height: 28px; /* ✅ smaller input height */
  border-radius: 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.96);
  padding: 0 8px; /* ✅ smaller */
  font-size: 11.5px;
  font-weight: 850;
  color: rgba(15, 23, 42, 1);
  outline: none;
}
.in:focus {
  border-color: rgba(32, 184, 232, 0.35);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.12);
}
.mpSel {
  min-width: 0;
}
.qty {
  font-variant-numeric: tabular-nums;
  font-weight: 950;
}
.cellAct {
  width: 34px;
}
.emptyRow {
  color: rgba(107, 114, 128, 1);
  padding: 10px;
}

/* smaller MP font in composition */
.mpFont {
  font-size: 10.8px;
  font-weight: 800;
  letter-spacing: -0.1px;
}

/* note */
.note {
  margin-top: 8px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 11.5px;
  color: rgba(107, 114, 128, 1);
}

/* empty */
.panelEmpty {
  border: 1px dashed rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.03);
  border-radius: 14px;
  padding: 12px;
  color: rgba(107, 114, 128, 1);
  font-size: 12px;
}

/* overlays + toast (unchanged family) */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 99999;
}
.dlg {
  width: min(820px, 96vw);
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 40%);
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}
.hdr {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
}
.ttl {
  font-size: 14px;
  font-weight: 950;
  color: #0f172a;
}
.sub {
  font-size: 11px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
  margin-top: 2px;
}
.x {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.x:hover {
  background: rgba(32, 184, 232, 0.12);
  border-color: rgba(32, 184, 232, 0.18);
}
.grid {
  padding: 12px 14px 6px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.lab {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.7);
}
.inSel {
  height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.96);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
  color: #0f172a;
  outline: none;
}
.inSel:focus {
  border-color: rgba(32, 184, 232, 0.35);
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.12);
}
.span2 {
  grid-column: span 2;
}
.ftr {
  padding: 10px 14px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(255, 255, 255, 0.72);
}
.delBox {
  margin: 10px 14px 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(127, 29, 29, 0.95);
  font-weight: 850;
  font-size: 12px;
}
.muted {
  color: rgba(107, 114, 128, 1);
  font-weight: 800;
}

/* toast */
.toastOvl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 100000;
}
.toastDlg {
  width: min(520px, 96vw);
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 40%);
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}
.toastHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
}
.toastTitle {
  font-size: 13px;
  font-weight: 950;
  color: #0f172a;
}
.xIc {
  width: 18px;
  height: 18px;
  color: rgba(15, 23, 42, 0.8);
}
.toastBody {
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.tIc {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin-top: 2px;
  color: rgba(239, 68, 68, 1);
}
.tMsg {
  font-size: 12px;
  font-weight: 900;
  color: rgba(127, 29, 29, 0.95);
}
.toastFoot {
  padding: 12px 14px 14px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(255, 255, 255, 0.72);
}

/* responsive */
@media (max-width: 980px) {
  .sub {
    display: none;
  }
  .name {
    max-width: 280px;
  }
  .miniKpi {
    display: none;
  }
  /* filters collapse on mobile */
  .filters {
    grid-template-columns: 1fr;
  }
  .range {
    justify-content: space-between;
  }
}
</style>
