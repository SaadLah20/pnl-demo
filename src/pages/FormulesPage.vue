<!-- src/pages/Variante/Sections/Formules/FormulesPage.vue
     (FICHIER COMPLET / UI alignée style TransportPage)
     ✅ Enlève toutes les infos du haut (P&L / Contrat / Variante / hints)
     ✅ Garde فقط: titre page + boutons + lignes formules
     ✅ Message "Aucune formule…" quand vide
     ✅ Style cohérent (variables, head sticky, boutons, cards)
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionGeneralizeModal, { type CopyPreset } from "@/components/SectionGeneralizeModal.vue";

// Heroicons
import { ArrowDownTrayIcon } from "@heroicons/vue/24/outline";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();

  // optional loaders (fallback-safe)
  try {
    if (!store.formulesCatalogue?.length && (store as any).loadFormulesCatalogue) {
      await (store as any).loadFormulesCatalogue();
    }
  } catch {}
  try {
    if (!store.mpCatalogue?.length && (store as any).loadMpCatalogue) {
      await (store as any).loadMpCatalogue();
    }
  } catch {}
});

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

/* =========================
   ACTIVE
========================= */
const pnl = computed(() => store.activePnl);
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

watch(
  () => store.activeVariantId,
  async (vid) => {
    const id = String(vid ?? "").trim();
    if (!id) return;

    const v = store.activeVariant as any;
    if (v && Array.isArray(v.formules?.items)) return;

    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(id);
    }
  },
  { immediate: true }
);

/* =========================
   ROWS (variant formules)
========================= */
type FormuleRow = {
  id: string; // variantFormuleId (or preview id)
  formuleId: string;
  label: string;
  resistance: string;
  city: string;
  region: string;
  volumeM3: number;
  momd: number;
  cmpOverride: number | null;
  raw: any;
};

function mapItemToRow(it: any, idPrefix = ""): FormuleRow {
  const f = it?.formule ?? {};
  const fid = String(it?.formuleId ?? f?.id ?? "");
  const rid = String(it?.id ?? "");
  return {
    id: idPrefix ? `${idPrefix}${fid || rid || crypto?.randomUUID?.() || Math.random()}` : rid,
    formuleId: String(fid),
    label: String(f?.label ?? ""),
    resistance: String(f?.resistance ?? ""),
    city: String(f?.city ?? ""),
    region: String(f?.region ?? ""),
    volumeM3: toNum(it?.volumeM3 ?? 0),
    momd: toNum(it?.momd ?? 0),
    cmpOverride: it?.cmpOverride == null ? null : toNum(it?.cmpOverride),
    raw: it,
  };
}

const rows = computed<FormuleRow[]>(() => {
  const v: any = variant.value ?? null;
  const items = v?.formules?.items ?? v?.variantFormules ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((it: any) => mapItemToRow(it));
});

function getItemsRaw(r: FormuleRow): any[] {
  return r?.raw?.formule?.items ?? [];
}

/* =========================
   ✅ IMPORT PREVIEW (visible avant save)
========================= */
type SnapshotItem = { formuleId: string; volumeM3: number; momd: number; cmpOverride: number | null };

const importDraft = reactive<{
  ready: boolean;
  sourceVariantId: string;
  copy: CopyPreset;
  previewRawItems: any[];
  items: SnapshotItem[];
}>({
  ready: false,
  sourceVariantId: "",
  copy: "QTY_MOMD",
  previewRawItems: [],
  items: [],
});

function clearImportDraft() {
  importDraft.ready = false;
  importDraft.sourceVariantId = "";
  importDraft.copy = "QTY_MOMD";
  importDraft.previewRawItems = [];
  importDraft.items = [];
  for (const k of Object.keys(open)) delete open[k];
}

/** ✅ Rows affichées: si preview actif => on montre les formules importées (non enregistrées) */
const rowsShown = computed<FormuleRow[]>(() => {
  if (!importDraft.ready) return rows.value;

  const items = importDraft.previewRawItems ?? [];
  if (!Array.isArray(items)) return [];

  return items.map((it: any) => {
    const f = it?.formule ?? {};
    const fid = String(it?.formuleId ?? f?.id ?? "").trim();
    const clone = { ...it, id: `__preview__${fid || String(it?.id ?? "")}` };
    return mapItemToRow(clone, "");
  });
});

/* =========================
   ✅ AJOUT FORMULE
========================= */
const addOpen = ref(false);
const addQ = ref("");
const addBusy = ref(false);
const addErr = ref<string | null>(null);

const existingFormuleIds = computed(() => new Set(rowsShown.value.map((r) => String(r.formuleId))));
const catalogue = computed<any[]>(() => (store.formulesCatalogue ?? []) as any[]);

const filteredCatalogue = computed(() => {
  const q = addQ.value.trim().toLowerCase();
  const list = catalogue.value.slice();
  const out = !q
    ? list
    : list.filter((f: any) => {
        const blob = `${f.label ?? ""} ${f.resistance ?? ""} ${f.city ?? ""} ${f.region ?? ""}`.toLowerCase();
        return blob.includes(q);
      });
  return out;
});

function isAlreadyInVariant(formuleId: string) {
  return existingFormuleIds.value.has(String(formuleId));
}

async function addFormule(formuleId: string) {
  if (!variant.value) return;
  if (importDraft.ready) return;
  if (isAlreadyInVariant(formuleId)) return;

  addBusy.value = true;
  addErr.value = null;
  try {
    const variantId = String((variant.value as any)?.id ?? store.activeVariantId ?? "").trim();
    if (!variantId) return;

    await (store as any).addFormuleToVariant(variantId, String(formuleId));
    if ((store as any).loadVariantDeep) await (store as any).loadVariantDeep(variantId);
  } catch (e: any) {
    addErr.value = e?.message ?? String(e);
  } finally {
    addBusy.value = false;
  }
}

/* =========================
   ✅ SUPPRIMER FORMULE
========================= */
const delBusy = reactive<Record<string, boolean>>({});
const delErr = ref<string | null>(null);

const delConfirm = reactive({
  open: false,
  variantFormuleId: "",
  formuleId: "",
  label: "",
});

function resolveVariantFormuleId(row: FormuleRow): string {
  const rawId = String(row?.raw?.id ?? "").trim();
  if (rawId && !rawId.startsWith("__preview__")) return rawId;

  const v: any = variant.value ?? null;
  const items = (v?.formules?.items ?? v?.variantFormules ?? []) as any[];
  const fid = String(row?.formuleId ?? "").trim();
  if (!fid || !Array.isArray(items)) return "";

  const found = items.find((x: any) => String(x?.formuleId ?? x?.formule?.id ?? "").trim() === fid);
  return String(found?.id ?? "").trim();
}

function openDeleteConfirm(row: FormuleRow) {
  delErr.value = null;
  if (importDraft.ready) return;

  const vfId = resolveVariantFormuleId(row);
  if (!vfId) {
    delErr.value =
      "Impossible de trouver l'ID de la formule dans la variante (variantFormuleId manquant). Clique sur Recharger puis réessaie.";
    return;
  }

  delConfirm.variantFormuleId = vfId;
  delConfirm.formuleId = String(row?.formuleId ?? "");
  delConfirm.label = String(row?.label ?? "");
  delConfirm.open = true;
}

function closeDeleteConfirm() {
  delConfirm.open = false;
  delConfirm.variantFormuleId = "";
  delConfirm.formuleId = "";
  delConfirm.label = "";
}

async function deleteFormule(variantFormuleId: string) {
  if (importDraft.ready) return;

  const variantId = String((variant.value as any)?.id ?? store.activeVariantId ?? "").trim();
  const vfId = String(variantFormuleId ?? "").trim();
  if (!variantId || !vfId) return;

  delErr.value = null;
  delBusy[vfId] = true;

  try {
    await (store as any).deleteVariantFormule(variantId, vfId);
    if ((store as any).loadVariantDeep) await (store as any).loadVariantDeep(variantId);
    closeDeleteConfirm();
  } catch (e: any) {
    delErr.value = e?.message ?? String(e);
  } finally {
    delBusy[vfId] = false;
  }
}

/* =========================
   MP sorting (fallback-safe)
========================= */
function normKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function catRank(catRaw: any): number {
  const c = normKey(catRaw);
  if (c === "ciment") return 0;
  if (c === "granulats" || c === "granulat" || c.includes("granul")) return 1;
  if (c === "adjuvant") return 2;
  return 9;
}

function sortedItems(r: FormuleRow) {
  const items = getItemsRaw(r).slice();
  items.sort((a: any, b: any) => {
    const ra = catRank(a?.mp?.categorie);
    const rb = catRank(b?.mp?.categorie);
    if (ra !== rb) return ra - rb;

    const la = String(a?.mp?.label ?? "").toLowerCase();
    const lb = String(b?.mp?.label ?? "").toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  return items;
}

/* =========================
   CMP
========================= */
function cmpPerM3(r: FormuleRow): number {
  let total = 0;
  for (const it of getItemsRaw(r)) {
    const qtyKg = toNum(it?.qty ?? 0);
    const prixT = toNum(it?.mp?.prix ?? 0);
    total += (qtyKg / 1000) * prixT;
  }
  return total;
}

/* =========================
   Volume verifier (fallback-safe)
========================= */
function getRhoFromCategorie(catRaw: any): number | null {
  const c = normKey(catRaw);
  if (c === "ciment") return 3.1;
  if (c === "granulats" || c === "granulat" || c.includes("granul")) return 2.65;
  if (c === "adjuvant") return 1.1;
  return null;
}

type ItemDraft = { mpId: string; qty: number };

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

function getMpById(mpId: string): any | null {
  const list = store.mpCatalogue ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.find((x: any) => String(x?.id ?? "") === String(mpId)) ?? null;
}

function compositionStatsFor(r: FormuleRow) {
  const raw = getItemsRaw(r) ?? [];
  const rawItems: Array<ItemDraft & { mpInline?: any }> = raw.map((x: any) => ({
    mpId: String(x?.mpId ?? x?.mp?.id ?? ""),
    qty: toNum(x?.qty ?? 0),
    mpInline: x?.mp ?? null,
  }));

  const withKeys = rawItems.map((x, idx) => ({
    ...x,
    mpId: x.mpId?.trim() ? x.mpId : `__missing_${idx}`,
  }));
  const cleaned = normalizeItems(withKeys);

  let mCiment = 0;
  let vTotal = 0;
  const missing: Array<{ mpId: string; label: string }> = [];

  const inlineById = new Map<string, any>();
  for (const it of withKeys) {
    if (it.mpInline && it.mpId) inlineById.set(String(it.mpId), it.mpInline);
  }

  for (const it of cleaned) {
    const mpFromCatalogue = getMpById(String(it.mpId));
    const mpInline = inlineById.get(String(it.mpId)) ?? null;
    const mp = mpFromCatalogue ?? mpInline ?? null;

    const rho = getRhoFromCategorie(mp?.categorie);

    if (!rho) {
      missing.push({ mpId: String(it.mpId), label: String(mp?.label ?? "MP inconnue") });
      continue;
    }

    const qty = toNum(it.qty);
    const cat = normKey(mp?.categorie);
    if (cat === "ciment") mCiment += qty;

    vTotal += (qty / 1000) / rho;
  }

  const vEau = (mCiment * 0.5 + 15) / 1000;
  const target = 1;
  const vTotWithWater = vTotal + vEau;

  const delta = target - vTotWithWater;

  const isLow = delta > 0.02;
  const isOk = !isLow && delta >= -0.02;

  const statusLabel = isOk ? "OK" : isLow ? "Bas" : "Haut";

  return {
    vTotal: vTotWithWater * 1000,
    target: target * 1000,
    delta: delta * 1000,
    vEau: vEau * 1000,
    missing,
    isLow,
    isOk,
    statusLabel,
  };
}

/* =========================
   UI: expand
========================= */
const open = reactive<Record<string, boolean>>({});

function toggle(r: FormuleRow) {
  open[r.id] = !open[r.id];
}
function openAll() {
  for (const r of rowsShown.value) open[r.id] = true;
}
function closeAll() {
  for (const r of rowsShown.value) open[r.id] = false;
}
function isOpen(r: FormuleRow) {
  return !!open[r.id];
}

/* =========================
   ✅ IMPORT MODAL (prepare preview)
========================= */
type ImportRow = {
  pnlId: string;
  pnlTitle: string;
  contractId: string;
  contractLabel: string;
  variantId: string;
  variantTitle: string;
  variantStatus: string;
  hasFormules: boolean;
};

type TreeContract = {
  contractId: string;
  contractLabel: string;
  variants: ImportRow[];
};
type TreePnl = {
  pnlId: string;
  pnlTitle: string;
  contracts: TreeContract[];
};

const importUi = reactive({
  open: false,
  q: "",
  sourceVariantId: "",
  onlyActivePnl: false,
  copy: "QTY_MOMD" as CopyPreset,
});

const openPnl = reactive<Record<string, boolean>>({});
const openContract = reactive<Record<string, boolean>>({});

const importBusy = ref(false);
const importErr = ref<string | null>(null);

function pnlTitleOf(p: any) {
  return String(p?.title ?? p?.name ?? `PNL #${String(p?.id ?? "").slice(0, 6)}`);
}
function contractLabelOf(c: any) {
  const d = (c as any)?.dureeMois ?? null;
  const id = String((c as any)?.id ?? "");
  return d != null ? `Contrat #${id.slice(0, 6)} — ${d} mois` : `Contrat #${id.slice(0, 6)}`;
}
function hasFormules(v: any) {
  const items = (v?.formules?.items ?? v?.variantFormules ?? []) as any[];
  return Array.isArray(items) && items.length > 0;
}

function getPnlsForImport(): any[] {
  const all = (store as any).pnls ?? [];
  if (!Array.isArray(all)) return [];
  if (!importUi.onlyActivePnl) return all;

  const activeId = String((store as any).activePnl?.id ?? "");
  if (!activeId) return all;
  return all.filter((p: any) => String(p?.id ?? "") === activeId);
}

const importRows = computed<ImportRow[]>(() => {
  const pnls = getPnlsForImport();
  const out: ImportRow[] = [];

  for (const p of pnls) {
    const pid = String(p?.id ?? "");
    const pTitle = pnlTitleOf(p);

    const contracts = p?.contracts ?? [];
    for (const c of contracts) {
      const cid = String(c?.id ?? "");
      if (!cid) continue;

      const cLabel = contractLabelOf(c);

      const vars = c?.variants ?? [];
      for (const v of vars) {
        const vid = String(v?.id ?? "");
        if (!vid) continue;

        if (variant.value?.id && vid === String(variant.value.id)) continue;

        out.push({
          pnlId: pid,
          pnlTitle: pTitle,
          contractId: cid,
          contractLabel: cLabel,
          variantId: vid,
          variantTitle: String(v?.title ?? "—"),
          variantStatus: String(v?.status ?? "—"),
          hasFormules: hasFormules(v),
        });
      }
    }
  }

  return out;
});

const importTree = computed<TreePnl[]>(() => {
  const needle = String(importUi.q ?? "").trim().toLowerCase();

  const byPnl: Record<
    string,
    {
      pnlId: string;
      pnlTitle: string;
      contracts: Record<string, { contractId: string; contractLabel: string; variants: ImportRow[] }>;
    }
  > = {};

  for (const r of importRows.value) {
    const hay = `${r.pnlTitle} ${r.contractLabel} ${r.variantTitle} ${r.variantStatus} ${r.variantId}`.toLowerCase();
    if (needle && !hay.includes(needle)) continue;

    const p =
      (byPnl[r.pnlId] ??= {
        pnlId: r.pnlId,
        pnlTitle: r.pnlTitle,
        contracts: {},
      });

    const c =
      (p.contracts[r.contractId] ??= {
        contractId: r.contractId,
        contractLabel: r.contractLabel,
        variants: [],
      });

    c.variants.push(r);
  }

  return Object.values(byPnl)
    .sort((a, b) => a.pnlTitle.localeCompare(b.pnlTitle))
    .map((p) => ({
      pnlId: p.pnlId,
      pnlTitle: p.pnlTitle,
      contracts: Object.values(p.contracts)
        .map((c) => ({
          contractId: c.contractId,
          contractLabel: c.contractLabel,
          variants: (c.variants ?? []).slice().sort((a, b) => a.variantTitle.localeCompare(b.variantTitle)),
        }))
        .sort((a, b) => a.contractLabel.localeCompare(b.contractLabel)),
    }));
});

function togglePnl(pnlId: string) {
  openPnl[pnlId] = !openPnl[pnlId];
}
function toggleContract(pnlId: string, contractId: string) {
  const k = `${pnlId}::${contractId}`;
  openContract[k] = !openContract[k];
}
function contractIsOpen(pnlId: string, contractId: string) {
  const k = `${pnlId}::${contractId}`;
  return Boolean(openContract[k]);
}

function openAllImport() {
  for (const p of importTree.value) {
    openPnl[p.pnlId] = true;
    for (const c of p.contracts) openContract[`${p.pnlId}::${c.contractId}`] = true;
  }
}
function closeAllImport() {
  for (const p of importTree.value) {
    openPnl[p.pnlId] = false;
    for (const c of p.contracts) openContract[`${p.pnlId}::${c.contractId}`] = false;
  }
}

function openImport() {
  importErr.value = null;
  importUi.q = "";
  importUi.sourceVariantId = "";
  importUi.copy = "QTY_MOMD";
  importUi.open = true;

  const pnls = getPnlsForImport();
  for (const p of pnls) {
    const pid = String(p?.id ?? "");
    if (pid) openPnl[pid] = true;

    for (const c of p?.contracts ?? []) {
      const cid = String(c?.id ?? "");
      if (!cid) continue;
      openContract[`${pid}::${cid}`] = false;
    }
  }

  const first = importTree.value?.[0]?.contracts?.[0]?.variants?.[0];
  if (first?.variantId) importUi.sourceVariantId = first.variantId;
}
function closeImport() {
  importUi.open = false;
}

function copyLabel(copy: CopyPreset) {
  if (copy === "ZERO") return "Formules seulement (tout à 0)";
  if (copy === "QTY_ONLY") return "Formules + Quantités (MOMD=0)";
  if (copy === "MOMD_ONLY") return "Formules + MOMD (m³=0)";
  return "Formules + Quantités + MOMD";
}

function extractSourceSnapshot(srcVariant: any) {
  const items = (srcVariant?.formules?.items ?? srcVariant?.variantFormules ?? []) as any[];
  const seen = new Set<string>();
  const out: SnapshotItem[] = [];

  if (!Array.isArray(items)) return out;

  for (const it of items) {
    const f = it?.formule ?? {};
    const fid = String(it?.formuleId ?? f?.id ?? "").trim();
    if (!fid) continue;
    if (seen.has(fid)) continue;
    seen.add(fid);

    out.push({
      formuleId: fid,
      volumeM3: toNum(it?.volumeM3 ?? 0),
      momd: toNum(it?.momd ?? 0),
      cmpOverride: it?.cmpOverride == null ? null : toNum(it?.cmpOverride),
    });
  }

  return out;
}

function makePatchFor(copy: CopyPreset, s: SnapshotItem) {
  if (copy === "ZERO") return { volumeM3: 0, momd: 0, cmpOverride: 0 };
  if (copy === "QTY_ONLY") return { volumeM3: Number(s.volumeM3 ?? 0), momd: 0, cmpOverride: 0 };
  if (copy === "MOMD_ONLY") return { volumeM3: 0, momd: Number(s.momd ?? 0), cmpOverride: 0 };
  return {
    volumeM3: Number(s.volumeM3 ?? 0),
    momd: Number(s.momd ?? 0),
    cmpOverride: s.cmpOverride == null ? 0 : s.cmpOverride,
  };
}

/* =========================
   ✅ CONFIRM IMPORT PREPARE
========================= */
const importConfirm = reactive({
  open: false,
  msg: "",
});

function openImportConfirm() {
  if (!variant.value) return;
  if (!importUi.sourceVariantId) return;

  importConfirm.msg =
    `Importer les Formules depuis la variante source vers la variante active ?\n` +
    `• Affiche un preview (non enregistré)\n` +
    `• Mode: ${copyLabel(importUi.copy)}\n\n` +
    `Confirmer l'import (preview) ?`;

  importConfirm.open = true;
}
function closeImportConfirm() {
  importConfirm.open = false;
}

async function doImportPrepare() {
  if (!variant.value) return;

  const targetId = String(store.activeVariantId ?? "").trim();
  const srcId = String(importUi.sourceVariantId ?? "").trim();
  if (!targetId || !srcId) return;

  importBusy.value = true;
  importErr.value = null;

  try {
    let srcVariant: any = null;
    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(srcId);
      srcVariant = store.activeVariant as any;
    }
    if (!srcVariant || String(srcVariant?.id ?? "") !== srcId) {
      throw new Error("Impossible de charger la variante source (deep).");
    }

    const rawItems = (srcVariant?.formules?.items ?? srcVariant?.variantFormules ?? []) as any[];
    const snap = extractSourceSnapshot(srcVariant);

    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(targetId);
    }

    importDraft.ready = true;
    importDraft.sourceVariantId = srcId;
    importDraft.copy = importUi.copy ?? "QTY_MOMD";
    importDraft.previewRawItems = Array.isArray(rawItems) ? rawItems.slice() : [];
    importDraft.items = snap;

    closeImportConfirm();
    closeImport();

    for (const k of Object.keys(open)) delete open[k];
  } catch (e: any) {
    importErr.value = e?.message ?? String(e);
  } finally {
    importBusy.value = false;
  }
}

async function saveImportedDraft() {
  if (!variant.value) return;

  const targetId = String(store.activeVariantId ?? "").trim();
  if (!targetId) return;
  if (!importDraft.ready || !importDraft.items?.length) return;

  importBusy.value = true;
  importErr.value = null;

  try {
    const copy = importDraft.copy ?? "QTY_MOMD";
    const src = importDraft.items.slice();

    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(targetId);
    }

    const targetVariant = store.activeVariant as any;
    const targetItems = (targetVariant?.formules?.items ?? targetVariant?.variantFormules ?? []) as any[];

    if (Array.isArray(targetItems) && targetItems.length) {
      for (const it of targetItems) {
        const vfId = String(it?.id ?? "").trim();
        if (!vfId) continue;
        await (store as any).deleteVariantFormule(targetId, vfId);
      }
    }

    for (const s of src) {
      await (store as any).addFormuleToVariant(targetId, s.formuleId);
    }

    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(targetId);
    }

    const refreshed = store.activeVariant as any;
    const its = (refreshed?.formules?.items ?? refreshed?.variantFormules ?? []) as any[];

    for (const s of src) {
      const created = Array.isArray(its)
        ? its.find((x: any) => String(x?.formuleId ?? x?.formule?.id ?? "") === String(s.formuleId))
        : null;

      const createdId = String(created?.id ?? "").trim();
      if (!createdId) continue;

      const patch = makePatchFor(copy, s);
      await (store as any).updateVariantFormule(targetId, createdId, patch);
    }

    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(targetId);
    }

    clearImportDraft();
  } catch (e: any) {
    importErr.value = e?.message ?? String(e);
  } finally {
    importBusy.value = false;
  }
}

/* =========================
   ✅ GENERALISER SECTION (Formules)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

function getAllVariantsOfActivePnl(): Array<{ id: string; raw: any }> {
  const p = store.activePnl;
  if (!p) return [];
  const out: Array<{ id: string; raw: any }> = [];
  for (const c of p.contracts ?? []) {
    for (const v of c.variants ?? []) {
      const id = String(v?.id ?? "");
      if (!id) continue;
      out.push({ id, raw: v });
    }
  }
  return out;
}

function getVariantById(variantId: string): any | null {
  const list = getAllVariantsOfActivePnl();
  return list.find((x) => x.id === String(variantId))?.raw ?? null;
}

function makePatchForGeneralize(copy: CopyPreset, s: any) {
  if (copy === "ZERO") return { volumeM3: 0, momd: 0, cmpOverride: 0 };
  if (copy === "QTY_ONLY") return { volumeM3: Number(s.volumeM3 ?? 0), momd: 0, cmpOverride: 0 };
  if (copy === "MOMD_ONLY") return { volumeM3: 0, momd: Number(s.momd ?? 0), cmpOverride: 0 };
  return {
    volumeM3: Number(s.volumeM3 ?? 0),
    momd: Number(s.momd ?? 0),
    cmpOverride: s.cmpOverride == null ? 0 : s.cmpOverride,
  };
}

async function generalizeFormulesTo(variantIds: string[], copy: CopyPreset) {
  const sourceVariantId = String(store.activeVariantId ?? "").trim();
  if (!sourceVariantId) return;

  const src = rows.value
    .filter((r) => r.formuleId)
    .map((r) => ({
      formuleId: String(r.formuleId),
      volumeM3: toNum(r.volumeM3),
      momd: toNum(r.momd),
      cmpOverride: r.cmpOverride,
    }));

  genErr.value = null;
  genBusy.value = true;

  try {
    for (const targetIdRaw of variantIds) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;

      const target = getVariantById(targetId) as any;
      const targetItems = (target?.formules?.items ?? target?.variantFormules ?? []) as any[];
      if (Array.isArray(targetItems) && targetItems.length) {
        for (const it of targetItems) {
          const vfId = String(it?.id ?? "").trim();
          if (!vfId) continue;
          await (store as any).deleteVariantFormule(targetId, vfId);
        }
      }

      for (const s of src) {
        await (store as any).addFormuleToVariant(targetId, s.formuleId);

        const refreshed = getVariantById(targetId) as any;
        const its = (refreshed?.formules?.items ?? refreshed?.variantFormules ?? []) as any[];
        const created = Array.isArray(its)
          ? its.find((x: any) => String(x?.formuleId ?? x?.formule?.id ?? "") === s.formuleId)
          : null;

        const createdId = String(created?.id ?? "").trim();
        if (createdId) {
          const patch = makePatchForGeneralize(copy, s);
          await (store as any).updateVariantFormule(targetId, createdId, patch);
        }
      }
    }
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[]; copy: CopyPreset }) {
  const ids = payload?.variantIds ?? [];
  const copy = payload?.copy ?? "QTY_MOMD";
  if (!ids.length) return;

  const label =
    copy === "ZERO"
      ? "Formules seulement (0 m³ / 0 MOMD / 0 DH)"
      : copy === "QTY_ONLY"
      ? "Formules + Quantités (MOMD=0 / 0 DH)"
      : "Formules + Quantités + MOMD";

  const ok = window.confirm(
    payload.mode === "ALL"
      ? `Généraliser les Formules sur TOUTES les variantes ?\nMode: ${label}`
      : `Généraliser les Formules sur ${ids.length} variante(s) ?\nMode: ${label}`
  );
  if (!ok) return;

  await generalizeFormulesTo(ids, copy);
  if (!genErr.value) genOpen.value = false;
}
</script>

<template>
  <div class="page">
    <!-- ✅ Header minimal (style TransportPage) -->
    <div class="head">
      <div class="hleft">
        <div class="h1">Formules</div>
        <div class="muted small">Composition & CMP</div>
      </div>

      <div class="actions">
        <button class="btn" type="button" @click="addOpen = true" :disabled="!variant || addBusy || importBusy || importDraft.ready">
          + Ajouter
        </button>

        <button class="btn" type="button" @click="openImport()" :disabled="!variant || importBusy">
          <ArrowDownTrayIcon class="ic" />
          Importer
        </button>

        <button
          v-if="importDraft.ready"
          class="btn primary"
          type="button"
          :disabled="importBusy || !variant"
          @click="saveImportedDraft()"
          title="Enregistrer l'import (commit DB)"
        >
          Enregistrer
        </button>

        <button
          v-if="importDraft.ready"
          class="btn ghost"
          type="button"
          :disabled="importBusy"
          @click="clearImportDraft()"
          title="Annuler le preview"
        >
          Annuler
        </button>

        <button class="btn" type="button" @click="genOpen = true" :disabled="!variant || genBusy || importBusy || importDraft.ready">
          Généraliser
        </button>

        <button class="btn ghost" type="button" @click="store.loadPnls()" :disabled="importBusy">Recharger</button>
        <button class="btn ghost" type="button" @click="openAll()" :disabled="!variant">Ouvrir</button>
        <button class="btn ghost" type="button" @click="closeAll()" :disabled="!variant">Fermer</button>
      </div>
    </div>

    <!-- Alerts -->
    <div v-if="importDraft.ready" class="alert info">
      <b>Preview import (non enregistré)</b>
      <span class="muted"> — Source #{{ String(importDraft.sourceVariantId).slice(0, 8) }} • Mode: {{ copyLabel(importDraft.copy) }}</span>
    </div>

    <div v-if="delErr" class="alert err"><b>Erreur :</b> {{ delErr }}</div>
    <div v-if="genErr" class="alert err"><b>Généralisation :</b> {{ genErr }}</div>
    <div v-if="genBusy" class="alert info">Généralisation : traitement…</div>

    <div v-if="importErr" class="alert err"><b>Import :</b> {{ importErr }}</div>
    <div v-if="importBusy" class="alert info">Import : traitement…</div>

    <div v-if="store.loading" class="alert info">Chargement…</div>
    <div v-else-if="store.error" class="alert err"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div v-if="!variant" class="card mutedCard">
        Sélectionne une variante (via Mes P&L) puis reviens ici.
      </div>

      <template v-else>
        <div v-if="rowsShown.length === 0" class="card empty">
          <div class="emptyTitle">Aucune formule</div>
          <div class="muted small">Clique sur <b>+ Ajouter</b> ou <b>Importer</b> pour démarrer.</div>
        </div>

        <div v-else class="cards">
          <div v-for="r in rowsShown" :key="r.id" class="card">
            <button class="rowHead" type="button" @click="toggle(r)">
              <div class="left">
                <span class="chev">{{ isOpen(r) ? "▾" : "▸" }}</span>
                <span class="name">{{ r.label || "—" }}</span>
                <span class="chip">{{ r.resistance || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ r.city || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ r.region || "—" }}</span>
              </div>

              <div class="right">
                <button
                  class="iconDanger"
                  title="Supprimer la formule"
                  @click.stop="openDeleteConfirm(r)"
                  :disabled="importBusy || importDraft.ready"
                >
                  🗑
                </button>

                <div class="cmpBox">
                  <span class="cmpLbl">CMP</span>
                  <span class="cmpVal mono">{{ n(cmpPerM3(r)) }}</span>
                </div>

                <template v-if="getItemsRaw(r).length">
                  <div class="pills">
                    <span class="pill mono">V <b>{{ liters(compositionStatsFor(r).vTotal) }}</b>L</span>
                    <span
                      class="pill"
                      :class="compositionStatsFor(r).isOk ? 'pill-ok' : compositionStatsFor(r).isLow ? 'pill-bad' : 'pill-warn'"
                    >
                      {{ compositionStatsFor(r).statusLabel }}
                    </span>
                  </div>
                </template>
              </div>
            </button>

            <div v-if="isOpen(r)" class="rowBody">
              <div class="grid">
                <div class="box">
                  <div class="boxTitle">Composition (kg/m³)</div>

                  <div v-if="compositionStatsFor(r).missing.length" class="miniErr">
                    <b>MP non résolues</b> :
                    <span v-for="m in compositionStatsFor(r).missing" :key="m.mpId" class="miniChip">
                      {{ m.label }}
                    </span>
                  </div>

                  <div class="table">
                    <div class="thead">
                      <div>MP</div>
                      <div class="r">Cat.</div>
                      <div class="r">Qty</div>
                      <div class="r">Prix/t</div>
                      <div class="r">Total</div>
                    </div>

                    <div
                      v-for="it in sortedItems(r)"
                      :key="String(it?.id ?? it?.mpId ?? it?.mp?.id ?? '')"
                      class="trow"
                    >
                      <div class="mp">
                        <span class="mpName">{{ it?.mp?.label ?? "—" }}</span>
                        <span class="mpSub muted">{{ it?.mp?.resistance ?? "" }}</span>
                      </div>
                      <div class="r muted">{{ it?.mp?.categorie ?? "—" }}</div>
                      <div class="r mono strong">{{ n(it?.qty ?? 0, 0) }}</div>
                      <div class="r mono">{{ n(it?.mp?.prix ?? 0) }}</div>
                      <div class="r mono strong">
                        {{ n(((toNum(it?.qty ?? 0) / 1000) * toNum(it?.mp?.prix ?? 0))) }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="box">
                  <div class="boxTitle">Contrôle volume</div>

                  <div class="kpis">
                    <div class="kpi">
                      <div class="k muted">Volume total</div>
                      <div class="v mono strong">{{ liters(compositionStatsFor(r).vTotal) }} L</div>
                    </div>
                    <div class="kpi">
                      <div class="k muted">Cible</div>
                      <div class="v mono">{{ liters(compositionStatsFor(r).target) }} L</div>
                    </div>
                    <div class="kpi">
                      <div class="k muted">Δ</div>
                      <div
                        class="v mono"
                        :class="compositionStatsFor(r).isOk ? 'okTxt' : compositionStatsFor(r).isLow ? 'badTxt' : 'warnTxt'"
                      >
                        {{ liters(compositionStatsFor(r).delta) }} L
                      </div>
                    </div>
                    <div class="kpi">
                      <div class="k muted">Eau estimée</div>
                      <div class="v mono">{{ liters(compositionStatsFor(r).vEau) }} L</div>
                    </div>
                  </div>

                  <div class="muted small" style="margin-top:8px">
                    Contrôle indicatif (ρ approx).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL AJOUT -->
        <div v-if="addOpen" class="overlay underDash" @click.self="addOpen = false">
          <div class="modal">
            <div class="mhead">
              <div class="mtitle">Ajouter une formule</div>
              <button class="x" @click="addOpen = false">×</button>
            </div>

            <div class="mbody">
              <input v-model="addQ" class="in" placeholder="Rechercher…" />
              <div v-if="addErr" class="alert err" style="margin-top:10px"><b>Erreur :</b> {{ addErr }}</div>

              <div class="list">
                <div
                  v-for="f in filteredCatalogue"
                  :key="String(f?.id ?? '')"
                  class="item"
                  :class="isAlreadyInVariant(String(f?.id ?? '')) ? 'disabled' : ''"
                >
                  <div class="ileft">
                    <div class="ititle">
                      <span class="iname">{{ f?.label ?? "—" }}</span>
                      <span class="chip">{{ f?.resistance ?? "—" }}</span>
                    </div>
                    <div class="muted small">{{ f?.city ?? "—" }} • {{ f?.region ?? "—" }}</div>
                  </div>

                  <div class="iright">
                    <span v-if="isAlreadyInVariant(String(f?.id ?? ''))" class="tag">Déjà ajouté</span>
                    <button
                      v-else
                      class="btn primary"
                      style="padding:7px 10px;font-size:12px"
                      :disabled="addBusy || importBusy || importDraft.ready"
                      @click="addFormule(String(f?.id ?? ''))"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="mact">
              <button class="btn ghost" @click="addOpen = false">Fermer</button>
            </div>
          </div>
        </div>

        <!-- ✅ MODAL IMPORT -->
        <div v-if="importUi.open" class="overlay underDash" @click.self="closeImport()">
          <div class="modal">
            <div class="mhead">
              <div class="mtitle">Importer — Formules</div>
              <button class="x" @click="closeImport()">×</button>
            </div>

            <div class="mbody">
              <div class="rowBetween">
                <label class="check">
                  <input type="checkbox" v-model="importUi.onlyActivePnl" />
                  <span><b>P&L active uniquement</b></span>
                </label>

                <div class="btns">
                  <button class="btn ghost" type="button" @click="openAllImport()">Tout ouvrir</button>
                  <button class="btn ghost" type="button" @click="closeAllImport()">Tout fermer</button>
                </div>
              </div>

              <input
                v-model="importUi.q"
                class="in"
                placeholder="Rechercher… (PNL / contrat / variante / status / id)"
                style="margin-top:10px"
              />

              <div class="section">
                <div class="sectionTitle">Mode d’import</div>
                <div class="copyGrid">
                  <label class="radio">
                    <input type="radio" v-model="importUi.copy" value="QTY_MOMD" />
                    <span><b>Formules + Quantités + MOMD</b></span>
                  </label>
                  <label class="radio">
                    <input type="radio" v-model="importUi.copy" value="QTY_ONLY" />
                    <span><b>Formules + Quantités</b> (MOMD=0)</span>
                  </label>
                  <label class="radio">
                    <input type="radio" v-model="importUi.copy" value="MOMD_ONLY" />
                    <span><b>Formules + MOMD</b> (m³=0)</span>
                  </label>
                  <label class="radio">
                    <input type="radio" v-model="importUi.copy" value="ZERO" />
                    <span><b>Formules seulement</b> (tout à 0)</span>
                  </label>
                </div>
              </div>

              <div class="muted small" style="margin-top:10px">
                Import = affiche un <b>preview</b> (non enregistré). Enregistrer est séparé.
              </div>

              <div v-if="importTree.length === 0" class="alert info" style="margin-top:10px">
                Aucune variante trouvée (filtre trop strict ?).
              </div>

              <div v-else class="tree" style="margin-top:10px">
                <div v-for="p in importTree" :key="p.pnlId" class="block">
                  <button class="treeRow" type="button" @click="togglePnl(p.pnlId)">
                    <span class="caret" :class="{ on: openPnl[p.pnlId] }">▾</span>
                    <span class="tTitle ell">{{ p.pnlTitle }}</span>
                    <span class="muted small mono">#{{ String(p.pnlId).slice(0, 8) }}</span>
                  </button>

                  <div v-if="openPnl[p.pnlId]" class="body">
                    <div v-for="c in p.contracts" :key="c.contractId" class="block">
                      <button class="treeRow subRow" type="button" @click="toggleContract(p.pnlId, c.contractId)">
                        <span class="caret" :class="{ on: contractIsOpen(p.pnlId, c.contractId) }">▾</span>
                        <span class="tTitle ell">{{ c.contractLabel }}</span>
                        <span class="muted small mono">#{{ String(c.contractId).slice(0, 8) }}</span>
                      </button>

                      <div v-if="contractIsOpen(p.pnlId, c.contractId)" class="body">
                        <button
                          v-for="v in c.variants"
                          :key="v.variantId"
                          class="treeRow varRow"
                          type="button"
                          :class="{ active: importUi.sourceVariantId === v.variantId }"
                          @click="importUi.sourceVariantId = v.variantId"
                        >
                          <span class="dotVar" :class="{ ok: v.hasFormules }"></span>
                          <span class="tTitle ell">{{ v.variantTitle }}</span>
                          <span class="statusPill">{{ v.variantStatus }}</span>
                          <span class="muted small mono">#{{ String(v.variantId).slice(0, 8) }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="muted small" style="margin-top:10px">
                  Indicateur: <span class="dotLeg ok"></span> a des formules • <span class="dotLeg"></span> vide
                </div>
              </div>
            </div>

            <div class="mact">
              <button class="btn ghost" @click="closeImport()">Annuler</button>
              <button class="btn primary" :disabled="!importUi.sourceVariantId || !variant || importBusy" @click="openImportConfirm()">
                Importer (preview)
              </button>
            </div>
          </div>
        </div>

        <!-- ✅ MODAL CONFIRM IMPORT -->
        <div v-if="importConfirm.open" class="overlay underDash" @click.self="closeImportConfirm()">
          <div class="modal confirm">
            <div class="mhead">
              <div class="mtitle">Confirmer l’import</div>
              <button class="x" @click="closeImportConfirm()">×</button>
            </div>

            <div class="mbody">
              <div class="confirmText">{{ importConfirm.msg }}</div>
              <div class="muted small" style="margin-top:8px">
                Tu verras les formules importées, mais rien n’est écrit tant que tu n’enregistres pas.
              </div>
            </div>

            <div class="mact">
              <button class="btn ghost" :disabled="importBusy" @click="closeImportConfirm()">Annuler</button>
              <button class="btn primary" :disabled="importBusy || !variant || !importUi.sourceVariantId" @click="doImportPrepare()">
                {{ importBusy ? "..." : "Confirmer & afficher" }}
              </button>
            </div>
          </div>
        </div>

        <!-- ✅ MODAL CONFIRM DELETE -->
        <div v-if="delConfirm.open" class="overlay underDash" @click.self="closeDeleteConfirm()">
          <div class="modal confirm">
            <div class="mhead">
              <div class="mtitle">Supprimer la formule</div>
              <button class="x" @click="closeDeleteConfirm()">×</button>
            </div>

            <div class="mbody">
              <div class="confirmText">
                Supprimer cette formule de la variante ?
                <span class="muted" style="display:block;margin-top:6px;font-weight:900;">{{ delConfirm.label || "—" }}</span>
              </div>
              <div class="muted small" style="margin-top:8px">Cette action est définitive.</div>
            </div>

            <div class="mact">
              <button class="btn ghost" :disabled="delBusy[delConfirm.variantFormuleId]" @click="closeDeleteConfirm()">Annuler</button>
              <button
                class="btn"
                style="border-color:#fecaca;background:#fff5f5;color:#7f1d1d;font-weight:950"
                :disabled="delBusy[delConfirm.variantFormuleId] || importBusy || importDraft.ready"
                @click="deleteFormule(delConfirm.variantFormuleId)"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>

        <!-- ✅ MODAL GENERALISATION -->
        <SectionGeneralizeModal
          v-model="genOpen"
          section-label="Formules"
          :source-variant-id="String(store.activeVariantId ?? '') || null"
          @apply="onApplyGeneralize"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
/* ✅ Style calqué sur TransportPage (variables + head sticky + boutons) */
.page{
  --text:#0f172a;
  --muted: rgba(15,23,42,0.62);
  --b: rgba(16,24,40,0.12);
  --soft: rgba(15,23,42,0.04);

  display:flex;
  flex-direction:column;
  gap:10px;
  padding: 0 10px 14px;
}
.page, .page *{ box-sizing: border-box; }
.muted{ color: var(--muted); }
.small{ font-size: 11px; }
.mono{ font-variant-numeric: tabular-nums; }
.r{ text-align:right; }
.dot{ color: rgba(148,163,184,1); font-weight: 900; }
.ell{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }

/* Header */
.head{
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fff;
  padding: 10px 0 6px;
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:10px;
  border-bottom: 1px solid rgba(226,232,240,.65);
}
.hleft{ display:flex; flex-direction:column; gap:2px; }
.h1{ font-weight: 950; font-size: 14px; color: var(--text); }
.actions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

/* Buttons */
.btn{
  border: 1px solid var(--b);
  background: #fff;
  padding: 8px 10px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
  font-size: 12px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  color: var(--text);
}
.btn:hover{ background: rgba(15,23,42,0.03); }
.btn:disabled{ opacity:.55; cursor:not-allowed; }
.btn.primary{
  border-color: rgba(15,23,42,0.85);
  background: rgba(15,23,42,0.92);
  color:#fff;
}
.btn.primary:hover{ filter: brightness(1.05); }
.btn.ghost{ background: rgba(15,23,42,0.03); }

/* Alerts */
.alert{
  border: 1px solid var(--b);
  background: #fff;
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 12px;
}
.alert.info{ background: rgba(15,23,42,0.03); }
.alert.err{ border-color:#fecaca; background:#fff5f5; color:#7f1d1d; }

/* Cards */
.card{
  border: 1px solid rgba(226,232,240,0.85);
  background:#fff;
  border-radius: 16px;
  overflow:hidden;
}
.mutedCard{
  padding: 14px;
  color: var(--muted);
  font-weight: 900;
}
.empty{
  padding: 16px;
}
.emptyTitle{
  font-weight: 950;
  color: var(--text);
  margin-bottom: 4px;
}
.cards{ display:flex; flex-direction:column; gap:8px; }

/* Formule row head */
.rowHead{
  width:100%;
  border:0;
  background:#fff;
  cursor:pointer;
  padding:10px 12px;
  display:flex;
  gap:10px;
  justify-content:space-between;
  align-items:center;
  text-align:left;
}
.rowHead:hover{ background: rgba(15,23,42,0.02); }
.left{ display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto; overflow:hidden; }
.chev{ color: var(--muted); width:16px; display:inline-block; flex:0 0 auto; }
.name{ font-weight: 950; font-size: 12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 520px; }
.chip{
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.03);
  font-weight: 950;
  flex:0 0 auto;
}
.sub{ font-size: 10.5px; color: var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 180px; }
.right{ display:flex; gap:8px; align-items:center; justify-content:flex-end; flex:0 0 auto; }

.iconDanger{
  border:1px solid #fee2e2;
  background:#fff;
  color:#b91c1c;
  width:32px;
  height:30px;
  border-radius: 12px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size: 14px;
}
.iconDanger:hover{ background:#fff5f5; }
.iconDanger:disabled{ opacity:.55; cursor:not-allowed; }

.cmpBox{
  display:inline-flex;
  align-items:baseline;
  gap:6px;
  padding: 4px 10px;
  border-radius: 999px;
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.03);
}
.cmpLbl{ font-size:10px; color: var(--muted); font-weight: 900; }
.cmpVal{ font-size:12px; font-weight:950; color: var(--text); }

.pills{ display:inline-flex; gap:6px; align-items:center; }
.pill{
  font-size:10px;
  padding: 2px 8px;
  border-radius: 999px;
  border:1px solid rgba(226,232,240,0.9);
  background:#fff;
  font-weight: 900;
}
.pill-ok{ border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
.pill-warn{ border-color:#fde68a; background:#fffbeb; color:#92400e; }
.pill-bad{ border-color:#fecaca; background:#fff5f5; color:#7f1d1d; }

.rowBody{ padding: 12px; border-top: 1px solid rgba(226,232,240,0.7); }
.grid{ display:grid; grid-template-columns: 1.5fr 1fr; gap:10px; }
@media (max-width: 980px){ .grid{ grid-template-columns:1fr; } }

.box{
  border:1px solid rgba(226,232,240,0.8);
  background: rgba(15,23,42,0.02);
  border-radius: 14px;
  padding: 10px;
}
.boxTitle{ font-weight: 950; font-size: 12px; margin-bottom: 8px; color: var(--text); }

.miniErr{
  border:1px solid #fecaca;
  background:#fff5f5;
  color:#7f1d1d;
  border-radius:12px;
  padding:8px 10px;
  font-size: 11px;
  margin-bottom: 8px;
}
.miniChip{
  display:inline-flex;
  align-items:center;
  padding:2px 6px;
  border-radius:999px;
  border:1px solid #fecaca;
  background:#fff;
  margin-left:6px;
  font-size:10px;
  font-weight:900;
}

.table{ display:flex; flex-direction:column; gap:6px; }
.thead, .trow{ display:grid; grid-template-columns: 1.4fr 0.8fr 0.6fr 0.7fr 0.7fr; gap:8px; align-items:center; }
.thead{ font-size:10px; color: var(--muted); font-weight: 900; padding: 0 2px 4px; }
.trow{
  background:#fff;
  border:1px solid rgba(226,232,240,0.9);
  border-radius:12px;
  padding: 8px 8px;
  font-size: 11.5px;
}
.mp{ display:flex; flex-direction:column; gap:1px; min-width:0; }
.mpName{ font-weight:950; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mpSub{ font-size:10px; }

.kpis{ display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
.kpi{
  border:1px solid rgba(226,232,240,0.9);
  border-radius:14px;
  background:#fff;
  padding: 8px 10px;
}
.kpi .v{ font-size: 12px; margin-top:2px; color: var(--text); }
.okTxt{ color:#166534; font-weight: 950; }
.warnTxt{ color:#92400e; font-weight: 950; }
.badTxt{ color:#7f1d1d; font-weight: 950; }

/* Overlay & Modal (z-index haut + underDash sous HeaderDashboard) */
.overlay{
  position:fixed;
  inset:0;
  background: rgba(0,0,0,.28);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 18px;
  z-index: 99999;
}
.overlay.underDash{ align-items:flex-start; padding-top: 82px; }

.modal{
  width: min(920px, 96vw);
  max-height: 82vh;
  overflow:auto;
  background:#fff;
  border-radius: 18px;
  border:1px solid rgba(226,232,240,0.95);
  box-shadow: 0 25px 50px rgba(0,0,0,.15);
}
.modal.confirm{ width: min(620px, 96vw); }

.mhead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(226,232,240,0.8);
  position: sticky;
  top: 0;
  background:#fff;
  z-index:2;
}
.mtitle{ font-weight: 950; font-size: 13px; color: var(--text); }
.x{
  border:1px solid var(--b);
  background:#fff;
  width: 34px;
  height: 32px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 950;
  font-size: 18px;
  line-height: 1;
}
.x:hover{ background: rgba(15,23,42,0.03); }

.mbody{ padding: 12px 14px; }
.mact{
  border-top: 1px solid rgba(226,232,240,0.8);
  padding: 12px 14px;
  display:flex;
  justify-content:flex-end;
  gap:8px;
  position: sticky;
  bottom:0;
  background:#fff;
}
.in{
  width:100%;
  border:1px solid rgba(226,232,240,0.95);
  border-radius: 12px;
  padding: 10px 12px;
  outline:none;
  font-size: 12px;
}
.in:focus{ border-color: rgba(15,23,42,0.55); box-shadow: 0 0 0 3px rgba(15,23,42,.10); }

.list{ margin-top: 10px; display:flex; flex-direction:column; gap:8px; }
.item{
  border:1px solid rgba(226,232,240,0.9);
  border-radius: 14px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.item:hover{ background: rgba(15,23,42,0.02); }
.item.disabled{ opacity:.6; }
.ileft{ display:flex; flex-direction:column; gap:3px; min-width:0; }
.ititle{ display:flex; align-items:center; gap:8px; min-width:0; }
.iname{ font-weight: 950; font-size: 12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 560px; }
.iright{ display:flex; align-items:center; gap:8px; flex:0 0 auto; }
.tag{
  font-size:10px;
  padding:2px 7px;
  border-radius: 999px;
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.03);
  color: var(--muted);
  font-weight: 900;
}

.rowBetween{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.btns{ display:flex; gap:8px; }
.check{ display:flex; align-items:center; gap:8px; user-select:none; }
.check input{ width: 16px; height: 16px; }

.section{ margin-top: 12px; }
.sectionTitle{ font-weight: 950; font-size: 12px; color: var(--text); margin-bottom: 8px; }
.copyGrid{ display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
@media (max-width: 820px){ .copyGrid{ grid-template-columns:1fr; } }
.radio{
  display:flex;
  gap:8px;
  align-items:flex-start;
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.02);
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 900;
  color: var(--text);
}
.radio input{ margin-top:2px; }

.tree{ border:1px solid rgba(226,232,240,0.9); border-radius: 14px; background: rgba(15,23,42,0.02); padding: 10px; }
.treeRow{
  width:100%;
  text-align:left;
  border:1px solid rgba(226,232,240,0.9);
  background:#fff;
  border-radius: 12px;
  padding: 9px 10px;
  display:flex;
  gap:10px;
  align-items:center;
  cursor:pointer;
}
.treeRow + .treeRow{ margin-top: 8px; }
.treeRow:hover{ background: rgba(15,23,42,0.02); }
.subRow{ opacity:.96; font-size: 11.5px; font-weight: 950; }
.varRow{ font-size: 11.25px; font-weight: 900; opacity:.98; }
.varRow.active{ border-color: rgba(15,23,42,.22); box-shadow: 0 0 0 3px rgba(15,23,42,.10); }

.caret{
  width: 18px;
  display:inline-flex;
  justify-content:center;
  color: var(--muted);
  transform: rotate(-90deg);
  transition: transform .12s ease;
  flex: 0 0 auto;
}
.caret.on{ transform: rotate(0deg); }

.tTitle{ flex:1; min-width:0; }
.dotVar{ width: 10px; height: 10px; border-radius: 999px; background: #cbd5e1; border: 1px solid rgba(226,232,240,0.9); flex:0 0 auto; }
.dotVar.ok{ background: #22c55e; border-color: #bbf7d0; }
.dotLeg{ display:inline-block; width: 10px; height: 10px; border-radius: 999px; background: #cbd5e1; border: 1px solid rgba(226,232,240,0.9); transform: translateY(1px); }
.dotLeg.ok{ background: #22c55e; border-color: #bbf7d0; }

.statusPill{
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.03);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 900;
  color: var(--muted);
  white-space:nowrap;
  flex:0 0 auto;
}

.confirmText{ white-space: pre-line; font-size: 12px; font-weight: 950; color: var(--text); line-height: 1.35; }
.ic{ width: 14px; height: 14px; }
</style>
