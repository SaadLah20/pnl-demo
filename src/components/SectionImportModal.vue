<!-- src/components/SectionImportModal.vue (FICHIER COMPLET / ✅ scope Même P&L vs Tous + bouton Importer OK) -->
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

export type ImportCopyPreset = "FULL" | "ZERO" | "QTY_ONLY" | "MOMD_ONLY" | "QTY_MOMD";
type ImportScope = "SAME_PNL" | "ALL_PNLS";

type VariantRow = {
  variantId: string;
  title: string;
  status: string;
  pnlId: string;
  pnlLabel: string;
  contractLabel: string;
  ebit: number;
  pvMoy: number;
};

const props = defineProps<{
  modelValue: boolean;
  sectionLabel: string;
  targetVariantId: string | null;
  enablePresets?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "apply", payload: { sourceVariantId: string; copy: ImportCopyPreset }): void;
}>();

const store = usePnlStore();
const isOpen = computed(() => !!props.modelValue);

const q = ref("");
const picked = ref<string | null>(null);
const copy = ref<ImportCopyPreset>("FULL");
const scope = ref<ImportScope>("SAME_PNL");

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

function setPicked(id: string) {
  picked.value = id;
}

/* =========================
   resolve target pnl id (important for SAME_PNL)
========================= */
const targetPnlId = computed<string | null>(() => {
  const t = String(props.targetVariantId ?? "").trim();
  if (!t) return null;

  for (const p of (store as any).pnls ?? []) {
    const pid = String((p as any)?.id ?? "");
    for (const c of (p as any)?.contracts ?? []) {
      for (const v of (c as any)?.variants ?? []) {
        if (String(v?.id ?? "") === t) return pid;
      }
    }
  }
  return null;
});

const canSamePnl = computed(() => !!targetPnlId.value);

/* =========================
   rows
========================= */
const allRows = computed<VariantRow[]>(() => {
  const out: VariantRow[] = [];

  for (const p of (store as any).pnls ?? []) {
    const pnlId = String((p as any)?.id ?? "");
    const pnlLabel = String((p as any)?.title ?? (p as any)?.label ?? `P&L ${pnlId}`);

    for (const c of (p as any)?.contracts ?? []) {
      const d = (c as any)?.dureeMois ?? null;
      const cid = String((c as any)?.id ?? "");
      const contractLabel =
        d != null && Number(d) > 0 ? `Contrat ${cid.slice(0, 6)} — ${Number(d)} mois` : `Contrat ${cid.slice(0, 6)}`;

      for (const v of (c as any)?.variants ?? []) {
        const vid = String(v?.id ?? "");
        if (!vid) continue;

        // on exclut la cible (variante active)
        if (props.targetVariantId && vid === String(props.targetVariantId)) continue;

        const k = computeKpisFor(v, Number(d ?? 0));
        const ebit = toNum((k as any)?.ebit?.total ?? (k as any)?.ebitTotal ?? (k as any)?.ebit ?? 0);
        const pvMoy = toNum((k as any)?.asp?.m3 ?? (k as any)?.pvMoy?.m3 ?? (k as any)?.pvMoy ?? 0);

        out.push({
          variantId: vid,
          title: String(v?.title ?? "—"),
          status: String(v?.status ?? "—"),
          pnlId,
          pnlLabel,
          contractLabel,
          ebit,
          pvMoy,
        });
      }
    }
  }

  return out;
});

const rows = computed<VariantRow[]>(() => {
  // scope filter
  let out = allRows.value;

  if (scope.value === "SAME_PNL" && targetPnlId.value) {
    out = out.filter((r) => r.pnlId === targetPnlId.value);
  }

  // search filter
  const needle = q.value.trim().toLowerCase();
  if (needle) {
    out = out.filter((r) => {
      const blob = `${r.title} ${r.status} ${r.pnlLabel} ${r.contractLabel}`.toLowerCase();
      return blob.includes(needle);
    });
  }

  // sort
  out = [...out].sort((a, b) => b.ebit - a.ebit);
  return out;
});

const pickedRow = computed(() => rows.value.find((r) => r.variantId === picked.value) ?? null);
const canSubmit = computed(() => !!String(picked.value ?? "").trim());

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;
    q.value = "";
    picked.value = null;
    copy.value = "FULL";
    scope.value = canSamePnl.value ? "SAME_PNL" : "ALL_PNLS";
  }
);

// si l’utilisateur bascule de scope et que la sélection n’est plus visible -> reset
watch(
  () => scope.value,
  () => {
    const sel = String(picked.value ?? "");
    if (!sel) return;
    if (!rows.value.some((r) => r.variantId === sel)) picked.value = null;
  }
);

function submit() {
  const src = String(picked.value ?? "").trim();
  if (!src) return;
  emit("apply", { sourceVariantId: src, copy: copy.value });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="`Importer — ${sectionLabel}`">
        <!-- Header -->
        <div class="head">
          <div class="headLeft">
            <div class="title">Importer — {{ sectionLabel }}</div>
            <div class="subtitle">
              Copier depuis une autre variante vers la variante active. <b>L’enregistrement se fait à part.</b>
            </div>
          </div>
          <button class="iconBtn" type="button" @click="close" aria-label="Fermer">✕</button>
        </div>

        <!-- Body -->
        <div class="body">
          <div class="callout">
            <div class="calloutTitle">Source</div>
            <div class="calloutText">
              Choisis une variante source, puis clique <b>Importer</b>.
            </div>
          </div>

          <div class="controls">
            <!-- ✅ Scope toggle -->
            <div class="seg" role="tablist" aria-label="Périmètre">
              <button
                type="button"
                class="segBtn"
                :class="{ on: scope === 'SAME_PNL' }"
                :disabled="!canSamePnl"
                @click="scope = 'SAME_PNL'"
                :title="!canSamePnl ? 'P&L cible introuvable (targetVariantId manquant)' : ''"
              >
                Même P&L
              </button>
              <button
                type="button"
                class="segBtn"
                :class="{ on: scope === 'ALL_PNLS' }"
                @click="scope = 'ALL_PNLS'"
              >
                Tous les P&L
              </button>
            </div>

            <input class="search" v-model="q" placeholder="Rechercher (P&L, contrat, titre, status…)" />

            <div v-if="enablePresets" class="preset">
              <div class="presetTitle">Données à importer</div>
              <select class="select" v-model="copy">
                <option value="FULL">Section complète</option>
                <option value="ZERO">Formules seulement (Qté=0, MOMD=0)</option>
                <option value="QTY_ONLY">Formules + Qté (MOMD=0)</option>
                <option value="MOMD_ONLY">Formules + MOMD (Qté=0)</option>
                <option value="QTY_MOMD">Formules + Qté + MOMD</option>
              </select>
            </div>

            <span class="pill">{{ rows.length }} trouvée{{ rows.length > 1 ? "s" : "" }}</span>
          </div>

          <div v-if="rows.length === 0" class="empty">
            Aucune variante trouvée pour ce périmètre.
          </div>

          <div v-else class="listWrap" role="listbox" aria-label="Variantes source">
            <div class="listHead">
              <div class="c1"></div>
              <div class="c2">Variante</div>
              <div class="c3">P&L</div>
              <div class="c4">Contrat</div>
              <div class="c5 right">PV moy</div>
              <div class="c6 right">EBIT</div>
              <div class="c7">Status</div>
            </div>

            <button
              v-for="r in rows"
              :key="r.variantId"
              class="row"
              type="button"
              role="option"
              :aria-selected="picked === r.variantId"
              :class="{ active: picked === r.variantId }"
              @click="setPicked(r.variantId)"
            >
              <div class="c1">
                <input
                  type="radio"
                  name="import-source-variant"
                  :checked="picked === r.variantId"
                  tabindex="-1"
                  @click.stop
                  readonly
                />
              </div>

              <div class="c2">
                <div class="nm" :title="r.title">{{ r.title }}</div>
                <div class="id muted">#{{ r.variantId.slice(0, 8) }}</div>
              </div>

              <div class="c3 muted" :title="r.pnlLabel">{{ r.pnlLabel }}</div>
              <div class="c4 muted" :title="r.contractLabel">{{ r.contractLabel }}</div>

              <div class="c5 right mono">{{ fmt(r.pvMoy, 2) }}</div>
              <div class="c6 right mono strong">{{ fmt0(r.ebit) }}</div>

              <div class="c7"><span class="tag">{{ r.status }}</span></div>
            </button>
          </div>

          <div v-if="pickedRow" class="hint">
            Source sélectionnée : <b>{{ pickedRow.title }}</b> — {{ pickedRow.pnlLabel }} — {{ pickedRow.contractLabel }}
          </div>
        </div>

        <!-- Footer -->
        <div class="foot">
          <button class="btn ghost" type="button" @click="close">Annuler</button>
          <button class="btn primary" type="button" @click="submit" :disabled="!canSubmit">
            Importer
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
  padding: 18px 22px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.headLeft { display: flex; flex-direction: column; gap: 4px; }
.title { font-size: 16px; font-weight: 750; color: #0f172a; }
.subtitle { font-size: 12px; color: #64748b; line-height: 1.35; }
.iconBtn {
  width: 36px; height: 34px; border-radius: 10px;
  border: 1px solid #e5e7eb; background: #fff;
  cursor: pointer; font-weight: 800; color: #0f172a;
}
.iconBtn:hover { background: #f8fafc; }

/* Body */
.body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  flex: 1 1 auto;
}

/* Callout */
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
.calloutText { font-size: 12px; color: #475569; }

/* Controls */
.controls {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

/* Segmented (scope) */
.seg {
  display: inline-flex;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
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
.segBtn.on { background: #0f172a; color: #fff; }
.segBtn:not(.on):hover { background: #f8fafc; }
.segBtn:disabled { opacity: 0.55; cursor: not-allowed; }

.search {
  flex: 1 1 380px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 9px 11px;
  outline: none;
  font-size: 12px;
  background: #fff;
}
.search:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.12); }

.preset { display: flex; flex-direction: column; gap: 6px; min-width: 280px; }
.presetTitle { font-weight: 800; font-size: 11px; color: #334155; }
.select {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 12px;
  outline: none;
  background: #fff;
}
.select:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.12); }

.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
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
.listHead, .row {
  display: grid;
  grid-template-columns: 40px 1.1fr 1.0fr 1.1fr 0.6fr 0.6fr 0.55fr;
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
  font-weight: 800;
  color: #475569;
}
.row {
  border-bottom: 1px solid #eef2f7;
  background: #fff;
  font-size: 12px;
  text-align: left;
  width: 100%;
  cursor: pointer;
}
.row:last-child { border-bottom: 0; }
.row:hover { background: #fbfdff; }
.row.active { background: #eef2ff; box-shadow: inset 3px 0 0 #0f172a; }

.c1 { display: flex; align-items: center; justify-content: center; }
.nm {
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.id { font-size: 10px; }
.right { text-align: right; }
.muted { color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.strong { font-weight: 900; color: #0f172a; }
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-weight: 800;
  font-size: 10px;
  color: #334155;
}
.hint {
  font-size: 12px;
  color: #334155;
  border: 1px solid #eef2f7;
  background: #fcfcfd;
  border-radius: 12px;
  padding: 10px 12px;
}

/* Footer */
.foot {
  padding: 14px 22px;
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
  font-weight: 800;
  font-size: 12px;
  color: #0f172a;
}
.btn:hover { background: #f8fafc; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn.ghost { background: #fff; }
.btn.primary { border-color: #0f172a; background: #0f172a; color: #fff; }
.btn.primary:hover { filter: brightness(1.06); }
</style>
