<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

const showDebugJson = ref(false);

// ----------------------------
// Helpers
// ----------------------------
function num(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v || 0);
}

function money(v: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

// ----------------------------
// Active data
// ----------------------------
const pnl = computed(() => store.activePnl);
const variant = computed(() => store.activeVariant);
const v = computed(() => variant.value ?? null);

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
  if (store.mpCatalogue.length === 0) await store.loadMpCatalogue();
  if (store.formulesCatalogue.length === 0) await store.loadFormulesCatalogue();

  rebuildMpDraft();
  rebuildFormulesDraft();
});

// ----------------------------
// KPI mini (volume = somme)
// ----------------------------
const totalVolume = computed(() => {
  const items = v.value?.formules?.items ?? [];
  return items.reduce((s: number, x: any) => s + Number(x.volumeM3 ?? 0), 0);
});

const totalCa = computed(() => {
  const items = v.value?.formules?.items ?? [];
  return items.reduce((s: number, x: any) => {
    const vol = Number(x.volumeM3 ?? 0);
    const momd = Number(x.momd ?? 0);
    return s + vol * momd;
  }, 0);
});

// ===================================================
// ✅ MP VARIANTE (add/remove + override prix/comment)
// ===================================================
const mpToAdd = ref<string>("");
const savingMp = ref(false);
const mpError = ref<string | null>(null);
const mpOk = ref(false);

type MpDraftRow = {
  id: string; // VariantMp.id
  mpId: string;
  categorie: string;
  label: string;
  unite: string;
  prixCatalogue: number;
  prixVariante: number; // editable
  comment: string; // editable
};
const mpDraft = ref<MpDraftRow[]>([]);

function rebuildMpDraft() {
  const items = v.value?.mp?.items ?? [];
  mpDraft.value = items.map((it: any) => ({
    id: String(it.id),
    mpId: String(it.mpId),
    categorie: it?.mp?.categorie ?? "",
    label: it?.mp?.label ?? "",
    unite: it?.mp?.unite ?? "",
    prixCatalogue: Number(it?.mp?.prix ?? 0),
    prixVariante: Number(it?.prix ?? it?.mp?.prix ?? 0),
    comment: it?.comment ?? "",
  }));
}

watch(
  () => v.value?.id,
  () => {
    if (!v.value) return;
    rebuildMpDraft();
    rebuildFormulesDraft();
  },
  { immediate: true }
);


const mpCatalogueOptions = computed(() => {
  const already = new Set((v.value?.mp?.items ?? []).map((x: any) => String(x.mpId)));
  return (store.mpCatalogue ?? []).filter((m: any) => !already.has(String(m.id)));
});

async function addMp() {
  mpError.value = null;
  mpOk.value = false;
  if (!mpToAdd.value) return;

  try {
    await store.addMpToActiveVariant(String(mpToAdd.value));
    mpToAdd.value = "";
    rebuildMpDraft();
    mpOk.value = true;
    setTimeout(() => (mpOk.value = false), 1200);
  } catch (e: any) {
    mpError.value = e?.message ?? String(e);
  }
}

async function removeMp(row: MpDraftRow) {
  mpError.value = null;
  mpOk.value = false;

  try {
    await store.removeVariantMp(String(row.id));
    rebuildMpDraft();
    mpOk.value = true;
    setTimeout(() => (mpOk.value = false), 1200);
  } catch (e: any) {
    mpError.value = e?.message ?? String(e);
  }
}

async function saveMpOverrides() {
  mpError.value = null;
  mpOk.value = false;
  savingMp.value = true;

  try {
    for (const r of mpDraft.value) {
      await store.updateVariantMp(String(r.id), {
        prix: Number(r.prixVariante ?? 0),
        comment: String(r.comment ?? ""),
      });
    }
    mpOk.value = true;
    setTimeout(() => (mpOk.value = false), 1200);
  } catch (e: any) {
    mpError.value = e?.message ?? String(e);
  } finally {
    savingMp.value = false;
  }
}

// ===================================================
// ✅ FORMULES VARIANTE (add/remove + edit volume/momd/cmpOverride)
// + EDIT composition qty (catalogue items)
// ===================================================
const formuleToAdd = ref<string>("");
const savingFormules = ref(false);
const formulesError = ref<string | null>(null);
const formulesOk = ref(false);

type FormuleDraftRow = {
  id: string; // VariantFormule.id
  formuleId: string;
  label: string;
  resistance: string;

  volumeM3: number;
  momd: number;
  cmpOverride: number | null;

  // composition (catalogue items)
  composition: Array<{
    id?: string; // FormuleCatalogueItem.id (si dispo)
    mpId: string;
    mpLabel: string;
    mpCategorie: string;
    mpUnite: string;
    qty: number;
  }>;
};

const formulesDraft = ref<FormuleDraftRow[]>([]);

function rebuildFormulesDraft() {
  const items = v.value?.formules?.items ?? [];

  formulesDraft.value = items.map((it: any) => {
    const f = it.formule;

    const composition = (f?.items ?? []).map((fi: any) => ({
      id: fi?.id ? String(fi.id) : undefined,
      mpId: String(fi.mpId),
      mpLabel: fi?.mp?.label ?? "",
      mpCategorie: fi?.mp?.categorie ?? "",
      mpUnite: fi?.mp?.unite ?? "",
      qty: Number(fi.qty ?? 0),
    }));

    return {
      id: String(it.id),
      formuleId: String(it.formuleId),
      label: f?.label ?? "",
      resistance: f?.resistance ?? "",
      volumeM3: Number(it.volumeM3 ?? 0),
      momd: Number(it.momd ?? 0),
      cmpOverride: it.cmpOverride == null ? null : Number(it.cmpOverride),
      composition,
    };
  });
}

const formulesCatalogueOptions = computed(() => {
  const already = new Set((v.value?.formules?.items ?? []).map((x: any) => String(x.formuleId)));
  return (store.formulesCatalogue ?? []).filter((f: any) => !already.has(String(f.id)));
});

async function addFormule() {
  formulesError.value = null;
  formulesOk.value = false;
  if (!formuleToAdd.value) return;

  try {
    await store.addFormuleToActiveVariant(String(formuleToAdd.value));
    formuleToAdd.value = "";
    rebuildFormulesDraft();
    formulesOk.value = true;
    setTimeout(() => (formulesOk.value = false), 1200);
  } catch (e: any) {
    formulesError.value = e?.message ?? String(e);
  }
}

async function removeFormule(row: FormuleDraftRow) {
  formulesError.value = null;
  formulesOk.value = false;

  try {
    await store.removeVariantFormule(String(row.id));
    rebuildFormulesDraft();
    formulesOk.value = true;
    setTimeout(() => (formulesOk.value = false), 1200);
  } catch (e: any) {
    formulesError.value = e?.message ?? String(e);
  }
}

async function saveFormules() {
  formulesError.value = null;
  formulesOk.value = false;
  savingFormules.value = true;

  try {
    // 1) save VariantFormule (volume/momd/cmpOverride)
    for (const r of formulesDraft.value) {
      await store.updateVariantFormule(String(r.id), {
        volumeM3: Number(r.volumeM3 ?? 0),
        momd: Number(r.momd ?? 0),
        cmpOverride: r.cmpOverride == null ? null : Number(r.cmpOverride),
      });
    }

    // 2) save catalogue composition qty
    // on update via endpoint /formules-catalogue/:id/items (replace all items)
    // ⚠️ impacte toutes les variantes utilisant cette formule
    for (const r of formulesDraft.value) {
      const payload = {
        items: r.composition.map((c) => ({ mpId: String(c.mpId), qty: Number(c.qty ?? 0) })),
      };

      const res = await fetch(`http://localhost:3001/formules-catalogue/${r.formuleId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
    }

    // reload catalogue + pnls (pour refléter composition)
    await store.loadFormulesCatalogue();
    await store.loadPnls();

    formulesOk.value = true;
    setTimeout(() => (formulesOk.value = false), 1200);
  } catch (e: any) {
    formulesError.value = e?.message ?? String(e);
  } finally {
    savingFormules.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1>Mes P&L</h1>
        <p class="subtitle">Edition (MP + Formules + volumes/MOMD/CMP + quantités composition)</p>
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
              :value="store.activePnlId ?? ''"
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
              :value="store.activeVariantId ?? ''"
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
<div v-if="!v" class="card error">
  Aucune variante active. Clique sur Recharger ou sélectionne un PNL/Variante.
</div>

      <!-- KPI mini -->
      <div v-if="v" class="grid2">
        <div class="card kpi">
          <div class="kpiLabel">Volume total (Σ volumes formules)</div>
          <div class="kpiValue">{{ num(totalVolume, 0) }} m³</div>
        </div>

        <div class="card kpi">
          <div class="kpiLabel">CA total (Σ vol * MOMD)</div>
          <div class="kpiValue">{{ money(totalCa) }}</div>
        </div>
      </div>

      <!-- ========================= -->
      <!-- ✅ MP VARIANTE -->
      <!-- ========================= -->
      <div v-if="v" class="card">
        <div class="between">
          <div>
            <h2>🧱 MP Variante</h2>
            <div class="muted">Ajouter / supprimer + override prix/comment</div>
          </div>

          <div class="row" style="gap: 8px">
            <button class="btn primary" :disabled="savingMp" @click="saveMpOverrides">
              💾 Enregistrer (MP)
            </button>
            <span v-if="mpOk" class="ok">✅ OK</span>
            <span v-if="mpError" class="err">❌ {{ mpError }}</span>
          </div>
        </div>

        <div class="row" style="margin-top: 10px">
          <div class="field" style="min-width: 360px">
            <div class="label">Ajouter une MP</div>
            <select class="select" v-model="mpToAdd">
              <option value="">-- sélectionner --</option>
              <option v-for="m in mpCatalogueOptions" :key="m.id" :value="String(m.id)">
                {{ m.categorie }} - {{ m.label }} ({{ num(m.prix) }} / {{ m.unite }})
              </option>
            </select>
          </div>

          <button class="btn" :disabled="!mpToAdd" @click="addMp">+ Ajouter</button>
        </div>

        <div v-if="mpDraft.length === 0" class="muted" style="margin-top: 10px">
          Aucune MP dans cette variante.
        </div>

        <div v-else class="tableWrap">
          <table class="table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>MP</th>
                <th>Unité</th>
                <th>Prix catalogue</th>
                <th>Prix variante</th>
                <th>Commentaire</th>
                <th style="width: 90px"></th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="r in mpDraft" :key="r.id">
                <td>{{ r.categorie }}</td>
                <td><b>{{ r.label }}</b></td>
                <td>{{ r.unite }}</td>
                <td>{{ num(r.prixCatalogue) }}</td>
                <td style="width: 140px">
                  <input class="input" type="number" v-model.number="r.prixVariante" />
                </td>
                <td>
                  <input class="input" v-model="r.comment" />
                </td>
                <td>
                  <button class="btn danger" @click="removeMp(r)">Suppr</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========================= -->
      <!-- ✅ FORMULES VARIANTE -->
      <!-- ========================= -->
      <div v-if="v" class="card">
        <div class="between">
          <div>
            <h2>🧪 Formules Variante</h2>
            <div class="muted">Ajouter/supprimer + Volume/MOMD/CMP override + qty composition (catalogue)</div>
          </div>

          <div class="row" style="gap: 8px">
            <button class="btn primary" :disabled="savingFormules" @click="saveFormules">
              💾 Enregistrer (Formules + Qty)
            </button>
            <span v-if="formulesOk" class="ok">✅ OK</span>
            <span v-if="formulesError" class="err">❌ {{ formulesError }}</span>
          </div>
        </div>

        <div class="row" style="margin-top: 10px">
          <div class="field" style="min-width: 360px">
            <div class="label">Ajouter une Formule</div>
            <select class="select" v-model="formuleToAdd">
              <option value="">-- sélectionner --</option>
              <option v-for="f in formulesCatalogueOptions" :key="f.id" :value="String(f.id)">
                {{ f.label }} ({{ f.resistance }})
              </option>
            </select>
          </div>

          <button class="btn" :disabled="!formuleToAdd" @click="addFormule">+ Ajouter</button>
        </div>

        <div v-if="formulesDraft.length === 0" class="muted" style="margin-top: 10px">
          Aucune formule dans cette variante.
        </div>

        <div v-else class="formules">
          <div v-for="f in formulesDraft" :key="f.id" class="formuleCard">
            <div class="between">
              <div>
                <div class="formuleTitle">{{ f.label }}</div>
                <div class="muted">{{ f.resistance }}</div>
              </div>

              <button class="btn danger" @click="removeFormule(f)">Suppr formule</button>
            </div>

            <div class="grid3" style="margin-top: 10px">
              <div class="field">
                <div class="label">Volume (m³)</div>
                <input class="input" type="number" v-model.number="f.volumeM3" />
              </div>

              <div class="field">
                <div class="label">MOMD (MAD/m³)</div>
                <input class="input" type="number" v-model.number="f.momd" />
              </div>

              <div class="field">
                <div class="label">CMP override (MAD/m³) (optionnel)</div>
                <input class="input" type="number" v-model.number="f.cmpOverride" />
                <div class="muted" style="margin-top: 4px">Vide = CMP calculé via composition</div>
              </div>
            </div>

            <div class="muted" style="margin-top: 10px">Composition (catalogue) - qty par m³</div>

            <div class="tableWrap">
              <table class="table small">
                <thead>
                  <tr>
                    <th>MP</th>
                    <th>Catégorie</th>
                    <th>Qty / m³</th>
                    <th>Unité</th>
                  </tr>
                </thead>

                <tbody>
                  <tr v-for="c in f.composition" :key="c.mpId">
                    <td>{{ c.mpLabel }}</td>
                    <td>{{ c.mpCategorie }}</td>
                    <td style="width: 160px">
                      <input class="input" type="number" v-model.number="c.qty" />
                    </td>
                    <td>{{ c.mpUnite }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="muted" style="margin-top: 6px">
              ⚠️ Modifier qty ici modifie le catalogue de la formule (impact global).
            </div>
          </div>
        </div>
      </div>

      <!-- JSON DEBUG -->
      <div v-if="showDebugJson" class="card">
        <h2>🧾 JSON Variante (debug)</h2>
        <pre class="pre">{{ JSON.stringify(variant, null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:14px; padding:16px; }
.topbar { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
h1 { margin:0; font-size:22px; }
.subtitle { margin:4px 0 0 0; color:#6b7280; font-size:13px; }
.actions { display:flex; gap:8px; flex-wrap:wrap; }

.btn { border:1px solid #d1d5db; padding:8px 10px; border-radius:10px; background:white; cursor:pointer; }
.btn:hover { background:#f9fafb; }
.primary { background:#111827; color:white; border-color:#111827; }
.primary:hover { background:#0b1020; }
.danger { border-color:#fecaca; background:#fff5f5; }
.danger:hover { background:#ffecec; }

.card { background:white; border:1px solid #e5e7eb; border-radius:14px; padding:14px; }
.error { border-color:#ef4444; background:#fff5f5; }

.row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.between { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; }

.field { display:flex; flex-direction:column; gap:6px; min-width:260px; }
.label { font-size:12px; color:#6b7280; }
.select { padding:8px 10px; border:1px solid #d1d5db; border-radius:10px; }
.input { padding:8px 10px; border:1px solid #d1d5db; border-radius:10px; width:100%; box-sizing:border-box; }

.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
@media (max-width:950px){ .grid2,.grid3{ grid-template-columns:1fr; } }

.kpi { display:flex; flex-direction:column; gap:4px; }
.kpiLabel { color:#6b7280; font-size:12px; }
.kpiValue { font-size:20px; font-weight:800; }

.tableWrap { overflow:auto; margin-top:10px; }
.table { width:100%; border-collapse:collapse; font-size:13px; }
.table th,.table td { border-bottom:1px solid #e5e7eb; padding:8px 10px; text-align:left; vertical-align:top; }
.table th { font-size:12px; color:#6b7280; background:#fafafa; }
.table.small td,.table.small th { padding:6px 8px; font-size:12px; }

.formules { display:flex; flex-direction:column; gap:12px; margin-top:10px; }
.formuleCard { border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#fcfcfd; }
.formuleTitle { font-size:16px; font-weight:800; }

.muted { color:#6b7280; font-size:13px; }
.ok { color:#16a34a; font-size:13px; }
.err { color:#dc2626; font-size:13px; }

.pre { background:#0b1020; color:#e5e7eb; padding:12px; border-radius:12px; overflow:auto; font-size:12px; }
</style>
