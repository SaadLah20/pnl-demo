<!-- ✅ src/pages/MajorationPage.vue (FICHIER COMPLET / UI/UX harmonisé + infos actions dé-dupliquées)
     Changements demandés :
     ✅ Supprimer du header les lignes qui “augmentent” la page :
        - Appliquer = preview KPIs (Header)
        - Enregistrer = persisté
        - Appliquer réellement = écrit DB + remet % à 0
     ✅ Ces infos existent en double -> on garde UNIQUEMENT la version à côté de “Masquer 0”
     ✅ Remplacer window.confirm (généralisation) par un vrai modal (comme autres pages)
-->
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

/* =========================
   MOMD imputation keys stored in majorations map
========================= */
const IMP_ENABLED_KEY = "momdImputation.enabled";
const IMP_PCT_KEY = "momdImputation.pct";

/* =========================
   ✅ MODAL CONFIRM/INFO (pour généralisation, cohérent avec autres pages)
========================= */
const uiModal = reactive({
  open: false,
  title: "",
  message: "",
  mode: "confirm" as "confirm" | "info",
  busy: false,
  onConfirm: null as null | (() => void | Promise<void>),
});

function openConfirm(title: string, message: string, onConfirm: () => void | Promise<void>) {
  uiModal.open = true;
  uiModal.title = title;
  uiModal.message = message;
  uiModal.mode = "confirm";
  uiModal.onConfirm = onConfirm;
}
function openInfo(title: string, message: string) {
  uiModal.open = true;
  uiModal.title = title;
  uiModal.message = message;
  uiModal.mode = "info";
  uiModal.onConfirm = null;
}
function closeUiModal() {
  if (uiModal.busy) return;
  uiModal.open = false;
  uiModal.title = "";
  uiModal.message = "";
  uiModal.onConfirm = null;
  uiModal.mode = "confirm";
  uiModal.busy = false;
}

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

  openConfirm("Généraliser — Majorations", msg, async () => {
    uiModal.busy = true;
    try {
      await generalizeTo(ids);
      closeUiModal();
    } catch (e: any) {
      // genErr est déjà alimenté dans generalizeTo, mais on garde la sécurité
      genErr.value = genErr.value ?? (e?.message ?? String(e));
      openInfo("Erreur", String(genErr.value));
    } finally {
      uiModal.busy = false;
    }
  });
}

/* =========================
   ✅ IMPORTER (modal habituel)
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
    return { vol, dpvNoImp: 0, dpvImp: 0, debitNoImp: 0, debitImp: 0, addMomdM3: 0, surcoutNoImp: 0, surcoutImp: 0, fgNoImp: 0, fgImp: 0 };
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
   ✅ BEFORE/AFTER per row (instant)
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

  res.push({ title: "Transport", rows: [{ key: "transport.prixMoyen", label: "Transport moyen (DH/m³)" }] });

  res.push({ title: "CAB", rows: [{ key: "cab.amortMois", label: "Amortissement mensuel (DH/mois)" }] });

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
    .map((x: any) => ({ key: `autresCoutsLabel:${normLabel(x.label)}`, label: x.label }));
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

/* =========================
   ✅ UI helper (unique place for action explanations)
========================= */
const helpOpen = ref(false);
</script>

<template>
  <div class="maj">
    <!-- Title (compact, sans les lignes doublées) -->
    <div class="head">
      <div class="h1">Majorations</div>
      <div class="sub">Saisie en % sur les postes majorables. Utilise <b>Impacts</b> pour visualiser ΔPV/ΔEBIT.</div>
    </div>

    <!-- Sticky actions only -->
    <div class="bar">
      <div class="acts">
        <button class="btn ghost" type="button" @click="resetAll" :disabled="saving || loading || genBusy || impBusy">
          Réinit
        </button>

        <button class="btn pri" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="impOpen = true">
          {{ impBusy ? "..." : "Importer" }}
        </button>

        <button class="btn pri" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="genOpen = true">
          {{ genBusy ? "..." : "Généraliser" }}
        </button>

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
      </div>
    </div>

    <!-- status -->
    <div v-if="!variant" class="alert info">Aucune variante active. Sélectionne une variante puis reviens ici.</div>
    <div v-if="error" class="alert err">{{ error }}</div>
    <div v-if="impErr" class="alert err">{{ impErr }}</div>
    <div v-if="genErr" class="alert err">{{ genErr }}</div>
    <div v-if="loading" class="alert">Chargement…</div>

    <!-- Tabs -->
    <div v-if="variant && !loading" class="tabs">
      <button class="tab" :class="{ on: tab === 'SAISIE' }" type="button" @click="tab = 'SAISIE'">Saisie</button>
      <button class="tab" :class="{ on: tab === 'IMPACTS' }" type="button" @click="tab = 'IMPACTS'">Impacts</button>
      <button class="tab" :class="{ on: tab === 'PAR' }" type="button" @click="tab = 'PAR'">Par majoration</button>
    </div>

    <!-- =========================
         TAB: IMPACTS (compact)
    ========================== -->
    <div v-if="variant && !loading && tab === 'IMPACTS'" class="topCards">
      <div class="card">
        <div class="cardT">Imputation sur MOMD</div>
        <div class="cardSub">Compense la baisse EBIT via une hausse MOMD (impacte aussi frais généraux).</div>

        <div class="row">
          <button class="toggle" type="button" :class="{ on: impEnabled }" @click="impEnabled = !impEnabled">
            <span class="dot" /> Activée
          </button>

          <div class="slider">
            <input class="rng" type="range" min="0" max="100" step="1" v-model.number="impPct" :disabled="!impEnabled" />
            <div class="rngVal">{{ impPct }}%</div>
          </div>
        </div>

        <div class="mini">
          <div class="kv"><span class="k">MOMD ajoutée</span><span class="v">{{ impactSummary.addMomdM3.toFixed(2) }} DH/m³</span></div>
          <div class="kv"><span class="k">Volume</span><span class="v">{{ impactSummary.vol.toFixed(2) }} m³</span></div>
        </div>
      </div>

      <div class="card">
        <div class="cardT">Impact global (moyenne / m³)</div>
        <div class="cardSub">Différences vs base (sans majorations).</div>

        <div class="miniGrid">
          <div class="pill">
            <div class="pT">Δ PV/m³ (sans imputation)</div>
            <div class="pV">{{ impactSummary.dpvNoImp.toFixed(2) }}</div>
          </div>
          <div class="pill">
            <div class="pT">Δ PV/m³ (avec imputation)</div>
            <div class="pV">{{ impactSummary.dpvImp.toFixed(2) }}</div>
          </div>
          <div class="pill bad">
            <div class="pT">Δ EBIT/m³ (sans imputation)</div>
            <div class="pV">{{ impactSummary.debitNoImp.toFixed(2) }}</div>
          </div>
          <div class="pill" :class="impEnabled ? 'ok' : 'mut'">
            <div class="pT">Δ EBIT/m³ (avec imputation)</div>
            <div class="pV">{{ impactSummary.debitImp.toFixed(2) }}</div>
          </div>

          <div class="pill">
            <div class="pT">Surcoût/m³ (sans imp.)</div>
            <div class="pV">{{ impactSummary.surcoutNoImp.toFixed(2) }}</div>
            <div class="pS">dont FG: {{ impactSummary.fgNoImp.toFixed(2) }}</div>
          </div>
          <div class="pill" :class="impEnabled ? 'ok' : 'mut'">
            <div class="pT">Surcoût/m³ (avec imp.)</div>
            <div class="pV">{{ impactSummary.surcoutImp.toFixed(2) }}</div>
            <div class="pS">dont FG: {{ impactSummary.fgImp.toFixed(2) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- =========================
         TAB: SAISIE (inputs + before/after + filters)
         ✅ Les infos actions (Appliquer/Enregistrer/Appliquer réellement) ne sont gardées qu'ici.
    ========================== -->
    <div v-if="variant && !loading && tab === 'SAISIE'" class="filters">
      <div class="search">
        <input v-model="q" class="searchIn" type="text" placeholder="Recherche (libellé)…" />
        <button v-if="q" class="x" type="button" @click="q = ''" title="Effacer">✕</button>
      </div>

      <button class="toggle" type="button" :class="{ on: hideZero }" @click="hideZero = !hideZero">
        <span class="dot" /> Masquer 0
      </button>

      <!-- ✅ UNIQUE bloc d'info (plus de duplication dans le header) -->
      <div class="help">
        <button class="helpBtn" type="button" @click="helpOpen = !helpOpen" :class="{ on: helpOpen }" title="Aide actions">
          i
        </button>
        <div class="helpTxt" v-show="helpOpen">
          <b>Appliquer</b> = preview KPIs (Header) <span class="sep3">•</span>
          <b>Enregistrer</b> = persisté <span class="sep3">•</span>
          <b>Appliquer réellement</b> = écrit DB + remet % à 0
        </div>
      </div>

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
                  <span class="b">Base:</span>
                  <span class="v mono">{{ baseValueOfKey(r.key).toFixed(2) }}</span>
                  <span class="sep2">→</span>
                  <span class="b">Après:</span>
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
    <div v-if="variant && !loading && tab === 'PAR'" class="impactBox">
      <div class="impactHead">
        <div class="impactT">Impact par majoration (Δ vs base)</div>
        <div class="impactS">Top {{ Math.min(nonZeroRows.length, 120) }} lignes non-zéro • Δ PV/m³ • Surcoût/m³ • Δ EBIT/m³</div>
      </div>

      <div v-if="!impactsByRow.length" class="empty">Aucune majoration non-zéro.</div>

      <div v-else class="impactGrid">
        <div v-for="r in impactsByRow" :key="r.key" class="impactRow">
          <div class="iLbl" :title="r.key">
            <div class="iName">{{ r.label }}</div>
            <div class="iKey">{{ r.key }}</div>
          </div>
          <div class="iPct">{{ r.pct.toFixed(1) }}%</div>

          <div class="iCell">
            <div class="iT">Δ PV/m³</div>
            <div class="iV">{{ r.dpvNoImp.toFixed(2) }}</div>
            <div class="iS" v-if="impEnabled">avec imp: {{ r.dpvImp.toFixed(2) }}</div>
          </div>

          <div class="iCell">
            <div class="iT">Surcoût/m³</div>
            <div class="iV">{{ r.surcoutNoImp.toFixed(2) }}</div>
            <div class="iS" v-if="impEnabled">avec imp: {{ r.surcoutImp.toFixed(2) }}</div>
          </div>

          <div class="iCell bad">
            <div class="iT">Δ EBIT/m³</div>
            <div class="iV">{{ r.debitNoImp.toFixed(2) }}</div>
            <div class="iS" v-if="impEnabled">avec imp: {{ r.debitImp.toFixed(2) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ✅ Import / Generaliser -->
    <SectionImportModal v-model="impOpen" sectionLabel="Majorations" :targetVariantId="variant?.id ?? null" @apply="onApplyImport" />
    <SectionTargetsGeneralizeModal v-model="genOpen" sectionLabel="Majorations" :sourceVariantId="variant?.id ?? null" @apply="onApplyGeneralize" />

    <!-- ✅ Modal confirm/info (pour généralisation) -->
    <teleport to="body">
      <div v-if="uiModal.open" class="ovl" role="dialog" aria-modal="true" @mousedown.self="closeUiModal()">
        <div class="dlg">
          <div class="dlgHdr">
            <div class="dlgTtl">{{ uiModal.title }}</div>
            <button class="xbtn" type="button" @click="closeUiModal()" aria-label="Fermer">✕</button>
          </div>

          <div class="dlgBody">
            <div class="dlgMsg">{{ uiModal.message }}</div>
          </div>

          <div class="dlgFtr">
            <button class="btn2 ghost" type="button" @click="closeUiModal()" :disabled="uiModal.busy">Annuler</button>
            <button
              v-if="uiModal.mode === 'confirm'"
              class="btn2 pri"
              type="button"
              @click="uiModal.onConfirm && uiModal.onConfirm()"
              :disabled="uiModal.busy"
            >
              {{ uiModal.busy ? "..." : "Confirmer" }}
            </button>
            <button v-else class="btn2 pri" type="button" @click="closeUiModal()">OK</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ✅ Confirm modal (apply real) -->
    <div v-if="confirmOpen" class="modalOverlay" @click.self="confirmOpen = false">
      <div class="modal">
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

          <div v-if="confirmErr" class="alert err">{{ confirmErr }}</div>
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
.maj {
  --navy: #184070;
  --cyan: #20b8e8;
  --green: #90c028;

  --panel: #f7f8fb;
  --border: rgba(16, 24, 40, 0.1);
  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.6);

  padding: 10px;
  color: var(--text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.bar {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 8px 10px;
}

.h1 {
  font-weight: 950;
  color: var(--navy);
  font-size: 15px;
  line-height: 1.05;
}
.sub {
  font-size: 11px;
  font-weight: 850;
  color: var(--muted);
}

.acts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.btn {
  height: 32px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  cursor: pointer;
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

.alert {
  border-radius: 14px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 850;
  font-size: 12px;
  margin-top: 8px;
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

/* Tabs */
.tabs {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tab {
  height: 32px;
  border-radius: 999px;
  padding: 0 12px;
  border: 1px solid var(--border);
  background: #fff;
  font-weight: 950;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.7);
  cursor: pointer;
}
.tab.on {
  border-color: rgba(32, 184, 232, 0.35);
  background: rgba(32, 184, 232, 0.12);
  color: rgba(15, 23, 42, 0.95);
}

/* Impact cards */
.topCards {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.card {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 16px;
  padding: 10px;
}
.cardT {
  font-weight: 950;
  color: var(--navy);
  font-size: 12.5px;
}
.cardSub {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
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
  min-width: 52px;
  text-align: right;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.75);
}
.mini {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  font-weight: 900;
}
.kv .k {
  color: rgba(15, 23, 42, 0.6);
}
.kv .v {
  color: rgba(15, 23, 42, 0.9);
}
.miniGrid {
  margin-top: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}
.pill {
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 8px;
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
  font-weight: 900;
  color: rgba(15, 23, 42, 0.65);
}
.pV {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.95);
  font-variant-numeric: tabular-nums;
}
.pS {
  margin-top: 1px;
  font-size: 11px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.55);
}

/* Filters */
.filters {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
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
  font-size: 12px;
  color: var(--text);
}
.x {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}

.toggle {
  height: 32px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.03);
  padding: 0 10px;
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.toggle.on {
  border-color: rgba(32, 184, 232, 0.35);
  background: rgba(32, 184, 232, 0.12);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid rgba(15, 23, 42, 0.35);
}
.toggle.on .dot {
  border-color: rgba(32, 184, 232, 0.6);
  background: rgba(32, 184, 232, 0.25);
}

/* ✅ help next to Masquer 0 (unique info place) */
.help {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 280px;
  min-width: 220px;
}
.helpBtn {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(32, 184, 232, 0.35);
  background: rgba(32, 184, 232, 0.12);
  color: rgba(15, 23, 42, 0.85);
  font-weight: 950;
  cursor: pointer;
}
.helpBtn.on {
  border-color: rgba(32, 184, 232, 0.6);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.15);
}
.helpTxt {
  font-size: 11px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
  line-height: 1.2;
}
.sep3 {
  opacity: 0.5;
  margin: 0 6px;
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.65);
}
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
  font-weight: 950;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Stack / Sections */
.stack {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sec {
  border-radius: 16px;
  border: 1px solid var(--border);
  background: #fff;
  overflow: hidden;
}
.secHead {
  width: 100%;
  border: 0;
  background: var(--panel);
  padding: 10px;
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
  background: var(--cyan);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.12);
}
.secTitle {
  font-weight: 950;
  font-size: 13px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70vw;
}
.count {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid var(--border);
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
  padding: 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}
.grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
@media (max-width: 540px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.field {
  border: 1px solid rgba(16, 24, 40, 0.08);
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
  gap: 3px;
}
.lblTop {
  font-size: 12px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lblSub {
  font-size: 11px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.55);
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.lblSub .b {
  color: rgba(15, 23, 42, 0.6);
  font-weight: 900;
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
  width: 86px;
  height: 32px;
  border-radius: 12px;
  border: 1px solid rgba(32, 184, 232, 0.45);
  background: rgba(32, 184, 232, 0.12);
  text-align: right;
  font-weight: 950;
  outline: none;
  padding: 0 10px;
}
.in:focus {
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.18);
  border-color: rgba(32, 184, 232, 0.65);
}
.suf {
  font-size: 12px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}
.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.empty {
  border: 1px dashed rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 16px;
  padding: 14px 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.6);
  text-align: center;
}
.emptyHint {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
}
.foot {
  font-size: 11px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
  text-align: center;
}

/* Par majoration tab */
.impactBox {
  margin-top: 10px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 16px;
  padding: 10px;
}
.impactHead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.impactT {
  font-weight: 950;
  color: var(--navy);
  font-size: 12.5px;
}
.impactS {
  font-size: 11px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.55);
}
.impactGrid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.impactRow {
  border: 1px solid rgba(16, 24, 40, 0.08);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 14px;
  padding: 8px;
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 10px;
  align-items: center;
}
@media (max-width: 820px) {
  .impactRow {
    grid-template-columns: 1fr auto;
    grid-auto-rows: auto;
  }
}
.iLbl {
  min-width: 0;
}
.iName {
  font-weight: 950;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.iKey {
  font-size: 10.5px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.iPct {
  font-weight: 950;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.75);
  font-variant-numeric: tabular-nums;
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
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
}
.iV {
  font-size: 12.5px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.95);
  font-variant-numeric: tabular-nums;
}
.iS {
  font-size: 10.5px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.55);
}

/* ✅ Confirm modal (généralisation) - AU-DESSUS du SectionTargetsGeneralizeModal (z=110000) */
.ovl {
  position: fixed;
  inset: 0;
  z-index: 120000;
  background: rgba(2, 6, 23, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.dlg {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 18px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  box-shadow: 0 20px 50px rgba(2, 6, 23, 0.25);
  overflow: hidden;
}
.dlgHdr {
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.95);
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dlgTtl {
  font-weight: 950;
  color: rgba(15, 23, 42, 0.92);
}
.xbtn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}
.dlgBody {
  padding: 12px;
}
.dlgMsg {
  font-weight: 850;
  color: rgba(15, 23, 42, 0.8);
  line-height: 1.45;
  font-size: 12px;
}
.dlgFtr {
  padding: 10px 12px;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn2 {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  cursor: pointer;
}
.btn2.ghost {
  background: #fff;
}
.btn2.pri {
  background: rgba(24, 64, 112, 0.12);
  border-color: rgba(24, 64, 112, 0.22);
  color: var(--navy);
}

/* Confirm modal (apply real) - existant */
.modalOverlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(2, 6, 23, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.modal {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 18px;
  box-shadow: 0 20px 50px rgba(2, 6, 23, 0.25);
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
  font-weight: 950;
  color: rgba(15, 23, 42, 0.92);
}
.mX {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}
.mBody {
  padding: 12px;
}
.mTxt {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 850;
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
