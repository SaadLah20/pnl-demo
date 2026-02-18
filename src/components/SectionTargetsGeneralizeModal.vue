<!-- src/components/SectionTargetsGeneralizeModal.vue (FICHIER COMPLET / UI+UX aligné ImportModal + filtres ALL_PNLS) -->
<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";
import { contractUiTitle } from "@/services/contractTitle";

const props = defineProps<{
  modelValue: boolean;
  sectionLabel: string;
  sourceVariantId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "apply", payload: { mode: "ALL" | "SELECT"; variantIds: string[] }): void;
}>();

const store = usePnlStore();
const isOpen = computed(() => !!props.modelValue);

/* =========================
   State
========================= */
type Scope = "SAME_PNL" | "ALL_PNLS";
const scope = ref<Scope>("SAME_PNL");

const mode = ref<"ALL" | "SELECT">("ALL");
const picked = reactive<Record<string, boolean>>({});
const q = ref("");

const pnlFilter = ref<string>("ALL");
const contractFilter = ref<string>("ALL");

/* =========================
   close / scroll lock / ESC
========================= */
function close() {
  emit("update:modelValue", false);
  emit("close");
}
function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return;
  if (e.key === "Escape") close();
}
function lockBodyScroll(lock: boolean) {
  const el = document?.body;
  if (!el) return;
  el.style.overflow = lock ? "hidden" : "";
}
watch(
  () => isOpen.value,
  (open) => {
    lockBodyScroll(open);
    if (open) window.addEventListener("keydown", onKeydown);
    else window.removeEventListener("keydown", onKeydown);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  lockBodyScroll(false);
  window.removeEventListener("keydown", onKeydown);
});

/* =========================
   Helpers
========================= */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function computeKpisFor(v: any, dureeMois: number) {
  try {
    return computeHeaderKpis(v, dureeMois, null, null, false);
  } catch {
    return null;
  }
}
function fmt0(x: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(toNum(x));
}

/* =========================
   Rows
========================= */
type VariantRow = {
  id: string;
  title: string;
  status: string;

  pnlId: string;
  pnlLabel: string;

  contractId: string;
  contractLabel: string;

  ebit: number;
};

function pnlLabelOf(p: any) {
  return String(p?.title ?? p?.label ?? p?.name ?? `P&L ${String(p?.id ?? "").slice(0, 6)}`);
}

const allRows = computed<VariantRow[]>(() => {
  const out: VariantRow[] = [];
  const pnls = (store as any).pnls ?? [];
  if (!Array.isArray(pnls)) return out;

  for (const p of pnls) {
    const pnlId = String(p?.id ?? "");
    if (!pnlId) continue;

    const pnlLabel = pnlLabelOf(p);

    for (const c of p?.contracts ?? []) {
      const contractId = String(c?.id ?? "");
      if (!contractId) continue;

      const contractLabel = contractUiTitle(c); // ✅ sans durée / titre depuis contractTitle.ts
      const d = (c as any)?.dureeMois ?? 0;

      for (const v of c?.variants ?? []) {
        const vid = String(v?.id ?? "");
        if (!vid) continue;

        // exclude source
        if (props.sourceVariantId && vid === String(props.sourceVariantId)) continue;

        const k = computeKpisFor(v, Number(d ?? 0));
        const ebit = toNum((k as any)?.ebit?.total ?? (k as any)?.ebitTotal ?? (k as any)?.ebit ?? 0);

        out.push({
          id: vid,
          title: String(v?.title ?? "—"),
          status: String(v?.status ?? "—"),
          pnlId,
          pnlLabel,
          contractId,
          contractLabel,
          ebit,
        });
      }
    }
  }

  return out;
});

const activePnlId = computed(() => String((store as any)?.activePnl?.id ?? "").trim() || null);

const pnlOptions = computed(() => {
  const pnls = (store as any).pnls ?? [];
  if (!Array.isArray(pnls)) return [];
  return pnls.map((p: any) => ({
    id: String(p?.id ?? ""),
    label: pnlLabelOf(p),
  }));
});

const contractOptions = computed(() => {
  const list: Array<{ id: string; label: string; pnlId: string }> = [];
  const pnls = (store as any).pnls ?? [];
  if (!Array.isArray(pnls)) return [];

  for (const p of pnls) {
    const pid = String(p?.id ?? "");
    if (!pid) continue;

    if (scope.value === "ALL_PNLS" && pnlFilter.value !== "ALL" && pid !== pnlFilter.value) continue;

    for (const c of p?.contracts ?? []) {
      const cid = String(c?.id ?? "");
      if (!cid) continue;
      list.push({ id: cid, label: contractUiTitle(c), pnlId: pid });
    }
  }

  const map = new Map<string, { id: string; label: string; pnlId: string }>();
  for (const x of list) if (!map.has(x.id)) map.set(x.id, x);

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
});

const rows = computed<VariantRow[]>(() => {
  let out = allRows.value;

  // SAME_PNL: limité au P&L actif
  if (scope.value === "SAME_PNL" && activePnlId.value) {
    out = out.filter((r) => r.pnlId === activePnlId.value);
  }

  // ALL_PNLS + filtres
  if (scope.value === "ALL_PNLS") {
    if (pnlFilter.value !== "ALL") out = out.filter((r) => r.pnlId === pnlFilter.value);
    if (contractFilter.value !== "ALL") out = out.filter((r) => r.contractId === contractFilter.value);
  }

  const needle = q.value.trim().toLowerCase();
  if (needle) {
    out = out.filter((r) => {
      const blob = `${r.title} ${r.status} ${r.pnlLabel} ${r.contractLabel}`.toLowerCase();
      return blob.includes(needle);
    });
  }

  return out.slice().sort((a, b) => b.ebit - a.ebit);
});

const allIds = computed(() => rows.value.map((r) => r.id));
const selectedIds = computed(() => rows.value.filter((r) => !!picked[r.id]).map((r) => r.id));
const selectedCount = computed(() => (mode.value === "ALL" ? allIds.value.length : selectedIds.value.length));

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;

    scope.value = "SAME_PNL";
    mode.value = "ALL";
    q.value = "";

    pnlFilter.value = "ALL";
    contractFilter.value = "ALL";

    for (const k of Object.keys(picked)) delete picked[k];
  }
);

watch(
  () => scope.value,
  () => {
    // reset filtres quand on quitte ALL_PNLS
    if (scope.value !== "ALL_PNLS") {
      pnlFilter.value = "ALL";
      contractFilter.value = "ALL";
    }
    // purge sélection si éléments sortent du filtre
    const keep = new Set(allIds.value);
    for (const k of Object.keys(picked)) if (!keep.has(k)) delete picked[k];
  }
);

watch(
  () => pnlFilter.value,
  () => {
    if (contractFilter.value === "ALL") return;
    const ok = rows.value.some((r) => r.contractId === contractFilter.value);
    if (!ok) contractFilter.value = "ALL";
  }
);

function toggleAll(v: boolean) {
  for (const r of rows.value) picked[r.id] = v;
}

function submit() {
  const ids = mode.value === "ALL" ? allIds.value : selectedIds.value;
  emit("apply", { mode: mode.value, variantIds: ids });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close" aria-hidden="false">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="`Généraliser — ${sectionLabel}`">
        <!-- Header -->
        <div class="head">
          <div class="headLeft">
            <div class="title">Généraliser — {{ sectionLabel }}</div>
            <div class="subtitle">Copier la section active vers d'autres variantes.</div>
          </div>
          <button class="iconBtn" type="button" @click="close" aria-label="Fermer">✕</button>
        </div>

        <!-- Body -->
        <div class="body">
          <div class="callout">
            <div class="calloutTitle">Portée</div>
            <div class="calloutText">
              La section <b>{{ sectionLabel }}</b> de la variante active sera copiée vers les variantes sélectionnées.
            </div>
          </div>

          <!-- ✅ Topbar compact (no wrap) -->
          <div class="topbar">
            <div class="seg" role="tablist" aria-label="Périmètre">
              <button
                type="button"
                class="segBtn"
                :class="{ on: scope === 'SAME_PNL' }"
                @click="scope = 'SAME_PNL'"
                title="Limiter au P&L actif"
              >
                Même P&L
              </button>
              <button
                type="button"
                class="segBtn"
                :class="{ on: scope === 'ALL_PNLS' }"
                @click="scope = 'ALL_PNLS'"
                title="Parcourir tous les P&L"
              >
                Tous les P&L
              </button>
            </div>

            <div class="seg" role="tablist" aria-label="Mode de sélection">
              <button type="button" class="segBtn" :class="{ on: mode === 'ALL' }" @click="mode = 'ALL'">Toutes</button>
              <button type="button" class="segBtn" :class="{ on: mode === 'SELECT' }" @click="mode = 'SELECT'">
                Choisir
              </button>
            </div>

            <div v-if="scope === 'ALL_PNLS'" class="filtersRow">
              <select class="select sm" v-model="pnlFilter" title="Filtrer par P&L">
                <option value="ALL">P&L : Tous</option>
                <option v-for="p in pnlOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>

              <select class="select sm" v-model="contractFilter" title="Filtrer par contrat">
                <option value="ALL">Contrat : Tous</option>
                <option v-for="c in contractOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
            </div>

            <input class="search smGrow" v-model="q" placeholder="Filtrer (titre, statut, P&L, contrat)…" />

            <div class="topbarRight">
              <span class="pillNoWrap" :title="`${rows.length} variantes`">
                {{ rows.length }} • {{ selectedCount }} sel.
              </span>
            </div>
          </div>

          <div v-if="rows.length === 0" class="empty">Aucune variante trouvée pour ce périmètre.</div>

          <!-- ✅ Liste scroll interne + header sticky -->
          <div v-else class="listWrap" role="listbox" aria-label="Variantes cibles">
            <div class="listHead">
              <div class="c1"></div>
              <div class="c2">Variante</div>
              <div class="c3">P&L</div>
              <div class="c4">Contrat</div>
              <div class="c5 right">EBIT</div>
              <div class="c6">Statut</div>
            </div>

            <div v-for="r in rows" :key="r.id" class="row" :class="{ locked: mode === 'ALL' }">
              <div class="c1">
                <input
                  type="checkbox"
                  :disabled="mode === 'ALL'"
                  v-model="picked[r.id]"
                  :aria-label="`Sélectionner ${r.title}`"
                />
              </div>

              <div class="c2">
                <div class="nm" :title="r.title">{{ r.title }}</div>
              </div>

              <div class="c3 muted" :title="r.pnlLabel">{{ r.pnlLabel }}</div>
              <div class="c4 muted" :title="r.contractLabel">{{ r.contractLabel }}</div>

              <div class="c5 right mono strong" :title="fmt0(r.ebit)">{{ fmt0(r.ebit) }}</div>

              <div class="c6">
                <span class="tag" :title="r.status">{{ r.status }}</span>
              </div>
            </div>
          </div>

          <div v-if="mode === 'SELECT' && rows.length" class="miniActions">
            <button class="btn ghost xs" type="button" @click="toggleAll(true)">Tout cocher</button>
            <button class="btn ghost xs" type="button" @click="toggleAll(false)">Tout décocher</button>
          </div>
        </div>

        <!-- Footer -->
        <div class="foot">
          <button class="btn ghost" type="button" @click="close">Annuler</button>
          <button
            class="btn primary"
            type="button"
            @click="submit"
            :disabled="!allIds.length || (mode === 'SELECT' && !selectedIds.length)"
            :title="mode === 'SELECT' && !selectedIds.length ? 'Sélectionne au moins une variante' : ''"
          >
            Généraliser
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Overlay */
.ov {
  position: fixed;
  inset: 0;
  z-index: 110000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(4px);
}

/* Modal */
.modal {
  width: min(1100px, 96vw);
  height: min(84vh, 860px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
}

/* Header */
.head {
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.headLeft {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}
.subtitle {
  font-size: 12px;
  color: #64748b;
  line-height: 1.25;
}
.iconBtn {
  width: 36px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  font-weight: 900;
  color: #0f172a;
}
.iconBtn:hover {
  background: #f8fafc;
}

/* Body */
.body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  flex: 1 1 auto;
}

/* Callout */
.callout {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
}
.calloutTitle {
  font-size: 11px;
  font-weight: 900;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin-bottom: 4px;
}
.calloutText {
  font-size: 12px;
  color: #475569;
}

/* Topbar compact */
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  padding: 10px 12px;
  border: 1px solid #eef2f7;
  background: #fcfcfd;
  border-radius: 12px;
  overflow: hidden;
}
.filtersRow {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: nowrap;
}
.topbarRight {
  margin-left: auto;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  flex: 0 0 auto;
}

.seg {
  display: inline-flex;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  flex: 0 0 auto;
}
.segBtn {
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
  background: transparent;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}
.segBtn.on {
  background: #0f172a;
  color: #fff;
}
.segBtn:not(.on):hover {
  background: #f8fafc;
}

.select {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
  background: #fff;
  max-width: 220px;
}
.select.sm {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 10px;
}

.search {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 7px 10px;
  outline: none;
  font-size: 12px;
  background: #fff;
  min-width: 200px;
}
.search.smGrow {
  flex: 1 1 auto;
  min-width: 220px;
}

.pillNoWrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  font-weight: 900;
  color: #334155;
  white-space: nowrap;
  flex: 0 0 auto;
}

/* Empty */
.empty {
  border: 1px dashed #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  color: #64748b;
  font-size: 12px;
}

/* List */
.listWrap {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 220px;
}

.listHead,
.row {
  display: grid;
  grid-template-columns: 40px 1.25fr 1fr 1fr 0.65fr 0.55fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}
.listHead {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
  font-size: 11px;
  font-weight: 900;
  color: #475569;
}
.row {
  border-bottom: 1px solid #eef2f7;
  background: #fff;
  font-size: 12px;
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: #fbfdff;
}
.row.locked {
  opacity: 0.85;
}

.c1 {
  display: flex;
  align-items: center;
  justify-content: center;
}
.nm {
  font-weight: 900;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.right {
  text-align: right;
}
.muted {
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.strong {
  font-weight: 900;
  color: #0f172a;
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-weight: 900;
  font-size: 10px;
  color: #334155;
}

/* mini actions */
.miniActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Footer */
.foot {
  padding: 12px 14px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #fff;
}
.btn {
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 900;
  font-size: 12px;
  color: #0f172a;
}
.btn:hover {
  background: #f8fafc;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.ghost {
  background: #fff;
}
.btn.primary {
  border-color: #0f172a;
  background: #0f172a;
  color: #fff;
}
.btn.primary:hover {
  filter: brightness(1.06);
}
.btn.xs {
  padding: 7px 10px;
  font-size: 11px;
}
</style>
