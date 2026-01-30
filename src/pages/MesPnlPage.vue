<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();
const showDebugJson = ref(false);

onMounted(async () => {
  if (store.pnls.length === 0) {
    await store.loadPnls();
  }
});

// ----------------------------
// Helpers
// ----------------------------
function money(v: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function num(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v || 0);
}

function yn(v: any) {
  return v == null ? "Non renseigné" : "OK";
}

// ----------------------------
// Active data
// ----------------------------
const pnl = computed(() => store.activePnl);
const variant = computed(() => store.activeVariant);

// Petit helper pour simplifier template
const v = computed(() => variant.value ?? null);

// ----------------------------
// MP table (variant.mp.items)
// ----------------------------
type MpRow = {
  id: string;
  categorie: string;
  label: string;
  unite: string;
  fournisseur: string;
  city: string;
  region: string;
  prixCatalogue: number;
  prixVariante: number | null;
  prixUtilise: number;
  comment: string;
};

const mpItems = computed<MpRow[]>(() => {
  const items = v.value?.mp?.items ?? [];
  return items.map((it: any) => {
    const catalogPrice = it?.mp?.prix ?? 0;
    const variantPrice = it?.prix ?? null;

    return {
      id: it.id,
      categorie: it?.mp?.categorie ?? "",
      label: it?.mp?.label ?? "",
      unite: it?.mp?.unite ?? "",
      fournisseur: it?.mp?.fournisseur ?? "",
      city: it?.mp?.city ?? "",
      region: it?.mp?.region ?? "",
      prixCatalogue: catalogPrice,
      prixVariante: variantPrice,
      prixUtilise: variantPrice ?? catalogPrice,
      comment: it?.comment ?? "",
    };
  });
});

// ----------------------------
// Formules + calculs MP
// ----------------------------
type FormuleRow = {
  id: string;
  label: string;
  resistance: string;
  volumeM3: number;
  momd: number;

  coutMpParM3: number;
  coutMpTotal: number;
  caTotal: number;

  composition: Array<{
    mpLabel: string;
    mpCategorie: string;
    mpUnite: string;
    qty: number;
    prixUtilise: number;
    coutParM3: number;
  }>;
};

function getMpPriceForVariant(mpId: string): number {
  const items = v.value?.mp?.items ?? [];

  // prix variante prioritaire
  const vmp = items.find((x: any) => x.mpId === mpId);
  if (vmp?.prix != null) return vmp.prix;

  // sinon prix catalogue
  const mp = vmp?.mp;
  if (mp?.prix != null) return mp.prix;

  return 0;
}

const formulesRows = computed<FormuleRow[]>(() => {
  const items = v.value?.formules?.items ?? [];

  return items.map((it: any) => {
    const f = it.formule;

    const composition = (f?.items ?? []).map((fi: any) => {
      const mpId = fi.mpId;
      const prixUtilise = getMpPriceForVariant(mpId);

      const qty = fi.qty ?? 0; // kg/m3 (ou unité de la MP)
      const coutParM3 = qty * prixUtilise;

      return {
        mpLabel: fi?.mp?.label ?? "",
        mpCategorie: fi?.mp?.categorie ?? "",
        mpUnite: fi?.mp?.unite ?? "",
        qty,
        prixUtilise,
        coutParM3,
      };
    });

    // ✅ FIX TS: x doit avoir coutParM3, pas volumeM3
    const coutMpParM3 = composition.reduce(
      (s: number, x: { coutParM3: number }) => s + x.coutParM3,
      0
    );

    const volumeM3 = it.volumeM3 ?? 0;
    const coutMpTotal = coutMpParM3 * volumeM3;

    const momd = it.momd ?? 0;
    const caTotal = momd * volumeM3;

    return {
      id: it.id,
      label: f?.label ?? "",
      resistance: f?.resistance ?? "",
      volumeM3,
      momd,
      coutMpParM3,
      coutMpTotal,
      caTotal,
      composition,
    };
  });
});

// ----------------------------
// GLOBAL KPI (basés sur formules)
// ----------------------------
const totalVolume = computed(() => formulesRows.value.reduce((s, x) => s + x.volumeM3, 0));
const totalCa = computed(() => formulesRows.value.reduce((s, x) => s + x.caTotal, 0));
const totalMpCost = computed(() => formulesRows.value.reduce((s, x) => s + x.coutMpTotal, 0));

const prixMoyenM3 = computed(() => (totalVolume.value === 0 ? 0 : totalCa.value / totalVolume.value));
const coutMpMoyenM3 = computed(() => (totalVolume.value === 0 ? 0 : totalMpCost.value / totalVolume.value));

const margeBrute = computed(() => totalCa.value - totalMpCost.value);
const margeBrutePct = computed(() => (totalCa.value === 0 ? 0 : (margeBrute.value / totalCa.value) * 100));

// ----------------------------
// Sections config (TOUJOURS affichées)
// ----------------------------
const sections = computed(() => {
  const vv: any = v.value;
  return [
    { key: "transport", title: "🚚 Transport", data: vv?.transport },
    { key: "cab", title: "🏗️ CAB", data: vv?.cab },
    { key: "maintenance", title: "🛠️ Maintenance", data: vv?.maintenance },
    { key: "coutM3", title: "📏 Coûts / m³", data: vv?.coutM3 },
    { key: "coutMensuel", title: "📅 Coûts mensuels", data: vv?.coutMensuel },
    { key: "coutOccasionnel", title: "🧾 Coûts occasionnels", data: vv?.coutOccasionnel },
    { key: "employes", title: "👷 Employés", data: vv?.employes },
    { key: "autresCouts", title: "➕ Autres coûts", data: vv?.autresCouts },
    { key: "majorations", title: "📈 Majorations", data: vv?.majorations },
    { key: "devis", title: "📄 Devis", data: vv?.devis },
    // MP + Formules ont leur UI dédiée en dessous, mais on les garde aussi visibles via statut
    { key: "mp", title: "🧱 Matières premières", data: vv?.mp },
    { key: "formules", title: "🧪 Formules", data: vv?.formules },
  ] as Array<{ key: string; title: string; data: any }>;
});
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Mes P&L</h1>
        <p class="subtitle">Visualisation complète (PNL → Contrat → Variante → Sections)</p>
      </div>

      <div class="actions">
        <button class="btn" @click="store.loadPnls()">🔄 Recharger</button>
        <button class="btn" @click="showDebugJson = !showDebugJson">
          {{ showDebugJson ? "Masquer JSON" : "Afficher JSON" }}
        </button>
      </div>
    </div>

    <div v-if="store.loading" class="card">Chargement...</div>
    <div v-else-if="store.error" class="card error">
      <b>Erreur :</b> {{ store.error }}
    </div>

    <template v-else>
      <!-- Selectors -->
      <div class="card">
        <div class="row">
          <div class="field">
            <div class="label">PNL</div>
            <select
              class="select"
              :value="store.activePnlId"
              @change="store.setActivePnl(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="p in store.pnls" :key="p.id" :value="p.id">
                {{ p.title }} ({{ p.city }})
              </option>
            </select>
          </div>

          <div class="field" v-if="pnl">
            <div class="label">Variante</div>
            <select
              class="select"
              :value="store.activeVariantId"
              @change="store.setActiveVariant(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="vv in pnl.contracts?.flatMap((c:any)=>c.variants ?? [])"
                :key="vv.id"
                :value="vv.id"
              >
                {{ vv.title }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Header infos -->
      <div v-if="pnl && variant" class="grid2">
        <div class="card">
          <h2>📌 Infos PNL</h2>
          <div class="kv">
            <div><b>Titre :</b> {{ pnl.title }}</div>
            <div><b>Client :</b> {{ pnl.client ?? "-" }}</div>
            <div><b>Modèle :</b> {{ pnl.model }}</div>
            <div><b>Ville :</b> {{ pnl.city }} / {{ pnl.region }}</div>
            <div><b>Status :</b> {{ pnl.status }}</div>
          </div>
        </div>

        <div class="card">
          <h2>📌 Infos Variante</h2>
          <div class="kv">
            <div><b>Titre :</b> {{ variant.title }}</div>
            <div><b>Status :</b> {{ variant.status }}</div>
            <div><b>Description :</b> {{ variant.description ?? "-" }}</div>
          </div>
        </div>
      </div>

      <!-- KPI -->
      <div v-if="variant" class="grid3">
        <div class="card kpi">
          <div class="kpiLabel">Volume total</div>
          <div class="kpiValue">{{ num(totalVolume, 0) }} m³</div>
        </div>

        <div class="card kpi">
          <div class="kpiLabel">CA total (MOMD)</div>
          <div class="kpiValue">{{ money(totalCa) }}</div>
          <div class="kpiSub">{{ num(prixMoyenM3) }} MAD / m³</div>
        </div>

        <div class="card kpi">
          <div class="kpiLabel">Coût MP total</div>
          <div class="kpiValue">{{ money(totalMpCost) }}</div>
          <div class="kpiSub">{{ num(coutMpMoyenM3) }} MAD / m³</div>
        </div>
      </div>

      <div v-if="variant" class="grid2">
        <div class="card kpi">
          <div class="kpiLabel">Marge brute</div>
          <div class="kpiValue">{{ money(margeBrute) }}</div>
          <div class="kpiSub">{{ num(margeBrutePct) }} %</div>
        </div>

        <div class="card">
          <h2>⚠️ Note</h2>
          <p class="muted">
            Pour l’instant, la marge brute = CA - coût MP.
            <br />
            Plus tard on ajoutera transport, énergie, employés, maintenance, amortissements, etc.
          </p>
        </div>
      </div>

      <!-- ✅ TOUS LES BLOCS (toujours visibles) -->
      <div v-if="variant" class="card">
        <h2>🧩 Sections (toujours affichées)</h2>
        <div class="muted" style="margin-top:6px">
          Chaque section est affichée même si elle est vide dans le JSON.
        </div>

        <div class="sectionsGrid">
          <div v-for="s in sections" :key="s.key" class="sectionCard">
            <div class="sectionTitle">{{ s.title }}</div>

            <div v-if="s.data == null" class="muted">Non renseigné</div>

            <!-- cas: sections "items" (mp, formules) : juste résumé -->
            <div v-else-if="s.key === 'mp'">
              <div class="kv">
                <div><b>items:</b> {{ (s.data?.items?.length ?? 0) }}</div>
              </div>
            </div>

            <div v-else-if="s.key === 'formules'">
              <div class="kv">
                <div><b>items:</b> {{ (s.data?.items?.length ?? 0) }}</div>
              </div>
            </div>

            <div v-else-if="s.key === 'autresCouts'">
  <div class="kv">
    <div><b>items:</b> {{ (s.data?.items?.length ?? 0) }}</div>
  </div>
</div>

            <!-- cas générique: objet plat -->
            <div v-else class="kv">
              <div v-for="(val, key) in s.data" :key="key">
                <b>{{ key }} :</b>
                <span v-if="typeof val === 'number'">{{ num(val) }}</span>
                <span v-else>{{ val ?? "-" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- MP TABLE -->
      <div v-if="variant" class="card">
        <h2>🧱 Matières premières (Variante)</h2>

        <div v-if="mpItems.length === 0" class="muted">Aucune MP liée à cette variante.</div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>MP</th>
                <th>Unité</th>
                <th>Fournisseur</th>
                <th>Ville</th>
                <th>Prix catalogue</th>
                <th>Prix variante</th>
                <th>Prix utilisé</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="m in mpItems" :key="m.id">
                <td>{{ m.categorie }}</td>
                <td>{{ m.label }}</td>
                <td>{{ m.unite }}</td>
                <td>{{ m.fournisseur }}</td>
                <td>{{ m.city }}</td>
                <td>{{ num(m.prixCatalogue) }}</td>
                <td>{{ m.prixVariante == null ? "-" : num(m.prixVariante) }}</td>
                <td><b>{{ num(m.prixUtilise) }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- FORMULES -->
      <div v-if="variant" class="card">
        <h2>🧪 Formules (Volumes + composition)</h2>

        <div v-if="formulesRows.length === 0" class="muted">
          Aucune formule liée à cette variante.
        </div>

        <div v-else class="formules">
          <div v-for="f in formulesRows" :key="f.id" class="formuleCard">
            <div class="formuleHeader">
              <div>
                <div class="formuleTitle">{{ f.label }}</div>
                <div class="muted">{{ f.resistance }}</div>
              </div>

              <div class="formuleKpis">
                <div>
                  <div class="muted">Volume</div>
                  <b>{{ num(f.volumeM3, 0) }} m³</b>
                </div>

                <div>
                  <div class="muted">MOMD</div>
                  <b>{{ num(f.momd) }} MAD/m³</b>
                </div>

                <div>
                  <div class="muted">Coût MP/m³</div>
                  <b>{{ num(f.coutMpParM3) }} MAD/m³</b>
                </div>

                <div>
                  <div class="muted">Coût MP total</div>
                  <b>{{ money(f.coutMpTotal) }}</b>
                </div>

                <div>
                  <div class="muted">CA total</div>
                  <b>{{ money(f.caTotal) }}</b>
                </div>
              </div>
            </div>

            <div class="tableWrap">
              <table class="table small">
                <thead>
                  <tr>
                    <th>MP</th>
                    <th>Catégorie</th>
                    <th>Qté / m³</th>
                    <th>Unité</th>
                    <th>Prix utilisé</th>
                    <th>Coût / m³</th>
                  </tr>
                </thead>

                <tbody>
                  <tr v-for="c in f.composition" :key="c.mpLabel">
                    <td>{{ c.mpLabel }}</td>
                    <td>{{ c.mpCategorie }}</td>
                    <td>{{ num(c.qty) }}</td>
                    <td>{{ c.mpUnite }}</td>
                    <td>{{ num(c.prixUtilise) }}</td>
                    <td><b>{{ num(c.coutParM3) }}</b></td>
                  </tr>
                </tbody>

                <tfoot>
                  <tr>
                    <td colspan="5" style="text-align:right"><b>Total coût MP / m³</b></td>
                    <td><b>{{ num(f.coutMpParM3) }}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ✅ AUTRES COUTS (ITEMS) -->
<div v-if="variant" class="card">
  <h2>➕ Autres coûts</h2>

  <div v-if="(v?.autresCouts?.items?.length ?? 0) === 0" class="muted">
    Aucun coût.
  </div>

  <div v-else class="tableWrap">
    <table class="table">
      <thead>
        <tr>
          <th>Désignation</th>
          <th>Unité</th>
          <th>Valeur</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="it in (v?.autresCouts?.items ?? [])" :key="it.id">
          <td>{{ it.label }}</td>
          <td>{{ it.unite }}</td>
          <td><b>{{ num(it.valeur) }}</b></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- JSON DEBUG -->
<div v-if="showDebugJson" class="card">
  ...
</div>

      <!-- JSON DEBUG -->
      <div v-if="showDebugJson" class="card">
        <h2>🧾 JSON Variante (debug)</h2>
        <!-- ✅ variant est un computed ref -> stringify variant.value -->
        <pre class="pre">{{ JSON.stringify(variant, null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

h1 {
  margin: 0;
  font-size: 22px;
}

.subtitle {
  margin: 4px 0 0 0;
  color: #6b7280;
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid #d1d5db;
  padding: 8px 10px;
  border-radius: 10px;
  background: white;
  cursor: pointer;
}

.btn:hover {
  background: #f9fafb;
}

.card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px;
}

.error {
  border-color: #ef4444;
  background: #fff5f5;
}

.row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 260px;
}

.label {
  font-size: 12px;
  color: #6b7280;
}

.select {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
}

@media (max-width: 950px) {
  .grid2,
  .grid3 {
    grid-template-columns: 1fr;
  }
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.muted {
  color: #6b7280;
  font-size: 13px;
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpiLabel {
  color: #6b7280;
  font-size: 12px;
}

.kpiValue {
  font-size: 20px;
  font-weight: 800;
}

.kpiSub {
  font-size: 12px;
  color: #6b7280;
}

.tableWrap {
  overflow: auto;
  margin-top: 10px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.table th {
  font-size: 12px;
  color: #6b7280;
  background: #fafafa;
}

.table.small td,
.table.small th {
  padding: 6px 8px;
  font-size: 12px;
}

.formules {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.formuleCard {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  background: #fcfcfd;
}

.formuleHeader {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.formuleTitle {
  font-size: 16px;
  font-weight: 800;
}

.formuleKpis {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.pre {
  background: #0b1020;
  color: #e5e7eb;
  padding: 12px;
  border-radius: 12px;
  overflow: auto;
  font-size: 12px;
}

/* ✅ Sections grid */
.sectionsGrid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 950px) {
  .sectionsGrid {
    grid-template-columns: 1fr;
  }
}

.sectionCard {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  background: #fcfcfd;
}

.sectionTitle {
  font-weight: 800;
  margin-bottom: 8px;
}
</style>
