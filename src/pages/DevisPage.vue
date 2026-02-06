<!-- src/pages/DevisPage.vue (FICHIER COMPLET) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

type DevisLineItem = { label: string; unite?: string; qty?: number; prix?: number; note?: string };

const store = usePnlStore();

const variant = computed<any | null>(() => (store as any).activeVariant ?? null);
const contract = computed<any | null>(() => (store as any).activeContract ?? null);
const pnl = computed<any | null>(() => (store as any).activePnl ?? null);

const saving = ref(false);
const error = ref<string | null>(null);

const applyMajorations = ref(false);

const draft = reactive({
  meta: { date: "", titreProjet: "", client: "", lieu: "" },
  intro: "",
  rappel: { dureeMois: 0, quantiteM3: 0 },
  chargeFournisseur: [] as DevisLineItem[],
  chargeClient: [] as DevisLineItem[],
  prixComplementaires: [] as DevisLineItem[],
  validiteTexte: "",
  signature: { nom: "", poste: "", telephone: "" },
  surcharges: {} as Record<string, number>, // { [variantFormuleId]: surcharge }
});

function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n(v));
}
function roundToNearest5(x: number): number {
  const v = n(x);
  return Math.round(v / 5) * 5;
}
function parseJson(raw: any, fallback: any) {
  try {
    if (!raw) return fallback;
    if (typeof raw === "object") return raw;
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

const rows = computed<any[]>(() => variant.value?.formules?.items ?? []);
const volumeTotal = computed(() => rows.value.reduce((s, r) => s + n(r?.volumeM3), 0));

function readPersistedMajorations(v: any): Record<string, number> {
  try {
    const raw = v?.autresCouts?.majorations;
    if (!raw) return {};
    if (typeof raw === "object") return raw as Record<string, number>;
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function getMajPct(key: string, persisted: Record<string, number>): number {
  return n((persisted as any)[key]);
}
function applyPct(value: number, pct: number): number {
  return value * (1 + pct / 100);
}
function pricePerKg(prixDhPerTonne: number): number {
  const p = n(prixDhPerTonne);
  return p > 0 ? p / 1000 : 0;
}
function mpPrixUsed(mpId: string): number {
  const items = variant.value?.mp?.items ?? [];
  const vmp = items.find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return n(vmp.prix);
  return n(vmp?.mp?.prix);
}
function cmpFormuleM3(formule: any, withMaj: boolean, persistedMaj: Record<string, number>): number {
  const compo = formule?.items ?? [];
  return (compo ?? []).reduce((s: number, it: any) => {
    const mpId = String(it?.mpId ?? "");
    const qtyKg = n(it?.qty);
    const prixDhT = mpPrixUsed(mpId);
    const prixKgBase = pricePerKg(prixDhT);

    if (!withMaj) return s + qtyKg * prixKgBase;

    const pct = getMajPct(`mp:${mpId}`, persistedMaj);
    const prixKg = applyPct(prixKgBase, pct);
    return s + qtyKg * prixKg;
  }, 0);
}
function transportM3(withMaj: boolean, persistedMaj: Record<string, number>): number {
  const base = n(variant.value?.transport?.prixMoyen);
  if (!withMaj) return base;
  const pct = getMajPct("transport.prixMoyen", persistedMaj);
  return applyPct(base, pct);
}

function prixCalcule(row: any): number {
  const formule = row?.formule;
  const cmpOverride = row?.cmpOverride;
  const cmp = cmpOverride != null ? n(cmpOverride) : cmpFormuleM3(formule, false, {});
  const t = transportM3(false, {});
  const momd = n(row?.momd);
  return cmp + t + momd;
}
function prixCalculeAvecMajDirect(row: any, persistedMaj: Record<string, number>): number {
  const formule = row?.formule;
  const cmpOverride = row?.cmpOverride;
  const cmp = cmpOverride != null ? n(cmpOverride) : cmpFormuleM3(formule, true, persistedMaj);
  const t = transportM3(true, persistedMaj);
  const momd = n(row?.momd);
  return cmp + t + momd;
}

const impactMajPerM3 = computed(() => {
  if (!variant.value) return 0;
  if (!applyMajorations.value) return 0;

  const persistedMaj = readPersistedMajorations(variant.value);
  const volTot = volumeTotal.value;
  if (volTot <= 0) return 0;

  const caBase = rows.value.reduce((s, r) => s + prixCalcule(r) * n(r?.volumeM3), 0);
  const caMaj = rows.value.reduce((s, r) => s + prixCalculeAvecMajDirect(r, persistedMaj) * n(r?.volumeM3), 0);

  return (caMaj - caBase) / volTot;
});

function prixAvecMajoration(row: any): number {
  return prixCalcule(row) + impactMajPerM3.value;
}
function prixPondere(row: any): number {
  const base = applyMajorations.value ? prixAvecMajoration(row) : prixCalcule(row);
  return roundToNearest5(base);
}
function getSurcharge(row: any): number {
  return n(draft.surcharges[String(row?.id ?? "")]);
}
function setSurcharge(row: any, v: any) {
  const id = String(row?.id ?? "");
  const x = Number(v);
  draft.surcharges[id] = Number.isFinite(x) ? x : 0;
}
function prixDefinitif(row: any): number {
  return prixPondere(row) + getSurcharge(row);
}

function hydrate() {
  const v = variant.value;
  if (!v) return;

  const d = v?.devis ?? null;

  draft.meta = parseJson(d?.meta, { date: "", titreProjet: "", client: "", lieu: "" });
  draft.intro = String(d?.intro ?? "");
  draft.rappel = parseJson(d?.rappel, { dureeMois: n(contract.value?.dureeMois), quantiteM3: volumeTotal.value });
  draft.chargeFournisseur = parseJson(d?.chargeFournisseur, []);
  draft.chargeClient = parseJson(d?.chargeClient, []);
  draft.prixComplementaires = parseJson(d?.prixComplementaires, []);
  draft.validiteTexte = String(d?.validiteTexte ?? "");
  draft.signature = parseJson(d?.signature, { nom: "", poste: "", telephone: "" });
  draft.surcharges = parseJson(d?.surcharges, {});

  // defaults utiles
  if (!draft.meta.date) draft.meta.date = new Date().toISOString().slice(0, 10);
  if (!draft.meta.client) draft.meta.client = String(pnl.value?.client ?? "");
  if (!draft.rappel.dureeMois) draft.rappel.dureeMois = n(contract.value?.dureeMois);
  if (!draft.rappel.quantiteM3) draft.rappel.quantiteM3 = volumeTotal.value;
}

onMounted(() => hydrate());
watch(() => variant.value?.id, () => hydrate());

function addItem(list: DevisLineItem[]) {
  list.push({ label: "", unite: "", qty: 1, prix: 0, note: "" });
}
function removeItem(list: DevisLineItem[], idx: number) {
  list.splice(idx, 1);
}

function applyPreviewToHeader() {
  if (Boolean((store as any).headerUseDevisSurcharge)) {
    const s: any = store as any;
    if (typeof s.setHeaderDevisSurchargesPreview === "function") {
      s.setHeaderDevisSurchargesPreview({ ...draft.surcharges });
    } else {
      s.headerDevisSurchargesPreview = { ...draft.surcharges };
    }
  }
}

async function onApply() {
  error.value = null;
  applyPreviewToHeader();
}

async function onSave() {
  if (!variant.value?.id) return;
  saving.value = true;
  error.value = null;

  try {
    const payload = {
      meta: draft.meta,
      intro: draft.intro,
      rappel: draft.rappel,
      chargeFournisseur: draft.chargeFournisseur,
      chargeClient: draft.chargeClient,
      prixComplementaires: draft.prixComplementaires,
      validiteTexte: draft.validiteTexte,
      signature: draft.signature,
      surcharges: draft.surcharges,
    };

    const s: any = store as any;
    if (typeof s.saveDevis !== "function") throw new Error("store.saveDevis() manquante");
    await s.saveDevis(String(variant.value.id), payload);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="px-6 py-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-lg font-semibold text-slate-900">Devis</div>
        <div class="text-sm text-slate-500">
          9 sections (date/titre, intro, charges, tableau, compléments, durée, validité, signature)
        </div>
      </div>

      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" class="h-4 w-4 rounded border-slate-300" v-model="applyMajorations" />
          Appliquer majorations
        </label>

        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          @click="onApply"
          :disabled="!variant"
        >
          Appliquer
        </button>

        <button
          class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          @click="onSave"
          :disabled="!variant || saving"
        >
          {{ saving ? "Enregistrement..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {{ error }}
    </div>

    <!-- Meta + Intro + Validité + Signature (compact) -->
    <div class="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 text-sm font-semibold text-slate-900">1) Date / Projet / Client</div>

        <div class="grid grid-cols-1 gap-2">
          <label class="text-xs font-medium text-slate-600">Date</label>
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" v-model="draft.meta.date" />

          <label class="text-xs font-medium text-slate-600">Titre / Projet</label>
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" v-model="draft.meta.titreProjet" />

          <label class="text-xs font-medium text-slate-600">Client</label>
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" v-model="draft.meta.client" />

          <label class="text-xs font-medium text-slate-600">Lieu</label>
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" v-model="draft.meta.lieu" />
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div class="mb-3 text-sm font-semibold text-slate-900">2) Introduction (editable)</div>
        <textarea class="h-[180px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" v-model="draft.intro" />
        <div class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div class="text-xs font-medium text-slate-600">7) Durée (mois)</div>
            <input class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" v-model.number="draft.rappel.dureeMois" />
          </div>
          <div>
            <div class="text-xs font-medium text-slate-600">7) Quantité (m³)</div>
            <input class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" v-model.number="draft.rappel.quantiteM3" />
          </div>
        </div>
      </div>
    </div>

    <!-- Charges lists -->
    <div class="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-900">3) À la charge du fournisseur</div>
          <button class="text-xs font-semibold text-slate-700 hover:text-slate-900" @click="addItem(draft.chargeFournisseur)">+ Ajouter</button>
        </div>
        <div class="space-y-2">
          <div v-for="(it, i) in draft.chargeFournisseur" :key="i" class="rounded-lg border border-slate-200 p-2">
            <div class="flex items-center gap-2">
              <input class="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" placeholder="Article" v-model="it.label" />
              <button class="text-xs text-rose-600 hover:text-rose-700" @click="removeItem(draft.chargeFournisseur, i)">Suppr</button>
            </div>
          </div>
          <div v-if="draft.chargeFournisseur.length === 0" class="text-xs text-slate-500">Aucun article.</div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-900">4) À la charge du client</div>
          <button class="text-xs font-semibold text-slate-700 hover:text-slate-900" @click="addItem(draft.chargeClient)">+ Ajouter</button>
        </div>
        <div class="space-y-2">
          <div v-for="(it, i) in draft.chargeClient" :key="i" class="rounded-lg border border-slate-200 p-2">
            <div class="flex items-center gap-2">
              <input class="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" placeholder="Article" v-model="it.label" />
              <button class="text-xs text-rose-600 hover:text-rose-700" @click="removeItem(draft.chargeClient, i)">Suppr</button>
            </div>
          </div>
          <div v-if="draft.chargeClient.length === 0" class="text-xs text-slate-500">Aucun article.</div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-900">6) Prix complémentaires</div>
          <button class="text-xs font-semibold text-slate-700 hover:text-slate-900" @click="addItem(draft.prixComplementaires)">+ Ajouter</button>
        </div>
        <div class="space-y-2">
          <div v-for="(it, i) in draft.prixComplementaires" :key="i" class="rounded-lg border border-slate-200 p-2">
            <div class="flex items-center gap-2">
              <input class="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" placeholder="Article" v-model="it.label" />
              <button class="text-xs text-rose-600 hover:text-rose-700" @click="removeItem(draft.prixComplementaires, i)">Suppr</button>
            </div>
          </div>
          <div v-if="draft.prixComplementaires.length === 0" class="text-xs text-slate-500">Aucun article.</div>
        </div>
      </div>
    </div>

    <!-- Tableau devis -->
    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-[1080px] w-full table-fixed">
          <thead class="bg-slate-50">
            <tr class="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th class="px-4 py-3 w-[260px]">Désignation</th>
              <th class="px-4 py-3 w-[120px]">MOMD</th>
              <th class="px-4 py-3 w-[140px]">Prix calculé</th>
              <th v-if="applyMajorations" class="px-4 py-3 w-[160px]">Avec majorations</th>
              <th class="px-4 py-3 w-[140px]">Prix pondéré</th>
              <th class="px-4 py-3 w-[140px]">Surcharge</th>
              <th class="px-4 py-3 w-[160px]">Prix définitif</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100">
            <tr v-for="r in rows" :key="r.id" class="text-sm text-slate-800">
              <td class="px-4 py-3">
                <div class="font-medium text-slate-900">{{ r?.formule?.label ?? "—" }}</div>
                <div class="text-xs text-slate-500">{{ (r?.volumeM3 ?? 0).toFixed(2) }} m³</div>
              </td>

              <td class="px-4 py-3">{{ money(n(r?.momd), 2) }}</td>

              <td class="px-4 py-3 font-semibold">{{ money(prixCalcule(r), 2) }}</td>

              <td v-if="applyMajorations" class="px-4 py-3 font-semibold">
                {{ money(prixAvecMajoration(r), 2) }}
              </td>

              <td class="px-4 py-3 font-semibold">
                {{ money(prixPondere(r), 2) }}
              </td>

              <td class="px-4 py-3">
                <input
                  type="number"
                  step="0.01"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  :value="getSurcharge(r)"
                  @input="setSurcharge(r, ($event.target as HTMLInputElement).value)"
                />
              </td>

              <td class="px-4 py-3 font-bold text-slate-900">
                {{ money(prixDefinitif(r), 2) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3 text-sm">
        <div class="text-slate-600">
          Volume total: <span class="font-semibold text-slate-900">{{ volumeTotal.toFixed(2) }} m³</span>
        </div>

        <div v-if="applyMajorations" class="text-slate-600">
          Impact majorations:
          <span class="font-semibold text-slate-900">{{ impactMajPerM3.toFixed(2) }} DH/m³</span>
        </div>
      </div>
    </div>

    <!-- Validité + Signature -->
    <div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div class="mb-2 text-sm font-semibold text-slate-900">8) Validité de l’offre</div>
        <textarea class="h-[110px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" v-model="draft.validiteTexte" />
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-2 text-sm font-semibold text-slate-900">9) Signature</div>
        <div class="grid grid-cols-1 gap-2">
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Nom" v-model="draft.signature.nom" />
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Poste" v-model="draft.signature.poste" />
          <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Téléphone" v-model="draft.signature.telephone" />
        </div>
      </div>
    </div>
  </div>
</template>
