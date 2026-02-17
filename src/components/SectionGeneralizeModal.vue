<!-- src/components/SectionGeneralizeModal.vue (FICHIER COMPLET / ✅ confirm step + ✅ no blur overlay) -->
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

/* ✅ confirmation step (inside modal) */
const confirmStep = ref(false);

function close() {
  emit("update:modelValue", false);
  emit("close");
}

function reset() {
  mode.value = "ALL";
  copy.value = "QTY_MOMD";
  q.value = "";
  confirmStep.value = false;
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

      // exclude source
      if (props.sourceVariantId && vid === String(props.sourceVariantId)) continue;

      const kpis = computeHeaderKpis(v, dureeMois);
      const pvMoy = Number(kpis?.prixMoyenM3 ?? 0);
      const ebit = Number(kpis?.ebitTotal ?? 0);

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
const selectedIds = computed(() => rows.value.map((r) => r.id).filter((id) => !!picked[id]));

function toggleAll(v: boolean) {
  for (const r of rows.value) picked[r.id] = v;
}

const targetIds = computed(() => (mode.value === "ALL" ? allIds.value : selectedIds.value));
const targetCount = computed(() => targetIds.value.length);

function copyLabelLocal(c: CopyPreset) {
  if (c === "ZERO") return "Section seulement (tout à 0)";
  if (c === "QTY_ONLY") return "Quantités seulement (MOMD=0)";
  if (c === "MOMD_ONLY") return "MOMD seulement (m³=0)";
  return "Quantités + MOMD";
}

/* ✅ Step 1: open confirm */
function submit() {
  const ids = targetIds.value;
  if (!ids.length) return;
  confirmStep.value = true;
}

/* ✅ Step 2: confirm apply */
function confirmApply() {
  const ids = targetIds.value;
  if (!ids.length) return;
  emit("apply", { mode: mode.value, variantIds: ids, copy: copy.value });
  close();
}

/* ESC to close + ESC to go back from confirm */
function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return;
  if (e.key === "Escape") {
    if (confirmStep.value) confirmStep.value = false;
    else close();
  }
}
window.addEventListener("keydown", onKeydown);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="confirmStep ? (confirmStep = false) : close()" role="dialog" aria-modal="true">
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

          <button class="x" type="button" @click="confirmStep ? (confirmStep = false) : close()" aria-label="Fermer">✕</button>
        </div>

        <!-- =========================
             STEP 1 (selection)
        ========================= -->
        <div v-if="!confirmStep" class="body">
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
              <span><b>Section seulement</b> (Qté = 0, MOMD = 0)</span>
            </label>

            <label class="radio line">
              <input type="radio" value="QTY_ONLY" v-model="copy" />
              <span><b>Section + Qté</b> (Qté copiée, MOMD = 0)</span>
            </label>

            <label class="radio line">
              <input type="radio" value="MOMD_ONLY" v-model="copy" />
              <span><b>Section + MOMD</b> (Qté = 0, MOMD copié)</span>
            </label>

            <label class="radio line">
              <input type="radio" value="QTY_MOMD" v-model="copy" />
              <span><b>Section + Qté + MOMD</b> (copie complète)</span>
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

        <!-- =========================
             STEP 2 (confirmation)
        ========================= -->
        <div v-else class="body">
          <div class="confirmBox">
            <div class="confirmTitle">Confirmer la généralisation</div>

            <div class="confirmLine">
              <span class="k">Section</span>
              <span class="v"><b>{{ sectionLabel }}</b></span>
            </div>
            <div class="confirmLine">
              <span class="k">Mode</span>
              <span class="v">{{ mode === "ALL" ? "Toutes les variantes" : "Sélection" }}</span>
            </div>
            <div class="confirmLine">
              <span class="k">Cibles</span>
              <span class="v"><b>{{ targetCount }}</b> variante(s)</span>
            </div>
            <div class="confirmLine">
              <span class="k">Copie</span>
              <span class="v">{{ copyLabelLocal(copy) }}</span>
            </div>

            <div class="warn">
              ⚠️ Cette action va <b>remplacer</b> la section sur les variantes cibles.
            </div>
          </div>
        </div>

        <div class="foot">
          <div class="footLeft muted" v-if="allIds.length && !confirmStep">
            <span v-if="mode === 'ALL'">Cibles: <b>{{ allIds.length }}</b> variantes</span>
            <span v-else>Cibles: <b>{{ selectedIds.length }}</b> / {{ allIds.length }}</span>
          </div>

          <div class="footRight">
            <button class="btn" type="button" @click="confirmStep ? (confirmStep = false) : close()">
              {{ confirmStep ? "Retour" : "Annuler" }}
            </button>

            <button
              v-if="!confirmStep"
              class="btnPrimary"
              type="button"
              @click="submit"
              :disabled="!allIds.length || (mode === 'SELECT' && !selectedIds.length)"
            >
              Généraliser
            </button>

            <button v-else class="btnDanger" type="button" @click="confirmApply" :disabled="!targetCount">
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
/* ✅ overlay sans blur (comme tes autres pages) */
.ov{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.28);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 18px;
  z-index: 120000;
}

.modal{
  width: min(980px, 96vw);
  max-height: 84vh;
  overflow: auto;
  background:#fff;
  border:1px solid rgba(16,24,40,0.14);
  border-radius: 18px;
  box-shadow: 0 26px 80px rgba(15,23,42,0.18);
}

.head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(16,24,40,0.10);
  position: sticky;
  top:0;
  background:#fff;
  z-index: 2;
}

.ttl{ display:flex; flex-direction:column; gap:2px; }
.h{ font-weight:950; font-size:14px; color:#111827; }
.s{
  margin-top: 2px;
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  font-size:11px;
  color: rgba(15,23,42,0.55);
}
.pill{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding: 3px 9px;
  border-radius: 999px;
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.03);
  font-weight:900;
}
.pill.pri{
  border-color: rgba(24, 64, 112, 0.35);
  background: rgba(24, 64, 112, 0.08);
  color: rgba(24, 64, 112, 1);
}

.x{
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  width: 36px;
  height: 34px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 900;
}
.x:hover{ background: rgba(15,23,42,0.07); }

.body{
  padding: 12px 16px;
  display:flex;
  flex-direction:column;
  gap:10px;
}

.modeRow{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.radio{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-weight:950;
  font-size:12px;
  color:#111827;
  user-select:none;
}
.radio input{ width:16px; height:16px; }
.radio.line{
  width: 100%;
  padding: 8px 10px;
  border-radius: 12px;
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.02);
}
.spacer{ flex: 1 1 auto; }

.in{
  width: min(340px, 92vw);
  border:1px solid #e5e7eb;
  border-radius: 12px;
  padding: 9px 10px;
  outline:none;
  font-size:12px;
}
.in:focus{ border-color:#111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.12); }
.in:disabled{ opacity:.55; cursor:not-allowed; }

.copyBox{
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.02);
  border-radius: 14px;
  padding: 10px;
}
.copyTitle{ font-weight: 950; font-size: 12px; margin-bottom: 8px; color:#111827; }

.empty{
  border:1px dashed rgba(226,232,240,0.9);
  border-radius: 14px;
  padding: 12px;
  color: rgba(15,23,42,0.62);
  font-weight: 900;
  font-size: 12px;
}

.list{
  border:1px solid rgba(226,232,240,0.9);
  border-radius: 14px;
  background: rgba(15,23,42,0.02);
  padding: 10px;
}
.listHead{
  display:grid;
  grid-template-columns: 40px 1.1fr 1.2fr 0.6fr 0.6fr 0.6fr;
  gap:10px;
  padding: 0 8px 6px;
  font-size: 10.5px;
  font-weight: 950;
  color: rgba(15,23,42,0.62);
}
.row{
  display:grid;
  grid-template-columns: 40px 1.1fr 1.2fr 0.6fr 0.6fr 0.6fr;
  gap:10px;
  align-items:center;
  background:#fff;
  border:1px solid rgba(226,232,240,0.9);
  border-radius: 12px;
  padding: 9px 10px;
  cursor:pointer;
}
.row + .row{ margin-top: 8px; }
.row:hover{ background: rgba(15,23,42,0.02); }
.disabledPick{ opacity: .75; cursor: default; }

.right{ text-align:right; }
.muted{ color: rgba(15,23,42,0.62); }
.mono{ font-variant-numeric: tabular-nums; }
.strong{ font-weight: 950; }

.nm{ font-weight: 950; font-size: 12px; color:#111827; }
.id{ font-size: 11px; margin-top: 1px; }
.tag{
  display:inline-flex;
  align-items:center;
  padding: 2px 8px;
  border-radius: 999px;
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.03);
  font-size: 10.5px;
  font-weight: 900;
  color: rgba(15,23,42,0.62);
  white-space:nowrap;
}

.miniActions{
  display:flex;
  gap:8px;
  justify-content:flex-end;
}

.btn{
  border:1px solid rgba(16,24,40,0.12);
  background:#fff;
  padding: 9px 12px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 950;
  font-size: 12px;
}
.btn:hover{ background: rgba(15,23,42,0.03); }
.btn.xs{ padding: 7px 10px; font-size: 11px; }

.foot{
  border-top: 1px solid rgba(16,24,40,0.10);
  padding: 12px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  position: sticky;
  bottom: 0;
  background:#fff;
}
.footLeft{ font-size: 12px; }
.footRight{ display:flex; gap:8px; }

.btnPrimary{
  border:1px solid rgba(15,23,42,0.85);
  background: rgba(15,23,42,0.92);
  color:#fff;
  padding: 9px 12px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 950;
  font-size: 12px;
}
.btnPrimary:disabled{ opacity:.55; cursor:not-allowed; }

.btnDanger{
  border:1px solid #fecaca;
  background:#fff5f5;
  color:#7f1d1d;
  padding: 9px 12px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 950;
  font-size: 12px;
}
.btnDanger:disabled{ opacity:.55; cursor:not-allowed; }

.confirmBox{
  border:1px solid rgba(226,232,240,0.9);
  background: rgba(15,23,42,0.02);
  border-radius: 14px;
  padding: 12px;
}
.confirmTitle{ font-weight: 950; font-size: 13px; color:#111827; margin-bottom: 10px; }
.confirmLine{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(226,232,240,0.9);
  font-size: 12px;
}
.confirmLine:last-of-type{ border-bottom: 0; }
.confirmLine .k{ color: rgba(15,23,42,0.62); font-weight: 900; }
.confirmLine .v{ color:#111827; font-weight: 950; }
.warn{
  margin-top: 10px;
  border:1px solid #fde68a;
  background:#fffbeb;
  color:#92400e;
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 900;
}
</style>
