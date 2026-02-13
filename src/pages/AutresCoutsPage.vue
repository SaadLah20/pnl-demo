<!-- ✅ src/pages/AutresCoutsPage.vue (FICHIER COMPLET / charte “subheader sticky” + KPIs en haut + actions compactes + inputs bleu unité/valeur + ✅ importer) -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

// Heroicons (charte pages)
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  PlusCircleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/vue/24/outline";

const store = usePnlStore();

onMounted(async () => {
  if ((store as any).pnls?.length === 0 && (store as any).loadPnls) {
    await (store as any).loadPnls();
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
function money(v: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function clamp(v: any, min = 0, max = 1e15) {
  const x = toNum(v);
  return Math.max(min, Math.min(max, x));
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
const FG_NORM = normLabel("Frais généraux");

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);
const dureeMois = computed(() => clamp(contract.value?.dureeMois, 0, 9999));

const variantLabel = computed(() => {
  const v = variant.value;
  if (!v) return "—";
  return v.title ?? v.name ?? v.id?.slice?.(0, 8) ?? "Variante";
});

/* =========================
   KPIs requis (Volume / CA)
========================= */
type DraftForm = { volumeM3: number; momd: number };
const formDrafts = reactive<Record<string, DraftForm>>({});
function getFormDraft(id: string): DraftForm {
  const k = String(id);
  if (!formDrafts[k]) formDrafts[k] = { volumeM3: 0, momd: 0 };
  return formDrafts[k];
}
const formules = computed<any[]>(() => (variant.value as any)?.formules?.items ?? []);
watch(
  () => variant.value?.id,
  () => {
    for (const vf of formules.value) {
      const d = getFormDraft(vf.id);
      d.volumeM3 = clamp(vf?.volumeM3);
      d.momd = clamp(vf?.momd);
    }
  },
  { immediate: true }
);

const volumeTotal = computed(() =>
  formules.value.reduce((s: number, vf: any) => s + clamp(getFormDraft(vf.id).volumeM3), 0)
);
const transportPrixMoyen = computed(() => clamp((variant.value as any)?.transport?.prixMoyen));

function mpPriceUsed(mpId: string): number {
  const it = (((variant.value as any)?.mp?.items ?? []) as any[]).find((x: any) => String(x.mpId) === String(mpId));
  if (!it) return 0;
  if (it?.prix != null) return clamp(it.prix);
  return clamp(it?.mp?.prix);
}
function cmpParM3For(vf: any): number {
  const it = (vf?.formule?.items ?? []) as any[];
  return it.reduce((s: number, x: any) => {
    const qtyKg = clamp(x?.qty);
    const prixTonne = mpPriceUsed(String(x?.mpId));
    return s + (qtyKg / 1000) * prixTonne;
  }, 0);
}
const caTotal = computed(() => {
  return formules.value.reduce((s: number, vf: any) => {
    const vol = clamp(getFormDraft(vf.id).volumeM3);
    const momd = clamp(getFormDraft(vf.id).momd);
    const cmp = cmpParM3For(vf);
    const pv = cmp + transportPrixMoyen.value + momd;
    return s + pv * vol;
  }, 0);
});
const pvMoy = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  return caTotal.value / vol;
});

/* =========================
   AUTRES COUTS - UI MODEL
========================= */
type Unite = "FORFAIT" | "MOIS" | "M3" | "POURCENT_CA";
type DraftRow = { _id: string; label: string; unite: Unite; valeur: number };

const rows = ref<DraftRow[]>([]);
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function isFraisGenerauxRow(r: DraftRow | null | undefined) {
  if (!r) return false;
  return normLabel(r.label) === FG_NORM;
}

function ensureFraisGeneraux() {
  const idx = rows.value.findIndex((r) => isFraisGenerauxRow(r));
  if (idx === -1) {
    rows.value.unshift({
      _id: uid(),
      label: "Frais généraux",
      unite: "POURCENT_CA",
      valeur: 0,
    });
    return;
  }
  if (idx > 0) {
    const [fg] = rows.value.splice(idx, 1);
    if (fg) rows.value.unshift(fg);
  }
}

function loadFromVariant() {
  const items = ((variant.value as any)?.autresCouts?.items ?? []) as any[];
  rows.value = items.map((it: any) => ({
    _id: uid(),
    label: String(it?.label ?? ""),
    unite: (String(it?.unite ?? "FORFAIT") as Unite) || "FORFAIT",
    valeur: clamp(it?.valeur),
  }));
  ensureFraisGeneraux();
}
watch(
  () => variant.value?.id,
  () => loadFromVariant(),
  { immediate: true }
);

const fgRow = computed<DraftRow | null>(() => {
  const r = rows.value.find((x) => isFraisGenerauxRow(x));
  return r ?? null;
});
const displayRows = computed(() => {
  const fg = rows.value.find((r) => isFraisGenerauxRow(r));
  const rest = rows.value.filter((r) => !isFraisGenerauxRow(r));
  return fg ? [fg, ...rest] : rest;
});

/* =========================
   CALCULS
========================= */
function totalFor(r: DraftRow): number {
  const v = clamp(r.valeur);
  if (r.unite === "FORFAIT") return v;
  if (r.unite === "MOIS") return v * clamp(dureeMois.value);
  if (r.unite === "M3") return v * clamp(volumeTotal.value);
  return (v / 100) * clamp(caTotal.value);
}
function monthlyFor(r: DraftRow): number {
  const d = clamp(dureeMois.value);
  if (d <= 0) return 0;
  if (r.unite === "MOIS") return clamp(r.valeur);
  return totalFor(r) / d;
}
function perM3For(r: DraftRow): number {
  const vol = clamp(volumeTotal.value);
  if (vol <= 0) return 0;
  return totalFor(r) / vol;
}
function pctFor(r: DraftRow): number {
  const ca = clamp(caTotal.value);
  if (ca <= 0) return 0;
  return (totalFor(r) / ca) * 100;
}

const totalGlobal = computed(() => rows.value.reduce((s, r) => s + totalFor(r), 0));
const perM3Global = computed(() => {
  const vol = volumeTotal.value;
  if (vol <= 0) return 0;
  return totalGlobal.value / vol;
});
const monthlyGlobal = computed(() => {
  const d = clamp(dureeMois.value);
  if (d <= 0) return 0;
  return totalGlobal.value / d;
});
const pctGlobal = computed(() => {
  const ca = caTotal.value;
  if (ca <= 0) return 0;
  return (totalGlobal.value / ca) * 100;
});

/* Frais généraux: alerte si <= 4% */
const fgPct = computed<number>(() => (fgRow.value ? pctFor(fgRow.value) : 0));
const fgLow = computed<boolean>(() => {
  if (!fgRow.value) return false;
  if (clamp(caTotal.value) <= 0) return false;
  return fgPct.value <= 4;
});

/* =========================
   TOAST (charte pages)
========================= */
const toastOpen = ref(false);
const toastMsg = ref("");
const toastKind = ref<"ok" | "err">("ok");

function showToast(msg: string, kind: "ok" | "err" = "ok") {
  toastMsg.value = msg;
  toastKind.value = kind;
  toastOpen.value = true;
  window.setTimeout(() => (toastOpen.value = false), 2600);
}

/* =========================
   ACTIONS
========================= */
function addRow() {
  rows.value.push({
    _id: uid(),
    label: "Nouveau coût",
    unite: "FORFAIT",
    valeur: 0,
  });
}
function removeRowById(id: string) {
  const idx = rows.value.findIndex((r) => r._id === id);
  if (idx < 0) return;
  if (isFraisGenerauxRow(rows.value[idx])) return;
  rows.value.splice(idx, 1);
}

/* =========================
   VALIDATION (FG unique)
========================= */
function validateRows(): string | null {
  ensureFraisGeneraux();

  const norms = rows.value.map((r) => normLabel(r.label));
  const fgCount = norms.filter((x) => x === FG_NORM).length;
  if (fgCount !== 1) return 'Le coût "Frais généraux" doit exister une seule fois (pas de doublon).';

  const seen = new Set<string>();
  for (const x of norms) {
    if (!x) continue;
    if (seen.has(x)) return "Libellés en doublon : merci de les rendre uniques.";
    seen.add(x);
  }
  return null;
}

/* =========================
   MODAL (confirm/info)
========================= */
const modal = reactive({
  open: false,
  title: "",
  message: "",
  mode: "confirm" as "confirm" | "info",
  onConfirm: null as null | (() => void | Promise<void>),
});
function openConfirm(title: string, message: string, onConfirm: () => void | Promise<void>) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "confirm";
  modal.onConfirm = onConfirm;
}
function openInfo(title: string, message: string) {
  modal.open = true;
  modal.title = title;
  modal.message = message;
  modal.mode = "info";
  modal.onConfirm = null;
}
function closeModal() {
  modal.open = false;
  modal.title = "";
  modal.message = "";
  modal.onConfirm = null;
}

/* =========================
   SAVE / RESET
========================= */
const saving = ref(false);
const err = ref<string | null>(null);

function buildPayload() {
  ensureFraisGeneraux();
  const fg = rows.value.find((r) => isFraisGenerauxRow(r));
  const rest = rows.value.filter((r) => !isFraisGenerauxRow(r));
  const all = fg ? [fg, ...rest] : rest;

  return all.map((r) => ({
    label: String(r.label ?? ""),
    unite: String(r.unite ?? "FORFAIT"),
    valeur: Number(clamp(r.valeur)),
  }));
}

async function save() {
  if (!variant.value) return;

  err.value = null;

  const validation = validateRows();
  if (validation) {
    err.value = validation;
    showToast(validation, "err");
    openInfo("Erreur", validation);
    return;
  }

  saving.value = true;
  try {
    await (store as any).updateVariant(variant.value.id, {
      autresCouts: { items: buildPayload() },
    });
    showToast("Autres coûts enregistrés.", "ok");
  } catch (e: any) {
    err.value = e?.message ?? String(e);
    showToast(String(err.value), "err");
    openInfo("Erreur", String(err.value));
  } finally {
    saving.value = false;
  }
}

function askSave() {
  openConfirm("Enregistrer", "Confirmer l’enregistrement des autres coûts ?", async () => {
    closeModal();
    await save();
  });
}

function askReset() {
  openConfirm("Réinitialiser", "Recharger les valeurs depuis la base ?", () => {
    closeModal();
    loadFromVariant();
    showToast("Valeurs restaurées.", "ok");
  });
}

/* =========================
   ✅ GENERALISER (AutresCouts)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

async function generalizeTo(variantIds: string[]) {
  const sourceVariantId = String((store as any).activeVariantId ?? variant.value?.id ?? "").trim();
  if (!sourceVariantId) return;

  const validation = validateRows();
  if (validation) {
    genErr.value = validation;
    showToast(validation, "err");
    openInfo("Erreur", validation);
    return;
  }

  const payload = buildPayload();

  genErr.value = null;
  genBusy.value = true;
  try {
    for (const targetIdRaw of variantIds) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;

      await (store as any).updateVariant(targetId, {
        autresCouts: { items: payload },
      });
    }
    showToast("Section Autres coûts généralisée.", "ok");
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
    showToast(String(genErr.value), "err");
    openInfo("Erreur", String(genErr.value ?? e?.message ?? e));
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[] }) {
  const ids = payload?.variantIds ?? [];
  if (!ids.length) return;

  const msg =
    payload.mode === "ALL"
      ? "Confirmer la généralisation de la section Autres coûts sur TOUTES les variantes ?"
      : `Confirmer la généralisation de la section Autres coûts sur ${ids.length} variante(s) ?`;

  openConfirm("Généraliser", msg, async () => {
    closeModal();
    await generalizeTo(ids);
    if (!genErr.value) genOpen.value = false;
  });
}

/* =========================
   ✅ IMPORTER (UI only)
========================= */
const impOpen = ref(false);
const impBusy = ref(false);
const impErr = ref<string | null>(null);

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

function applyFromVariant(v: any) {
  const items = ((v as any)?.autresCouts?.items ?? []) as any[];
  rows.value = items.map((it: any) => ({
    _id: uid(),
    label: String(it?.label ?? ""),
    unite: (String(it?.unite ?? "FORFAIT") as Unite) || "FORFAIT",
    valeur: clamp(it?.valeur),
  }));
  ensureFraisGeneraux();
}

async function onApplyImport(payload: { sourceVariantId: string }) {
  if (!variant.value) return;

  const sourceId = String(payload?.sourceVariantId ?? "").trim();
  if (!sourceId) return;

  if (String(variant.value?.id ?? "") === sourceId) {
    showToast("La source est déjà la variante active.", "ok");
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
      showToast("Variante source introuvable (données non chargées).", "err");
      return;
    }

    applyFromVariant(src);
    showToast("Autres coûts importés. Pense à enregistrer.", "ok");
    impOpen.value = false;
  } catch (e: any) {
    impErr.value = e?.message ?? String(e);
    showToast(String(impErr.value), "err");
    openInfo("Erreur", String(impErr.value));
  } finally {
    impBusy.value = false;
  }
}

/* =========================
   UI helpers (inputs selon unité)
========================= */
function valueUnitLabel(u: Unite): string {
  if (u === "POURCENT_CA") return "%";
  if (u === "MOIS") return "DH/mois";
  if (u === "M3") return "DH/m³";
  return "DH";
}
function valuePlaceholder(u: Unite): string {
  if (u === "POURCENT_CA") return "ex: 5";
  return "0";
}
</script>

<template>
  <div class="page">
    <!-- ✅ Sticky subheader (charte) -->
    <div class="subhdr">
      <div class="rowTop">
        <div class="left">
          <div class="ttlRow">
            <div class="ttl">Autres coûts</div>
            <span v-if="variant" class="badge">Variante active</span>
          </div>

          <div class="meta" v-if="variant">
            <span class="clip"><b>{{ variantLabel }}</b></span>
            <span class="sep" v-if="dureeMois">•</span>
            <span v-if="dureeMois">Durée <b>{{ n(dureeMois, 0) }}</b> mois</span>

            <span class="sep" v-if="volumeTotal">•</span>
            <span v-if="volumeTotal">Vol <b>{{ n(volumeTotal, 0) }}</b> m³</span>

            <span class="sep" v-if="caTotal">•</span>
            <span v-if="caTotal">CA <b>{{ money(caTotal, 0) }}</b></span>

            <span class="sep" v-if="pvMoy">•</span>
            <span v-if="pvMoy">PV moy <b>{{ money(pvMoy, 2) }}</b>/m³</span>
          </div>

          <div class="meta" v-else>Aucune variante active.</div>
        </div>

        <div class="actions" v-if="variant">
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="addRow()">
            <PlusCircleIcon class="ic" />
            Ajouter
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="askReset()">
            <ArrowPathIcon class="ic" />
            Reset
          </button>

          <!-- ✅ Importer -->
          <button class="btn" :disabled="saving || genBusy || impBusy" @click="impOpen = true">
            <ArrowDownTrayIcon class="ic" />
            {{ impBusy ? "…" : "Importer" }}
          </button>

          <button class="btn" :disabled="saving || genBusy || impBusy" @click="genOpen = true">
            <Squares2X2Icon class="ic" />
            {{ genBusy ? "…" : "Généraliser" }}
          </button>

          <button class="btn pri" :disabled="saving || genBusy || impBusy" @click="askSave()">
            <CheckCircleIcon class="ic" />
            {{ saving ? "…" : "Enregistrer" }}
          </button>
        </div>
      </div>

      <!-- ✅ KPIs en haut (charte) -->
      <div class="kpis" v-if="variant">
        <div class="kpi kpiMain">
          <div class="kLbl">Total</div>
          <div class="kVal mono">{{ money(totalGlobal, 2) }}</div>
        </div>

        <div class="kpi">
          <div class="kLbl">/ m³</div>
          <div class="kVal mono">{{ n(perM3Global, 2) }} <span>DH/m³</span></div>
        </div>

        <div class="kpi kpiMonth">
          <div class="kLbl">/ mois</div>
          <div class="kVal mono">{{ money(monthlyGlobal, 2) }} <span>DH/mois</span></div>
        </div>

        <div class="kpi" :class="{ warn: fgLow }" :title="fgLow ? 'Frais généraux <= 4%' : ''">
          <div class="kLbl">% FG</div>
          <div class="kVal mono">
            {{ n(fgPct, 2) }} <span>%</span>
          </div>
        </div>
      </div>

      <div v-if="err" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ err }}</div>
      </div>

      <div v-if="impErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Import :</b> {{ impErr }}</div>
      </div>

      <div v-if="genErr" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Généralisation :</b> {{ genErr }}</div>
      </div>

      <div v-if="(store as any).loading" class="alert">
        <div>Chargement…</div>
      </div>

      <div v-else-if="(store as any).error" class="alert err">
        <ExclamationTriangleIcon class="aic" />
        <div><b>Erreur :</b> {{ (store as any).error }}</div>
      </div>
    </div>

    <div v-if="!variant" class="card">
      <div class="empty">Sélectionne une variante puis reviens ici.</div>
    </div>

    <template v-else>
      <div class="card">
        <div class="listWrap">
          <div class="listHead">
            <div class="cLabel">Libellé</div>
            <div class="cPm3 r">/m³</div>
            <div class="cMonth r">/mois</div>
            <div class="cTot r">Total</div>
            <div class="cPct r">%</div>
            <div class="cAct r"></div>
          </div>

          <div v-if="displayRows.length === 0" class="empty muted">Aucun autre coût.</div>

          <div v-for="r0 in displayRows" :key="r0._id" class="rowLine" :class="{ fg: isFraisGenerauxRow(r0) }">
            <div class="cell cLabel">
              <div class="labelWrap">
                <input
                  class="in"
                  v-model="r0.label"
                  placeholder="Ex: Sécurité, gardiennage…"
                  :class="{ lock: isFraisGenerauxRow(r0) }"
                />

                <div class="inlineRight">
                  <select class="in inSel inBlue" v-model="r0.unite" title="Unité">
                    <option value="FORFAIT">FORFAIT</option>
                    <option value="MOIS">MOIS</option>
                    <option value="M3">M3</option>
                    <option value="POURCENT_CA">%CA</option>
                  </select>

                  <div class="valWrap">
                    <input
                      class="in inSm r inBlue"
                      type="number"
                      step="0.01"
                      min="0"
                      v-model.number="r0.valeur"
                      :placeholder="valuePlaceholder(r0.unite)"
                    />
                    <span class="unit">{{ valueUnitLabel(r0.unite) }}</span>
                  </div>
                </div>
              </div>

              <div v-if="isFraisGenerauxRow(r0) && fgLow" class="fgHint">⚠ Frais généraux ≤ <b>4%</b></div>
            </div>

            <div class="cell cPm3 r mono">{{ n(perM3For(r0), 2) }}</div>
            <div class="cell cMonth r mono">{{ money(monthlyFor(r0), 2) }}</div>
            <div class="cell cTot r mono"><b>{{ money(totalFor(r0), 2) }}</b></div>
            <div class="cell cPct r mono" :class="{ red: isFraisGenerauxRow(r0) && fgLow }">{{ n(pctFor(r0), 2) }}%</div>

            <div class="cell cAct r">
              <button
                class="icon"
                :class="isFraisGenerauxRow(r0) ? 'disabled' : 'danger'"
                type="button"
                :disabled="isFraisGenerauxRow(r0)"
                :title="isFraisGenerauxRow(r0) ? 'Non supprimable' : 'Supprimer'"
                @click="removeRowById(r0._id)"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="note muted">
            Unité <b>M3</b> et <b>%CA</b> calculées sur le volume total et le CA total. (<b>/mois</b> = 0 pour M3/%CA par design)
          </div>
        </div>
      </div>
    </template>

    <!-- ✅ IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Autres coûts"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ GENERALISATION -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      section-label="Autres coûts"
      :source-variant-id="String((store as any).activeVariantId ?? (variant?.id ?? '')) || null"
      @apply="onApplyGeneralize"
      @close="() => {}"
    />

    <!-- ✅ Modal confirm/info (charte) -->
    <teleport to="body">
      <div v-if="modal.open" class="ovl" role="dialog" aria-modal="true" @mousedown.self="closeModal()">
        <div class="dlg">
          <div class="dlgHdr">
            <div class="dlgTtl">{{ modal.title }}</div>
            <button class="x" type="button" @click="closeModal()" aria-label="Fermer">✕</button>
          </div>

          <div class="dlgBody">
            <div class="dlgMsg">{{ modal.message }}</div>
          </div>

          <div class="dlgFtr">
            <button class="btn2" type="button" @click="closeModal()">Fermer</button>
            <button v-if="modal.mode === 'confirm'" class="btn2 pri" type="button" @click="modal.onConfirm && modal.onConfirm()">
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ✅ Toast -->
    <teleport to="body">
      <div v-if="toastOpen" class="toast" :class="{ err: toastKind === 'err' }" role="status" aria-live="polite">
        <CheckCircleIcon v-if="toastKind === 'ok'" class="tic" />
        <ExclamationTriangleIcon v-else class="tic" />
        <div class="tmsg">{{ toastMsg }}</div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mono {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.muted {
  color: rgba(15, 23, 42, 0.55);
}

/* ✅ sticky subheader (charte) */
.subhdr {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 16px;
  padding: 8px 10px;
}
.rowTop {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 240px;
}
.ttlRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ttl {
  font-size: 15px;
  font-weight: 950;
  color: #0f172a;
}
.badge {
  font-size: 10px;
  font-weight: 950;
  color: #065f46;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 8px;
  border-radius: 999px;
}

/* ✅ meta: 1 ligne, ellipsis comme tes pages */
.meta {
  font-size: 10.5px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}
.clip {
  display: inline-block;
  max-width: 520px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sep {
  margin: 0 6px;
  color: rgba(15, 23, 42, 0.35);
}

/* actions */
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  height: 32px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  color: #0f172a;
  font-weight: 950;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.btn:hover {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.18);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.pri {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}
.btn.pri:hover {
  background: rgba(2, 132, 199, 0.18);
}
.ic {
  width: 18px;
  height: 18px;
}

/* KPIs */
.kpis {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 980px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.kpi {
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.1);
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.kLbl {
  font-size: 10px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.kVal {
  font-size: 13px;
  font-weight: 950;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kVal span {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
  margin-left: 6px;
  font-size: 11px;
}
.kpiMonth {
  border-color: rgba(2, 132, 199, 0.28);
  background: rgba(2, 132, 199, 0.06);
}
.kpiMain {
  border-color: rgba(16, 185, 129, 0.42);
  background: rgba(236, 253, 245, 0.9);
}
.kpi.warn {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(239, 68, 68, 0.06);
}

/* alerts */
.alert {
  margin-top: 8px;
  border-radius: 14px;
  padding: 9px 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.alert.err {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
}
.aic {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin-top: 1px;
}

/* card */
.card {
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: #fff;
  overflow: hidden;
}
.empty {
  padding: 12px;
  font-weight: 850;
  color: rgba(15, 23, 42, 0.6);
}

/* list/table (compact) */
.listWrap {
  padding: 8px;
}
.listHead {
  display: grid;
  grid-template-columns: 1fr 120px 130px 150px 90px 40px;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid rgba(16, 24, 40, 0.1);
  background: rgba(15, 23, 42, 0.02);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(55, 65, 81, 1);
}
.rowLine {
  display: grid;
  grid-template-columns: 1fr 120px 130px 150px 90px 40px;
  gap: 8px;
  align-items: start;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.rowLine:last-of-type {
  border-bottom: 0;
}
.rowLine.fg {
  background: rgba(15, 23, 42, 0.02);
}

.cell {
  min-width: 0;
}
.r {
  text-align: right;
}

/* inputs (charte) */
.in {
  width: 100%;
  height: 30px;
  border-radius: 10px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.02);
  padding: 0 9px;
  font-size: 12px;
  font-weight: 900;
  color: #0f172a;
  outline: none;
  min-width: 0;
}
.in:focus {
  border-color: rgba(2, 132, 199, 0.5);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}
.in.lock {
  border-color: rgba(16, 24, 40, 0.18);
  background: rgba(15, 23, 42, 0.02);
}

/* ✅ bleu uniquement pour unité + valeur (comme tes autres pages) */
.inBlue {
  border-color: rgba(2, 132, 199, 0.26);
  background: rgba(2, 132, 199, 0.06);
}
.inBlue:focus {
  border-color: rgba(2, 132, 199, 0.55);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}

.labelWrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.inlineRight {
  display: grid;
  grid-template-columns: 140px minmax(140px, 220px);
  gap: 8px;
  align-items: center;
  justify-content: end;
}
.inSel {
  max-width: 180px;
}

.valWrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
.inSm {
  width: 100%;
  max-width: 160px;
}
.unit {
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.5);
  min-width: 56px;
  text-align: right;
  white-space: nowrap;
}

.fgHint {
  font-size: 11.5px;
  font-weight: 900;
  color: rgba(185, 28, 28, 0.95);
  margin-top: 2px;
}
.red {
  color: rgba(185, 28, 28, 0.95);
  font-weight: 950;
}

/* delete icon */
.icon {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
  font-weight: 950;
}
.icon.danger {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(127, 29, 29, 0.95);
}
.icon.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* note */
.note {
  padding: 8px 10px;
  border-top: 1px solid rgba(16, 24, 40, 0.06);
  font-size: 11.5px;
  font-weight: 800;
}

/* responsive */
@media (max-width: 1100px) {
  .listHead,
  .rowLine {
    grid-template-columns: 1fr 110px 120px 140px 80px 40px;
  }
  .inlineRight {
    grid-template-columns: 130px minmax(140px, 1fr);
  }
  .unit {
    min-width: 48px;
  }
  .clip {
    max-width: 420px;
  }
}
@media (max-width: 920px) {
  .listHead {
    display: none;
  }
  .rowLine {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 10px 8px;
    border-radius: 12px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.92);
  }
  .rowLine.fg {
    background: rgba(15, 23, 42, 0.03);
  }

  .cLabel {
    grid-column: 1 / -1;
  }
  .cPm3,
  .cMonth,
  .cTot,
  .cPct {
    text-align: left;
  }
  .cAct {
    grid-column: 2;
    justify-self: end;
  }

  .inlineRight {
    grid-template-columns: 1fr 1fr;
  }
  .inSel {
    max-width: 100%;
  }
  .inSm {
    max-width: 100%;
  }
  .unit {
    min-width: 36px;
  }
  .meta {
    flex-wrap: wrap; /* mobile ok */
  }
  .clip {
    max-width: 92vw;
  }
}

/* modal */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 80;
}
.dlg {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  overflow: hidden;
}
.dlgHdr {
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.dlgTtl {
  font-weight: 950;
  color: #0f172a;
}
.x {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
}
.dlgBody {
  padding: 12px;
}
.dlgMsg {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.8);
  line-height: 1.45;
}
.dlgFtr {
  padding: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
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
.btn2.pri {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(2, 132, 199, 0.28);
}

/* toast */
.toast {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(2, 6, 23, 0.15);
}
.toast.err {
  border-color: rgba(239, 68, 68, 0.22);
}
.tic {
  width: 18px;
  height: 18px;
}
.tmsg {
  font-weight: 900;
  color: rgba(15, 23, 42, 0.85);
}
</style>
