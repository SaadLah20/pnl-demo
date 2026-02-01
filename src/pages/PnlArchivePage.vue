<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
  if ((store as any).formulesCatalogue?.length === 0 && (store as any).loadFormulesCatalogue) {
    await (store as any).loadFormulesCatalogue();
  }
});

/* =========================
   HELPERS
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function money(v: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(toNum(v));
}

/** garde uniquement les clés supportées par Prisma (présentes dans l'objet existant) */
function pickSupported(existing: any, draft: Record<string, any>, baseKeys: string[]) {
  const out: Record<string, any> = {};
  const ex = existing ?? null;

  for (const k of baseKeys) out[k] = toNum((draft as any)[k]);

  if (ex) {
    for (const k of Object.keys(draft)) {
      if (baseKeys.includes(k)) continue;
      if (k in ex) out[k] = toNum((draft as any)[k]);
    }
  }
  return out;
}

/* =========================
   ACTIVE
========================= */
const pnl = computed(() => store.activePnl);
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const contracts = computed<any[]>(() => pnl.value?.contracts ?? []);
const currentContractId = computed(() => contract.value?.id ?? null);
const variantsOfCurrentContract = computed<any[]>(() => contract.value?.variants ?? []);

/* =========================
   NAV (Pnl / Contract / Variant)
========================= */
function onChangePnl(pnlId: string) {
  store.setActivePnl(pnlId);
}

function onChangeContract(contractId: string) {
  const c = contracts.value.find((x) => x.id === contractId);
  const firstVar = c?.variants?.[0]?.id ?? null;
  if (firstVar) store.setActiveVariant(firstVar);
}

function onChangeVariant(variantId: string) {
  store.setActiveVariant(variantId);
}

/* =========================
   MP VARIANTE (read-only)
========================= */
type MpRow = {
  id: string;
  categorie: string;
  label: string;
  unite: string;
  fournisseur: string;
  prixCatalogue: number;
  prixVariante: number | null;
  prixUtilise: number;
};

const mpRows = computed<MpRow[]>(() => {
  const items = (variant.value as any)?.mp?.items ?? [];
  return items.map((it: any) => {
    const mp = it?.mp;
    const prixCatalogue = toNum(mp?.prix);
    const prixVariante = it?.prix == null ? null : toNum(it.prix);
    return {
      id: it.id,
      categorie: mp?.categorie ?? "",
      label: mp?.label ?? "",
      unite: mp?.unite ?? "",
      fournisseur: mp?.fournisseur ?? "",
      prixCatalogue,
      prixVariante,
      prixUtilise: prixVariante ?? prixCatalogue,
    };
  });
});

/* =========================
   TRANSPORT (editable)
========================= */
const transportPrixMoyen = ref<number>(0);

watch(
  () => (variant.value as any)?.transport?.prixMoyen,
  (v) => (transportPrixMoyen.value = toNum(v)),
  { immediate: true }
);

/* =========================
   FORMULES (editable: volume & momd)
========================= */
const formEdit = reactive<Record<string, { volumeM3: number; momd: number }>>({});
function fe(id: string) {
  const k = String(id);
  if (!formEdit[k]) formEdit[k] = { volumeM3: 0, momd: 0 };
  return formEdit[k];
}

const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

watch(
  () => formules.value.map((x: any) => ({ id: String(x.id), volumeM3: x.volumeM3, momd: x.momd })),
  (arr) => {
    for (const x of arr) {
      const e = fe(x.id);
      e.volumeM3 = toNum(x.volumeM3);
      e.momd = toNum(x.momd);
    }
  },
  { immediate: true }
);

const volumeTotal = computed(() =>
  (variant.value as any)?.formules?.items?.reduce((s: number, it: any) => s + toNum(fe(it.id).volumeM3), 0) ?? 0
);

const transportTotal = computed(() => toNum(transportPrixMoyen.value) * volumeTotal.value);

function mpPriceUsed(mpId: string): number {
  const vmp = ((variant.value as any)?.mp?.items ?? []).find((x: any) => x.mpId === mpId);
  if (!vmp) return 0;
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);
  return toNum(vmp?.mp?.prix);
}

type CompRow = { mpId: string; mpLabel: string; qty: number; prix: number; coutParM3: number };
function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty);
    const prix = mpPriceUsed(mpId);
    return { mpId, mpLabel: it?.mp?.label ?? "", qty, prix, coutParM3: (qty / 1000) * prix };
  });
}
function cmpParM3For(vf: any): number {
  return compositionFor(vf?.formule).reduce((s: number, x) => s + toNum(x.coutParM3), 0);
}

const formExpanded = reactive<Record<string, boolean>>({});
function toggleForm(id: string) {
  const k = String(id);
  formExpanded[k] = !formExpanded[k];
}

/* KPIs */
const cmpTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + cmpParM3For(vf) * toNum(fe(vf.id).volumeM3), 0));
const momdTotal = computed(() => formules.value.reduce((s: number, vf: any) => s + toNum(fe(vf.id).momd) * toNum(fe(vf.id).volumeM3), 0));
const cmpMoy = computed(() => (volumeTotal.value === 0 ? 0 : cmpTotal.value / volumeTotal.value));
const momdMoy = computed(() => (volumeTotal.value === 0 ? 0 : momdTotal.value / volumeTotal.value));

const pvParM3Moy = computed(() => {
  const vol = volumeTotal.value;
  if (vol === 0) return 0;
  const total = formules.value.reduce((s: number, vf: any) => {
    const volF = toNum(fe(vf.id).volumeM3);
    const pv = cmpParM3For(vf) + toNum(fe(vf.id).momd) + toNum(transportPrixMoyen.value);
    return s + pv * volF;
  }, 0);
  return total / vol;
});

const caTotal = computed(() => pvParM3Moy.value * volumeTotal.value);
const pctCmp = computed(() => (caTotal.value === 0 ? 0 : (cmpTotal.value / caTotal.value) * 100));
const pctMomd = computed(() => (caTotal.value === 0 ? 0 : (momdTotal.value / caTotal.value) * 100));

/* =========================
   COSTS EDIT (sections)
========================= */
const costEdit = reactive({
  coutM3: { eau: 0, qualite: 0, dechets: 0 },

  coutMensuel: {
    electricite: 0,
    locationGroupes: 0,
    gasoil: 0,
    hebergements: 0,
    locationTerrain: 0,
    telephone: 0,
    troisG: 0,
    taxeProfessionnelle: 0,
    securite: 0,
    locationVehicule: 0,
    locationAmbulance: 0,
    locationBungalows: 0,
    epi: 0,
    location: 0, // compat DB
  },

  coutOccasionnel: {
    genieCivil: 0,
    installationCab: 0,
    demontage: 0,
    remisePointCentrale: 0,
    transport: 0,
    silots: 0,
    localAdjuvant: 0,
    bungalows: 0,
    installation: 0, // compat DB
  },

  maintenance: { cab: 0, elec: 0, chargeur: 0, generale: 0, bassins: 0, preventive: 0 },

  employes: {
    responsableNb: 0,
    responsableCout: 0,
    centralistesNb: 0,
    centralistesCout: 0,

    manoeuvreNb: 0,
    manoeuvreCout: 0,
    coordinateurExploitationNb: 0,
    coordinateurExploitationCout: 0,
    technicienLaboNb: 0,
    technicienLaboCout: 0,
    femmeMenageNb: 0,
    femmeMenageCout: 0,
    gardienNb: 0,
    gardienCout: 0,
    maintenancierNb: 0,
    maintenancierCout: 0,
    panierRepasNb: 0,
    panierRepasCout: 0,
  },

  autresCouts: [] as Array<{ label: string; unite: string; valeur: number }>,
});

const amort_mois = ref<number>(0);

watch(
  () => variant.value,
  (v) => {
    const vv: any = v ?? {};
    costEdit.coutM3 = { eau: toNum(vv?.coutM3?.eau), qualite: toNum(vv?.coutM3?.qualite), dechets: toNum(vv?.coutM3?.dechets) };

    costEdit.coutMensuel = {
      electricite: toNum(vv?.coutMensuel?.electricite),
      gasoil: toNum(vv?.coutMensuel?.gasoil),
      securite: toNum(vv?.coutMensuel?.securite),
      location: toNum(vv?.coutMensuel?.location),
      locationGroupes: toNum(vv?.coutMensuel?.locationGroupes),
      hebergements: toNum(vv?.coutMensuel?.hebergements),
      locationTerrain: toNum(vv?.coutMensuel?.locationTerrain),
      telephone: toNum(vv?.coutMensuel?.telephone),
      troisG: toNum(vv?.coutMensuel?.troisG),
      taxeProfessionnelle: toNum(vv?.coutMensuel?.taxeProfessionnelle),
      locationVehicule: toNum(vv?.coutMensuel?.locationVehicule),
      locationAmbulance: toNum(vv?.coutMensuel?.locationAmbulance),
      locationBungalows: toNum(vv?.coutMensuel?.locationBungalows),
      epi: toNum(vv?.coutMensuel?.epi),
    };

    costEdit.coutOccasionnel = {
      genieCivil: toNum(vv?.coutOccasionnel?.genieCivil),
      transport: toNum(vv?.coutOccasionnel?.transport),
      installation: toNum(vv?.coutOccasionnel?.installation),
      installationCab: toNum(vv?.coutOccasionnel?.installationCab),
      demontage: toNum(vv?.coutOccasionnel?.demontage),
      remisePointCentrale: toNum(vv?.coutOccasionnel?.remisePointCentrale),
      silots: toNum(vv?.coutOccasionnel?.silots),
      localAdjuvant: toNum(vv?.coutOccasionnel?.localAdjuvant),
      bungalows: toNum(vv?.coutOccasionnel?.bungalows),
    };

    costEdit.maintenance = {
      cab: toNum(vv?.maintenance?.cab),
      elec: toNum(vv?.maintenance?.elec),
      chargeur: toNum(vv?.maintenance?.chargeur),
      generale: toNum(vv?.maintenance?.generale),
      bassins: toNum(vv?.maintenance?.bassins),
      preventive: toNum(vv?.maintenance?.preventive),
    };

    costEdit.employes = {
      responsableNb: toNum(vv?.employes?.responsableNb),
      responsableCout: toNum(vv?.employes?.responsableCout),
      centralistesNb: toNum(vv?.employes?.centralistesNb),
      centralistesCout: toNum(vv?.employes?.centralistesCout),

      manoeuvreNb: toNum(vv?.employes?.manoeuvreNb),
      manoeuvreCout: toNum(vv?.employes?.manoeuvreCout),
      coordinateurExploitationNb: toNum(vv?.employes?.coordinateurExploitationNb),
      coordinateurExploitationCout: toNum(vv?.employes?.coordinateurExploitationCout),
      technicienLaboNb: toNum(vv?.employes?.technicienLaboNb),
      technicienLaboCout: toNum(vv?.employes?.technicienLaboCout),
      femmeMenageNb: toNum(vv?.employes?.femmeMenageNb),
      femmeMenageCout: toNum(vv?.employes?.femmeMenageCout),
      gardienNb: toNum(vv?.employes?.gardienNb),
      gardienCout: toNum(vv?.employes?.gardienCout),
      maintenancierNb: toNum(vv?.employes?.maintenancierNb),
      maintenancierCout: toNum(vv?.employes?.maintenancierCout),
      panierRepasNb: toNum(vv?.employes?.panierRepasNb),
      panierRepasCout: toNum(vv?.employes?.panierRepasCout),
    };

    amort_mois.value = toNum(vv?.cab?.amortMois);

    const items = vv?.autresCouts?.items ?? [];
    costEdit.autresCouts = items.map((it: any) => ({
      label: String(it.label ?? ""),
      unite: String(it.unite ?? "FORFAIT"),
      valeur: toNum(it.valeur),
    }));
  },
  { immediate: true }
);

/* =========================
   SAVE HELPERS
========================= */
function buildTransportPayload(): any {
  const t: any = (variant.value as any)?.transport ?? {};
  return {
    category: t.category ?? "LOGISTIQUE_APPRO",
    type: t.type ?? "MOYENNE",
    prixMoyen: Number(transportPrixMoyen.value),
    volumePompePct: t.volumePompePct ?? null,
    prixAchatPompe: t.prixAchatPompe ?? null,
    prixVentePompe: t.prixVentePompe ?? null,
  };
}

function buildCabPayload(): any {
  const c: any = (variant.value as any)?.cab ?? {};
  return {
    category: c.category ?? "LOGISTIQUE_APPRO",
    etat: c.etat ?? "NEUVE",
    mode: c.mode ?? "ACHAT",
    capaciteM3: toNum(c.capaciteM3),
    amortMois: Number(amort_mois.value),
  };
}

function buildCoutM3Payload(): any {
  const s: any = (variant.value as any)?.coutM3 ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...costEdit.coutM3 };
}

function buildCoutMensuelPayload(): any {
  const existing: any = (variant.value as any)?.coutMensuel ?? null;
  const baseKeys = ["electricite", "gasoil", "location", "securite"];
  const data = pickSupported(existing, costEdit.coutMensuel as any, baseKeys);

  if (!existing || !("locationGroupes" in (existing ?? {}))) {
    if (toNum((costEdit.coutMensuel as any).locationGroupes) !== 0) {
      data.location = toNum((costEdit.coutMensuel as any).locationGroupes);
    }
  }

  const s: any = existing ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...data };
}

function buildCoutOccPayload(): any {
  const existing: any = (variant.value as any)?.coutOccasionnel ?? null;
  const baseKeys = ["genieCivil", "installation", "transport"];
  const data = pickSupported(existing, costEdit.coutOccasionnel as any, baseKeys);

  if (!existing || !("installationCab" in (existing ?? {}))) {
    if (toNum((costEdit.coutOccasionnel as any).installationCab) !== 0) {
      data.installation = toNum((costEdit.coutOccasionnel as any).installationCab);
    }
  }

  const s: any = existing ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...data };
}

function buildMaintenancePayload(): any {
  const s: any = (variant.value as any)?.maintenance ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...costEdit.maintenance };
}

function buildEmployesPayload(): any {
  const existing: any = (variant.value as any)?.employes ?? null;
  const baseKeys = ["responsableNb", "responsableCout", "centralistesNb", "centralistesCout"];
  const data = pickSupported(existing, costEdit.employes as any, baseKeys);
  const s: any = existing ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...data };
}

/* =========================
   ACTIONS
========================= */
const saving = reactive({
  transport: false,
  formules: false,
  coutM3: false,
  coutMensuel: false,
  coutOccasionnel: false,
  maintenance: false,
  employes: false,
  cab: false,
  autresCouts: false,
  addFormule: false,
});

const err = ref<string | null>(null);
function setErr(e: any) {
  err.value = e?.message ?? String(e);
}

async function saveTransport() {
  err.value = null;
  if (!variant.value) return;
  saving.transport = true;
  try {
    await store.updateVariant(variant.value.id, { transport: buildTransportPayload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.transport = false;
  }
}

async function saveFormules() {
  err.value = null;
  if (!variant.value) return;
  saving.formules = true;
  try {
    const items = formules.value.map((f: any) => ({
      id: String(f.id),
      volumeM3: toNum(fe(f.id).volumeM3),
      momd: toNum(fe(f.id).momd),
    }));
    await store.updateVariant(variant.value.id, { formules: { items } });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.formules = false;
  }
}

async function saveCoutM3() {
  err.value = null;
  if (!variant.value) return;
  saving.coutM3 = true;
  try {
    await store.updateVariant(variant.value.id, { coutM3: buildCoutM3Payload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.coutM3 = false;
  }
}

async function saveCoutMensuel() {
  err.value = null;
  if (!variant.value) return;
  saving.coutMensuel = true;
  try {
    await store.updateVariant(variant.value.id, { coutMensuel: buildCoutMensuelPayload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.coutMensuel = false;
  }
}

async function saveCoutOcc() {
  err.value = null;
  if (!variant.value) return;
  saving.coutOccasionnel = true;
  try {
    await store.updateVariant(variant.value.id, { coutOccasionnel: buildCoutOccPayload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.coutOccasionnel = false;
  }
}

async function saveMaintenance() {
  err.value = null;
  if (!variant.value) return;
  saving.maintenance = true;
  try {
    await store.updateVariant(variant.value.id, { maintenance: buildMaintenancePayload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.maintenance = false;
  }
}

async function saveEmployes() {
  err.value = null;
  if (!variant.value) return;
  saving.employes = true;
  try {
    await store.updateVariant(variant.value.id, { employes: buildEmployesPayload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.employes = false;
  }
}

async function saveCab() {
  err.value = null;
  if (!variant.value) return;
  saving.cab = true;
  try {
    await store.updateVariant(variant.value.id, { cab: buildCabPayload() });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.cab = false;
  }
}

async function saveAutresCouts() {
  err.value = null;
  if (!variant.value) return;
  saving.autresCouts = true;
  try {
    await store.updateVariant(variant.value.id, { autresCouts: { items: costEdit.autresCouts } });
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.autresCouts = false;
  }
}

function addAutreCout() {
  costEdit.autresCouts.push({ label: "Nouveau coût", unite: "FORFAIT", valeur: 0 });
}
function removeAutreCout(idx: number) {
  costEdit.autresCouts.splice(idx, 1);
}

/* add/delete formules */
const selectedFormuleId = ref<string>("");
const formulesCatalogue = computed<any[]>(() => ((store as any).formulesCatalogue ?? []) as any[]);

async function addFormuleToVariant() {
  err.value = null;
  if (!variant.value) return;
  const formuleId = selectedFormuleId.value;
  if (!formuleId) return;

  saving.addFormule = true;
  try {
    await store.addFormuleToActiveVariant(formuleId);
    selectedFormuleId.value = "";
  } catch (e: any) {
    setErr(e);
  } finally {
    saving.addFormule = false;
  }
}
async function deleteFormuleFromVariant(variantFormuleId: string) {
  err.value = null;
  if (!variant.value) return;
  try {
    await store.removeVariantFormule(variantFormuleId);
  } catch (e: any) {
    setErr(e);
  }
}
</script>

<template>
  <div class="page">
    <!-- Top bar -->
    <div class="top">
      <div class="title">
        <div class="h1">Mes P&L</div>
        <div class="muted">Pilotage (P&L → Contrat → Variante)</div>
      </div>
      <button class="btn" @click="store.loadPnls()">Recharger</button>
    </div>

    <div v-if="store.loading" class="panel">Chargement…</div>
    <div v-else-if="store.error" class="panel error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div v-if="err" class="panel error"><b>Erreur :</b> {{ err }}</div>

      <!-- NAV compact -->
      <div class="panel">
        <div class="navGrid">
          <div class="field">
            <div class="label">P&L</div>
            <select class="select" :value="store.activePnlId" @change="onChangePnl(($event.target as HTMLSelectElement).value)">
              <option v-for="p in store.pnls" :key="p.id" :value="p.id">{{ p.title }} ({{ p.city }})</option>
            </select>
          </div>

          <div class="field" v-if="pnl">
            <div class="label">Contrat</div>
            <select class="select" :value="currentContractId" @change="onChangeContract(($event.target as HTMLSelectElement).value)">
              <option v-for="c in contracts" :key="c.id" :value="c.id">Contrat {{ c.id.slice(0, 6) }} — {{ c.dureeMois }} mois</option>
            </select>
          </div>

          <div class="field" v-if="contract">
            <div class="label">Variante</div>
            <select class="select" :value="store.activeVariantId" @change="onChangeVariant(($event.target as HTMLSelectElement).value)">
              <option v-for="v in variantsOfCurrentContract" :key="v.id" :value="v.id">{{ v.title }}</option>
            </select>
          </div>

          <div class="chips" v-if="variant">
            <div class="chip"><span>Vol</span><b>{{ n(volumeTotal, 0) }}</b><i>m³</i></div>
            <div class="chip"><span>CMP</span><b>{{ n(cmpMoy) }}</b><i>/m³</i></div>
            <div class="chip"><span>MOMD</span><b>{{ n(momdMoy) }}</b><i>/m³</i></div>
            <div class="chip"><span>PV</span><b>{{ n(pvParM3Moy) }}</b><i>/m³</i></div>
            <div class="chip"><span>CA</span><b>{{ money(caTotal) }}</b></div>
          </div>
        </div>
      </div>

      <!-- ====== SECTIONS compact ====== -->
      <details class="panel" open v-if="variant">
        <summary class="sum">
          <b>MP Variante</b>
          <span class="muted">synchro formules</span>
        </summary>

        <div v-if="mpRows.length === 0" class="muted pad">Aucune MP.</div>
        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Cat.</th>
                <th>MP</th>
                <th>Fournisseur</th>
                <th class="r">Prix cat.</th>
                <th class="r">Prix var.</th>
                <th class="r">Utilisé</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in mpRows" :key="m.id">
                <td>{{ m.categorie }}</td>
                <td><b>{{ m.label }}</b> <span class="muted">({{ m.unite }})</span></td>
                <td>{{ m.fournisseur }}</td>
                <td class="r">{{ n(m.prixCatalogue) }}</td>
                <td class="r">{{ m.prixVariante == null ? "-" : n(m.prixVariante) }}</td>
                <td class="r"><b>{{ n(m.prixUtilise) }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <details class="panel" open v-if="variant">
        <summary class="sum">
          <b>Transport</b>
          <span class="muted">MAD/m³</span>
        </summary>

        <div class="row pad">
          <div class="field grow">
            <div class="label">Prix moyen</div>
            <input class="input r" type="number" step="0.01" v-model.number="transportPrixMoyen" />
          </div>
          <button class="btn primary" :disabled="saving.transport" @click="saveTransport()">
            {{ saving.transport ? "..." : "Enregistrer" }}
          </button>

          <div class="miniKpis">
            <div><span class="muted">Total</span> <b>{{ money(transportTotal) }}</b></div>
          </div>
        </div>
      </details>

      <details class="panel" open v-if="variant">
        <summary class="sum">
          <b>Formules</b>
          <span class="muted">{{ formules.length }} item(s)</span>
        </summary>

        <div class="row pad">
          <div class="field grow">
            <div class="label">Ajouter</div>
            <select class="select" v-model="selectedFormuleId">
              <option value="">-- choisir --</option>
              <option v-for="f in formulesCatalogue" :key="f.id" :value="f.id">{{ f.label }} ({{ f.resistance }})</option>
            </select>
          </div>

          <button class="btn" :disabled="saving.addFormule || !selectedFormuleId" @click="addFormuleToVariant()">
            {{ saving.addFormule ? "..." : "Ajouter" }}
          </button>

          <button class="btn primary" :disabled="saving.formules" @click="saveFormules()">
            {{ saving.formules ? "..." : "Enregistrer" }}
          </button>
        </div>

        <div v-if="formules.length === 0" class="muted pad">Aucune formule.</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Formule</th>
                <th class="r">Qté (m³)</th>
                <th class="r">CMP</th>
                <th class="r">MOMD</th>
                <th class="r">PV</th>
                <th class="r"></th>
              </tr>
            </thead>

            <tbody>
              <template v-for="vf in formules" :key="vf.id">
                <tr>
                  <td>
                    <div class="click" @click="toggleForm(vf.id)">
                      <b>{{ vf.formule?.label ?? "-" }}</b>
                      <span class="muted">— {{ formExpanded[String(vf.id)] ? "masquer" : "détails" }}</span>
                    </div>
                    <div class="muted small">{{ vf.formule?.comment ?? "" }}</div>
                  </td>

                  <td class="r" style="width: 130px">
                    <input class="inputSm r" type="number" step="1" v-model.number="fe(vf.id).volumeM3" />
                  </td>

                  <td class="r"><b>{{ n(cmpParM3For(vf)) }}</b></td>

                  <td class="r" style="width: 130px">
                    <input class="inputSm r" type="number" step="0.01" v-model.number="fe(vf.id).momd" />
                  </td>

                  <td class="r">
                    <b>{{ n(cmpParM3For(vf) + toNum(fe(vf.id).momd) + toNum(transportPrixMoyen)) }}</b>
                  </td>

                  <td class="r" style="width: 90px">
                    <button class="btn danger" @click="deleteFormuleFromVariant(String(vf.id))">Suppr</button>
                  </td>
                </tr>

                <tr v-if="formExpanded[String(vf.id)]">
                  <td colspan="6" class="subRow">
                    <div class="muted" style="margin-bottom: 6px">Composition (kg/m³ → coût/m³)</div>
                    <div class="tableWrap">
                      <table class="table small">
                        <thead>
                          <tr>
                            <th>MP</th>
                            <th class="r">Qté</th>
                            <th class="r">Prix</th>
                            <th class="r">Coût</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="c in compositionFor(vf.formule)" :key="c.mpId">
                            <td>{{ c.mpLabel }}</td>
                            <td class="r">{{ n(c.qty) }}</td>
                            <td class="r">{{ n(c.prix) }}</td>
                            <td class="r"><b>{{ n(c.coutParM3) }}</b></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div class="kpiRow">
                      <div class="chip"><span>CMP total</span><b>{{ money(cmpTotal) }}</b></div>
                      <div class="chip"><span>MOMD total</span><b>{{ money(momdTotal) }}</b></div>
                      <div class="chip"><span>% CMP</span><b>{{ n(pctCmp) }}%</b></div>
                      <div class="chip"><span>% MOMD</span><b>{{ n(pctMomd) }}%</b></div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>CAB</b> <span class="muted">amort/mois</span></summary>
        <div class="row pad">
          <div class="field grow">
            <div class="label">Amortissement / mois (MAD)</div>
            <input class="input r" type="number" step="0.01" v-model.number="amort_mois" />
          </div>
          <button class="btn primary" :disabled="saving.cab" @click="saveCab()">
            {{ saving.cab ? "..." : "Enregistrer" }}
          </button>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>Maintenance</b></summary>
        <div class="grid pad">
          <div class="field"><div class="label">CAB</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.maintenance.cab" /></div>
          <div class="field"><div class="label">Élec</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.maintenance.elec" /></div>
          <div class="field"><div class="label">Chargeur</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.maintenance.chargeur" /></div>
          <div class="field"><div class="label">Générale</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.maintenance.generale" /></div>
          <div class="field"><div class="label">Bassins</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.maintenance.bassins" /></div>
          <div class="field"><div class="label">Préventive</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.maintenance.preventive" /></div>
        </div>
        <div class="row padTop">
          <button class="btn primary" :disabled="saving.maintenance" @click="saveMaintenance()">
            {{ saving.maintenance ? "..." : "Enregistrer" }}
          </button>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>Coûts / m³</b></summary>
        <div class="grid3 pad">
          <div class="field"><div class="label">Eau</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutM3.eau" /></div>
          <div class="field"><div class="label">Qualité</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutM3.qualite" /></div>
          <div class="field"><div class="label">Déchets</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutM3.dechets" /></div>
        </div>
        <div class="row padTop">
          <button class="btn primary" :disabled="saving.coutM3" @click="saveCoutM3()">
            {{ saving.coutM3 ? "..." : "Enregistrer" }}
          </button>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>Coûts / mois</b></summary>

        <div class="grid4 pad">
          <div class="field"><div class="label">Électricité</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.electricite" /></div>
          <div class="field"><div class="label">Location groupes</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.locationGroupes" /></div>
          <div class="field"><div class="label">Gasoil</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.gasoil" /></div>
          <div class="field"><div class="label">Hébergements</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.hebergements" /></div>

          <div class="field"><div class="label">Location terrain</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.locationTerrain" /></div>
          <div class="field"><div class="label">Téléphone</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.telephone" /></div>
          <div class="field"><div class="label">3G</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.troisG" /></div>
          <div class="field"><div class="label">Taxe prof.</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.taxeProfessionnelle" /></div>

          <div class="field"><div class="label">Sécurité</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.securite" /></div>
          <div class="field"><div class="label">Loc. véhicule</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.locationVehicule" /></div>
          <div class="field"><div class="label">Loc. ambulance</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.locationAmbulance" /></div>
          <div class="field"><div class="label">Loc. bungalows</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.locationBungalows" /></div>

          <div class="field"><div class="label">EPI</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.epi" /></div>
          <div class="field"><div class="label muted">DB: location</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutMensuel.location" /></div>
        </div>

        <div class="row padTop">
          <button class="btn primary" :disabled="saving.coutMensuel" @click="saveCoutMensuel()">
            {{ saving.coutMensuel ? "..." : "Enregistrer" }}
          </button>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>Coûts occasionnels</b></summary>

        <div class="grid4 pad">
          <div class="field"><div class="label">Génie civil</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.genieCivil" /></div>
          <div class="field"><div class="label">Install CAB</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.installationCab" /></div>
          <div class="field"><div class="label">Démontage</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.demontage" /></div>
          <div class="field"><div class="label">Remise point</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.remisePointCentrale" /></div>

          <div class="field"><div class="label">Transport</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.transport" /></div>
          <div class="field"><div class="label">Silots</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.silots" /></div>
          <div class="field"><div class="label">Local adjuvant</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.localAdjuvant" /></div>
          <div class="field"><div class="label">Bungalows</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.bungalows" /></div>

          <div class="field"><div class="label muted">DB: installation</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.installation" /></div>
        </div>

        <div class="row padTop">
          <button class="btn primary" :disabled="saving.coutOccasionnel" @click="saveCoutOcc()">
            {{ saving.coutOccasionnel ? "..." : "Enregistrer" }}
          </button>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>Employés</b> <span class="muted">(compat Prisma)</span></summary>

        <div class="grid4 pad">
          <div class="field"><div class="label">Responsable Nb</div><input class="input r" type="number" step="0.1" v-model.number="costEdit.employes.responsableNb" /></div>
          <div class="field"><div class="label">Responsable coût</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.employes.responsableCout" /></div>

          <div class="field"><div class="label">Centralistes Nb</div><input class="input r" type="number" step="0.1" v-model.number="costEdit.employes.centralistesNb" /></div>
          <div class="field"><div class="label">Centralistes coût</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.employes.centralistesCout" /></div>

          <div class="field"><div class="label">Manœuvre Nb</div><input class="input r" type="number" step="0.1" v-model.number="costEdit.employes.manoeuvreNb" /></div>
          <div class="field"><div class="label">Manœuvre coût</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.employes.manoeuvreCout" /></div>

          <div class="field"><div class="label">Gardien Nb</div><input class="input r" type="number" step="0.1" v-model.number="costEdit.employes.gardienNb" /></div>
          <div class="field"><div class="label">Gardien coût</div><input class="input r" type="number" step="0.01" v-model.number="costEdit.employes.gardienCout" /></div>
        </div>

        <div class="row padTop">
          <button class="btn primary" :disabled="saving.employes" @click="saveEmployes()">
            {{ saving.employes ? "..." : "Enregistrer" }}
          </button>
          <div class="muted small">
            Tant que Prisma n’a pas les colonnes, seuls Responsable/Centralistes seront sauvés.
          </div>
        </div>
      </details>

      <details class="panel" v-if="variant">
        <summary class="sum"><b>Autres coûts</b></summary>

        <div class="row pad">
          <button class="btn" @click="addAutreCout()">+ Ajouter</button>
          <button class="btn primary" :disabled="saving.autresCouts" @click="saveAutresCouts()">
            {{ saving.autresCouts ? "..." : "Enregistrer" }}
          </button>
        </div>

        <div v-if="costEdit.autresCouts.length === 0" class="muted pad">Aucun coût.</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th style="width: 140px">Unité</th>
                <th class="r" style="width: 140px">Valeur</th>
                <th class="r" style="width: 90px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, idx) in costEdit.autresCouts" :key="idx">
                <td><input class="input" v-model="it.label" /></td>
                <td>
                  <select class="select" v-model="it.unite">
                    <option value="FORFAIT">FORFAIT</option>
                    <option value="MOIS">MOIS</option>
                    <option value="M3">M3</option>
                    <option value="POURCENT_CA">POURCENT_CA</option>
                  </select>
                </td>
                <td class="r"><input class="input r" type="number" step="0.01" v-model.number="it.valeur" /></td>
                <td class="r">
                  <button class="btn danger" @click="removeAutreCout(idx)">Suppr</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }

/* top */
.top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.title { display:flex; flex-direction:column; gap:2px; }
.h1 { font-size:16px; font-weight:800; line-height:1.1; margin:0; }
.muted { color:#6b7280; font-size:12px; }
.small { font-size:11px; }

/* panel */
.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px; }
.panel.error { border-color:#ef4444; background:#fff5f5; }

/* details */
details.panel { padding:0; overflow:hidden; }
.sum {
  cursor:pointer; user-select:none;
  display:flex; justify-content:space-between; align-items:center;
  padding:10px;
  border-bottom:1px solid #eef2f7;
}
.sum b { font-size:13px; }
.pad { padding:10px; }
.padTop { padding:0 10px 10px; }

.navGrid {
  display:grid;
  grid-template-columns: repeat(3, minmax(160px, 1fr));
  gap:10px;
  align-items:end;
}
@media (max-width: 980px) {
  .navGrid { grid-template-columns: 1fr; }
}

.field { display:flex; flex-direction:column; gap:6px; }
.field.grow { min-width: 240px; }
.label { font-size:11px; color:#6b7280; }

.select, .input, .inputSm {
  border:1px solid #d1d5db;
  border-radius:10px;
  font-size:13px;
  padding:7px 9px;
  width:100%;
}
.inputSm { font-size:12px; padding:6px 8px; }
.r { text-align:right; }

.row { display:flex; gap:8px; align-items:end; flex-wrap:wrap; }
.btn {
  border:1px solid #d1d5db;
  background:#fff;
  border-radius:10px;
  padding:7px 10px;
  font-size:13px;
  cursor:pointer;
}
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { background:#046a2f; }
.btn.danger { background:#fff; border-color:#ef4444; color:#b91c1c; }

.tableWrap { overflow:auto; padding:10px; padding-top:0; }
.table { width:100%; border-collapse:collapse; font-size:12px; }
.table th, .table td { border-bottom:1px solid #e5e7eb; padding:7px 8px; vertical-align:top; }
.table th { background:#fafafa; color:#6b7280; font-size:11px; }
.table.small th, .table.small td { padding:6px 7px; font-size:11px; }
.subRow { background:#fcfcfd; }

.click { cursor:pointer; }

.chips { grid-column: 1 / -1; display:flex; gap:8px; flex-wrap:wrap; }
.chip {
  display:flex; gap:6px; align-items:baseline;
  border:1px solid #e5e7eb;
  background:#fcfcfd;
  border-radius:999px;
  padding:6px 10px;
  font-size:12px;
}
.chip span { color:#6b7280; }
.chip b { font-weight:800; }
.chip i { color:#6b7280; font-style:normal; margin-left:2px; }

.miniKpis { display:flex; gap:12px; align-items:center; }
.grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
.grid3 { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; padding:10px; padding-bottom:0; }
.grid4 { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; padding:10px; padding-bottom:0; }
@media (max-width: 980px) { .grid, .grid3, .grid4 { grid-template-columns: 1fr; } }

.kpiRow { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
</style>
