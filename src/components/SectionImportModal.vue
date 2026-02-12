<!-- src/components/SectionImportModal.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

// ✅ Presets: par défaut l'import copie "FULL" (la section entière).
// Pour les pages qui utilisent déjà CopyPreset (Qté/MOMD/Formules), tu peux activer enablePresets.
export type ImportCopyPreset = "FULL" | "ZERO" | "QTY_ONLY" | "MOMD_ONLY" | "QTY_MOMD";

type VariantRow = {
  variantId: string;
  title: string;
  status: string;
  pnlLabel: string;
  contractLabel: string;
  ebit: number;
  pvMoy: number;
};

const props = defineProps<{
  modelValue: boolean;
  sectionLabel: string;
  // Variante cible (active)
  targetVariantId: string | null;
  // ✅ Si true -> affiche les presets (ZERO/QTY_ONLY/MOMD_ONLY/QTY_MOMD)
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

function close() {
  emit("update:modelValue", false);
  emit("close");
}

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

const rows = computed<VariantRow[]>(() => {
  const out: VariantRow[] = [];

  for (const p of (store as any).pnls ?? []) {
    const pnlLabel = String((p as any)?.title ?? (p as any)?.label ?? `P&L ${(p as any)?.id ?? ""}`);

    for (const c of (p as any)?.contracts ?? []) {
      const d = (c as any)?.dureeMois ?? null;
      const contractLabel =
        d != null
          ? `Contrat ${String((c as any)?.id ?? "").slice(0, 6)} — ${d} mois`
          : `Contrat ${String((c as any)?.id ?? "").slice(0, 6)}`;

      for (const v of c?.variants ?? []) {
        const vid = String(v?.id ?? "");
        if (!vid) continue;
        if (props.targetVariantId && vid === String(props.targetVariantId)) continue;

        const k = computeKpisFor(v, Number(d ?? 0));
        const ebit = toNum((k as any)?.ebit?.total ?? (k as any)?.ebitTotal ?? (k as any)?.ebit ?? 0);
        const pvMoy = toNum((k as any)?.asp?.m3 ?? (k as any)?.pvMoy?.m3 ?? (k as any)?.pvMoy ?? 0);

        out.push({
          variantId: vid,
          title: String(v?.title ?? "—"),
          status: String(v?.status ?? "—"),
          pnlLabel,
          contractLabel,
          ebit,
          pvMoy,
        });
      }
    }
  }

  const needle = q.value.trim().toLowerCase();
  const filtered = !needle
    ? out
    : out.filter((r) => {
        const blob = `${r.title} ${r.status} ${r.pnlLabel} ${r.contractLabel}`.toLowerCase();
        return blob.includes(needle);
      });

  filtered.sort((a, b) => b.ebit - a.ebit);
  return filtered;
});

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;
    q.value = "";
    picked.value = null;
    copy.value = "FULL";
  }
);

const pickedRow = computed(() => rows.value.find((r) => r.variantId === picked.value) ?? null);

function submit() {
  const src = String(picked.value ?? "").trim();
  if (!src) return;
  emit("apply", { sourceVariantId: src, copy: copy.value });
}
</script>

<template>
  <div v-if="isOpen" class="ov" @click.self="close">
    <div class="modal">
      <div class="head">
        <div class="ttl">
          <div class="h">Importer — {{ sectionLabel }}</div>
          <div class="s">
            Copier les données depuis une autre variante (même ou autre P&L) vers la variante active.
            <b>L’enregistrement se fait à part.</b>
          </div>
        </div>
        <button class="x" @click="close">✕</button>
      </div>

      <div class="body">
        <div class="topRow">
          <input class="in" v-model="q" placeholder="Rechercher une variante (P&L, contrat, titre, status…)" />

          <div v-if="enablePresets" class="preset">
            <div class="pt">Données à importer</div>
            <select class="sel" v-model="copy">
              <option value="FULL">Section complète</option>
              <option value="ZERO">Formules seulement (Qté=0, MOMD=0)</option>
              <option value="QTY_ONLY">Formules + Qté (MOMD=0)</option>
              <option value="MOMD_ONLY">Formules + MOMD (Qté=0)</option>
              <option value="QTY_MOMD">Formules + Qté + MOMD</option>
            </select>
          </div>
        </div>

        <div v-if="rows.length === 0" class="empty">Aucune autre variante trouvée.</div>

        <div v-else class="list">
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
            :class="{ active: picked === r.variantId }"
            @click="picked = r.variantId"
          >
            <div class="c1">
              <input type="radio" :checked="picked === r.variantId" />
            </div>

            <div class="c2">
              <div class="nm">{{ r.title }}</div>
              <div class="id muted">#{{ r.variantId.slice(0, 8) }}</div>
            </div>

            <div class="c3 muted">{{ r.pnlLabel }}</div>
            <div class="c4 muted">{{ r.contractLabel }}</div>
            <div class="c5 right mono">{{ r.pvMoy.toLocaleString("fr-FR") }}</div>
            <div class="c6 right mono strong">{{ r.ebit.toLocaleString("fr-FR") }}</div>

            <div class="c7">
              <span class="tag">{{ r.status }}</span>
            </div>
          </button>
        </div>

        <div v-if="pickedRow" class="hint">
          Source sélectionnée : <b>{{ pickedRow.title }}</b> — {{ pickedRow.pnlLabel }} — {{ pickedRow.contractLabel }}
        </div>
      </div>

      <div class="foot">
        <button class="btn" @click="close">Annuler</button>
        <button class="btnPrimary" @click="submit" :disabled="!picked">Importer</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 100000; /* ✅ au-dessus du HeaderDashboard */
}
.modal {
  width: min(1100px, 96vw);
  max-height: 84vh;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #eef2f7;
}
.ttl {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.h {
  font-weight: 950;
  font-size: 14px;
  color: #111827;
}
.s {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.35;
}
.x {
  border: 1px solid #e5e7eb;
  background: #fff;
  width: 36px;
  height: 34px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
}
.x:hover {
  background: #f9fafb;
}

.body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.topRow {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.in {
  flex: 1 1 420px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 9px 11px;
  outline: none;
  font-size: 12px;
}
.in:focus {
  border-color: #111827;
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.12);
}
.preset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 260px;
}
.pt {
  font-weight: 950;
  font-size: 11px;
  color: #374151;
}
.sel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
}
.sel:focus {
  border-color: #111827;
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.12);
}

.empty {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  color: #6b7280;
  font-size: 12px;
}

.list {
  border: 1px solid #eef2f7;
  border-radius: 14px;
  overflow: hidden;
}
.listHead,
.row {
  display: grid;
  grid-template-columns: 40px 1.1fr 1.0fr 1.1fr 0.6fr 0.6fr 0.55fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}
.listHead {
  background: #f9fafb;
  border-bottom: 1px solid #eef2f7;
  font-size: 11px;
  font-weight: 950;
  color: #374151;
}
.row {
  border-bottom: 1px solid #eef2f7;
  background: #fff;
  font-size: 12px;
  text-align: left;
  width: 100%;
  cursor: pointer;
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: #fcfcfd;
}
.row.active {
  background: #eef2ff;
}
.c1 {
  display: flex;
  align-items: center;
  justify-content: center;
}
.nm {
  font-weight: 950;
  color: #111827;
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
  color: #6b7280;
}
.mono {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
.strong {
  font-weight: 950;
  color: #111827;
}
.tag {
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: #374151;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hint {
  font-size: 12px;
  color: #374151;
  border: 1px solid #eef2f7;
  background: #fcfcfd;
  border-radius: 14px;
  padding: 10px 12px;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eef2f7;
}
.btn,
.btnPrimary {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  font-size: 12px;
  cursor: pointer;
}
.btn:hover {
  background: #f9fafb;
}
.btnPrimary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.btnPrimary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
