<!-- src/pages/MesPnlPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
});

// ----------------------------
// Helpers
// ----------------------------
function n(v: any, digits = 2) {
  const x = Number(v ?? 0);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(isFinite(x) ? x : 0);
}
function money(v: any) {
  const x = Number(v ?? 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(isFinite(x) ? x : 0);
}
function toNum(v: any) {
  const x = Number(v);
  return isFinite(x) ? x : 0;
}

// ----------------------------
// Active hierarchy
// ----------------------------
const pnl = computed(() => store.activePnl);
const activeContract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const contracts = computed<any[]>(() => pnl.value?.contracts ?? []);
const selectedContractId = ref<string>("");

const variantsOfSelectedContract = computed<any[]>(() => {
  const c = contracts.value.find((x) => x.id === selectedContractId.value) ?? null;
  return c?.variants ?? [];
});

watch(
  () => pnl.value?.id,
  () => {
    // init contract selection
    const c0 = contracts.value[0];
    selectedContractId.value = c0?.id ?? "";
    // keep store variant selection coherent
    const v0 = c0?.variants?.[0];
    if (v0?.id) store.setActiveVariant(v0.id);
  },
  { immediate: true }
);

function onChangeContract(id: string) {
  selectedContractId.value = id;
  const c = contracts.value.find((x) => x.id === id);
  const v0 = c?.variants?.[0];
  if (v0?.id) store.setActiveVariant(v0.id);
}

// ----------------------------
// MP Variant (readonly)
// ----------------------------
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
  const items = variant.value?.mp?.items ?? [];
  return items.map((it: any) => {
    const cat = it?.mp?.categorie ?? "";
    const label = it?.mp?.label ?? "";
    const unite = it?.mp?.unite ?? "";
    const fournisseur = it?.mp?.fournisseur ?? "";
    const prixCatalogue = toNum(it?.mp?.prix ?? 0);
    const prixVariante = it?.prix == null ? null : toNum(it.prix);
    const prixUtilise = prixVariante ?? prixCatalogue;

    return {
      id: String(it.id),
      categorie: String(cat),
      label: String(label),
      unite: String(unite),
      fournisseur: String(fournisseur),
      prixCatalogue,
      prixVariante,
      prixUtilise,
    };
  });
});

const mpPriceById = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};
  const items = variant.value?.mp?.items ?? [];
  for (const it of items) {
    const mpId = String(it.mpId ?? it?.mp?.id ?? "");
    if (!mpId) continue;
    const prixCatalogue = toNum(it?.mp?.prix ?? 0);
    const prixVariante = it?.prix == null ? null : toNum(it.prix);
    map[mpId] = prixVariante ?? prixCatalogue;
  }
  return map;
});

// ----------------------------
// Transport (editable prixMoyen)
// ----------------------------
const transportPrixMoyen = ref<number>(0);

watch(
  () => variant.value?.transport?.prixMoyen,
  (v) => (transportPrixMoyen.value = toNum(v ?? 0)),
  { immediate: true }
);

const volumePompePct = computed(() => toNum(variant.value?.transport?.volumePompePct ?? 0));

// ----------------------------
// Formules variante (editable volume, momd)
// ----------------------------
const openComp = reactive<Record<string, boolean>>({});

type FormuleRow = {
  id: string; // variantFormule.id
  formuleId: string;
  label: string;
  comment: string;
  volumeM3: number; // editable
  momd: number; // editable (MAD/m3)
  cmp: number; // computed (MAD/m3)
  pv: number; // computed = cmp + transport + momd
  ca: number; // pv * volume
  composition: Array<{
    mpId: string;
    mpLabel: string;
    mpUnite: string;
    qty: number;
    prixUtilise: number;
    coutParM3: number;
  }>;
};

const formules = computed<FormuleRow[]>(() => {
  const items = variant.value?.formules?.items ?? [];
  const t = transportPrixMoyen.value;

  return items.map((it: any) => {
    const vfId = String(it.id);
    const f = it.formule;
    const formuleId = String(it.formuleId ?? f?.id ?? "");

    const comp = (f?.items ?? []).map((fi: any) => {
      const mpId = String(fi.mpId);
      const prixUtilise = toNum(mpPriceById.value[mpId] ?? 0);
      const qty = toNum(fi.qty ?? 0);
      const coutParM3 = qty * prixUtilise;
      return {
        mpId,
        mpLabel: String(fi?.mp?.label ?? ""),
        mpUnite: String(fi?.mp?.unite ?? ""),
        qty,
        prixUtilise,
        coutParM3,
      };
    });

const cmp = comp.reduce(
  (s: number, x: { coutParM3: number }) => s + toNum(x.coutParM3),
  0
);
    const volumeM3 = toNum(it.volumeM3 ?? 0);
    const momd = toNum(it.momd ?? 0);

    const pv = cmp + t + momd;
    const ca = pv * volumeM3;

    return {
      id: vfId,
      formuleId,
      label: String(f?.label ?? ""),
      comment: String(f?.comment ?? ""),
      volumeM3,
      momd,
      cmp,
      pv,
      ca,
      composition: comp,
    };
  });
});

// Editable buffers (volume/momd)
const formEdit = reactive<Record<string, { volumeM3: number; momd: number }>>({});

// ✅ helper: retourne toujours un objet (jamais undefined)
function fe(id: string) {
  if (!formEdit[id]) formEdit[id] = { volumeM3: 0, momd: 0 };
  return formEdit[id];
}

watch(
  () => formules.value.map((x) => ({ id: x.id, volumeM3: x.volumeM3, momd: x.momd })),
  (arr) => {
    for (const x of arr) {
      const e = fe(x.id);
      e.volumeM3 = x.volumeM3;
      e.momd = x.momd;
    }
  },
  { immediate: true }
);


// Section KPIs (Formules)
const volTotal = computed(() =>
  formules.value.reduce((s, f) => s + toNum(fe(f.id)?.volumeM3 ?? f.volumeM3), 0)
);

const cmpTotal = computed(() => {
  let s = 0;
  for (const f of formules.value) {
    const v = toNum(fe(f.id)?.volumeM3 ?? f.volumeM3);
    s += f.cmp * v;
  }
  return s;
});
const momdTotal = computed(() => {
  let s = 0;
  for (const f of formules.value) {
    const v = toNum(fe(f.id)?.volumeM3 ?? f.volumeM3);
    const momd = toNum(fe(f.id)?.momd ?? f.momd);
    s += momd * v;
  }
  return s;
});

const pvTotal = computed(() => {
  let s = 0;
  const t = transportPrixMoyen.value;
  for (const f of formules.value) {
    const v = toNum(fe(f.id)?.volumeM3 ?? f.volumeM3);
    const momd = toNum(fe(f.id)?.momd ?? f.momd);
    const pv = f.cmp + t + momd;
    s += pv * v;
  }
  return s;
});

const cmpMoy = computed(() => (volTotal.value === 0 ? 0 : cmpTotal.value / volTotal.value));
const momdMoy = computed(() => (volTotal.value === 0 ? 0 : momdTotal.value / volTotal.value));
const pvMoy = computed(() => (volTotal.value === 0 ? 0 : pvTotal.value / volTotal.value));

const pctCmp = computed(() => (pvTotal.value === 0 ? 0 : (cmpTotal.value / pvTotal.value) * 100));
const pctMomd = computed(() => (pvTotal.value === 0 ? 0 : (momdTotal.value / pvTotal.value) * 100));
const pctTransport = computed(() => {
  const t = transportPrixMoyen.value;
  const tTotal = t * volTotal.value;
  return pvTotal.value === 0 ? 0 : (tTotal / pvTotal.value) * 100;
});

// ----------------------------
// Coûts & charges (editable)
// ----------------------------
const dureeMois = computed(() => toNum(activeContract.value?.dureeMois ?? 0));
const caTotal = computed(() => pvTotal.value); // CA total = PV total (car pv * volume déjà)

type NumField = { key: string; label: string; value: number };

function pickNumericFields(obj: any, excludeKeys: string[] = []) {
  if (!obj) return [] as NumField[];
  return Object.entries(obj)
    .filter(([k, v]) => !excludeKeys.includes(k) && typeof v === "number")
    .map(([k, v]) => ({
      key: String(k),
      label: String(k),
      value: toNum(v),
    }));
}

const costEdit = reactive({
  coutM3: {} as Record<string, number>,
  coutMensuel: {} as Record<string, number>,
  coutOccasionnel: {} as Record<string, number>,
  maintenance: {} as Record<string, number>,
  employes: {
    responsableNb: 0,
    responsableCout: 0,
    centralistesNb: 0,
    centralistesCout: 0,
  },
  cab: { amortMois: 0 },
  autresCouts: [] as Array<{ label: string; unite: string; valeur: number }>,
});

watch(
  () => variant.value,
  (v) => {
    if (!v) return;

    // coutM3
    costEdit.coutM3 = {};
    for (const f of pickNumericFields(v.coutM3, ["id", "variantId", "category"])) costEdit.coutM3[f.key] = f.value;

    // coutMensuel
    costEdit.coutMensuel = {};
    for (const f of pickNumericFields(v.coutMensuel, ["id", "variantId", "category"]))
      costEdit.coutMensuel[f.key] = f.value;

    // coutOccasionnel
    costEdit.coutOccasionnel = {};
    for (const f of pickNumericFields(v.coutOccasionnel, ["id", "variantId", "category"]))
      costEdit.coutOccasionnel[f.key] = f.value;

    // maintenance
    costEdit.maintenance = {};
    for (const f of pickNumericFields(v.maintenance, ["id", "variantId", "category"])) costEdit.maintenance[f.key] = f.value;

    // employes
    costEdit.employes = {
      responsableNb: toNum(v.employes?.responsableNb ?? 0),
      responsableCout: toNum(v.employes?.responsableCout ?? 0),
      centralistesNb: toNum(v.employes?.centralistesNb ?? 0),
      centralistesCout: toNum(v.employes?.centralistesCout ?? 0),
    };

    // cab (coût uniquement)
    costEdit.cab = { amortMois: toNum(v.cab?.amortMois ?? 0) };

    // autres couts items
    const items = v.autresCouts?.items ?? [];
    costEdit.autresCouts = items.map((it: any) => ({
      label: String(it.label ?? ""),
      unite: String(it.unite ?? "FORFAIT"),
      valeur: toNum(it.valeur ?? 0),
    }));
  },
  { immediate: true }
);

function sumObj(o: Record<string, number>) {
  return Object.values(o ?? {}).reduce((s, x) => s + toNum(x), 0);
}

function percentOfCA(total: number) {
  return caTotal.value === 0 ? 0 : (total / caTotal.value) * 100;
}

// Totaux sections coûts
const totalCoutM3_m3 = computed(() => sumObj(costEdit.coutM3));
const totalCoutM3_total = computed(() => totalCoutM3_m3.value * volTotal.value);

const totalMensuel_mois = computed(() => sumObj(costEdit.coutMensuel));
const totalMensuel_total = computed(() => totalMensuel_mois.value * dureeMois.value);

const totalOcc_total = computed(() => sumObj(costEdit.coutOccasionnel));
const totalOcc_m3 = computed(() => (volTotal.value === 0 ? 0 : totalOcc_total.value / volTotal.value));
const totalOcc_mois = computed(() => (dureeMois.value === 0 ? 0 : totalOcc_total.value / dureeMois.value));

const totalMaint_mois = computed(() => sumObj(costEdit.maintenance));
const totalMaint_total = computed(() => totalMaint_mois.value * dureeMois.value);

const employes_mois = computed(() => {
  const e = costEdit.employes;
  return toNum(e.responsableNb) * toNum(e.responsableCout) + toNum(e.centralistesNb) * toNum(e.centralistesCout);
});
const employes_total = computed(() => employes_mois.value * dureeMois.value);

const amort_mois = computed(() => toNum(costEdit.cab.amortMois ?? 0));
const amort_total = computed(() => amort_mois.value * dureeMois.value);

// Autres coûts (calc selon unité)
function autreTotal(it: { unite: string; valeur: number }) {
  const u = String(it.unite ?? "FORFAIT");
  const v = toNum(it.valeur ?? 0);
  if (u === "M3") return v * volTotal.value;
  if (u === "MOIS") return v * dureeMois.value;
  if (u === "POURCENT_CA") return (caTotal.value * v) / 100;
  return v; // FORFAIT
}
const autres_total = computed(() => costEdit.autresCouts.reduce((s, it) => s + autreTotal(it), 0));
const autres_m3 = computed(() => (volTotal.value === 0 ? 0 : autres_total.value / volTotal.value));
const autres_mois = computed(() => (dureeMois.value === 0 ? 0 : autres_total.value / dureeMois.value));

// ----------------------------
// Save actions
// ----------------------------
const saving = ref(false);
const saveError = ref<string | null>(null);

async function saveTransport() {
  if (!variant.value) return;
  saving.value = true;
  saveError.value = null;
  try {
await store.updateVariant(variant.value.id, {
  transport: { prixMoyen: Number(transportPrixMoyen.value) },
});

  } catch (e: any) {
    saveError.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

async function saveFormules() {
  if (!variant.value) return;
  saving.value = true;
  saveError.value = null;
  try {
const items = formules.value.map((f) => ({
  id: f.id,
  volumeM3: toNum(fe(f.id).volumeM3),
  momd: toNum(fe(f.id).momd),
}));

await store.updateVariant(variant.value.id, {
  formules: { items },
});

  } catch (e: any) {
    saveError.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

async function saveCouts() {
  if (!variant.value) return;
  saving.value = true;
  saveError.value = null;
  try {
await store.updateVariant(variant.value.id, {
  coutM3: { ...costEdit.coutM3 },
  coutMensuel: { ...costEdit.coutMensuel },
  coutOccasionnel: { ...costEdit.coutOccasionnel },
  maintenance: { ...costEdit.maintenance },
  employes: { ...costEdit.employes },
  cab: { amortMois: Number(amort_mois.value) },
  autresCouts: { items: costEdit.autresCouts },
});

  } catch (e: any) {
    saveError.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

function addAutreCout() {
  costEdit.autresCouts.push({ label: "", unite: "FORFAIT", valeur: 0 });
}
function removeAutreCout(idx: number) {
  costEdit.autresCouts.splice(idx, 1);
}

function toggleComp(id: string) {
  openComp[id] = !openComp[id];
}
</script>

<template>
  <div class="page">
    <!-- NAV -->
    <div class="card nav">
      <div class="navGrid">
        <div class="field">
          <div class="label">P&L</div>
          <select class="select" :value="store.activePnlId" @change="store.setActivePnl(($event.target as HTMLSelectElement).value)">
            <option v-for="p in store.pnls" :key="p.id" :value="p.id">
              {{ p.title }} — {{ p.city }}
            </option>
          </select>
        </div>

        <div class="field">
          <div class="label">Contrat</div>
          <select class="select" :value="selectedContractId" @change="onChangeContract(($event.target as HTMLSelectElement).value)">
            <option v-for="c in contracts" :key="c.id" :value="c.id">
              Durée {{ c.dureeMois }} mois
            </option>
          </select>
        </div>

        <div class="field">
          <div class="label">Variante</div>
          <select class="select" :value="store.activeVariantId" @change="store.setActiveVariant(($event.target as HTMLSelectElement).value)">
            <option v-for="v in variantsOfSelectedContract" :key="v.id" :value="v.id">
              {{ v.title }}
            </option>
          </select>
        </div>

        <div class="navActions">
          <button class="btn" @click="store.loadPnls()" :disabled="store.loading || saving">Recharger</button>
        </div>
      </div>

      <div v-if="saveError" class="errorBox">Erreur: {{ saveError }}</div>
    </div>

    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="!variant" class="card">Aucune variante sélectionnée.</div>

    <template v-else>
      <!-- A) MP variante (readonly) -->
      <div class="card">
        <div class="cardTitle">MP variante</div>

        <div v-if="mpRows.length === 0" class="muted">Aucune MP (sera générée par les formules).</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Cat.</th>
                <th>MP</th>
                <th>Unité</th>
                <th>Fournisseur</th>
                <th>Prix cat.</th>
                <th>Prix var.</th>
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
      </div>

      <!-- B) Transport -->
      <div class="card">
        <div class="rowBetween">
          <div class="cardTitle">Transport</div>
          <button class="btn primary" @click="saveTransport" :disabled="saving">Enregistrer</button>
        </div>

        <div class="grid4">
          <div class="mini">
            <div class="miniLabel">Prix moyen (MAD/m³)</div>
            <input class="input" type="number" step="0.01" v-model.number="transportPrixMoyen" />
          </div>

          <div class="mini">
            <div class="miniLabel">Prix total</div>
            <div class="miniValue">{{ money(transportPrixMoyen * volTotal) }}</div>
          </div>

          <div class="mini">
            <div class="miniLabel">% pompé</div>
            <div class="miniValue">{{ n(volumePompePct, 0) }}%</div>
          </div>

          <div class="mini">
            <div class="miniLabel">% Transport / CA</div>
            <div class="miniValue">{{ n(pctTransport) }}%</div>
          </div>
        </div>
      </div>

      <!-- C) Formules variante -->
      <div class="card">
        <div class="rowBetween">
          <div class="cardTitle">Formules variante</div>
          <button class="btn primary" @click="saveFormules" :disabled="saving">Enregistrer</button>
        </div>

        <!-- C.ii Section KPIs -->
        <div class="kpiRow">
          <div class="kpiBox">
            <div class="kpiLabel">Volume total</div>
            <div class="kpiVal">{{ n(volTotal, 0) }} m³</div>
          </div>
          <div class="kpiBox">
            <div class="kpiLabel">CMP moyen</div>
            <div class="kpiVal">{{ n(cmpMoy) }}</div>
          </div>
          <div class="kpiBox">
            <div class="kpiLabel">MOMD moyen</div>
            <div class="kpiVal">{{ n(momdMoy) }}</div>
          </div>
          <div class="kpiBox">
            <div class="kpiLabel">PV moyen</div>
            <div class="kpiVal">{{ n(pvMoy) }}</div>
          </div>
          <div class="kpiBox">
            <div class="kpiLabel">CA total</div>
            <div class="kpiVal">{{ money(caTotal) }}</div>
          </div>
          <div class="kpiBox">
            <div class="kpiLabel">CMP total</div>
            <div class="kpiVal">{{ money(cmpTotal) }} ({{ n(pctCmp) }}%)</div>
          </div>
          <div class="kpiBox">
            <div class="kpiLabel">MOMD total</div>
            <div class="kpiVal">{{ money(momdTotal) }} ({{ n(pctMomd) }}%)</div>
          </div>
        </div>

        <!-- C.i Table -->
        <div v-if="formules.length === 0" class="muted">Aucune formule dans la variante.</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 34px"></th>
                <th>Désignation</th>
                <th>Comment.</th>
                <th class="right">Qté (m³)</th>
                <th class="right">CMP</th>
                <th class="right">MOMD</th>
                <th class="right">PV calc.</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="f in formules" :key="f.id">
                <tr>
                  <td>
                    <button class="btnTiny" @click="toggleComp(f.id)">
                      {{ openComp[f.id] ? "▾" : "▸" }}
                    </button>
                  </td>
                  <td><b>{{ f.label }}</b></td>
                  <td class="muted">{{ f.comment }}</td>

                  <td class="right">
                    <input class="inputSm right" type="number" step="1" v-model.number="fe(f.id).volumeM3" />
                  </td>

                  <td class="right">{{ n(f.cmp) }}</td>

                  <td class="right">
                    <input class="inputSm right" type="number" step="0.01" v-model.number="fe(f.id).momd" />
                  </td>

                  <td class="right">
                    <b>{{ n(f.cmp + transportPrixMoyen + toNum(fe(f.id).momd)) }}</b>
                  </td>
                </tr>

                <tr v-if="openComp[f.id]">
                  <td colspan="7" class="compCell">
                    <div class="compTitle">Composition (coût / m³)</div>
                    <div class="tableWrap inner">
                      <table class="table small">
                        <thead>
                          <tr>
                            <th>MP</th>
                            <th class="right">Qté</th>
                            <th>Unité</th>
                            <th class="right">Prix</th>
                            <th class="right">Coût/m³</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="c in f.composition" :key="c.mpId">
                            <td>{{ c.mpLabel }}</td>
                            <td class="right">{{ n(c.qty) }}</td>
                            <td>{{ c.mpUnite }}</td>
                            <td class="right">{{ n(c.prixUtilise) }}</td>
                            <td class="right"><b>{{ n(c.coutParM3) }}</b></td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colspan="4" class="right"><b>Total CMP / m³</b></td>
                            <td class="right"><b>{{ n(f.cmp) }}</b></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- D) Coûts & charges -->
      <div class="card">
        <div class="rowBetween">
          <div class="cardTitle">Coûts & charges</div>
          <button class="btn primary" @click="saveCouts" :disabled="saving">Enregistrer</button>
        </div>

        <!-- Maintenance -->
        <div class="costSection">
          <div class="costTitle">Maintenance</div>
          <div class="tableWrap">
            <table class="table small">
              <thead>
                <tr>
                  <th>Coût</th>
                  <th class="right">/mois</th>
                  <th class="right">Total</th>
                  <th class="right">% CA</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(val, key) in costEdit.maintenance" :key="key">
                  <td>{{ key }}</td>
                  <td class="right">
                    <input class="inputSm right" type="number" step="0.01" v-model.number="costEdit.maintenance[key]" />
                  </td>
                  <td class="right">{{ money(toNum(val) * dureeMois) }}</td>
                  <td class="right">{{ n(percentOfCA(toNum(val) * dureeMois)) }}%</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td>
                  <td class="right"><b>{{ n(totalMaint_mois) }}</b></td>
                  <td class="right"><b>{{ money(totalMaint_total) }}</b></td>
                  <td class="right"><b>{{ n(percentOfCA(totalMaint_total)) }}%</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Coûts / m3 -->
        <div class="costSection">
          <div class="costTitle">Coûts / m³</div>
          <div class="tableWrap">
            <table class="table small">
              <thead>
                <tr>
                  <th>Coût</th>
                  <th class="right">/m³</th>
                  <th class="right">Total</th>
                  <th class="right">% CA</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(val, key) in costEdit.coutM3" :key="key">
                  <td>{{ key }}</td>
                  <td class="right">
                    <input class="inputSm right" type="number" step="0.01" v-model.number="costEdit.coutM3[key]" />
                  </td>
                  <td class="right">{{ money(toNum(val) * volTotal) }}</td>
                  <td class="right">{{ n(percentOfCA(toNum(val) * volTotal)) }}%</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td>
                  <td class="right"><b>{{ n(totalCoutM3_m3) }}</b></td>
                  <td class="right"><b>{{ money(totalCoutM3_total) }}</b></td>
                  <td class="right"><b>{{ n(percentOfCA(totalCoutM3_total)) }}%</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Coûts mensuels -->
        <div class="costSection">
          <div class="costTitle">Coûts mensuels</div>
          <div class="tableWrap">
            <table class="table small">
              <thead>
                <tr>
                  <th>Coût</th>
                  <th class="right">/mois</th>
                  <th class="right">Total</th>
                  <th class="right">% CA</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(val, key) in costEdit.coutMensuel" :key="key">
                  <td>{{ key }}</td>
                  <td class="right">
                    <input class="inputSm right" type="number" step="0.01" v-model.number="costEdit.coutMensuel[key]" />
                  </td>
                  <td class="right">{{ money(toNum(val) * dureeMois) }}</td>
                  <td class="right">{{ n(percentOfCA(toNum(val) * dureeMois)) }}%</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td>
                  <td class="right"><b>{{ n(totalMensuel_mois) }}</b></td>
                  <td class="right"><b>{{ money(totalMensuel_total) }}</b></td>
                  <td class="right"><b>{{ n(percentOfCA(totalMensuel_total)) }}%</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Employés -->
        <div class="costSection">
          <div class="costTitle">Employés</div>
          <div class="tableWrap">
            <table class="table small">
              <thead>
                <tr>
                  <th>Poste</th>
                  <th class="right">Nb</th>
                  <th class="right">Coût / mois</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Responsable</td>
                  <td class="right"><input class="inputSm right" type="number" step="1" v-model.number="costEdit.employes.responsableNb" /></td>
                  <td class="right"><input class="inputSm right" type="number" step="0.01" v-model.number="costEdit.employes.responsableCout" /></td>
                </tr>
                <tr>
                  <td>Centralistes</td>
                  <td class="right"><input class="inputSm right" type="number" step="1" v-model.number="costEdit.employes.centralistesNb" /></td>
                  <td class="right"><input class="inputSm right" type="number" step="0.01" v-model.number="costEdit.employes.centralistesCout" /></td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2"><b>Total / mois</b></td>
                  <td class="right"><b>{{ n(employes_mois) }}</b></td>
                </tr>
                <tr>
                  <td colspan="2"><b>Total</b></td>
                  <td class="right"><b>{{ money(employes_total) }} ({{ n(percentOfCA(employes_total)) }}%)</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Occasionnels -->
        <div class="costSection">
          <div class="costTitle">Coûts occasionnels</div>
          <div class="tableWrap">
            <table class="table small">
              <thead>
                <tr>
                  <th>Coût</th>
                  <th class="right">Valeur</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(val, key) in costEdit.coutOccasionnel" :key="key">
                  <td>{{ key }}</td>
                  <td class="right">
                    <input class="inputSm right" type="number" step="0.01" v-model.number="costEdit.coutOccasionnel[key]" />
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td>
                  <td class="right">
                    <b>
                      {{ money(totalOcc_total) }}
                      — /m³ {{ n(totalOcc_m3) }}
                      — /mois {{ n(totalOcc_mois) }}
                      — {{ n(percentOfCA(totalOcc_total)) }}%
                    </b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Amortissement (CAB) -->
        <div class="costSection">
          <div class="costTitle">Amortissement CAB</div>
          <div class="grid3">
            <div class="mini">
              <div class="miniLabel">Amortissement / mois</div>
              <input class="input" type="number" step="0.01" v-model.number="costEdit.cab.amortMois" />
            </div>
            <div class="mini">
              <div class="miniLabel">Total</div>
              <div class="miniValue">{{ money(amort_total) }}</div>
            </div>
            <div class="mini">
              <div class="miniLabel">% CA</div>
              <div class="miniValue">{{ n(percentOfCA(amort_total)) }}%</div>
            </div>
          </div>
        </div>

        <!-- Autres coûts (ajout) -->
        <div class="costSection">
          <div class="rowBetween">
            <div class="costTitle">Autres coûts</div>
            <button class="btn" @click="addAutreCout">Ajouter</button>
          </div>

          <div class="tableWrap">
            <table class="table small">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th style="width: 140px">Unité</th>
                  <th class="right" style="width: 140px">Valeur</th>
                  <th class="right" style="width: 160px">Total</th>
                  <th class="right" style="width: 90px">% CA</th>
                  <th style="width: 44px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(it, idx) in costEdit.autresCouts" :key="idx">
                  <td>
                    <input class="inputSm" v-model="it.label" placeholder="Ex: Frais généraux" />
                  </td>
                  <td>
                    <select class="selectSm" v-model="it.unite">
                      <option value="FORFAIT">FORFAIT</option>
                      <option value="MOIS">MOIS</option>
                      <option value="M3">M3</option>
                      <option value="POURCENT_CA">POURCENT_CA</option>
                    </select>
                  </td>
                  <td class="right">
                    <input class="inputSm right" type="number" step="0.01" v-model.number="it.valeur" />
                  </td>
                  <td class="right">{{ money(autreTotal(it)) }}</td>
                  <td class="right">{{ n(percentOfCA(autreTotal(it))) }}%</td>
                  <td class="right">
                    <button class="btnTiny danger" @click="removeAutreCout(idx)">✕</button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="6">
                    <b>
                      Total {{ money(autres_total) }}
                      — /m³ {{ n(autres_m3) }}
                      — /mois {{ n(autres_mois) }}
                      — {{ n(percentOfCA(autres_total)) }}%
                    </b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- no DEVIS / MAJORATIONS -->
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
}

.nav {
  position: sticky;
  top: 0;
  z-index: 5;
  backdrop-filter: blur(6px);
}

.navGrid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr auto;
  gap: 10px;
  align-items: end;
}

@media (max-width: 980px) {
  .navGrid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 11px;
  color: #6b7280;
}

.select,
.input {
  border: 1px solid #d1d5db;
  border-radius: 9px;
  padding: 7px 9px;
  font-size: 12px;
  outline: none;
}

.navActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 9px;
  padding: 7px 10px;
  font-size: 12px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn:hover {
  background: #f9fafb;
}
.btn.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.btn.primary:hover {
  background: #1d4ed8;
}
.btnTiny {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 3px 7px;
  font-size: 12px;
  cursor: pointer;
}
.btnTiny.danger {
  border-color: #ef4444;
  color: #ef4444;
}
.btnTiny.danger:hover {
  background: #fff5f5;
}

.cardTitle {
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 8px;
}

.rowBetween {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tableWrap {
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.table th,
.table td {
  border-bottom: 1px solid #eef2f7;
  padding: 6px 8px;
  vertical-align: top;
}
.table th {
  background: #fafafa;
  font-size: 11px;
  color: #6b7280;
  position: sticky;
  top: 0;
  z-index: 1;
}
.table.small th,
.table.small td {
  padding: 5px 7px;
  font-size: 11.5px;
}

.right {
  text-align: right;
}

.muted {
  color: #6b7280;
  font-size: 12px;
}

.grid4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 10px;
}
.grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}
@media (max-width: 980px) {
  .grid4,
  .grid3 {
    grid-template-columns: 1fr;
  }
}

.mini {
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 8px;
  background: #fcfcfd;
}
.miniLabel {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 5px;
}
.miniValue {
  font-size: 12.5px;
  font-weight: 800;
}

.inputSm {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 4px 7px;
  font-size: 11.5px;
  width: 100%;
  outline: none;
}
.selectSm {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 4px 7px;
  font-size: 11.5px;
  width: 100%;
  outline: none;
}

.kpiRow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
@media (max-width: 980px) {
  .kpiRow {
    grid-template-columns: 1fr 1fr;
  }
}
.kpiBox {
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 7px 8px;
  background: #fcfcfd;
}
.kpiLabel {
  font-size: 10.5px;
  color: #6b7280;
}
.kpiVal {
  font-size: 12.5px;
  font-weight: 900;
  margin-top: 2px;
}

.compCell {
  background: #fbfbff;
  border-bottom: 1px solid #eef2f7;
}
.compTitle {
  font-size: 11px;
  color: #374151;
  font-weight: 800;
  margin: 2px 0 8px 0;
}
.tableWrap.inner {
  margin-top: 4px;
}

.costSection {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}
.costTitle {
  font-weight: 900;
  font-size: 12px;
  margin-bottom: 8px;
}

.errorBox {
  margin-top: 8px;
  border: 1px solid #ef4444;
  background: #fff5f5;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
}
</style>
