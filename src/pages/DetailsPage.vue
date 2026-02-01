<!-- src/pages/DetailsPage.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

const variant = computed<any>(() => store.activeVariant);
const variantId = computed<string>(() => String(store.activeVariantId ?? ""));

const saving = ref(false);
const error = ref<string | null>(null);
const okMsg = ref<string | null>(null);

/**
 * Draft local (édition UI) -> payload pour PUT /variants/:id
 * On garde une structure souple "any" car ton modèle exact Prisma peut évoluer.
 */
const draft = reactive<any>({
  transport: { prixMoyenM3: 0 },

  cab: { montant: 0 },
  maintenance: { montant: 0 },

  coutM3: { items: [] as any[] }, // ex: [{ label, montantM3 }]
  coutMensuel: { items: [] as any[] }, // ex: [{ label, montantMensuel }]
  coutOccasionnel: { items: [] as any[] }, // ex: [{ label, montant }]
  employes: { items: [] as any[] }, // ex: [{ label, salaireMensuel }]
  autresCouts: { items: [] as any[] }, // ex: [{ label, montant, frequence }]

  formules: { items: [] as any[] }, // ex: VariantFormule (catalogueId, volumeM3, momdM3, ...)
  devis: { items: [] as any[] },
  majorations: { items: [] as any[] },
});

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

function hydrateFromActiveVariant() {
  error.value = null;
  okMsg.value = null;

  const v = variant.value;
  if (!v) return;

  // ⚠️ IMPORTANT: on lit “au mieux” tes sections (noms possibles)
  // Adapte si tes clés sont différentes, mais ça fonctionnera déjà si tu as ces noms.
  const transport = v.sectionTransport ?? v.transport ?? null;
  const cab = v.sectionCab ?? v.cab ?? null;
  const maintenance = v.sectionMaintenance ?? v.maintenance ?? null;

  const coutM3 = v.sectionCoutM3 ?? v.coutM3 ?? null;
  const coutMensuel = v.sectionCoutMensuel ?? v.coutMensuel ?? null;
  const coutOccasionnel = v.sectionCoutOccasionnel ?? v.coutOccasionnel ?? null;
  const employes = v.sectionEmployes ?? v.employes ?? null;
  const autresCouts = v.sectionAutresCouts ?? v.autresCouts ?? null;

  const formules = v.formules ?? v.variantFormules ?? null;
  const devis = v.devis ?? null;
  const majorations = v.majorations ?? null;

  // hydrate draft avec fallback propre
  draft.transport = {
    prixMoyenM3: Number(transport?.prixMoyenM3 ?? transport?.prixTransportM3 ?? 0),
  };

  draft.cab = { montant: Number(cab?.montant ?? 0) };
  draft.maintenance = { montant: Number(maintenance?.montant ?? 0) };

  draft.coutM3 = { items: deepClone(coutM3?.items ?? []) };
  draft.coutMensuel = { items: deepClone(coutMensuel?.items ?? []) };
  draft.coutOccasionnel = { items: deepClone(coutOccasionnel?.items ?? []) };
  draft.employes = { items: deepClone(employes?.items ?? []) };
  draft.autresCouts = { items: deepClone(autresCouts?.items ?? []) };

  draft.formules = { items: deepClone(formules?.items ?? formules ?? []) };
  draft.devis = { items: deepClone(devis?.items ?? []) };
  draft.majorations = { items: deepClone(majorations?.items ?? []) };
}

watch(
  () => variantId.value,
  () => hydrateFromActiveVariant(),
  { immediate: true }
);

const headerKpis = computed(() => store.activeHeaderKPIs);

/* -----------------------------
   Helpers UI
----------------------------- */
function money(v: any) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(isFinite(n) ? n : 0);
}
function num(v: any, digits = 2) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(isFinite(n) ? n : 0);
}
function addRow(target: { items: any[] }, row: any) {
  target.items.push(row);
}
function removeRow(target: { items: any[] }, idx: string | number) {
  const i = typeof idx === "string" ? parseInt(idx, 10) : idx;
  if (!Number.isFinite(i)) return;
  target.items.splice(i, 1);
}


const canEdit = computed(() => !!variant.value && !!variantId.value);

/* -----------------------------
   Save
----------------------------- */
async function saveAll() {
  if (!variantId.value) return;

  saving.value = true;
  error.value = null;
  okMsg.value = null;

  try {
    // payload “large” : le backend fait l’upsert section par section
    const payload: any = {
      transport: { ...draft.transport },
      cab: { ...draft.cab },
      maintenance: { ...draft.maintenance },

      coutM3: deepClone(draft.coutM3),
      coutMensuel: deepClone(draft.coutMensuel),
      coutOccasionnel: deepClone(draft.coutOccasionnel),
      employes: deepClone(draft.employes),
      autresCouts: deepClone(draft.autresCouts),

      formules: deepClone(draft.formules),
      devis: deepClone(draft.devis),
      majorations: deepClone(draft.majorations),
    };

    await (store as any).updateVariant(variantId.value, payload);

    okMsg.value = "Enregistré.";
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div>
        <h1>Détails variante</h1>
        <div class="muted">
          <template v-if="variant">
            <b>{{ variant?.title ?? "Variante" }}</b>
            <span class="sep">•</span>
            ID: <code>{{ variantId }}</code>
          </template>
          <template v-else> Aucune variante active. </template>
        </div>
      </div>

      <div class="actions">
        <button class="btn ghost" @click="hydrateFromActiveVariant" :disabled="!canEdit || saving">
          Recharger
        </button>
        <button class="btn" @click="saveAll" :disabled="!canEdit || saving">
          {{ saving ? "Sauvegarde..." : "Sauvegarder" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="okMsg" class="alert ok">{{ okMsg }}</div>

    <!-- KPIs -->
    <div v-if="variant" class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">CMP (MAD/m³)</div>
        <div class="kpi-val">{{ num(headerKpis?.cmpMoyenM3 ?? headerKpis?.cmp ?? 0, 2) }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">MOMD (MAD/m³)</div>
        <div class="kpi-val">{{ num(headerKpis?.momdMoyenM3 ?? headerKpis?.momd ?? 0, 2) }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Transport (MAD)</div>
        <div class="kpi-val">{{ money(headerKpis?.transportTotal ?? 0) }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">ASP (MAD/m³)</div>
        <div class="kpi-val">{{ num(headerKpis?.asp ?? 0, 2) }}</div>
      </div>
    </div>

    <!-- CONTENT -->
    <div v-if="variant" class="grid">
      <!-- Transport -->
      <section class="card">
        <div class="card-head">
          <h2>Transport</h2>
          <div class="muted">Prix moyen MAD/m³</div>
        </div>

        <div class="row">
          <label>Prix transport (MAD/m³)</label>
          <input class="input" type="number" step="0.01" v-model.number="draft.transport.prixMoyenM3" />
        </div>
      </section>

      <!-- CAB -->
      <section class="card">
        <div class="card-head">
          <h2>CAB</h2>
          <div class="muted">Montant fixe</div>
        </div>
        <div class="row">
          <label>Montant (MAD)</label>
          <input class="input" type="number" step="0.01" v-model.number="draft.cab.montant" />
        </div>
      </section>

      <!-- Maintenance -->
      <section class="card">
        <div class="card-head">
          <h2>Maintenance</h2>
          <div class="muted">Montant fixe</div>
        </div>
        <div class="row">
          <label>Montant (MAD)</label>
          <input class="input" type="number" step="0.01" v-model.number="draft.maintenance.montant" />
        </div>
      </section>

      <!-- Formules -->
      <section class="card full">
        <div class="card-head">
          <h2>Formules (volumes + MOMD)</h2>
          <div class="muted">Édition des formules de la variante</div>
        </div>

        <div class="table">
          <div class="thead">
            <div>Formule</div>
            <div>Volume (m³)</div>
            <div>MOMD (MAD/m³)</div>
            <div></div>
          </div>

          <div
            v-for="(f, idx) in draft.formules.items"
            :key="f.id ?? `${f.formuleCatalogueId ?? 'f'}-${idx}`"
            class="trow"
          >
            <input class="input" v-model="f.label" placeholder="Label (optionnel)" />
            <input class="input" type="number" step="0.01" v-model.number="f.volumeM3" placeholder="0" />
            <input class="input" type="number" step="0.01" v-model.number="f.momdM3" placeholder="0" />
            <button class="icon-btn" title="Supprimer" @click="removeRow(draft.formules, idx)">✕</button>
          </div>
        </div>

        <div class="row end">
          <button
            class="btn ghost"
            @click="addRow(draft.formules, { label: '', volumeM3: 0, momdM3: 0 })"
          >
            + Ajouter une ligne
          </button>
          <div class="muted small">
            NB: si ton backend attend des IDs (formuleCatalogueId, etc.), ajoute-les ici via ta page dédiée “Formules”.
          </div>
        </div>
      </section>

      <!-- Cout au m3 -->
      <section class="card full">
        <div class="card-head">
          <h2>Coûts au m³</h2>
          <div class="muted">Items (MAD/m³)</div>
        </div>

        <div class="table">
          <div class="thead">
            <div>Libellé</div>
            <div>Montant (MAD/m³)</div>
            <div></div>
          </div>

          <div v-for="(it, idx) in draft.coutM3.items" :key="it.id ?? idx" class="trow">
            <input class="input" v-model="it.label" placeholder="Ex: Additif" />
            <input class="input" type="number" step="0.01" v-model.number="it.montantM3" placeholder="0" />
            <button class="icon-btn" @click="removeRow(draft.coutM3, idx)">✕</button>
          </div>
        </div>

        <div class="row end">
          <button class="btn ghost" @click="addRow(draft.coutM3, { label: '', montantM3: 0 })">
            + Ajouter
          </button>
        </div>
      </section>

      <!-- Cout au mois -->
      <section class="card full">
        <div class="card-head">
          <h2>Coûts mensuels</h2>
          <div class="muted">Items (MAD/mois)</div>
        </div>

        <div class="table">
          <div class="thead">
            <div>Libellé</div>
            <div>Montant (MAD/mois)</div>
            <div></div>
          </div>

          <div v-for="(it, idx) in draft.coutMensuel.items" :key="it.id ?? idx" class="trow">
            <input class="input" v-model="it.label" placeholder="Ex: Loyer" />
            <input class="input" type="number" step="0.01" v-model.number="it.montantMensuel" placeholder="0" />
            <button class="icon-btn" @click="removeRow(draft.coutMensuel, idx)">✕</button>
          </div>
        </div>

        <div class="row end">
          <button class="btn ghost" @click="addRow(draft.coutMensuel, { label: '', montantMensuel: 0 })">
            + Ajouter
          </button>
        </div>
      </section>

      <!-- Employés -->
      <section class="card full">
        <div class="card-head">
          <h2>Employés</h2>
          <div class="muted">Salaires / effectifs</div>
        </div>

        <div class="table">
          <div class="thead">
            <div>Poste</div>
            <div>Salaire (MAD/mois)</div>
            <div>Nb</div>
            <div></div>
          </div>

          <div v-for="(it, idx) in draft.employes.items" :key="it.id ?? idx" class="trow">
            <input class="input" v-model="it.label" placeholder="Ex: Chauffeur" />
            <input class="input" type="number" step="0.01" v-model.number="it.salaireMensuel" placeholder="0" />
            <input class="input" type="number" step="1" v-model.number="it.nb" placeholder="1" />
            <button class="icon-btn" @click="removeRow(draft.employes, idx)">✕</button>
          </div>
        </div>

        <div class="row end">
          <button class="btn ghost" @click="addRow(draft.employes, { label: '', salaireMensuel: 0, nb: 1 })">
            + Ajouter
          </button>
        </div>
      </section>

      <!-- Autres coûts -->
      <section class="card full">
        <div class="card-head">
          <h2>Autres coûts</h2>
          <div class="muted">Items libres</div>
        </div>

        <div class="table">
          <div class="thead">
            <div>Libellé</div>
            <div>Montant (MAD)</div>
            <div>Fréquence</div>
            <div></div>
          </div>

          <div v-for="(it, idx) in draft.autresCouts.items" :key="it.id ?? idx" class="trow">
            <input class="input" v-model="it.label" placeholder="Ex: Assurance" />
            <input class="input" type="number" step="0.01" v-model.number="it.montant" placeholder="0" />
            <input class="input" v-model="it.frequence" placeholder="mensuel / m3 / one-shot" />
            <button class="icon-btn" @click="removeRow(draft.autresCouts, idx)">✕</button>
          </div>
        </div>

        <div class="row end">
          <button class="btn ghost" @click="addRow(draft.autresCouts, { label: '', montant: 0, frequence: 'mensuel' })">
            + Ajouter
          </button>
        </div>
      </section>

      <!-- MP de la variante (lecture seule: sync auto) -->
      <section class="card full">
        <div class="card-head">
          <h2>MP variante (sync auto)</h2>
          <div class="muted">Lecture seule — générées depuis les formules</div>
        </div>

        <div class="table">
          <div class="thead">
            <div>MP</div>
            <div>Qté totale (kg)</div>
            <div>CMP (MAD)</div>
          </div>

          <div
            v-for="(mp, idx) in (variant.variantMps ?? variant.mps ?? [])"
            :key="mp.id ?? idx"
            class="trow readonly"
          >
            <div class="cell">{{ mp?.label ?? mp?.mpCatalogue?.label ?? "—" }}</div>
            <div class="cell">{{ num(mp?.qtyKgTotal ?? mp?.qtyKg ?? 0, 2) }}</div>
            <div class="cell">{{ money(mp?.coutTotal ?? 0) }}</div>
          </div>
        </div>

        <div class="muted small" style="margin-top: 8px;">
          Si tu modifies les formules/volumes, le backend recalc/synchronise automatiquement.
        </div>
      </section>
    </div>

    <div v-else class="empty">
      <div class="card">
        <h2>Aucune variante active</h2>
        <p class="muted">
          Va dans “Mes P&L” puis sélectionne un P&L / contrat / variante.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 750;
  color: #111827;
}

.muted {
  color: #6b7280;
  font-size: 0.9rem;
}
.muted.small {
  font-size: 0.8rem;
}
.sep {
  margin: 0 8px;
  color: #9ca3af;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn {
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 650;
  font-size: 0.9rem;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
  color: #111827;
}

.alert {
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 600;
}
.alert.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.alert.ok {
  background: #dcfce7;
  color: #14532d;
  border: 1px solid #bbf7d0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.kpi {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 10px 12px;
}
.kpi-label {
  font-size: 0.8rem;
  color: #6b7280;
  font-weight: 650;
}
.kpi-val {
  margin-top: 6px;
  font-size: 1.1rem;
  font-weight: 800;
  color: #111827;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card.full {
  grid-column: 1 / -1;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.card h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 780;
  color: #111827;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row.end {
  align-items: flex-start;
  gap: 8px;
}
label {
  font-size: 0.85rem;
  color: #374151;
  font-weight: 650;
}
.input {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 0.9rem;
}

.table {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}
.thead,
.trow {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 44px;
  gap: 8px;
  padding: 8px;
  align-items: center;
}
.thead {
  background: #f9fafb;
  font-weight: 750;
  color: #374151;
  font-size: 0.85rem;
}
.trow {
  border-top: 1px solid #f3f4f6;
}
.icon-btn {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
}
.icon-btn:hover {
  background: #f3f4f6;
}

.trow.readonly {
  grid-template-columns: 2fr 1fr 1fr;
}
.cell {
  padding: 6px 2px;
  font-size: 0.9rem;
  color: #111827;
}

.empty {
  padding: 20px 0;
}
code {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 8px;
}
</style>
