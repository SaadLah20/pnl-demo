<!-- src/pages/MajorationPage.vue (FICHIER COMPLET) -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

/* =========================
   STORE / STATE
========================= */
const store = usePnlStore();

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const variant = computed<any | null>(() => (store as any).activeVariant ?? null);

/* =========================
   DRAFT MAJORATIONS (UI)
========================= */
const draft = reactive<{ map: Record<string, number> }>({
  map: {},
});

/* =========================
   HELPERS
========================= */
function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clampPct(v: any): number {
  const x = n(v);
  return Math.max(-100, Math.min(1000, x));
}

function pctOf(key: string): number {
  return n(draft.map[key]);
}

function setPct(key: string, v: any) {
  draft.map[key] = clampPct(v);
}

function safeParse(raw: any): Record<string, number> {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/* =========================
   BUILD DRAFT FROM VARIANT
========================= */
function rebuildDraft() {
  const v = variant.value;
  const persisted = safeParse(v?.autresCouts?.majorations);
  draft.map = { ...persisted };

  // IMPORTANT: pas de preview automatique
  (store as any).clearHeaderMajorationsPreview();
}

onMounted(async () => {
  if ((store as any).pnls?.length === 0) {
    loading.value = true;
    await (store as any).loadPnls();
    loading.value = false;
  }
  rebuildDraft();
});

watch(
  () => variant.value?.id,
  () => rebuildDraft()
);

/* =========================
   CLEANUP (QUIT PAGE)
========================= */
onBeforeUnmount(() => {
  // Si on quitte sans enregistrer → retour KPIs originaux
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
    await (store as any).saveMajorations(String(variant.value.id), {
      ...draft.map,
    });
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
   UI STRUCTURE
========================= */
type Row = { key: string; label: string };
type Group = { title: string; rows: Row[] };

const groups = computed<Group[]>(() => {
  const v = variant.value;
  if (!v) return [];

  const res: Group[] = [];

  /* ---------- MP ---------- */
  const mpRows: Row[] = (v?.mp?.items ?? []).map((x: any) => ({
    key: `mp:${x.mpId}`,
    label: x?.mp?.label ?? "MP",
  }));
  if (mpRows.length) res.push({ title: "Matières premières (MP)", rows: mpRows });

  /* ---------- Transport ---------- */
  res.push({
    title: "Transport",
    rows: [{ key: "transport.prixMoyen", label: "Transport moyen (DH/m³)" }],
  });

  /* ---------- Coût m3 ---------- */
  res.push({
    title: "Coûts par m³",
    rows: [
      { key: "coutM3.eau", label: "Eau" },
      { key: "coutM3.qualite", label: "Qualité" },
      { key: "coutM3.dechets", label: "Déchets" },
    ],
  });

  /* ---------- Maintenance ---------- */
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

  /* ---------- Coûts mensuels ---------- */
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

  /* ---------- Autres coûts (items) ---------- */
  const autresRows: Row[] = (v?.autresCouts?.items ?? [])
    .filter((x: any) => !String(x.unite ?? "").includes("POURCENT"))
    .map((x: any) => ({
      key: `autresCoutsItem:${x.id}`,
      label: x.label,
    }));

  if (autresRows.length) {
    res.push({ title: "Autres coûts", rows: autresRows });
  }

  return res;
});

/* =========================
   COLLAPSE GROUPS
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
    <!-- Header compact -->
    <div class="maj__head">
      <div class="maj__titleWrap">
        <div class="maj__title">Majorations</div>
        <div class="maj__sub">
          Saisie des majorations <b>(%)</b> — <b>Appliquer</b> = preview KPIs • <b>Enregistrer</b> = définitif
        </div>
        <div class="maj__meta">
          <span class="maj__pill">-100% → 1000%</span>
          <button class="maj__link" type="button" @click="openAll">Ouvrir</button>
          <span class="maj__dot">•</span>
          <button class="maj__link" type="button" @click="closeAll">Fermer</button>
        </div>
      </div>

      <div class="maj__actions">
        <button class="maj__btn maj__btn--ghost" type="button" @click="resetAll">Réinit</button>
        <button class="maj__btn maj__btn--primary" type="button" @click="applyPreview">Appliquer</button>
        <button class="maj__btn maj__btn--success" type="button" :disabled="saving" @click="save">
          {{ saving ? "..." : "Enregistrer" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="maj__alert maj__alert--error">
      {{ error }}
    </div>

    <div v-if="loading" class="maj__loading">Chargement…</div>

    <!-- ✅ 2 colonnes (desktop) -->
    <div v-else class="maj__grid">
      <section v-for="g in groups" :key="g.title" class="maj__card">
        <button class="maj__cardHead" type="button" @click="toggle(g.title)">
          <div class="maj__cardLeft">
            <span class="maj__bullet"></span>
            <span class="maj__cardTitle">{{ g.title }}</span>
            <span class="maj__count">{{ g.rows.length }}</span>
          </div>

          <span class="maj__chev" :class="{ 'maj__chev--open': open[g.title] }">▾</span>
        </button>

        <div v-show="open[g.title]" class="maj__cardBody">
          <!-- liste compacte -->
          <div class="maj__list">
            <div v-for="r in g.rows" :key="r.key" class="maj__item">
              <div class="maj__label" :title="r.label">{{ r.label }}</div>

              <div class="maj__inputWrap">
                <input
                  class="maj__input"
                  type="number"
                  inputmode="decimal"
                  step="0.1"
                  min="-100"
                  max="1000"
                  :value="pctOf(r.key)"
                  @input="setPct(r.key, ($event.target as HTMLInputElement).value)"
                />
                <span class="maj__suffix">%</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="!loading" class="maj__foot">
      Quitter la page sans enregistrer annule le preview.
    </div>
  </div>
</template>

<style scoped>
/* ✅ Tokens inspirés Sidebar */
.maj {
  --navy: #184070;
  --cyan: #20b8e8;
  --green: #90c028;

  --panel: #f7f8fb;
  --border: rgba(16, 24, 40, 0.10);
  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.62);

  --radius: 14px;

  padding: 10px 12px;
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: var(--text);
}

/* Header ultra compact */
.maj__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.maj__titleWrap { min-width: 0; display: grid; gap: 4px; }
.maj__title {
  font-weight: 900;
  letter-spacing: -0.2px;
  color: var(--navy);
  font-size: 1.02rem;
  line-height: 1.05;
}
.maj__sub { font-size: 0.75rem; color: var(--muted); line-height: 1.2; }
.maj__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.70rem;
  color: var(--muted);
}
.maj__pill {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 8px;
}
.maj__link {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--navy);
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
  font-size: 0.70rem;
}
.maj__dot { color: rgba(15, 23, 42, 0.35); }

/* Actions compactes */
.maj__actions { display: flex; align-items: center; gap: 6px; }
.maj__btn {
  border-radius: 12px;
  padding: 8px 10px;
  font-weight: 900;
  font-size: 0.78rem;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: transform .04s ease, filter .15s ease, background .15s ease;
  line-height: 1;
}
.maj__btn:active { transform: translateY(1px); }
.maj__btn:disabled { opacity: 0.65; cursor: not-allowed; }

.maj__btn--ghost { background: #fff; color: var(--text); }
.maj__btn--ghost:hover { background: var(--panel); }

.maj__btn--primary {
  border-color: rgba(24, 64, 112, 0.20);
  background: rgba(24, 64, 112, 0.10);
  color: var(--navy);
}
.maj__btn--success {
  border-color: rgba(144, 192, 40, 0.25);
  background: rgba(144, 192, 40, 0.18);
  color: #2d5a00;
}

/* Alerts */
.maj__alert {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 0.82rem;
  margin-bottom: 10px;
}
.maj__alert--error {
  border-color: rgba(220, 38, 38, 0.25);
  background: rgba(220, 38, 38, 0.06);
  color: #b91c1c;
}
.maj__loading { font-size: 0.85rem; color: var(--muted); }

/* ✅ Grid 2 colonnes (réduit le scroll) */
.maj__grid {
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr;
}
@media (min-width: 1024px) {
  .maj__grid { grid-template-columns: 1fr 1fr; }
}

/* Cards compactes */
.maj__card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.maj__cardHead {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.maj__cardLeft {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.maj__bullet {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--cyan);
  box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.12);
}
.maj__cardTitle {
  font-weight: 950;
  color: var(--text);
  font-size: 0.86rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 52vw;
}
.maj__count {
  font-size: 0.72rem;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.50);
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid var(--border);
  padding: 2px 7px;
  border-radius: 999px;
}
.maj__chev {
  color: rgba(15, 23, 42, 0.55);
  font-size: 0.95rem;
  transition: transform .15s ease;
}
.maj__chev--open { transform: rotate(180deg); }

.maj__cardBody {
  background: #fff;
  border-top: 1px solid var(--border);
  padding: 6px 10px 8px;
}

/* ✅ Liste ultra compacte */
.maj__list {
  display: grid;
  gap: 6px;
}
.maj__item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;               /* proximité label ↔ input */
  padding: 6px 0;         /* hauteur ligne réduite */
  border-bottom: 1px solid rgba(16,24,40,0.06);
}
.maj__item:last-child { border-bottom: 0; }

.maj__label {
  font-size: 0.82rem;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Input très visible + compact */
.maj__inputWrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.maj__input {
  width: 96px;            /* plus compact */
  text-align: right;
  border-radius: 12px;
  padding: 7px 9px;       /* plus bas */
  border: 1px solid rgba(32, 184, 232, 0.45);
  background: rgba(32, 184, 232, 0.12);
  font-weight: 950;
  color: var(--text);
  outline: none;
}
.maj__input:focus {
  box-shadow: 0 0 0 4px rgba(32, 184, 232, 0.18);
  border-color: rgba(32, 184, 232, 0.65);
}
.maj__suffix {
  font-size: 0.74rem;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.55);
}

/* Footer */
.maj__foot {
  margin-top: 8px;
  font-size: 0.72rem;
  color: var(--muted);
}
</style>
