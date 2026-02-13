<!-- ✅ src/pages/MajorationPage.vue (FICHIER COMPLET / + Importer modal habituel + remap Autres coûts par libellé) -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionTargetsGeneralizeModal from "@/components/SectionTargetsGeneralizeModal.vue";
import SectionImportModal from "@/components/SectionImportModal.vue";

const store = usePnlStore();

/* =========================
   STORE / STATE
========================= */
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const variant = computed<any | null>(() => (store as any).activeVariant ?? null);

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
      else out[k] = Number(v); // fallback si label introuvable en source
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

    // ✅ remap spécial pour Autres coûts (IDs différents entre variantes)
    const remapped = remapMajorationsForImport(src, imported);

    draft.map = { ...remapped };
    (store as any).clearHeaderMajorationsPreview();
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

/**
 * pctOf : lit direct + fallback legacy
 * - si key == autresCoutsLabel:<norm>, fallback vers autresCoutsItem:<id> de la variante active
 */
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

function rebuildDraft() {
  const v = variant.value;
  const persisted = safeParse(v?.autresCouts?.majorations);
  draft.map = { ...persisted };
  (store as any).clearHeaderMajorationsPreview();
  genErr.value = null;
  impErr.value = null;
}

onMounted(async () => {
  if ((store as any).pnls?.length === 0) {
    loading.value = true;
    await (store as any).loadPnls();
    loading.value = false;
  }
  rebuildDraft();
});

watch(() => variant.value?.id, () => rebuildDraft());

onBeforeUnmount(() => {
  (store as any).clearHeaderMajorationsPreview();
});

/* =========================
   ACTIONS
========================= */
function applyPreview() {
  (store as any).setHeaderMajorationsPreview({ ...draft.map });
}

async function save() {
  if (!variant.value?.id) return;

  saving.value = true;
  error.value = null;

  try {
    await (store as any).saveMajorations(String(variant.value.id), { ...draft.map });
    (store as any).clearHeaderMajorationsPreview();
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

function resetAll() {
  draft.map = {};
  (store as any).setHeaderMajorationsPreview({});
}

/* =========================
   GROUPS
========================= */
type Row = { key: string; label: string };
type Group = { title: string; rows: Row[] };

const groups = computed<Group[]>(() => {
  const v = variant.value;
  if (!v) return [];

  const res: Group[] = [];

  const mpRows: Row[] = (v?.mp?.items ?? []).map((x: any) => ({
    key: `mp:${x.mpId}`,
    label: x?.mp?.label ?? "MP",
  }));
  if (mpRows.length) res.push({ title: "Matières premières (MP)", rows: mpRows });

  res.push({
    title: "Transport",
    rows: [{ key: "transport.prixMoyen", label: "Transport moyen (DH/m³)" }],
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
      { key: "coutMensuel.locationTerrain", label: "Location terrain" },
      { key: "coutMensuel.electricite", label: "Électricité" },
      { key: "coutMensuel.gasoil", label: "Gasoil" },
      { key: "coutMensuel.telephone", label: "Téléphone" },
      { key: "coutMensuel.securite", label: "Sécurité" },
    ],
  });

  res.push({
    title: "Employés",
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

  // ✅ Autres coûts : clé stable par libellé (normalisé) => compatible import
  const autresRows: Row[] = (v?.autresCouts?.items ?? [])
    .filter((x: any) => !String(x.unite ?? "").includes("POURCENT"))
    .map((x: any) => ({
      key: `autresCoutsLabel:${normLabel(x.label)}`,
      label: x.label,
    }));

  if (autresRows.length) res.push({ title: "Autres coûts", rows: autresRows });

  return res;
});

/* =========================
   ✅ UX: recherche + masquer 0 (safe)
========================= */
const q = ref("");
const hideZero = ref(false); // ✅ défaut OFF
const counts = computed(() => {
  const all = groups.value.reduce((s, g) => s + g.rows.length, 0);
  const nonZero = groups.value.reduce((s, g) => s + g.rows.filter((r) => pctOf(r.key) !== 0).length, 0);
  return { all, nonZero };
});
const effectiveHideZero = computed(() => (hideZero.value && counts.value.nonZero > 0 ? true : false));

function rowMatch(r: Row) {
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

/* =========================
   COLLAPSE
========================= */
const open = reactive<Record<string, boolean>>({});

watch(
  () => groups.value.map((g) => g.title).join("|"),
  () => {
    for (const g of groups.value) {
      if (typeof open[g.title] !== "boolean") open[g.title] = true;
    }
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
</script>

<template>
  <div class="maj">
    <!-- ✅ Sticky toolbar (cohérente avec tes pages) -->
    <div class="bar">
      <div class="barTop">
        <div class="ttl">
          <div class="h1">Majorations</div>
          <div class="sub">Saisie (%) • <b>Appliquer</b> = preview KPIs • <b>Enregistrer</b> = définitif</div>
        </div>

        <div class="acts">
          <button class="btn ghost" type="button" @click="resetAll" :disabled="saving || loading || genBusy || impBusy">
            Réinit
          </button>

          <!-- ✅ Importer (modal habituel) -->
          <button class="btn pri" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="impOpen = true">
            {{ impBusy ? "..." : "Importer" }}
          </button>

          <button class="btn pri" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="genOpen = true">
            {{ genBusy ? "..." : "Généraliser" }}
          </button>

          <button class="btn pri" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="applyPreview">
            Appliquer
          </button>

          <button class="btn ok" type="button" :disabled="!variant?.id || saving || loading || genBusy || impBusy" @click="save">
            {{ saving ? "..." : "Enregistrer" }}
          </button>
        </div>
      </div>

      <div class="barBottom">
        <div class="search">
          <input v-model="q" class="searchIn" type="text" placeholder="Recherche (libellé)…" />
          <button v-if="q" class="x" type="button" @click="q = ''" title="Effacer">✕</button>
        </div>

        <button class="toggle" type="button" :class="{ on: hideZero }" @click="hideZero = !hideZero">
          <span class="dot" /> Masquer 0
        </button>

        <div class="chips">
          <span class="chip">{{ visibleCount }}/{{ counts.all }}</span>
          <span class="chip ok" v-if="counts.nonZero">{{ counts.nonZero }} non-zéro</span>
          <span class="sep">•</span>
          <button class="link" type="button" @click="openAll">Ouvrir</button>
          <button class="link" type="button" @click="closeAll">Fermer</button>
        </div>
      </div>

      <div v-if="!variant" class="alert info">Aucune variante active. Sélectionne une variante puis reviens ici.</div>
      <div v-if="error" class="alert err">{{ error }}</div>
      <div v-if="impErr" class="alert err">{{ impErr }}</div>
      <div v-if="genErr" class="alert err">{{ genErr }}</div>
      <div v-if="loading" class="alert">Chargement…</div>
    </div>

    <!-- ✅ Liste 1 colonne => pas de blocs vides -->
    <div v-if="!loading" class="stack">
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
              <div class="lbl" :title="r.label">{{ r.label }}</div>

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

    <!-- ✅ IMPORT -->
    <SectionImportModal
      v-model="impOpen"
      sectionLabel="Majorations"
      :targetVariantId="variant?.id ?? null"
      @apply="onApplyImport"
    />

    <!-- ✅ GENERALISER -->
    <SectionTargetsGeneralizeModal
      v-model="genOpen"
      sectionLabel="Majorations"
      :sourceVariantId="variant?.id ?? null"
      @apply="onApplyGeneralize"
    />
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

/* ✅ sticky toolbar */
.bar {
  position: sticky;
  top: var(--hdrdash-h, -15px);
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.barTop {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.ttl {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 240px;
}
.h1 {
  font-weight: 950;
  color: var(--navy);
  font-size: 15px;
  line-height: 1.05;
}
.sub {
  font-size: 11px;
  font-weight: 800;
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

.barBottom {
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

.alert {
  border-radius: 14px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 850;
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

/* ✅ stack 1 colonne */
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

/* ✅ auto-fit grid : pas de “vides” */
.grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
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
  font-size: 12px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.9);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inWrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.in {
  width: 92px;
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
</style>
