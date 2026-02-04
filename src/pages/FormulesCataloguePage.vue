<!-- ✅ src/pages/FormulesCataloguePage.vue (FICHIER COMPLET) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

import {
  PlusCircleIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  TrashIcon,
  InformationCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
    const blob = `${f.label ?? ""} ${f.resistance ?? ""} ${f.city ?? ""} ${f.region ?? ""} ${f.comment ?? ""}`.toLowerCase();
    return blob.includes(s);
  });
});

/* =========================
   PAGINATION (LEFT LIST)
========================= */
const PAGE_SIZE = 10;
const page = ref(1);

const total = computed(() => filtered.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const pageRows = computed(() => {
  const p = Math.min(Math.max(1, page.value), totalPages.value);
  const start = (p - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

const leftTopRef = ref<HTMLElement | null>(null);
function scrollLeftTop() {
  leftTopRef.value?.scrollIntoView({ block: "start", behavior: "smooth" });
}
function goToPage(p: number) {
  page.value = Math.min(Math.max(1, p), totalPages.value);
  nextTick(() => scrollLeftTop());
}
watch(q, () => (page.value = 1));

/* =========================
   MODAL (create/edit) -> component
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

/* =========================
   DELETE CONFIRM MODAL (kept simple)
========================= */
const showDeleteModal = ref(false);
const deleteId = ref<string | null>(null);
const deleteLabel = ref<string>("");

function askDelete(row: any) {
  deleteId.value = String(row.id);
  deleteLabel.value = String(row.label ?? "");
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

    if (selectedId.value === deleteId.value) {
      selectedId.value = null;
      itemsDraft.value = [];
    }
    closeDeleteModal();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.remove = false;
  }
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

/* =========================
   MP SORT (Ciment -> Granulats/Sable -> Adjuvant -> others)
========================= */
function normKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function catRank(cat: string) {
  const c = normKey(cat);
  if (c.includes("ciment")) return 0;
  if (c.includes("granul") || c.includes("granula") || c.includes("granulas") || c.includes("sable")) return 1;
  if (c.includes("adjuvant")) return 2;
  return 3;
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

/* =========================
   Σ Qty -> Volume total (L)
========================= */
function getRhoForMp(mp: any): number | null {
  const cat = normKey(mp?.categorie);
  if (cat === "ciment") return 3.1;

  if (cat === "granulats" || cat === "granulat" || cat === "granulas" || cat === "granula" || cat.includes("granul"))
    return 2.65;

  if (cat === "adjuvant") return 1.1;
  return null;
}
function liters(v: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v);
}

const compositionStats = computed(() => {
  const cleaned = normalizeItems(itemsDraft.value);

  const mpById = new Map<string, any>();
  for (const mp of mpOptions.value ?? []) mpById.set(String(mp.id), mp);

  let mCiment = 0;
  let vTotal = 0;
  const missing: Array<{ mpId: string; label: string }> = [];

  for (const it of cleaned) {
    const mp = mpById.get(String(it.mpId));
    const rho = getRhoForMp(mp);

    if (!rho) {
      missing.push({ mpId: String(it.mpId), label: `${mp?.categorie ?? "—"} — ${mp?.label ?? "—"}` });
      continue;
    }

    const m = Number(it.qty ?? 0);
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
  const statusLabel = isLow ? `⚠️ -${liters(deficitPct)}%` : `✅ OK`;

  return {
    vTotal,
    target,
    deficitPct,
    isLow,
    statusLabel,
    missing,
  };
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
      showFormModal.value = false;
      page.value = 1;
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
      const row = store.formulesCatalogue.find((x: any) => String(x.id) === String(id));
      if (row) selectRow(row);
      showFormModal.value = false;
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.create = false;
    busy.update = false;
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

onMounted(reload);
</script>

<template>
  <div class="page">
    <!-- SLIM HEADER -->
    <div class="head">
      <div class="hTitle">
        Catalogue formules <span class="sep">•</span>
        <span class="hRes">Résultats : <b>{{ total }}</b></span>
      </div>

      <div class="hSearch">
        <input class="hInput" v-model="q" placeholder="Rechercher (label, résistance, ville…)" />
      </div>

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

    <div v-if="error" class="alert error"><b>Erreur :</b> {{ error }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- SPLIT VIEW -->
    <div class="gridFixed">
      <!-- LEFT -->
      <div class="card pane">
        <div class="cardHead" ref="leftTopRef">
          <div class="h">Formules</div>
        </div>

        <div class="paneBody">
          <div class="list">
            <button
              v-for="f in pageRows"
              :key="f.id"
              class="row"
              :class="{ active: selectedId === String(f.id) }"
              @click="selectRow(f)"
            >
              <div class="rowMain">
                <div class="l1">
                  <b class="lab ell">{{ f.label }}</b>

                  <span v-if="f.comment && String(f.comment).trim()" class="cmtWrap" @click.stop>
                    <button class="cmtBtn" type="button" title="Commentaire" aria-label="Commentaire">
                      <InformationCircleIcon class="cmtIc" />
                    </button>
                    <span class="cmtTip" role="tooltip">{{ f.comment }}</span>
                  </span>

                  <span class="tag">{{ f.resistance || "—" }}</span>
                </div>

                <div class="l2">
                  <span class="muted ell">{{ f.city || "—" }}</span>
                  <span class="dot">•</span>
                  <span class="muted ell">{{ f.region || "—" }}</span>
                </div>
              </div>

              <div class="rowActions" @click.stop>
                <button class="iconBtn" title="Modifier" @click="openEdit(f)" aria-label="Modifier">
                  <PencilSquareIcon class="actIc" />
                </button>
                <button class="iconBtn danger" title="Supprimer" @click="askDelete(f)" aria-label="Supprimer">
                  <TrashIcon class="actIc" />
                </button>
              </div>
            </button>

            <div v-if="pageRows.length === 0" class="empty">Aucune formule.</div>
          </div>
        </div>

        <!-- pager -->
        <div class="pager">
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

      <!-- RIGHT -->
      <div class="card pane">
        <div class="cardHead">
          <div class="h">Composition</div>
          <div class="rowBtns">
            <button class="btn" @click="clearSelection" :disabled="!selected">Désélectionner</button>
            <button class="btn primary" @click="saveItems" :disabled="!selected || busy.saveItems">
              {{ busy.saveItems ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>

        <div v-if="!selected" class="empty big">Sélectionne une formule à gauche.</div>

        <template v-else>
          <!-- ✅ Sticky ultra compact (sans redondance) -->
          <div class="stickyTop">
            <div class="stickyLine">
              <div class="stickyLeft">
                <b class="ell">{{ selected.label }}</b>
                <span class="miniMuted">{{ selected.city || "—" }}</span>
                <span class="miniDot">•</span>
                <span class="miniMuted">{{ selected.region || "—" }}</span>
              </div>

              <div class="stickyRight">
                <span class="pill" :class="{ ok: !compositionStats.isLow }">
                  V <b>{{ liters(compositionStats.vTotal) }} L</b> — {{ compositionStats.statusLabel }}
                </span>
                <button class="btn" @click="addItem">➕ MP</button>
              </div>
            </div>

            <div v-if="compositionStats.isLow" class="banner error">
              ⚠️ Volume <b>{{ liters(compositionStats.vTotal) }} L</b> &lt; cible <b>{{ compositionStats.target }} L</b>
              (déficit <b>{{ liters(compositionStats.deficitPct) }}%</b>).
            </div>
            <div v-else class="banner ok">
              ✅ Volume OK (±3%) — <b>{{ liters(compositionStats.vTotal) }} L</b>.
            </div>

            <div v-if="compositionStats.missing.length" class="banner warn">
              MP sans ρ :
              <span v-for="m in compositionStats.missing" :key="m.mpId" class="miniTag">{{ m.label }}</span>
            </div>
          </div>

          <div class="paneBody">
            <!-- ✅ NO HORIZONTAL SCROLL -->
            <div class="tableWrap">
              <table class="table">
                <colgroup>
                  <col />
                  <col style="width: 160px" />
                  <col style="width: 44px" />
                </colgroup>

                <thead>
                  <tr>
                    <th>MP</th>
                    <th class="right">kg / m³</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  <tr v-for="(it, i) in itemsDraft" :key="i">
                    <td class="cellMp">
                      <select class="input mpSel" v-model="it.mpId">
                        <option v-for="mp in mpSorted" :key="mp.id" :value="String(mp.id)">
                          {{ mp.categorie }} — {{ mp.label }}
                        </option>
                      </select>
                    </td>

                    <td class="cellQty">
                      <input class="input qty right" type="number" step="0.01" v-model.number="it.qty" />
                    </td>

                    <td class="cellDel">
                      <button class="iconBtn danger sm" @click="removeItem(i)" title="Supprimer" aria-label="Supprimer">
                        <TrashIcon class="actIc smIc" />
                      </button>
                    </td>
                  </tr>

                  <tr v-if="itemsDraft.length === 0">
                    <td colspan="3" class="emptyRow">Aucune MP.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="note">L’enregistrement remplace toute la composition côté DB.</div>
          </div>
        </template>
      </div>
    </div>

    <!-- ✅ Form modal (component) -->
    <FormuleModal
      v-model:open="showFormModal"
      v-model="formDraft"
      :mode="mode"
      :saving="busy.create || busy.update"
      @save="saveForm"
    />

    <!-- ✅ delete confirm (z-index haut aussi) -->
    <div v-if="showDeleteModal" class="modal">
      <div class="modalCard" style="width:min(560px, 100%);">
        <div class="modalHead">
          <div class="mh">Supprimer formule</div>
          <button class="iconBtn" @click="closeDeleteModal" aria-label="Fermer">✕</button>
        </div>

        <div class="alert error" style="margin:0;">
          Tu es sûr de vouloir supprimer :
          <b>{{ deleteLabel || "—" }}</b> ?
          <div class="muted" style="margin-top:6px;">
            La composition sera supprimée aussi. Si la formule est utilisée dans une variante, la suppression sera refusée.
          </div>
        </div>

        <div class="modalActions">
          <button class="btn" @click="closeDeleteModal" :disabled="busy.remove">Annuler</button>
          <button class="btn primary" @click="confirmDelete" :disabled="busy.remove">
            {{ busy.remove ? "Suppression..." : "Supprimer" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 14px; display:flex; flex-direction:column; gap:12px; }

/* SLIM HEADER */
.head{
  display:flex;
  align-items:center;
  gap:10px;
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 55%);
  border:1px solid rgba(16,24,40,0.12);
  border-radius:16px;
  padding:8px 10px;
  box-shadow: 0 10px 22px rgba(15,23,42,0.08);
}
.hTitle{ font-size:13px; font-weight:950; color:#0f172a; white-space:nowrap; }
.sep{ margin: 0 6px; color: rgba(15,23,42,0.35); }
.hRes{ color: rgba(15,23,42,0.75); }
.hSearch{ flex: 1 1 420px; min-width: 260px; }
.hInput{
  width:100%;
  height:34px;
  border-radius:14px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.95);
  padding:0 12px;
  font-size:12px;
  font-weight:850;
  outline:none;
}
.hInput:focus{
  border-color: rgba(32,184,232,0.35);
  box-shadow: 0 0 0 4px rgba(32,184,232,0.12);
}
.hRight{ margin-left:auto; display:flex; gap:8px; align-items:center; }

.card { background:#fff; border:1px solid rgba(16,24,40,0.1); border-radius:16px; padding:12px; }
.alert { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px; background:#fff; color:#111827; font-size:13px; }
.alert.error { border-color:#ef4444; background:#fff5f5; }

/* Buttons */
.btn{
  height:34px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  border-radius:14px;
  padding:0 12px;
  font-weight:950;
  font-size:12px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  cursor:pointer;
  white-space:nowrap;
}
.btn:hover{ background: rgba(32,184,232,0.12); border-color: rgba(32,184,232,0.18); }
.btn.primary{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }
.btn.primary:hover{ background: rgba(24,64,112,1); }
.btn.ghost{ background: rgba(255,255,255,0.75); padding:0 10px; }
.btnic{ width:16px; height:16px; }

.iconBtn{
  width:34px;
  height:34px;
  border-radius:12px;
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
}
.iconBtn:hover{ background:#f9fafb; }
.iconBtn.danger{ border-color:#ef4444; color:#b91c1c; background: rgba(239,68,68,0.06); }
.iconBtn.sm{ width:30px; height:30px; border-radius:10px; }
.actIc{ width:18px; height:18px; }
.smIc{ width:16px; height:16px; }

.input{
  width:100%;
  padding:8px 10px;
  border:1px solid rgba(16,24,40,0.14);
  border-radius:12px;
  font-size:13px;
  background:#fff;
}
.right{ text-align:right; }
.qty{ font-weight:950; font-variant-numeric: tabular-nums; }
.muted{ color:#6b7280; font-size:12px; }
.ell{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Split view */
.gridFixed{
  display:grid;
  grid-template-columns: 380px 1fr;
  gap:12px;
  height: calc(100vh - 210px);
}
@media (max-width: 980px){
  .gridFixed{ grid-template-columns:1fr; height:auto; }
}

.pane{
  display:flex;
  flex-direction:column;
  overflow:hidden;
  min-height:0;
}
.paneBody{
  overflow:auto;
  min-height:0;
  padding-right:4px;
}

/* Heads */
.cardHead{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
.h{ font-weight:950; font-size:13px; color:#0f172a; }
.rowBtns{ display:flex; gap:8px; flex-wrap:wrap; }

/* Left list */
.list{ display:flex; flex-direction:column; gap:8px; }
.row{
  width:100%;
  display:flex;
  justify-content:space-between;
  gap:10px;
  padding:10px;
  border-radius:14px;
  border:1px solid rgba(16,24,40,0.10);
  background:#fff;
  cursor:pointer;
  text-align:left;
}
.row:hover{ background:#f9fafb; }
.row.active{ border-color: rgba(24,64,112,0.35); background: rgba(24,64,112,0.06); }

.rowMain{ min-width:0; display:flex; flex-direction:column; gap:4px; }
.l1{ display:flex; align-items:center; gap:8px; min-width:0; }
.lab{ font-size:13px; font-weight:950; min-width:0; }
.tag{
  font-size:11px;
  padding:3px 8px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  color:#374151;
  font-weight:900;
  flex:0 0 auto;
}
.l2{ font-size:11px; color:#6b7280; display:flex; gap:6px; align-items:center; min-width:0; }
.dot{ opacity:0.6; }
.rowActions{ display:flex; gap:6px; align-items:center; flex:0 0 auto; }

.empty{
  color:#6b7280;
  font-size:12px;
  padding:10px;
  border:1px dashed rgba(16,24,40,0.18);
  border-radius:14px;
  background: rgba(15,23,42,0.03);
}
.empty.big{ padding:18px; }

/* comment tooltip */
.cmtWrap{ position:relative; display:inline-flex; align-items:center; flex:0 0 auto; }
.cmtBtn{
  width:26px;
  height:26px;
  border-radius:10px;
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor: default;
}
.cmtIc{ width:16px; height:16px; color:#6b7280; }
.cmtTip{
  position:absolute;
  left: 34px;
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  min-width: 220px;
  max-width: 360px;
  background: rgba(17,24,39,0.95);
  color:#fff;
  border:1px solid rgba(255,255,255,0.12);
  padding:8px 10px;
  border-radius:12px;
  font-size:12px;
  line-height:1.25;
  box-shadow: 0 18px 40px rgba(0,0,0,0.25);
  opacity:0;
  pointer-events:none;
  transition: opacity .12s ease, transform .12s ease;
  z-index: 30;
}
.cmtWrap:hover .cmtTip{
  opacity:1;
  transform: translateY(-50%) translateX(0px);
}

/* ✅ Sticky right: compact */
.stickyTop{
  position: sticky;
  top: 0;
  z-index: 5;
  background:#fff;
  border-bottom:1px solid rgba(16,24,40,0.10);
  margin-bottom:8px;
  padding-bottom:8px;
}
.stickyLine{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}
.stickyLeft{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  font-size:12px;
  color:#0f172a;
}
.miniMuted{ color:#6b7280; font-size:11px; }
.miniDot{ opacity:0.6; font-size:11px; }
.stickyRight{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

.pill{
  padding:4px 10px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-size:11px;
  color:#374151;
  font-weight:900;
  display:inline-flex;
  gap:6px;
  align-items:center;
}
.pill.ok{ border-color: rgba(0,122,51,0.55); background: rgba(236,253,245,0.55); color:#065f46; }

.banner{
  font-size:12px;
  border:1px solid rgba(16,24,40,0.12);
  border-radius:12px;
  padding:8px 10px;
  margin-top:6px;
}
.banner.error{ border-color:#ef4444; background:#fff5f5; }
.banner.warn{ border-color:#f59e0b; background:#fffbeb; }
.banner.ok{ border-color: rgba(0,122,51,0.55); background: rgba(236,253,245,0.55); color:#065f46; }
.miniTag{
  display:inline-flex;
  padding:2px 8px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  font-size:11px;
  margin-left:6px;
}

/* ✅ Table composition: NO horizontal scroll */
.tableWrap{
  overflow-y:auto;
  overflow-x:hidden; /* ✅ key */
  margin-top:8px;
}
.table{
  width:100%;
  border-collapse:collapse;
  font-size:12px;
  table-layout: fixed; /* ✅ key */
}
.table th, .table td{
  border-bottom:1px solid rgba(16,24,40,0.10);
  padding:8px;
  text-align:left;
  vertical-align:top;
}
.table th{
  font-size:11px;
  color:#6b7280;
  background: rgba(15,23,42,0.03);
}
.cellMp{ min-width:0; }
.mpSel{ min-width:0; }
.cellQty{ width:160px; }
.cellDel{ width:44px; text-align:right; }
.emptyRow{ color:#6b7280; padding:10px; }
.note{ margin-top:10px; font-size:11px; color:#6b7280; }

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
.pnum.on{ background: rgba(24,64,112,0.92); border-color: rgba(24,64,112,0.6); color:#fff; }

/* ✅ delete confirm modal z-index high */
.modal{
  position:fixed;
  inset:0;
  background:rgba(17,24,39,0.45);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:16px;
  z-index:10000; /* ✅ above header */
}
.modalCard{
  background:#fff;
  border:1px solid rgba(16,24,40,0.14);
  border-radius:18px;
  padding:12px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.22);
}
.modalHead{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
.mh{ font-weight:950; color:#0f172a; }
.modalActions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
</style>
