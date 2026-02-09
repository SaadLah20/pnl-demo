<!-- src/components/SectionTargetsGeneralizeModal.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
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

type VariantRow = {
  id: string;
  title: string;
  status: string;
  contractLabel: string;
  ebit: number;
  pvMoy: number;
};

const rows = computed<VariantRow[]>(() => {
  const pnl = store.activePnl;
  if (!pnl) return [];

  const out: VariantRow[] = [];

  for (const c of pnl.contracts ?? []) {
    const d = (c as any)?.dureeMois ?? null;
    const contractLabel =
      d != null
        ? `Contrat ${String((c as any)?.id ?? "").slice(0, 6)} — ${d} mois`
        : `Contrat ${String((c as any)?.id ?? "").slice(0, 6)}`;

    for (const v of c.variants ?? []) {
      const vid = String(v?.id ?? "");
      if (!vid) continue;
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

  filtered.sort((a, b) => b.ebit - a.ebit);
  return filtered;
});

const allIds = computed(() => rows.value.map((r) => r.id));
const selectedIds = computed(() => rows.value.filter((r) => picked[r.id]).map((r) => r.id));

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
  <div v-if="isOpen" class="ov" @click.self="close">
    <div class="modal">
      <div class="head">
        <div class="ttl">
          <div class="h">Généraliser — {{ sectionLabel }}</div>
          <div class="s">Copier la section active vers d'autres variantes du même P&L</div>
        </div>
        <button class="x" @click="close">✕</button>
      </div>

      <div class="body">
        <div class="modeRow">
          <label class="radio">
            <input type="radio" value="ALL" v-model="mode" />
            <span>Toutes les variantes</span>
          </label>

          <label class="radio">
            <input type="radio" value="SELECT" v-model="mode" />
            <span>Choisir</span>
          </label>

          <div class="spacer"></div>

          <input class="in" v-model="q" placeholder="Filtrer variantes…" />
        </div>

        <div v-if="rows.length === 0" class="empty">Aucune autre variante trouvée dans ce P&L.</div>

        <div v-else class="list">
          <div class="listHead">
            <div class="c1"></div>
            <div class="c2">Variante</div>
            <div class="c3">Contrat</div>
            <div class="c4 right">PV moy</div>
            <div class="c5 right">EBIT</div>
            <div class="c6">Status</div>
          </div>

          <div v-for="r in rows" :key="r.id" class="row" :class="mode === 'ALL' ? 'disabledPick' : ''">
            <div class="c1">
              <input type="checkbox" :disabled="mode === 'ALL'" v-model="picked[r.id]" />
            </div>

            <div class="c2">
              <div class="nm">{{ r.title }}</div>
              <div class="id muted">#{{ r.id.slice(0, 8) }}</div>
            </div>

            <div class="c3 muted">{{ r.contractLabel }}</div>
            <div class="c4 right mono">{{ r.pvMoy.toLocaleString("fr-FR") }}</div>
            <div class="c5 right mono strong">{{ r.ebit.toLocaleString("fr-FR") }}</div>

            <div class="c6">
              <span class="tag">{{ r.status }}</span>
            </div>
          </div>
        </div>

        <div v-if="mode === 'SELECT' && rows.length" class="miniActions">
          <button class="btn xs" @click="toggleAll(true)">Tout cocher</button>
          <button class="btn xs" @click="toggleAll(false)">Tout décocher</button>
        </div>
      </div>

      <div class="foot">
        <button class="btn" @click="close">Annuler</button>
        <button
          class="btnPrimary"
          @click="submit"
          :disabled="!allIds.length || (mode === 'SELECT' && !selectedIds.length)"
        >
          Généraliser
        </button>
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
  z-index: 60;
}
.modal {
  width: min(980px, 96vw);
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
.modeRow {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 900;
  font-size: 12px;
  color: #111827;
}
.spacer {
  flex: 1 1 auto;
}
.in {
  width: min(320px, 100%);
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
  grid-template-columns: 40px 1.2fr 1.2fr 0.6fr 0.6fr 0.6fr;
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
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: #fcfcfd;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.strong {
  font-weight: 950;
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fafafa;
  font-weight: 950;
  font-size: 10px;
  color: #374151;
}

.miniActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.foot {
  border-top: 1px solid #eef2f7;
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn,
.btnPrimary {
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 950;
  font-size: 12px;
}
.btn:hover {
  background: #f9fafb;
}
.btnPrimary {
  border-color: #111827;
  background: #111827;
  color: #fff;
}
.btnPrimary:hover {
  filter: brightness(1.05);
}
.btn.xs {
  padding: 6px 10px;
  font-size: 11px;
}
</style>
