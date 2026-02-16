<!-- src/components/SectionTargetsGeneralizeModal.vue (FICHIER COMPLET / ✅ scroll interne liste + sticky header) -->
<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

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

const mode = ref<"ALL" | "SELECT">("ALL");
const picked = reactive<Record<string, boolean>>({});
const q = ref("");

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
  if (lock) el.style.overflow = "hidden";
  else el.style.overflow = "";
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
   helpers
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

function fmt(x: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(x));
}
function fmt0(x: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(toNum(x));
}

/* =========================
   rows
========================= */
type VariantRow = {
  id: string;
  title: string;
  status: string;
  contractLabel: string;
  ebit: number;
  pvMoy: number;
};

const rows = computed<VariantRow[]>(() => {
  const pnl = (store as any).activePnl;
  if (!pnl) return [];

  const out: VariantRow[] = [];

  for (const c of pnl.contracts ?? []) {
    const d = (c as any)?.dureeMois ?? null;
    const cid = String((c as any)?.id ?? "");
    const contractLabel =
      d != null && Number(d) > 0
        ? `Contrat ${cid.slice(0, 6)} — ${Number(d)} mois`
        : `Contrat ${cid.slice(0, 6)}`;

    for (const v of (c as any).variants ?? []) {
      const vid = String(v?.id ?? "");
      if (!vid) continue;

      // on exclut la source (section déjà “active”)
      if (props.sourceVariantId && vid === String(props.sourceVariantId)) continue;

      const k = computeKpisFor(v, Number(d ?? 0));
      const ebit = toNum((k as any)?.ebit?.total ?? (k as any)?.ebitTotal ?? (k as any)?.ebit ?? 0);
      const pvMoy = toNum((k as any)?.asp?.m3 ?? (k as any)?.pvMoy?.m3 ?? (k as any)?.pvMoy ?? 0);

      out.push({
        id: vid,
        title: String(v?.title ?? "—"),
        status: String(v?.status ?? "—"),
        contractLabel,
        ebit,
        pvMoy,
      });
    }
  }

  const needle = q.value.trim().toLowerCase();
  const filtered = !needle
    ? out
    : out.filter((r) => {
        const blob = `${r.title} ${r.status} ${r.contractLabel}`.toLowerCase();
        return blob.includes(needle);
      });

  // tri pratique
  filtered.sort((a, b) => b.ebit - a.ebit);
  return filtered;
});

const allIds = computed(() => rows.value.map((r) => r.id));
const selectedIds = computed(() => rows.value.filter((r) => !!picked[r.id]).map((r) => r.id));
const selectedCount = computed(() => (mode.value === "ALL" ? allIds.value.length : selectedIds.value.length));

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;
    mode.value = "ALL";
    q.value = "";
    for (const k of Object.keys(picked)) delete picked[k];
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
            <div class="subtitle">
              Copier la section active vers d'autres variantes du même P&L.
            </div>
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

          <div class="controls">
            <div class="seg">
              <button type="button" class="segBtn" :class="mode === 'ALL' ? 'on' : ''" @click="mode = 'ALL'">
                Toutes
              </button>
              <button type="button" class="segBtn" :class="mode === 'SELECT' ? 'on' : ''" @click="mode = 'SELECT'">
                Choisir
              </button>
            </div>

            <span class="pill">
              {{ rows.length }} trouvée{{ rows.length > 1 ? "s" : "" }}
              •
              {{ selectedCount }} sélectionnée{{ selectedCount > 1 ? "s" : "" }}
            </span>

            <div class="spacer"></div>

            <input class="search" v-model="q" placeholder="Filtrer (titre, statut, contrat)..." />
          </div>

          <div v-if="rows.length === 0" class="empty">
            Aucune autre variante trouvée dans ce P&L.
          </div>

          <!-- ✅ LISTE AVEC SCROLL DÉDIÉ -->
          <div v-else class="listWrap">
            <div class="listHead">
              <div class="c1"></div>
              <div class="c2">Variante</div>
              <div class="c3">Contrat</div>
              <div class="c4 right">PV moy</div>
              <div class="c5 right">EBIT</div>
              <div class="c6">Statut</div>
            </div>

            <div
              v-for="r in rows"
              :key="r.id"
              class="row"
              :class="mode === 'ALL' ? 'locked' : ''"
            >
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
                <div class="id muted">#{{ r.id.slice(0, 8) }}</div>
              </div>

              <div class="c3 muted" :title="r.contractLabel">{{ r.contractLabel }}</div>

              <div class="c4 right mono">{{ fmt(r.pvMoy, 2) }}</div>
              <div class="c5 right mono strong">{{ fmt0(r.ebit) }}</div>

              <div class="c6">
                <span class="tag">{{ r.status }}</span>
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
/* Overlay + stacking */
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
  width: min(980px, 96vw);
  height: min(84vh, 820px); /* ✅ hauteur stable pour permettre le scroll interne */
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
}

/* Header */
.head {
  padding: 18px 22px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.headLeft {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.title {
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
}
.subtitle {
  font-size: 12px;
  color: #64748b;
}
.iconBtn {
  width: 36px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  cursor: pointer;
  font-weight: 800;
  color: #0f172a;
}
.iconBtn:hover {
  background: #f8fafc;
}

/* Body */
.body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden; /* ✅ le scroll est dans listWrap */
  flex: 1 1 auto;
}

/* callout */
.callout {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
}
.calloutTitle {
  font-size: 11px;
  font-weight: 800;
  color: #334155;
  margin-bottom: 4px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.calloutText {
  font-size: 12px;
  color: #475569;
}

/* Controls */
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.spacer {
  flex: 1 1 auto;
}
.seg {
  display: inline-flex;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
}
.segBtn {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 750;
  color: #334155;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.segBtn.on {
  background: #0f172a;
  color: #ffffff;
}
.segBtn:not(.on):hover {
  background: #f8fafc;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  font-size: 12px;
  font-weight: 750;
  color: #334155;
}
.search {
  width: min(360px, 100%);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 9px 11px;
  outline: none;
  font-size: 12px;
  background: #ffffff;
}
.search:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.12);
}

/* Empty */
.empty {
  border: 1px dashed #e5e7eb;
  background: #ffffff;
  border-radius: 12px;
  padding: 14px;
  color: #64748b;
  font-size: 12px;
}

/* ✅ ListWrap scroll */
.listWrap {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  overflow: auto;               /* ✅ scroll interne */
  flex: 1 1 auto;               /* ✅ prend le reste de la hauteur */
  min-height: 180px;
}

/* sticky header */
.listHead,
.row {
  display: grid;
  grid-template-columns: 42px 1.25fr 1.15fr 0.65fr 0.65fr 0.6fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}
.listHead {
  position: sticky;             /* ✅ reste visible */
  top: 0;
  z-index: 2;
  background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
  font-size: 11px;
  font-weight: 800;
  color: #475569;
}

.row {
  border-bottom: 1px solid #eef2f7;
  background: #ffffff;
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
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.id {
  font-size: 10px;
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
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  font-weight: 800;
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
  padding: 14px 22px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #ffffff;
}

.btn {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 800;
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
  background: #ffffff;
}
.btn.primary {
  border-color: #0f172a;
  background: #0f172a;
  color: #ffffff;
}
.btn.primary:hover {
  filter: brightness(1.06);
}
.btn.xs {
  padding: 7px 10px;
  font-size: 11px;
}
</style>
