<!-- ✅ src/pages/MajorationPage.vue (FICHIER COMPLET / UI-UX harmonisé charte app + lisibilité + responsive + sans dégrader la logique) -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

const store = usePnlStore();

/* =========================
   STORE / STATE
========================= */
const loading = ref(false);
const saving = ref(false);
const applyingReal = ref(false);
const error = ref<string | null>(null);

const variant = computed<any | null>(() => (store as any).activeVariant ?? null);
const activeContract = computed<any | null>(() => (store as any).activeContract ?? null);

const variantTitle = computed(() => String(variant.value?.title ?? "—"));
const variantId = computed(() => String(variant.value?.id ?? ""));

/* =========================
   MOMD imputation keys stored in majorations map
========================= */
const IMP_ENABLED_KEY = "momdImputation.enabled";
const IMP_PCT_KEY = "momdImputation.pct";

/* =========================
   ✅ GENERALISER
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeTo(variantIds: string[]) {
  const sourceId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceId) return;

  genErr.value = null;
  genBusy.value = true;

  try {
    for (const targetIdRaw of variantIds ?? []) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceId) continue;
      await (store as any).saveMajorations(targetId, { ...draft.map });
    }
    genOpen.value = false;
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation des majorations sur TOUTES les variantes ?"
      : `Confirmer la généralisation des majorations sur ${ids.length} variante(s) ?`;

  if (!window.confirm(msg)) return;
  await generalizeTo(ids);
}

/* =========================
   ✅ IMPORTER
========================= */
const impOpen = ref(false);
const impBusy = ref(false);
const impErr = ref<string | null>(null);

function safeParse(raw: any): Record<string, number> {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw as any;
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/** normalise pour comparer (case-insensitive + accents + espaces) */
function normLabel(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function findVariantById(variantId: string): any | null {
  const id = String(variantId ?? "").trim();
  if (!id) return null;

  for (const p of (store as any).pnls ?? []) {
    for (const c of (p as any)?.contracts ?? []) {
      for (const v of c?.variants ?? []) {
        if (String(v?.id ?? "") === id) return v;
      }
    }
  }
  return null;
}

/**
 * Remap "autresCoutsItem:<id>" (source) -> "autresCoutsLabel:<normLabel>" (stable)
 * + garde les autres clés intactes.
 */
function remapMajorationsForImport(sourceVariant: any, imported: Record<string, number>) {
  const out: Record<string, number> = {};
  const srcItems = ((sourceVariant?.autresCouts?.items ?? []) as any[]) || [];
  const srcIdToNorm: Record<string, string> = {};

  for (const it of srcItems) {
    const id = String(it?.id ?? "").trim();
    const nl = normLabel(it?.label);
    if (id && nl) srcIdToNorm[id] = nl;
  }

  for (const [k, v] of Object.entries(imported ?? {})) {
    const m = /^autresCoutsItem:(.+)$/.exec(k);
    if (m?.[1]) {
      const id = String(m[1]).trim();
      const nl = srcIdToNorm[id];
      if (nl) out[`autresCoutsLabel:${nl}`] = Number(v);
      else out[k] = Number(v);
    } else {
      out[k] = Number(v);
    }
  }

  return out;
}

async function onApplyImport(payload: { sourceVariantId: string }) {
  if (!variant.value?.id) return;

  const sourceId = String(payload?.sourceVariantId ?? "").trim();
  if (!sourceId) return;

  if (String(variant.value.id) === sourceId) {
    impErr.value = "La source est déjà la variante active.";
    impOpen.value = false;
    return;
  }

  impErr.value = null;
  impBusy.value = true;

  try {
    let src = findVariantById(sourceId);
    if (!src) {
      await (store as any).loadPnls?.();
      src = findVariantById(sourceId);
    }
    if (!src) {
      impErr.value = "Variante source introuvable (données non chargées).";
      return;
    }

    const imported = safeParse(src?.autresCouts?.majorations);
    const remapped = remapMajorationsForImport(src, imported);

    draft.map = { ...remapped };
    (store as any).clearHeaderMajorationsPreview?.();
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   DRAFT MAJORATIONS
========================= */
const draft = reactive<{ map: Record<string, number> }>({ map: {} });

function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(v: any): number {
  const x = n(v);
  return Math.max(-100, Math.min(1000, x));
}

function pctOf(key: string): number {
  const direct = n(draft.map[key]);
  if (direct !== 0) return direct;

  const m = /^autresCoutsLabel:(.+)$/.exec(String(key ?? ""));
  if (m?.[1] && variant.value?.autresCouts?.items) {
    const items = ((variant.value.autresCouts.items ?? []) as any[]) || [];
    const found = items.find((it: any) => normLabel(it?.label) === String(m[1]));
    const id = String(found?.id ?? "").trim();
    if (id) return n(draft.map[`autresCoutsItem:${id}`]);
  }

  return 0;
}

function setPct(key: string, v: any) {
  draft.map[key] = clampPct(v);
}

/* =========================
   Imputation controls (stored in draft.map)
========================= */
const impEnabled = computed<boolean>({
  get: () => n(draft.map[IMP_ENABLED_KEY]) >= 0.5,
  set: (v) => {
    draft.map[IMP_ENABLED_KEY] = v ? 1 : 0;
  },
});

const impPct = computed<number>({
  get: () => Math.max(0, Math.min(100, n(draft.map[IMP_PCT_KEY]))),
  set: (v) => {
    draft.map[IMP_PCT_KEY] = Math.max(0, Math.min(100, n(v)));
  },
});

function rebuildDraft() {
  const v = variant.value;
  const persisted = safeParse(v?.autresCouts?.majorations);

  draft.map = {
    [IMP_ENABLED_KEY]: n((persisted as any)?.[IMP_ENABLED_KEY]) >= 0.5 ? 1 : 0,
    [IMP_PCT_KEY]: Math.max(0, Math.min(100, n((persisted as any)?.[IMP_PCT_KEY]))),
    ...persisted,
  };

  (store as any).clearHeaderMajorationsPreview?.();
  previewOn.value = false;
  genErr.value = null;
  impErr.value = null;
}

onMounted(async () => {
  if ((store as any).pnls?.length === 0) {
    loading.value = true;
    await (store as any).loadPnls?.();
    loading.value = false;
  }
  rebuildDraft();
});

watch(() => variant.value?.id, () => rebuildDraft());

onBeforeUnmount(() => {
  (store as any).clearHeaderMajorationsPreview?.();
});

/* =========================
   PREVIEW (Header KPIs)
========================= */
const previewOn = ref(false);

watch(
  () => variant.value?.id,
  () => {
    previewOn.value = false;
  }
);

watch(
  () => draft.map,
  () => {
    if (!previewOn.value) return;
    (store as any).setHeaderMajorationsPreview?.({ ...draft.map });
  },
  { deep: true }
);

function applyPreview() {
  previewOn.value = true;
  (store as any).setHeaderMajorationsPreview?.({ ...draft.map });
}

async function save() {
  if (!variant.value?.id) return;

  saving.value = true;
  error.value = null;

  try {
    await (store as any).saveMajorations(String(variant.value.id), { ...draft.map });
    (store as any).clearHeaderMajorationsPreview?.();
    previewOn.value = false;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

/* =========================
   ✅ Refresh active variant (after apply real)
========================= */
async function refreshActiveVariant(variantId: string) {
  try {
    const s: any = store as any;
    if (typeof s.loadVariantById === "function") {
      const v = await s.loadVariantById(variantId);
      if (v?.id && typeof s.replaceActiveVariantInState === "function") s.replaceActiveVariantInState(v);
      return;
    }
  } catch {}

  try {
    await (store as any).loadPnls?.();
    const v = findVariantById(variantId);
    if (v?.id && typeof (store as any).replaceActiveVariantInState === "function") {
      (store as any).replaceActiveVariantInState(v);
    }
  } catch {}
}

/* =========================
   ✅ Custom confirmation modal for apply real
========================= */
const confirmOpen = ref(false);
const confirmBusy = ref(false);
const confirmErr = ref<string | null>(null);
const confirmAddMomdM3 = ref(0);

function openConfirmApplyReal(addMomd: number) {
  confirmAddMomdM3.value = Math.max(0, n(addMomd));
  confirmErr.value = null;
  confirmOpen.value = true;
}

/* =========================
   APPLY REAL
========================= */
const dureeMois = computed<number>(() => Number(activeContract.value?.dureeMois ?? 0));

const baseVariantNoMaj = computed<any | null>(() => {
  const v = variant.value;
  if (!v) return null;
  return {
    ...v,
    autresCouts: { ...(v?.autresCouts ?? {}), majorations: null },
  };
});

function previewMapNoImputation() {
  const m: Record<string, number> = { ...(draft.map ?? {}) };
  m[IMP_ENABLED_KEY] = 0;
  m[IMP_PCT_KEY] = 0;
  return m;
}

const kBase = computed<any | null>(() => {
  if (!baseVariantNoMaj.value) return null;
  return computeHeaderKpis(baseVariantNoMaj.value, dureeMois.value, null, null, false);
});

const kMajNoImp = computed<any | null>(() => {
  if (!variant.value) return null;
  return computeHeaderKpis(variant.value, dureeMois.value, previewMapNoImputation(), null, false);
});

const kMajWithImp = computed<any | null>(() => {
  if (!variant.value) return null;
  return computeHeaderKpis(variant.value, dureeMois.value, { ...(draft.map ?? {}) }, null, false);
});

function perM3(total: number, vol: number) {
  const v = n(vol);
  return v > 0 ? total / v : 0;
}

const impactSummary = computed(() => {
  const b = kBase.value;
  const a = kMajNoImp.value;
  const i = kMajWithImp.value;
  const vol = n(b?.volumeTotalM3 ?? a?.volumeTotalM3 ?? i?.volumeTotalM3);

  if (!b || !a || !i || vol <= 0) {
    return {
      vol,
      dpvNoImp: 0,
      dpvImp: 0,
      debitNoImp: 0,
      debitImp: 0,
      addMomdM3: 0,
      surcoutNoImp: 0,
      surcoutImp: 0,
      fgNoImp: 0,
      fgImp: 0,
    };
  }

  const dpvNoImp = n(a.prixMoyenM3) - n(b.prixMoyenM3);
  const dpvImp = n(i.prixMoyenM3) - n(b.prixMoyenM3);

  const debitNoImp = perM3(n(a.ebitTotal) - n(b.ebitTotal), vol);
  const debitImp = perM3(n(i.ebitTotal) - n(b.ebitTotal), vol);

  const addMomdM3 = n(i.momdMoyenM3) - n(a.momdMoyenM3);

  const dTransportNoImp = n(a.transportMoyenM3) - n(b.transportMoyenM3);
  const dCmpNoImp = n(a.coutMpMoyenM3) - n(b.coutMpMoyenM3);
  const dProdNoImp = perM3(n(a.productionTotal) - n(b.productionTotal), vol);
  const dFgNoImp = perM3(n(a.fraisGenerauxTotal) - n(b.fraisGenerauxTotal), vol);
  const surcoutNoImp = dTransportNoImp + dCmpNoImp + dProdNoImp + dFgNoImp;

  const dTransportImp = n(i.transportMoyenM3) - n(b.transportMoyenM3);
  const dCmpImp = n(i.coutMpMoyenM3) - n(b.coutMpMoyenM3);
  const dProdImp = perM3(n(i.productionTotal) - n(b.productionTotal), vol);
  const dFgImp = perM3(n(i.fraisGenerauxTotal) - n(b.fraisGenerauxTotal), vol);
  const surcoutImp = dTransportImp + dCmpImp + dProdImp + dFgImp;

  return { vol, dpvNoImp, dpvImp, debitNoImp, debitImp, addMomdM3, surcoutNoImp, surcoutImp, fgNoImp: dFgNoImp, fgImp: dFgImp };
});

async function confirmApplyRealNow() {
  if (!variant.value?.id) return;

  const variantId = String(variant.value.id);
  const addMomdM3 = confirmAddMomdM3.value;

  confirmBusy.value = true;
  confirmErr.value = null;
  applyingReal.value = true;

  try {
    const fn = (store as any).applyMajorationsReal;
    if (typeof fn !== "function") throw new Error("applyMajorationsReal non disponible dans le store.");

    await fn.call(store, variantId, addMomdM3);

    (store as any).clearHeaderMajorationsPreview?.();
    previewOn.value = false;

    await refreshActiveVariant(variantId);
    rebuildDraft();

    confirmOpen.value = false;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    confirmErr.value = msg;
    error.value = msg;
  } finally {
    confirmBusy.value = false;
    applyingReal.value = false;
  }
}

function applyReal() {
  const a = kMajNoImp.value;
  const i = kMajWithImp.value;
  const rawDelta = impEnabled.value && a && i ? Number(i.momdMoyenM3) - Number(a.momdMoyenM3) : 0;
  const addMomdM3 = Number.isFinite(rawDelta) ? Math.max(0, rawDelta) : 0;
  openConfirmApplyReal(addMomdM3);
}

function resetAll() {
  draft.map = { [IMP_ENABLED_KEY]: 0, [IMP_PCT_KEY]: 0 };
  (store as any).setHeaderMajorationsPreview?.({});
  previewOn.value = true;
}

/* =========================
   ✅ BEFORE/AFTER per row
========================= */
function applyPct(val: number, pct: number) {
  const v = n(val);
  const p = n(pct);
  return v * (1 + p / 100);
}

function baseValueOfKey(key: string): number {
  const v = variant.value;
  if (!v) return 0;

  if (key.startsWith("mp:")) {
    const mpId = key.slice(3);
    const it = (v?.mp?.items ?? []).find((x: any) => String(x?.mpId) === String(mpId));
    if (!it) return 0;
    if (it?.prix != null) return n(it.prix);
    return n(it?.mp?.prix);
  }

  if (key === "transport.prixMoyen") return n(v?.transport?.prixMoyen);

  if (key.startsWith("cab.")) {
    const f = key.split(".")[1];
    if (!f) return 0;
    return n((v?.cab as any)?.[f]);
  }

  if (key.startsWith("coutM3.")) {
    const f = key.split(".")[1];
    if (!f) return 0;
    return n((v?.coutM3 as any)?.[f]);
  }

  if (key.startsWith("coutMensuel.")) {
    const f = key.split(".")[1];
    if (!f) return 0;
    return n((v?.coutMensuel as any)?.[f]);
  }

  if (key.startsWith("maintenance.")) {
    const f = key.split(".")[1];
    if (!f) return 0;
    return n((v?.maintenance as any)?.[f]);
  }

  if (key.startsWith("employes.")) {
    const k = key.split(".")[1];
    if (!k) return 0;

    const map: Record<string, string> = {
      responsable: "responsableCout",
      centralistes: "centralistesCout",
      manoeuvre: "manoeuvreCout",
      coordinateurExploitation: "coordinateurExploitationCout",
      technicienLabo: "technicienLaboCout",
      femmeMenage: "femmeMenageCout",
      gardien: "gardienCout",
      maintenancier: "maintenancierCout",
      panierRepas: "panierRepasCout",
    };

    const f = map[k];
    if (!f) return 0;
    return n((v?.employes as any)?.[f]);
  }

  if (key.startsWith("coutOccasionnel.")) {
    const f = key.split(".")[1];
    if (!f) return 0;
    return n((v?.coutOccasionnel as any)?.[f]);
  }

  if (key.startsWith("autresCoutsLabel:")) {
    const nl = key.slice("autresCoutsLabel:".length);
    const it = (v?.autresCouts?.items ?? []).find((x: any) => normLabel(x?.label) === nl);
    return n(it?.valeur);
  }

  return 0;
}

function afterValueOfKey(key: string): number {
  const base = baseValueOfKey(key);
  const pct = pctOf(key);
  return applyPct(base, pct);
}

function shouldShowRow(r: { key: string; label: string }): boolean {
  const base = baseValueOfKey(r.key);
  const pct = pctOf(r.key);
  return n(base) !== 0 || n(pct) !== 0;
}

/* =========================
   GROUPS
========================= */
type Row = { key: string; label: string; hint?: string };
type Group = { title: string; rows: Row[] };

const groupsAll = computed<Group[]>(() => {
  const v = variant.value;
  if (!v) return [];

  const res: Group[] = [];

  const mpRows: Row[] = (v?.mp?.items ?? []).map((x: any) => ({
    key: `mp:${x.mpId}`,
    label: x?.mp?.label ?? "MP",
    hint: "DH/tonne",
  }));
  if (mpRows.length) res.push({ title: "Matières premières (MP)", rows: mpRows });

  res.push({
    title: "Transport",
    rows: [{ key: "transport.prixMoyen", label: "Transport moyen (DH/m³)" }],
  });

  res.push({
    title: "CAB",
    rows: [{ key: "cab.amortMois", label: "Amortissement mensuel (DH/mois)" }],
  });

  res.push({
    title: "Coûts par m³",
    rows: [
      { key: "coutM3.eau", label: "Eau" },
      { key: "coutM3.qualite", label: "Qualité" },
      { key: "coutM3.dechets", label: "Déchets" },
    ],
  });

  res.push({
    title: "Maintenance",
    rows: [
      { key: "maintenance.elec", label: "Électricité" },
      { key: "maintenance.chargeur", label: "Chargeur" },
      { key: "maintenance.cab", label: "CAB" },
      { key: "maintenance.generale", label: "Générale" },
      { key: "maintenance.bassins", label: "Bassins" },
      { key: "maintenance.preventive", label: "Préventive" },
    ],
  });

  res.push({
    title: "Coûts mensuels",
    rows: [
      { key: "coutMensuel.electricite", label: "Électricité" },
      { key: "coutMensuel.gasoil", label: "Gasoil" },
      { key: "coutMensuel.location", label: "Location" },
      { key: "coutMensuel.securite", label: "Sécurité" },
      { key: "coutMensuel.hebergements", label: "Hébergements" },
      { key: "coutMensuel.locationTerrain", label: "Location terrain" },
      { key: "coutMensuel.telephone", label: "Téléphone" },
      { key: "coutMensuel.troisG", label: "3G" },
      { key: "coutMensuel.taxeProfessionnelle", label: "Taxe professionnelle" },
      { key: "coutMensuel.locationVehicule", label: "Location véhicule" },
      { key: "coutMensuel.locationAmbulance", label: "Location ambulance" },
      { key: "coutMensuel.locationBungalows", label: "Location bungalows" },
      { key: "coutMensuel.epi", label: "EPI" },
    ],
  });

  res.push({
    title: "Employés (coût unitaire)",
    rows: [
      { key: "employes.responsable", label: "Responsable" },
      { key: "employes.centralistes", label: "Centralistes" },
      { key: "employes.manoeuvre", label: "Manœuvre" },
      { key: "employes.coordinateurExploitation", label: "Coordinateur exploitation" },
      { key: "employes.technicienLabo", label: "Technicien labo" },
      { key: "employes.femmeMenage", label: "Femme de ménage" },
      { key: "employes.gardien", label: "Gardien" },
      { key: "employes.maintenancier", label: "Maintenancier" },
      { key: "employes.panierRepas", label: "Panier repas" },
    ],
  });

  res.push({
    title: "Coûts occasionnels",
    rows: [
      { key: "coutOccasionnel.genieCivil", label: "Génie civil" },
      { key: "coutOccasionnel.installation", label: "Installation" },
      { key: "coutOccasionnel.transport", label: "Transport" },
      { key: "coutOccasionnel.demontage", label: "Démontage" },
      { key: "coutOccasionnel.remisePointCentrale", label: "Remise à point centrale" },
      { key: "coutOccasionnel.silots", label: "Silots" },
      { key: "coutOccasionnel.localAdjuvant", label: "Local adjuvant" },
      { key: "coutOccasionnel.bungalows", label: "Bungalows" },
    ],
  });

  const autresRows: Row[] = (v?.autresCouts?.items ?? [])
    .filter((x: any) => !String(x?.unite ?? "").includes("POURCENT"))
    .map((x: any) => ({
      key: `autresCoutsLabel:${normLabel(x.label)}`,
      label: x.label,
    }));
  if (autresRows.length) res.push({ title: "Autres coûts", rows: autresRows });

  return res;
});

const groups = computed<Group[]>(() => {
  return groupsAll.value
    .map((g) => ({ ...g, rows: g.rows.filter((r) => shouldShowRow(r)) }))
    .filter((g) => g.rows.length > 0);
});

/* =========================
   UX: search + hideZero + collapse
========================= */
const q = ref("");
const hideZero = ref(false);

type SimpleRow = { key: string; label: string };
const counts = computed(() => {
  const all = groups.value.reduce((s, g) => s + g.rows.length, 0);
  const nonZero = groups.value.reduce((s, g) => s + g.rows.filter((r) => pctOf(r.key) !== 0).length, 0);
  return { all, nonZero };
});
const effectiveHideZero = computed(() => (hideZero.value && counts.value.nonZero > 0 ? true : false));

function rowMatch(r: SimpleRow) {
  const query = String(q.value ?? "").trim().toLowerCase();
  if (!query) return true;
  return r.label.toLowerCase().includes(query) || r.key.toLowerCase().includes(query);
}

const filteredGroups = computed<Group[]>(() => {
  return groups.value
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => rowMatch(r) && (!effectiveHideZero.value || pctOf(r.key) !== 0)),
    }))
    .filter((g) => g.rows.length > 0);
});

const visibleCount = computed(() => filteredGroups.value.reduce((s, g) => s + g.rows.length, 0));

const open = reactive<Record<string, boolean>>({});
watch(
  () => groups.value.map((g) => g.title).join("|"),
  () => {
    for (const g of groups.value) if (typeof open[g.title] !== "boolean") open[g.title] = true;
  },
  { immediate: true }
);

function toggle(title: string) {
  open[title] = !open[title];
}
function openAll() {
  for (const g of groups.value) open[g.title] = true;
}
function closeAll() {
  for (const g of groups.value) open[g.title] = false;
}

/* =========================
   TABS
========================= */
type TabKey = "SAISIE" | "IMPACTS" | "PAR";
const tab = ref<TabKey>("SAISIE");

/* =========================
   Per-majoration impacts (only non-zero)
========================= */
type ImpactRow = {
  key: string;
  label: string;
  pct: number;
  dpvNoImp: number;
  dpvImp: number;
  debitNoImp: number;
  debitImp: number;
  surcoutNoImp: number;
  surcoutImp: number;
};

const nonZeroRows = computed<SimpleRow[]>(() => {
  const out: SimpleRow[] = [];
  for (const g of groups.value) {
    for (const r of g.rows) {
      const p = pctOf(r.key);
      if (p !== 0) out.push(r);
    }
  }
  return out;
});

function computeOneMap(key: string, pct: number, withImp: boolean): Record<string, number> {
  const m: Record<string, number> = {};
  m[key] = pct;
  m[IMP_ENABLED_KEY] = withImp && impEnabled.value ? 1 : 0;
  m[IMP_PCT_KEY] = withImp && impEnabled.value ? impPct.value : 0;
  return m;
}

const impactsByRow = computed<ImpactRow[]>(() => {
  const b = kBase.value;
  const v = variant.value;
  if (!b || !v) return [];

  const vol = n(b.volumeTotalM3);
  if (vol <= 0) return [];

  const rows = nonZeroRows.value;
  if (!rows.length) return [];

  const cap = 120;
  const slice = rows.slice(0, cap);

  return slice.map((r) => {
    const pct = pctOf(r.key);

    const kNoImp = computeHeaderKpis(v, dureeMois.value, computeOneMap(r.key, pct, false), null, false);
    const kImp = computeHeaderKpis(v, dureeMois.value, computeOneMap(r.key, pct, true), null, false);

    const dTransportNo = n(kNoImp.transportMoyenM3) - n(b.transportMoyenM3);
    const dCmpNo = n(kNoImp.coutMpMoyenM3) - n(b.coutMpMoyenM3);
    const dProdNo = perM3(n(kNoImp.productionTotal) - n(b.productionTotal), vol);
    const dFgNo = perM3(n(kNoImp.fraisGenerauxTotal) - n(b.fraisGenerauxTotal), vol);
    const surcoutNoImp = dTransportNo + dCmpNo + dProdNo + dFgNo;

    const dTransportImp = n(kImp.transportMoyenM3) - n(b.transportMoyenM3);
    const dCmpImp = n(kImp.coutMpMoyenM3) - n(b.coutMpMoyenM3);
    const dProdImp = perM3(n(kImp.productionTotal) - n(b.productionTotal), vol);
    const dFgImp = perM3(n(kImp.fraisGenerauxTotal) - n(b.fraisGenerauxTotal), vol);
    const surcoutImp = dTransportImp + dCmpImp + dProdImp + dFgImp;

    return {
      key: r.key,
      label: r.label,
      pct,
      dpvNoImp: n(kNoImp.prixMoyenM3) - n(b.prixMoyenM3),
      dpvImp: n(kImp.prixMoyenM3) - n(b.prixMoyenM3),
      debitNoImp: perM3(n(kNoImp.ebitTotal) - n(b.ebitTotal), vol),
      debitImp: perM3(n(kImp.ebitTotal) - n(b.ebitTotal), vol),
      surcoutNoImp,
      surcoutImp,
    };
  });
});
</script>

<template>
  <div class="page">
    <!-- Header (compact, charte app) -->
    <div class="card head">
      <div class="hLeft">
        <div class="titleLine">
          <div class="title">Majorations</div>

          <span v-if="previewOn" class="pill info">
            <span class="dot" aria-hidden="true"></span>
            Preview activé
          </span>
        </div>

        <div class="subline">
          <span class="muted">Variante</span>
          <b class="ell">{{ variantTitle }}</b>
          <span class="sep">•</span>
          <span class="muted">ID</span>
          <b class="mono">{{ variantId || "—" }}</b>
        </div>

        <div class="hintLine">
          <span class="hintChip">Appliquer = preview KPIs (Header)</span>
          <span class="hintChip">Enregistrer = persisté</span>
          <span class="hintChip warn">Appliquer réellement = écrit DB + remet % à 0</span>
        </div>
      </div>

      <div class="hRight">
        <div class="tabs">
          <button class="tab" :class="{ on: tab === 'SAISIE' }" type="button" @click="tab = 'SAISIE'">Saisie</button>
          <button class="tab" :class="{ on: tab === 'IMPACTS' }" type="button" @click="tab = 'IMPACTS'">Impacts</button>
          <button class="tab" :class="{ on: tab === 'PAR' }" type="button" @click="tab = 'PAR'">Par majoration</button>
        </div>
      </div>
    </div>

    <!-- Sticky actions -->
    <div class="card bar">
      <div class="acts">
        <button class="btn ghost" type="button" @click="resetAll" :disabled="saving || loading || genBusy || impBusy">
          Réinit
        </button>

        <button class="btn" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="impOpen = true">
          {{ impBusy ? "..." : "Importer" }}
        </button>

        <button class="btn" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="genOpen = true">
          {{ genBusy ? "..." : "Généraliser" }}
        </button>

        <div class="sepV"></div>

        <button class="btn pri" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="applyPreview">
          Appliquer
        </button>

        <button
          class="btn warn"
          type="button"
          :disabled="!variant?.id || applyingReal || saving || loading || genBusy || impBusy"
          @click="applyReal"
          title="Écrit les majorations dans la variante puis remet majorations=0"
        >
          {{ applyingReal ? "..." : "Appliquer réellement" }}
        </button>

        <button class="btn ok" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="save">
          {{ saving ? "..." : "Enregistrer" }}
        </button>

        <div class="rightMeta">
          <span class="miniChip">{{ visibleCount }}/{{ counts.all }}</span>
          <span class="miniChip ok" v-if="counts.nonZero">{{ counts.nonZero }} non-zéro</span>
        </div>
      </div>
    </div>

    <!-- status -->
    <div v-if="!variant" class="alert info">Aucune variante active. Sélectionne une variante puis reviens ici.</div>
    <div v-if="error" class="alert err">{{ error }}</div>
    <div v-if="impErr" class="alert err">{{ impErr }}</div>
    <div v-if="genErr" class="alert err">{{ genErr }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- =========================
         TAB: IMPACTS
    ========================== -->
    <div v-if="variant && !loading && tab === 'IMPACTS'" class="grid2">
      <div class="card">
        <div class="cardT">Imputation sur MOMD</div>
        <div class="cardSub">Compense la baisse EBIT via une hausse MOMD (impacte aussi les frais généraux).</div>

        <div class="row">
          <button class="toggle" type="button" :class="{ on: impEnabled }" @click="impEnabled = !impEnabled">
            <span class="dot2" /> Activée
          </button>

          <div class="slider">
            <input class="rng" type="range" min="0" max="100" step="1" v-model.number="impPct" :disabled="!impEnabled" />
            <div class="rngVal mono">{{ impPct }}%</div>
          </div>
        </div>

        <div class="mini">
          <div class="kv"><span class="k">MOMD ajoutée</span><span class="v mono">{{ impactSummary.addMomdM3.toFixed(2) }} DH/m³</span></div>
          <div class="kv"><span class="k">Volume</span><span class="v mono">{{ impactSummary.vol.toFixed(2) }} m³</span></div>
        </div>
      </div>

      <div class="card">
        <div class="cardT">Impact global (moyenne / m³)</div>
        <div class="cardSub">Différences vs base (sans majorations).</div>

        <div class="miniGrid">
          <div class="pill">
            <div class="pT">Δ PV/m³ (sans imp.)</div>
            <div class="pV mono">{{ impactSummary.dpvNoImp.toFixed(2) }}</div>
          </div>
          <div class="pill">
            <div class="pT">Δ PV/m³ (avec imp.)</div>
            <div class="pV mono">{{ impactSummary.dpvImp.toFixed(2) }}</div>
          </div>
          <div class="pill bad">
            <div class="pT">Δ EBIT/m³ (sans imp.)</div>
            <div class="pV mono">{{ impactSummary.debitNoImp.toFixed(2) }}</div>
          </div>
          <div class="pill" :class="impEnabled ? 'ok' : 'mut'">
            <div class="pT">Δ EBIT/m³ (avec imp.)</div>
            <div class="pV mono">{{ impactSummary.debitImp.toFixed(2) }}</div>
          </div>

          <div class="pill">
            <div class="pT">Surcoût/m³ (sans imp.)</div>
            <div class="pV mono">{{ impactSummary.surcoutNoImp.toFixed(2) }}</div>
            <div class="pS">dont FG: {{ impactSummary.fgNoImp.toFixed(2) }}</div>
          </div>
          <div class="pill" :class="impEnabled ? 'ok' : 'mut'">
            <div class="pT">Surcoût/m³ (avec imp.)</div>
            <div class="pV mono">{{ impactSummary.surcoutImp.toFixed(2) }}</div>
            <div class="pS">dont FG: {{ impactSummary.fgImp.toFixed(2) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- =========================
         TAB: SAISIE
    ========================== -->
    <div v-if="variant && !loading && tab === 'SAISIE'" class="card filters">
      <div class="search">
        <input v-model="q" class="searchIn" type="text" placeholder="Recherche (libellé / clé)…" />
        <button v-if="q" class="x" type="button" @click="q = ''" title="Effacer">✕</button>
      </div>

      <button class="toggle" type="button" :class="{ on: hideZero }" @click="hideZero = !hideZero" :disabled="counts.nonZero === 0">
        <span class="dot2" /> Masquer 0
      </button>

      <div class="chips">
        <span class="chip">{{ visibleCount }}/{{ counts.all }}</span>
        <span class="chip ok" v-if="counts.nonZero">{{ counts.nonZero }} non-zéro</span>
        <span class="sep">•</span>
        <button class="link" type="button" @click="openAll">Ouvrir</button>
        <button class="link" type="button" @click="closeAll">Fermer</button>
      </div>
    </div>

    <div v-if="variant && !loading && tab === 'SAISIE'" class="stack">
      <section v-for="g in filteredGroups" :key="g.title" class="sec">
        <button class="secHead" type="button" @click="toggle(g.title)">
          <div class="secLeft">
            <span class="bullet" />
            <span class="secTitle">{{ g.title }}</span>
            <span class="count">{{ g.rows.length }}</span>
          </div>
          <span class="chev" :class="{ open: open[g.title] }">▾</span>
        </button>

        <div v-show="open[g.title]" class="secBody">
          <div class="grid">
            <div v-for="r in g.rows" :key="r.key" class="field">
              <div class="lbl">
                <div class="lblTop" :title="r.label">{{ r.label }}</div>
                <div class="lblSub">
                  <span class="b">Base</span>
                  <span class="v mono">{{ baseValueOfKey(r.key).toFixed(2) }}</span>
                  <span class="sep2">→</span>
                  <span class="b">Après</span>
                  <span class="v mono">{{ afterValueOfKey(r.key).toFixed(2) }}</span>
                </div>
              </div>

              <div class="inWrap">
                <input
                  class="in mono"
                  type="number"
                  inputmode="decimal"
                  step="0.1"
                  min="-100"
                  max="1000"
                  :value="pctOf(r.key)"
                  @input="setPct(r.key, ($event.target as HTMLInputElement).value)"
                />
                <span class="suf">%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div v-if="!filteredGroups.length && variant" class="empty">
        Aucun résultat (recherche / masquer 0).
        <div v-if="hideZero && counts.nonZero === 0" class="emptyHint">
          Toutes les majorations sont à 0 : “Masquer 0” ne peut rien afficher.
        </div>
      </div>

      <div class="foot">Quitter la page sans enregistrer annule le preview.</div>
    </div>

    <!-- =========================
         TAB: PAR MAJORATION
    ========================== -->
    <div v-if="variant && !loading && tab === 'PAR'" class="card impactBox">
      <div class="impactHead">
        <div>
          <div class="impactT">Impact par majoration (Δ vs base)</div>
          <div class="impactS">Top {{ Math.min(nonZeroRows.length, 120) }} lignes non-zéro • Δ PV/m³ • Surcoût/m³ • Δ EBIT/m³</div>
        </div>

        <div class="miniHint">
          <span class="miniChip">{{ nonZeroRows.length }} non-zéro</span>
          <span class="miniChip" v-if="impEnabled">imputation: {{ impPct }}%</span>
        </div>
      </div>

      <div v-if="!impactsByRow.length" class="empty">Aucune majoration non-zéro.</div>

      <div v-else class="impactGrid">
        <div v-for="r in impactsByRow" :key="r.key" class="impactRow">
          <div class="iLbl" :title="r.key">
            <div class="iName">{{ r.label }}</div>
            <div class="iKey mono">{{ r.key }}</div>
          </div>

          <div class="iPct mono">{{ r.pct.toFixed(1) }}%</div>

          <div class="iCell">
            <div class="iT">Δ PV/m³</div>
            <div class="iV mono">{{ r.dpvNoImp.toFixed(2) }}</div>
            <div class="iS" v-if="impEnabled">avec imp: {{ r.dpvImp.toFixed(2) }}</div>
          </div>

          <div class="iCell">
            <div class="iT">Surcoût/m³</div>
            <div class="iV mono">{{ r.surcoutNoImp.toFixed(2) }}</div>
            <div class="iS" v-if="impEnabled">avec imp: {{ r.surcoutImp.toFixed(2) }}</div>
          </div>

          <div class="iCell bad">
            <div class="iT">Δ EBIT/m³</div>
            <div class="iV mono">{{ r.debitNoImp.toFixed(2) }}</div>
            <div class="iS" v-if="impEnabled">avec imp: {{ r.debitImp.toFixed(2) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ✅ Import / Generaliser -->
    <SectionImportModal v-model="impOpen" sectionLabel="Majorations" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />
    <SectionTargetsGeneralizeModal v-model="genOpen" sectionLabel="Majorations" :sourceVariantId="variant?.id ?? null" @apply="onApplyGeneralize" />

    <!-- ✅ Confirm modal (apply real) -->
    <div v-if="confirmOpen" class="modalOverlay" @click.self="confirmOpen = false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Appliquer réellement">
        <div class="mHead">
          <div class="mT">Appliquer réellement</div>
          <button class="mX" type="button" @click="confirmOpen = false">✕</button>
        </div>

        <div class="mBody">
          <div class="mTxt">
            <div>Les valeurs seront écrites dans la variante (MP/transport/coûts…).</div>
            <div v-if="confirmAddMomdM3 > 0" class="mHi">
              MOMD sera augmentée de <b>+{{ confirmAddMomdM3.toFixed(2) }} DH/m³</b> (imputation).
            </div>
            <div>Ensuite : majorations + imputation seront remises à 0.</div>
          </div>

          <div v-if="confirmErr" class="alert err" style="margin-top: 10px">{{ confirmErr }}</div>
        </div>

        <div class="mFoot">
          <button class="btn ghost" type="button" @click="confirmOpen = false" :disabled="confirmBusy">Annuler</button>
          <button class="btn warn" type="button" @click="confirmApplyRealNow" :disabled="confirmBusy">
            {{ confirmBusy ? "..." : "Confirmer" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ✅ Charte proche de DevisPage */
.page {
  --navy: #184070;
  --cyan: #20b8e8;
  --green: #90c028;

  --border: rgba(16, 24, 40, 0.12);
  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.6);

  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 10px 12px;
}

.muted {
  color: #6b7280;
  font-size: 12px;
}
.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.ell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sep {
  color: #9ca3af;
}

/* Header */
.head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.hLeft {
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.titleLine {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title {
  font-size: 15px;
  font-weight: 1000;
  color: #111827;
}
.subline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11.5px;
}
.hintLine {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.hintChip {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.7);
}
.hintChip.warn {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 4px 10px;
  font-weight: 1000;
  font-size: 11px;
  border: 1px solid rgba(2, 132, 199, 0.25);
  background: rgba(2, 132, 199, 0.08);
  color: rgba(2, 132, 199, 1);
}
.pill .dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(2, 132, 199, 1);
  display: inline-block;
}

.hRight {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex: 0 0 auto;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tab {
  height: 34px;
  border-radius: 999px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 1000;
  font-size: 12px;
  cursor: pointer;
  color: rgba(15, 23, 42, 0.75);
}
.tab:hover {
  background: rgba(15, 23, 42, 0.04);
}
.tab.on {
  background: rgba(24, 64, 112, 0.1);
  border-color: rgba(24, 64, 112, 0.28);
  color: rgba(24, 64, 112, 1);
}

/* Sticky bar */
.bar {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
}
.acts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.sepV {
  width: 1px;
  height: 22px;
  background: rgba(16, 24, 40, 0.12);
  border-radius: 999px;
  margin: 0 2px;
}
.rightMeta {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  height: 34px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid rgba(16, 24, 40, 0.14);
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}
.btn:hover {
  background: #f9fafb;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn.ghost {
  background: #fff;
}
.btn.pri {
  border-color: rgba(24, 64, 112, 0.2);
  background: rgba(24, 64, 112, 0.1);
  color: var(--navy);
}
.btn.ok {
  border-color: rgba(144, 192, 40, 0.25);
  background: rgba(144, 192, 40, 0.18);
  color: #2d5a00;
}
.btn.warn {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}

/* Alerts */
.alert {
  border-radius: 14px;
  padding: 8px 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.02);
  font-weight: 900;
  font-size: 12px;
}
.alert.err {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
  color: #b91c1c;
}
.alert.info {
  background: rgba(2, 132, 199, 0.08);
  border-color: rgba(2, 132, 199, 0.18);
}

/* IMPACTS layout */
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 980px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
.cardT {
  font-weight: 1000;
  color: var(--navy);
  font-size: 13px;
}
.cardSub {
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.slider {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 240px;
  min-width: 220px;
}
.rng {
  width: 100%;
}
.rngVal {
  min-width: 56px;
  text-align: right;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.75);
}

.toggle {
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.14);
  background: rgba(15, 23, 42, 0.03);
  padding: 0 10px;
  font-weight: 1000;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.dot2 {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid rgba(15, 23, 42, 0.35);
}
.toggle.on {
  border-color: rgba(24, 64, 112, 0.28);
  background: rgba(24, 64, 112, 0.1);
}
.toggle.on .dot2 {
  border-color: rgba(24, 64, 112, 0.65);
  background: rgba(24, 64, 112, 0.25);
}

.mini {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  font-weight: 950;
}
.kv .k {
  color: rgba(15, 23, 42, 0.6);
}
.kv .v {
  color: rgba(15, 23, 42, 0.9);
}

.miniGrid {
  margin-top: 10px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}
.pillBox,
.pill {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 10px;
}
.pill.bad {
  border-color: rgba(239, 68, 68, 0.18);
  background: rgba(239, 68, 68, 0.06);
}
.pill.ok {
  border-color: rgba(144, 192, 40, 0.22);
  background: rgba(144, 192, 40, 0.12);
}
.pill.mut {
  opacity: 0.75;
}
.pT {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.65);
}
.pV {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.95);
}
.pS {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}

/* Filters */
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.search {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(16, 24, 40, 0.14);
  background: #fff;
  border-radius: 12px;
  padding: 0 10px;
  min-width: 240px;
  flex: 1 1 240px;
}
.searchIn {
  border: 0;
  outline: none;
  background: transparent;
  width: 100%;
  font-weight: 900;
  font-size: 12.5px;
  color: var(--text);
}
.x {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.55);
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.chip,
.miniChip {
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.65);
}
.miniChip.ok,
.chip.ok {
  background: rgba(144, 192, 40, 0.16);
  border-color: rgba(144, 192, 40, 0.22);
  color: #2d5a00;
}
.sep {
  color: rgba(15, 23, 42, 0.35);
}
.link {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--navy);
  font-weight: 1000;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Stack / Sections */
.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec {
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: #fff;
  overflow: hidden;
}
.secHead {
  width: 100%;
  border: 0;
  background: rgba(15, 23, 42, 0.02);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.secLeft {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bullet {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgba(24, 64, 112, 0.85);
  box-shadow: 0 0 0 3px rgba(24, 64, 112, 0.12);
}
.secTitle {
  font-weight: 1000;
  font-size: 13px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70vw;
}
.count {
  font-size: 11px;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.55);
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(16, 24, 40, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
}
.chev {
  font-size: 16px;
  color: rgba(15, 23, 42, 0.55);
  transition: transform 0.15s ease;
}
.chev.open {
  transform: rotate(180deg);
}
.secBody {
  padding: 10px 12px 12px 12px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
@media (max-width: 540px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.field {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.lbl {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lblTop {
  font-size: 12.5px;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lblSub {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.lblSub .b {
  color: rgba(15, 23, 42, 0.6);
  font-weight: 950;
}
.lblSub .v {
  color: rgba(15, 23, 42, 0.9);
}
.sep2 {
  opacity: 0.5;
}

.inWrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.in {
  width: 92px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(24, 64, 112, 0.28);
  background: rgba(24, 64, 112, 0.08);
  text-align: right;
  font-weight: 1000;
  outline: none;
  padding: 0 10px;
}
.in:focus {
  box-shadow: 0 0 0 4px rgba(24, 64, 112, 0.14);
  border-color: rgba(24, 64, 112, 0.5);
}
.suf {
  font-size: 12px;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.55);
}

.empty {
  border: 1px dashed rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 16px;
  padding: 14px 12px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  text-align: center;
}
.emptyHint {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}
.foot {
  font-size: 11px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.55);
  text-align: center;
  padding: 6px 0;
}

/* PAR tab */
.impactBox {
  padding: 10px 12px;
}
.impactHead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.impactT {
  font-weight: 1000;
  color: var(--navy);
  font-size: 13px;
}
.impactS {
  font-size: 11.5px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}
.miniHint {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.impactGrid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.impactRow {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 10px;
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  gap: 10px;
  align-items: center;
}
@media (max-width: 980px) {
  .impactRow {
    grid-template-columns: 1fr auto;
    grid-auto-rows: auto;
  }
}
.iLbl {
  min-width: 0;
}
.iName {
  font-weight: 1000;
  font-size: 12.5px;
  color: rgba(15, 23, 42, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.iKey {
  font-size: 10.5px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.iPct {
  font-weight: 1000;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.75);
}
.iCell {
  border-left: 1px dashed rgba(16, 24, 40, 0.16);
  padding-left: 10px;
}
.iCell.bad {
  border-left-color: rgba(239, 68, 68, 0.22);
}
.iT {
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}
.iV {
  font-size: 12.5px;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.95);
}
.iS {
  font-size: 10.5px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}

/* Modal */
.modalOverlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(2, 6, 23, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.modal {
  width: min(540px, 100%);
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(2, 6, 23, 0.35);
  overflow: hidden;
}
.mHead {
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.95);
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mT {
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.92);
}
.mX {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 1000;
  color: rgba(15, 23, 42, 0.55);
}
.mBody {
  padding: 12px;
}
.mTxt {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.75);
  font-size: 12px;
}
.mHi {
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}
.mFoot {
  padding: 10px 12px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
