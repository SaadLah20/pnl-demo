<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
  // pour le dropdown "ajouter formule"
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
  // pas de state activeContractId dans le store => on sélectionne juste 1ère variante du contrat choisi
  const c = contracts.value.find((x) => x.id === contractId);
  const firstVar = c?.variants?.[0]?.id ?? null;
  if (firstVar) store.setActiveVariant(firstVar);
}
function onChangeVariant(variantId: string) {
  store.setActiveVariant(variantId);
}

/* =========================
   UI: sections pliables
========================= */
const open = reactive({
  mp: true,
  transport: true,
  formules: true,
  coutM3: false,
  coutMensuel: false,
  coutOccasionnel: false,
  maintenance: false,
  employes: false,
  cab: false,
  autresCouts: false,
});

function toggle(k: keyof typeof open) {
  open[k] = !open[k];
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
   TRANSPORT (editable: prix moyen)
========================= */
const transportPrixMoyen = ref<number>(0);

watch(
  () => (variant.value as any)?.transport?.prixMoyen,
  (v) => {
    transportPrixMoyen.value = toNum(v);
  },
  { immediate: true }
);

const volumeTotal = computed(() => {
  const items = (variant.value as any)?.formules?.items ?? [];
  // volume = somme volumes des formules (edited)
  return items.reduce((s: number, it: any) => s + toNum(fe(it.id).volumeM3), 0);
});

const transportTotal = computed(() => toNum(transportPrixMoyen.value) * volumeTotal.value);

/* =========================
   FORMULES VARIANTE (editable: volume & momd)
========================= */
const formEdit = reactive<Record<string, { volumeM3: number; momd: number }>>({});

// ✅ retourne toujours un objet
function fe(id: string) {
  if (!formEdit[id]) formEdit[id] = { volumeM3: 0, momd: 0 };
  return formEdit[id];
}

const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);

watch(
  () => formules.value.map((x) => ({ id: x.id, volumeM3: x.volumeM3, momd: x.momd })),
  (arr) => {
    for (const x of arr) {
      const e = fe(x.id);
      e.volumeM3 = toNum(x.volumeM3);
      e.momd = toNum(x.momd);
    }
  },
  { immediate: true }
);

function mpPriceUsed(mpId: string): number {
  const vmp = ((variant.value as any)?.mp?.items ?? []).find((x: any) => x.mpId === mpId);
  if (!vmp) return 0;

  // ✅ override uniquement
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);

  // ✅ sinon prix catalogue live
  return toNum(vmp?.mp?.prix);
}


type CompRow = { mpId: string; mpLabel: string; qty: number; prix: number; coutParM3: number };

function compositionFor(formule: any): CompRow[] {
  const items = (formule?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty);
    const prix = mpPriceUsed(mpId);
    console.log("DEBUG CMP", { mpId, qty, prix, coutParM3: qty * prix });

    return {
      mpId,
      mpLabel: it?.mp?.label ?? "",
      qty,
      prix,
// qty = kg/m³, prix = MAD/tonne  => cout = (kg/1000) * (MAD/tonne)
coutParM3: (qty / 1000) * prix,
    };
  });
}

function cmpParM3For(vf: any): number {
  const comp = compositionFor(vf?.formule);
  return comp.reduce((s: number, x: { coutParM3: number }) => s + toNum(x.coutParM3), 0);
}

const formExpanded = reactive<Record<string, boolean>>({});

function toggleForm(id: string) {
  formExpanded[id] = !formExpanded[id];
}

/* ---- KPIs formules section (basés sur edits) ---- */
const cmpTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + cmpParM3For(vf) * toNum(fe(vf.id).volumeM3), 0)
);
const momdTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + toNum(fe(vf.id).momd) * toNum(fe(vf.id).volumeM3), 0)
);

const pvParM3Moy = computed(() => {
  const vol = volumeTotal.value;
  if (vol === 0) return 0;
  // moyenne pondérée du PV/m3
  const total = formules.value.reduce((s: number, vf: any) => {
    const volF = toNum(fe(vf.id).volumeM3);
    const pv = cmpParM3For(vf) + toNum(fe(vf.id).momd) + toNum(transportPrixMoyen.value);
    return s + pv * volF;
  }, 0);
  return total / vol;
});

const cmpMoy = computed(() => (volumeTotal.value === 0 ? 0 : cmpTotal.value / volumeTotal.value));
const momdMoy = computed(() => (volumeTotal.value === 0 ? 0 : momdTotal.value / volumeTotal.value));
const caTotal = computed(() => pvParM3Moy.value * volumeTotal.value);

const pctCmp = computed(() => (caTotal.value === 0 ? 0 : (cmpTotal.value / caTotal.value) * 100));
const pctMomd = computed(() => (caTotal.value === 0 ? 0 : (momdTotal.value / caTotal.value) * 100));

/* =========================
   COSTS EDIT (sections)
========================= */
const costEdit = reactive({
  coutM3: { eau: 0, qualite: 0, dechets: 0 },
  coutMensuel: { electricite: 0, gasoil: 0, location: 0, securite: 0 },
  coutOccasionnel: { genieCivil: 0, installation: 0, transport: 0 },
  maintenance: { cab: 0, elec: 0, chargeur: 0, generale: 0, bassins: 0, preventive: 0 },
  employes: { responsableNb: 0, responsableCout: 0, centralistesNb: 0, centralistesCout: 0 },
  autresCouts: [] as Array<{ label: string; unite: string; valeur: number }>,
});

const amort_mois = ref<number>(0);

watch(
  () => variant.value,
  (v) => {
    const vv: any = v ?? {};
    costEdit.coutM3 = {
      eau: toNum(vv?.coutM3?.eau),
      qualite: toNum(vv?.coutM3?.qualite),
      dechets: toNum(vv?.coutM3?.dechets),
    };
    costEdit.coutMensuel = {
      electricite: toNum(vv?.coutMensuel?.electricite),
      gasoil: toNum(vv?.coutMensuel?.gasoil),
      location: toNum(vv?.coutMensuel?.location),
      securite: toNum(vv?.coutMensuel?.securite),
    };
    costEdit.coutOccasionnel = {
      genieCivil: toNum(vv?.coutOccasionnel?.genieCivil),
      installation: toNum(vv?.coutOccasionnel?.installation),
      transport: toNum(vv?.coutOccasionnel?.transport),
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
   SAVE HELPERS: build "full" payload (évite Bad Request)
   -> on envoie tous les champs requis par Prisma
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
  const s: any = (variant.value as any)?.coutMensuel ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...costEdit.coutMensuel };
}

function buildCoutOccPayload(): any {
  const s: any = (variant.value as any)?.coutOccasionnel ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...costEdit.coutOccasionnel };
}

function buildMaintenancePayload(): any {
  const s: any = (variant.value as any)?.maintenance ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...costEdit.maintenance };
}

function buildEmployesPayload(): any {
  const s: any = (variant.value as any)?.employes ?? {};
  return { category: s.category ?? "COUTS_CHARGES", ...costEdit.employes };
}

/* =========================
   ACTIONS (save/add/delete)
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

// ajouter / supprimer autres couts (front)
function addAutreCout() {
  costEdit.autresCouts.push({ label: "Nouveau coût", unite: "FORFAIT", valeur: 0 });
}
function removeAutreCout(idx: number) {
  costEdit.autresCouts.splice(idx, 1);
}

/* ---- add/delete formules variante ---- */
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
    <div class="topbar">
      <div>
        <h1>Mes P&L</h1>
        <div class="muted">Pilotage (P&L → Contrat → Variante)</div>
      </div>
      <button class="btn" @click="store.loadPnls()">🔄 Recharger</button>
    </div>

    <div v-if="store.loading" class="card">Chargement...</div>
    <div v-else-if="store.error" class="card error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div v-if="err" class="card error">
        <b>Erreur :</b> {{ err }}
      </div>

      <!-- NAV -->
      <div class="card">
        <div class="row">
          <div class="field">
            <div class="label">P&L</div>
            <select class="select" :value="store.activePnlId" @change="onChangePnl(($event.target as HTMLSelectElement).value)">
              <option v-for="p in store.pnls" :key="p.id" :value="p.id">
                {{ p.title }} ({{ p.city }})
              </option>
            </select>
          </div>

          <div class="field" v-if="pnl">
            <div class="label">Contrat</div>
            <select class="select" :value="currentContractId" @change="onChangeContract(($event.target as HTMLSelectElement).value)">
              <option v-for="c in contracts" :key="c.id" :value="c.id">
                Contrat {{ c.id.slice(0, 6) }} — {{ c.dureeMois }} mois
              </option>
            </select>
          </div>

          <div class="field" v-if="contract">
            <div class="label">Variante</div>
            <select class="select" :value="store.activeVariantId" @change="onChangeVariant(($event.target as HTMLSelectElement).value)">
              <option v-for="v in variantsOfCurrentContract" :key="v.id" :value="v.id">
                {{ v.title }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- =========================
           1) MP VARIANTE (read only)
      ========================== -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('mp')">
          <div class="sectionTitle">🧱 MP Variante</div>
          <div class="chev">{{ open.mp ? "▾" : "▸" }}</div>
        </div>

        <div v-show="open.mp">
          <div v-if="mpRows.length === 0" class="muted">Aucune MP.</div>
          <div v-else class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>MP</th>
                  <th>Unité</th>
                  <th>Fournisseur</th>
                  <th>Prix catalogue</th>
                  <th>Prix variante</th>
                  <th>Prix utilisé</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in mpRows" :key="m.id">
                  <td>{{ m.categorie }}</td>
                  <td>{{ m.label }}</td>
                  <td>{{ m.unite }}</td>
                  <td>{{ m.fournisseur }}</td>
                  <td>{{ n(m.prixCatalogue) }}</td>
                  <td>{{ m.prixVariante == null ? "-" : n(m.prixVariante) }}</td>
                  <td><b>{{ n(m.prixUtilise) }}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="muted" style="margin-top:8px">
            (Aucune action ici — MP est synchronisée depuis les formules)
          </div>
        </div>
      </div>

      <!-- =========================
           2) TRANSPORT
      ========================== -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('transport')">
          <div class="sectionTitle">🚚 Transport</div>
          <div class="chev">{{ open.transport ? "▾" : "▸" }}</div>
        </div>

        <div v-show="open.transport" class="grid2">
          <div>
            <div class="row">
              <div class="field grow">
                <div class="label">Prix moyen (MAD/m³)</div>
                <input class="input right" type="number" step="0.01" v-model.number="transportPrixMoyen" />
              </div>
              <button class="btn primary" :disabled="saving.transport" @click="saveTransport()">
                {{ saving.transport ? "Enregistrement..." : "Enregistrer" }}
              </button>
            </div>

            <div class="kpisLine">
              <div><span class="muted">Volume total</span> <b>{{ n(volumeTotal, 0) }} m³</b></div>
              <div><span class="muted">Transport total</span> <b>{{ money(transportTotal) }}</b></div>
            </div>
          </div>
        </div>
      </div>

      <!-- =========================
           3) FORMULES VARIANTE
      ========================== -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('formules')">
          <div class="sectionTitle">🧪 Formules variante</div>
          <div class="chev">{{ open.formules ? "▾" : "▸" }}</div>
        </div>

        <div v-show="open.formules">
          <!-- Add formule -->
          <div class="row" style="margin: 10px 0 6px">
            <div class="field grow">
              <div class="label">Ajouter une formule</div>
              <select class="select" v-model="selectedFormuleId">
                <option value="">-- choisir --</option>
                <option v-for="f in formulesCatalogue" :key="f.id" :value="f.id">
                  {{ f.label }} ({{ f.resistance }})
                </option>
              </select>
            </div>
            <button class="btn" :disabled="saving.addFormule || !selectedFormuleId" @click="addFormuleToVariant()">
              {{ saving.addFormule ? "Ajout..." : "Ajouter" }}
            </button>

            <button class="btn primary" :disabled="saving.formules" @click="saveFormules()">
              {{ saving.formules ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>

          <!-- Table formules -->
          <div v-if="formules.length === 0" class="muted">Aucune formule.</div>

          <div v-else class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Formule</th>
                  <th>Qté (m³)</th>
                  <th>CMP (MAD/m³)</th>
                  <th>MOMD (MAD/m³)</th>
                  <th>PV (MAD/m³)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="vf in formules" :key="vf.id">
                  <tr>
                    <td>
                      <div class="click" @click="toggleForm(vf.id)">
                        <b>{{ vf.formule?.label ?? "-" }}</b>
                        <span class="muted" style="margin-left:6px">{{ formExpanded[vf.id] ? "▾" : "▸" }}</span>
                      </div>
                      <div class="muted smallText">{{ vf.formule?.comment ?? "" }}</div>
                    </td>

                    <td style="width: 140px">
                      <input class="inputSm right" type="number" step="1" v-model.number="fe(vf.id).volumeM3" />
                    </td>

                    <td><b>{{ n(cmpParM3For(vf)) }}</b></td>

                    <td style="width: 140px">
                      <input class="inputSm right" type="number" step="0.01" v-model.number="fe(vf.id).momd" />
                    </td>

                    <td>
                      <b>{{ n(cmpParM3For(vf) + toNum(fe(vf.id).momd) + toNum(transportPrixMoyen)) }}</b>
                    </td>

                    <td style="width: 90px; text-align:right">
                      <button class="btn danger" @click="deleteFormuleFromVariant(String(vf.id))">Suppr</button>
                    </td>
                  </tr>

                  <tr v-if="formExpanded[vf.id]">
                    <td colspan="6" class="subRow">
                      <div class="muted" style="margin-bottom:6px">Composition (qty × prix → coût/m³)</div>
                      <div class="tableWrap">
                        <table class="table small">
                          <thead>
                            <tr>
                              <th>MP</th>
                              <th>Qté / m³</th>
                              <th>Prix utilisé</th>
                              <th>Coût / m³</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="c in compositionFor(vf.formule)" :key="c.mpId">
                              <td>{{ c.mpLabel }}</td>
                              <td>{{ n(c.qty) }}</td>
                              <td>{{ n(c.prix) }}</td>
                              <td><b>{{ n(c.coutParM3) }}</b></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- KPIs section formules -->
          <div class="kpisGrid">
            <div class="kpiBox"><div class="kpiL">Volume total</div><div class="kpiV">{{ n(volumeTotal, 0) }} m³</div></div>
            <div class="kpiBox"><div class="kpiL">CMP moyen</div><div class="kpiV">{{ n(cmpMoy) }} MAD/m³</div></div>
            <div class="kpiBox"><div class="kpiL">MOMD moyenne</div><div class="kpiV">{{ n(momdMoy) }} MAD/m³</div></div>
            <div class="kpiBox"><div class="kpiL">PV moyen</div><div class="kpiV">{{ n(pvParM3Moy) }} MAD/m³</div></div>
            <div class="kpiBox"><div class="kpiL">CA total</div><div class="kpiV">{{ money(caTotal) }}</div></div>
            <div class="kpiBox"><div class="kpiL">MOMD total</div><div class="kpiV">{{ money(momdTotal) }}</div></div>
            <div class="kpiBox"><div class="kpiL">CMP total</div><div class="kpiV">{{ money(cmpTotal) }}</div></div>
            <div class="kpiBox"><div class="kpiL">% CMP</div><div class="kpiV">{{ n(pctCmp) }}%</div></div>
            <div class="kpiBox"><div class="kpiL">% MOMD</div><div class="kpiV">{{ n(pctMomd) }}%</div></div>
          </div>
        </div>
      </div>

      <!-- =========================
           4) COÛTS & CHARGES (sections séparées + bouton chacune)
      ========================== -->

      <!-- CAB (amort) -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('cab')">
          <div class="sectionTitle">🏗️ CAB (coût)</div>
          <div class="chev">{{ open.cab ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.cab">
          <div class="row">
            <div class="field grow">
              <div class="label">Amortissement / mois (MAD)</div>
              <input class="input right" type="number" step="0.01" v-model.number="amort_mois" />
            </div>
            <button class="btn primary" :disabled="saving.cab" @click="saveCab()">
              {{ saving.cab ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Maintenance -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('maintenance')">
          <div class="sectionTitle">🛠️ Maintenance</div>
          <div class="chev">{{ open.maintenance ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.maintenance">
          <div class="grid3">
            <div class="field"><div class="label">CAB</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.maintenance.cab" /></div>
            <div class="field"><div class="label">Élec</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.maintenance.elec" /></div>
            <div class="field"><div class="label">Chargeur</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.maintenance.chargeur" /></div>
            <div class="field"><div class="label">Générale</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.maintenance.generale" /></div>
            <div class="field"><div class="label">Bassins</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.maintenance.bassins" /></div>
            <div class="field"><div class="label">Préventive</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.maintenance.preventive" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" :disabled="saving.maintenance" @click="saveMaintenance()">
              {{ saving.maintenance ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Coût / m3 -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('coutM3')">
          <div class="sectionTitle">📏 Coûts / m³</div>
          <div class="chev">{{ open.coutM3 ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.coutM3">
          <div class="grid3">
            <div class="field"><div class="label">Eau</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutM3.eau" /></div>
            <div class="field"><div class="label">Qualité</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutM3.qualite" /></div>
            <div class="field"><div class="label">Déchets</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutM3.dechets" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" :disabled="saving.coutM3" @click="saveCoutM3()">
              {{ saving.coutM3 ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Coûts mensuels -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('coutMensuel')">
          <div class="sectionTitle">📅 Coûts / mois</div>
          <div class="chev">{{ open.coutMensuel ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.coutMensuel">
          <div class="grid3">
            <div class="field"><div class="label">Électricité</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutMensuel.electricite" /></div>
            <div class="field"><div class="label">Gasoil</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutMensuel.gasoil" /></div>
            <div class="field"><div class="label">Location</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutMensuel.location" /></div>
            <div class="field"><div class="label">Sécurité</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutMensuel.securite" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" :disabled="saving.coutMensuel" @click="saveCoutMensuel()">
              {{ saving.coutMensuel ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Coûts occasionnels -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('coutOccasionnel')">
          <div class="sectionTitle">🧾 Coûts occasionnels</div>
          <div class="chev">{{ open.coutOccasionnel ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.coutOccasionnel">
          <div class="grid3">
            <div class="field"><div class="label">Génie civil</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.genieCivil" /></div>
            <div class="field"><div class="label">Installation</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.installation" /></div>
            <div class="field"><div class="label">Transport</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel.transport" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" :disabled="saving.coutOccasionnel" @click="saveCoutOcc()">
              {{ saving.coutOccasionnel ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Employés -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('employes')">
          <div class="sectionTitle">👷 Employés</div>
          <div class="chev">{{ open.employes ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.employes">
          <div class="grid4">
            <div class="field"><div class="label">Responsable (Nb)</div><input class="input right" type="number" step="1" v-model.number="costEdit.employes.responsableNb" /></div>
            <div class="field"><div class="label">Responsable (coût)</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.employes.responsableCout" /></div>
            <div class="field"><div class="label">Centralistes (Nb)</div><input class="input right" type="number" step="1" v-model.number="costEdit.employes.centralistesNb" /></div>
            <div class="field"><div class="label">Centralistes (coût)</div><input class="input right" type="number" step="0.01" v-model.number="costEdit.employes.centralistesCout" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" :disabled="saving.employes" @click="saveEmployes()">
              {{ saving.employes ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Autres coûts -->
      <div v-if="variant" class="card">
        <div class="sectionHead" @click="toggle('autresCouts')">
          <div class="sectionTitle">➕ Autres coûts</div>
          <div class="chev">{{ open.autresCouts ? "▾" : "▸" }}</div>
        </div>
        <div v-show="open.autresCouts">
          <div class="row" style="margin: 10px 0">
            <button class="btn" @click="addAutreCout()">+ Ajouter coût</button>
            <button class="btn primary" :disabled="saving.autresCouts" @click="saveAutresCouts()">
              {{ saving.autresCouts ? "Enregistrement..." : "Enregistrer" }}
            </button>
          </div>

          <div v-if="costEdit.autresCouts.length === 0" class="muted">Aucun coût.</div>

          <div v-else class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Unité</th>
                  <th>Valeur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(it, idx) in costEdit.autresCouts" :key="idx">
                  <td style="width: 55%"><input class="input" v-model="it.label" /></td>
                  <td style="width: 20%">
                    <select class="select" v-model="it.unite">
                      <option value="FORFAIT">FORFAIT</option>
                      <option value="MOIS">MOIS</option>
                      <option value="M3">M3</option>
                      <option value="POURCENT_CA">POURCENT_CA</option>
                    </select>
                  </td>
                  <td style="width: 20%"><input class="input right" type="number" step="0.01" v-model.number="it.valeur" /></td>
                  <td style="width: 5%; text-align:right">
                    <button class="btn danger" @click="removeAutreCout(idx)">Suppr</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }
.topbar { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
h1 { margin:0; font-size:18px; }
.muted { color:#6b7280; font-size:12px; }
.smallText { font-size: 11px; }
.card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
.error { border-color:#ef4444; background:#fff5f5; }
.row { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.field { display:flex; flex-direction:column; gap:6px; min-width:200px; }
.field.grow { flex: 1; min-width: 240px; }
.label { font-size:11px; color:#6b7280; }
.select { padding:7px 9px; border:1px solid #d1d5db; border-radius:10px; font-size:13px; }
.input { padding:7px 9px; border:1px solid #d1d5db; border-radius:10px; font-size:13px; width:100%; }
.inputSm { padding:6px 8px; border:1px solid #d1d5db; border-radius:10px; font-size:12px; width:100%; }
.right { text-align:right; }
.btn { border:1px solid #d1d5db; background:#fff; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.btn.primary { background:#007a33; border-color:#007a33; color:#fff; }
.btn.primary:hover { background:#046a2f; }
.btn.danger { background:#fff; border-color:#ef4444; color:#b91c1c; }
.tableWrap { overflow:auto; margin-top:8px; }
.table { width:100%; border-collapse:collapse; font-size:12px; }
.table th, .table td { border-bottom:1px solid #e5e7eb; padding:7px 8px; text-align:left; vertical-align:top; }
.table th { background:#fafafa; color:#6b7280; font-size:11px; }
.table.small th, .table.small td { padding:6px 7px; font-size:11px; }
.subRow { background:#fcfcfd; }
.sectionHead { display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; }
.sectionTitle { font-weight:800; font-size:13px; }
.chev { color:#6b7280; font-size:13px; }
.click { cursor:pointer; }
.grid2 { display:grid; grid-template-columns: 1fr; gap:10px; }
.grid3 { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
.grid4 { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
@media (max-width: 980px) { .grid3 { grid-template-columns: 1fr; } .grid4 { grid-template-columns: 1fr; } }
.kpisLine { display:flex; gap:14px; flex-wrap:wrap; margin-top:8px; }
.kpisGrid { margin-top:10px; display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; }
@media (max-width: 980px) { .kpisGrid { grid-template-columns: 1fr; } }
.kpiBox { border:1px solid #e5e7eb; border-radius:12px; padding:8px; background:#fcfcfd; }
.kpiL { font-size:11px; color:#6b7280; }
.kpiV { font-size:13px; font-weight:800; margin-top:2px; }
</style>
