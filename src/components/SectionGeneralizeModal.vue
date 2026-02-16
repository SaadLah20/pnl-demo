<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

export type CopyPreset = "ZERO" | "QTY_ONLY" | "MOMD_ONLY" | "QTY_MOMD";

const props = defineProps<{
  modelValue: boolean;
  sectionLabel: string;
  sourceVariantId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "apply", payload: { mode: "ALL" | "SELECT"; variantIds: string[]; copy: CopyPreset }): void;
}>();

const store = usePnlStore();

const isOpen = computed(() => !!props.modelValue);

const mode = ref<"ALL" | "SELECT">("ALL");
const modeLabel = computed(() => (mode.value === "ALL" ? "Toutes" : "Sélection"));
const copy = ref<CopyPreset>("QTY_MOMD");
const q = ref("");

const picked = reactive<Record<string, boolean>>({});

function close() {
  emit("update:modelValue", false);
  emit("close");
}

function reset() {
  mode.value = "ALL";
  copy.value = "QTY_MOMD";
  q.value = "";
  for (const k of Object.keys(picked)) delete picked[k];
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset();
  }
);

function fmtMoney0(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

type Row = {
  id: string;
  title: string;
  contractLabel: string;
  status: string;
  pvMoy: number;
  ebit: number;
};

function pnlTitleOf(p: any) {
  return String(p?.title ?? p?.name ?? `PNL #${String(p?.id ?? "").slice(0, 6)}`);
}
function contractLabelOf(c: any) {
  const d = (c as any)?.dureeMois ?? null;
  const id = String((c as any)?.id ?? "");
  return d != null ? `Contrat #${id.slice(0, 6)} — ${d} mois` : `Contrat #${id.slice(0, 6)}`;
}

const rows = computed<Row[]>(() => {
  const p = store.activePnl as any;
  if (!p) return [];

  const out: Row[] = [];

  for (const c of p?.contracts ?? []) {
    const cLabel = contractLabelOf(c);
    const dureeMois = Number(c?.dureeMois ?? 0);

    for (const v of c?.variants ?? []) {
      const vid = String(v?.id ?? "");
      if (!vid) continue;

      if (props.sourceVariantId && vid === String(props.sourceVariantId)) continue;

      const kpis = computeHeaderKpis(v, dureeMois);

const pvMoy = Number(kpis?.prixMoyenM3 ?? 0);
const ebit  = Number(kpis?.ebitTotal ?? 0);


      out.push({
        id: vid,
        title: String(v?.title ?? "—"),
        contractLabel: cLabel,
        status: String(v?.status ?? "—"),
        pvMoy,
        ebit,
      });
    }
  }

  const needle = q.value.trim().toLowerCase();
  const filtered = !needle
    ? out
    : out.filter((r) => {
        const hay = `${r.title} ${r.contractLabel} ${r.status} ${r.id}`.toLowerCase();
        return hay.includes(needle);
      });

  return filtered.sort((a, b) => a.title.localeCompare(b.title));
});


const allIds = computed(() => rows.value.map((r) => r.id));
const selectedIds = computed(() =>
  rows.value
    .map((r) => r.id)
    .filter((id) => !!picked[id])
);

function toggleAll(v: boolean) {
  for (const r of rows.value) picked[r.id] = v;
}

function submit() {
  const ids = mode.value === "ALL" ? allIds.value : selectedIds.value;
  if (!ids.length) return;

  emit("apply", { mode: mode.value, variantIds: ids, copy: copy.value });
}

/* ESC to close (optionnel mais agréable) */
function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return;
  if (e.key === "Escape") close();
}
window.addEventListener("keydown", onKeydown);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <!-- ✅ Teleport: garantit un overlay au-dessus de tout (stacking context) -->
  <teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="head">
          <div class="ttl">
            <div class="h">Généraliser — {{ sectionLabel }}</div>
            <div class="s">
              <span class="pill">Source: <b class="mono">#{{ (sourceVariantId || "").slice(0, 8) }}</b></span>
              <span class="pill">Cibles: <b>{{ allIds.length }}</b></span>
              <span class="pill" :class="mode === 'ALL' ? 'pri' : ''">Mode: <b>{{ modeLabel }}</b></span>
            </div>
          </div>
          <button class="x" type="button" @click="close" aria-label="Fermer">✕</button>
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

            <input class="in" v-model="q" :disabled="mode === 'ALL'" placeholder="Filtrer variantes…" />
          </div>

          <div class="copyBox">
            <div class="copyTitle">Données à copier</div>

            <label class="radio line">
              <input type="radio" value="ZERO" v-model="copy" />
              <span><b>Formules seulement</b> (Qté = 0, MOMD = 0)</span>
            </label>

            <label class="radio line">
              <input type="radio" value="QTY_ONLY" v-model="copy" />
              <span><b>Formules + Qté</b> (Qté copiée, MOMD = 0)</span>
            </label>

            <label class="radio line">
              <input type="radio" value="MOMD_ONLY" v-model="copy" />
              <span><b>Formules + MOMD</b> (Qté = 0, MOMD copié)</span>
            </label>

            <label class="radio line">
              <input type="radio" value="QTY_MOMD" v-model="copy" />
              <span><b>Formules + Qté + MOMD</b> (copie complète)</span>
            </label>
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

            <div
              v-for="r in rows"
              :key="r.id"
              class="row"
              :class="mode === 'ALL' ? 'disabledPick' : ''"
              @click="mode !== 'ALL' && (picked[r.id] = !picked[r.id])"
            >
              <div class="c1">
                <input type="checkbox" :disabled="mode === 'ALL'" v-model="picked[r.id]" @click.stop />
              </div>

              <div class="c2">
                <div class="nm">{{ r.title }}</div>
                <div class="id muted mono">#{{ r.id.slice(0, 8) }}</div>
              </div>

              <div class="c3 muted">{{ r.contractLabel }}</div>
              <div class="c4 right mono">{{ fmtMoney0(r.pvMoy) }}</div>
              <div class="c5 right mono strong">{{ fmtMoney0(r.ebit) }}</div>

              <div class="c6">
                <span class="tag">{{ r.status }}</span>
              </div>
            </div>
          </div>

          <div v-if="mode === 'SELECT' && rows.length" class="miniActions">
            <button class="btn xs" type="button" @click="toggleAll(true)">Tout cocher</button>
            <button class="btn xs" type="button" @click="toggleAll(false)">Tout décocher</button>
          </div>
        </div>

        <div class="foot">
          <div class="footLeft muted" v-if="allIds.length">
            <span v-if="mode === 'ALL'">Cibles: <b>{{ allIds.length }}</b> variantes</span>
            <span v-else>Cibles: <b>{{ selectedIds.length }}</b> / {{ allIds.length }}</span>
          </div>
          <div class="footRight">
            <button class="btn" type="button" @click="close">Annuler</button>
            <button
              class="btnPrimary"
              type="button"
              @click="submit"
              :disabled="!allIds.length || (mode === 'SELECT' && !selectedIds.length)"
            >
              Généraliser
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  /* ✅ au-dessus du HeaderDashboard (exigé > 100000) */
  z-index: 120000;
}

.modal {
  width: min(980px, 96vw);
  max-height: 84vh;
  overflow: auto;
  background: #fff;
  border: 1px solid rgba(16, 24, 40, 0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.35);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  z-index: 2;
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
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: rgba(15, 23, 42, 0.55);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 900;
}
.pill.pri {
  border-color: rgba(24, 64, 112, 0.35);
  background: rgba(24, 64, 112, 0.08);
  color: rgba(24, 64, 112, 1);
}

.x {
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  width: 36px;
  height: 34px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
}
.x:hover {
  background: rgba(2, 132, 199, 0.08);
  border-color: rgba(2, 132, 199, 0.18);
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
  gap: 14px;
  flex-wrap: wrap;
}
.radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 950;
  font-size: 12px;
  color: #111827;
  user-select: none;
}
.radio input {
  width: 16px;
  height: 16px;
}
.spacer {
  flex: 1 1 auto;
}
.in {
  width: min(340px, 92vw);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 9px 10px;
  outline: none;
  font-size: 12px;
}
.in:focus {
  border-color: #111827;
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.12);
}
.in:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.copyBox {
  border: 1px solid rgba(24, 64, 112, 0.14);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.55) 0%, rgba(255, 255, 255, 0.92) 45%);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.copyTitle {
  font-size: 11.5px;
  font-weight: 950;
  color: #111827;
}
.line {
  align-items: flex-start;
}

.empty {
  border: 1px solid #eef2f7;
  background: #fcfcfd;
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 12px;
  color: #6b7280;
  font-weight: 900;
}

.list {
  border: 1px solid rgba(16, 24, 40, 0.12);
  border-radius: 14px;
  overflow: hidden;
}
.listHead,
.row {
  display: grid;
  grid-template-columns: 42px 1.1fr 1.1fr 0.6fr 0.6fr 0.6fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}
.listHead {
  background: rgba(24, 64, 112, 0.05);
  border-bottom: 1px solid rgba(16, 24, 40, 0.1);
  font-size: 11px;
  font-weight: 950;
  color: #374151;
}
.row {
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: rgba(15, 23, 42, 0.03);
}
.row.disabledPick {
  opacity: 0.55;
  cursor: not-allowed;
}
.row.disabledPick:hover {
  background: #fff;
}
.row.disabledPick input {
  cursor: not-allowed;
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
.muted {
  color: #6b7280;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.strong {
  font-weight: 950;
}
.right {
  text-align: right;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  font-size: 10px;
  color: #374151;
}

.miniActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.foot {
  border-top: 1px solid rgba(16, 24, 40, 0.1);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  position: sticky;
  bottom: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
}

.footLeft {
  font-size: 11.5px;
  font-weight: 900;
}
.footRight {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn,
.btnPrimary {
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.04);
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 950;
  font-size: 12px;
}
.btn:hover {
  background: rgba(2, 132, 199, 0.08);
  border-color: rgba(2, 132, 199, 0.18);
}
.btnPrimary {
  border-color: rgba(24, 64, 112, 0.65);
  background: rgba(24, 64, 112, 0.92);
  color: #fff;
}
.btnPrimary:hover {
  background: rgba(24, 64, 112, 1);
}
.btn.xs {
  padding: 6px 9px;
  font-size: 11px;
}
</style>
