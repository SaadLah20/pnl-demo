<!-- src/pages/Variante/Sections/Formules/FormulesPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();

  // optional loaders (fallback-safe)
  try {
    if (!store.formulesCatalogue?.length && (store as any).loadFormulesCatalogue) {
      await (store as any).loadFormulesCatalogue();
    }
  } catch {}
  try {
    if (!store.mpCatalogue?.length && (store as any).loadMpCatalogue) {
      await (store as any).loadMpCatalogue();
    }
  } catch {}
});

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function liters(v: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(toNum(v));
}

/* =========================
   ACTIVE
========================= */
const pnl = computed(() => store.activePnl);
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const pnlTitle = computed(() => pnl.value?.title ?? "—");
const contractLabel = computed(() => {
  const d = (contract.value as any)?.dureeMois ?? null;
  return d != null ? `Contrat ${String((contract.value as any)?.id ?? "").slice(0, 6)} — ${d} mois` : "—";
});
const variantTitle = computed(() => (variant.value as any)?.title ?? "—");

/* =========================
   ROWS (variant formules)
========================= */
type FormuleRow = {
  id: string; // variantFormuleId
  formuleId: string;
  label: string;
  resistance: string;
  city: string;
  region: string;
  raw: any;
};

const rows = computed<FormuleRow[]>(() => {
  const items = (variant.value as any)?.formules?.items ?? (variant.value as any)?.variantFormules ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((it: any) => {
    const f = it?.formule ?? {};
    return {
      id: String(it?.id ?? ""),
      formuleId: String(it?.formuleId ?? f?.id ?? ""),
      label: String(f?.label ?? ""),
      resistance: String(f?.resistance ?? ""),
      city: String(f?.city ?? ""),
      region: String(f?.region ?? ""),
      raw: it,
    };
  });
});

function getItemsRaw(r: FormuleRow): any[] {
  return r?.raw?.formule?.items ?? [];
}

/* =========================
   Sorting MP: Ciment -> Granulas -> Adjuvant -> Others
========================= */
function normKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function catRank(catRaw: any): number {
  const c = normKey(catRaw);
  if (c === "ciment") return 0;

  if (
    c === "granulats" ||
    c === "granulat" ||
    c === "granulas" ||
    c === "granula" ||
    c.includes("granul")
  )
    return 1;

  if (c === "adjuvant") return 2;

  return 9;
}

function sortedItems(r: FormuleRow) {
  const items = getItemsRaw(r).slice();
  items.sort((a: any, b: any) => {
    const ra = catRank(a?.mp?.categorie);
    const rb = catRank(b?.mp?.categorie);
    if (ra !== rb) return ra - rb;

    // tie-breaker: keep stable, but sort by label to be deterministic
    const la = String(a?.mp?.label ?? "").toLowerCase();
    const lb = String(b?.mp?.label ?? "").toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  return items;
}

/* =========================
   CMP (composition)
========================= */
function cmpPerM3(r: FormuleRow): number {
  let total = 0;
  for (const it of getItemsRaw(r)) {
    const qtyKg = toNum(it?.qty ?? 0);
    const prixT = toNum(it?.mp?.prix ?? 0);
    total += (qtyKg / 1000) * prixT;
  }
  return total;
}

/* =========================
   Volume verifier (fallback-safe)
   Σ kg/ρ + eau(C*0.5)/1 + 15L ; target 1000L ; low if <97%
   ρ from category:
    - ciment: 3.1
    - granulats/granulas/...: 2.65
    - adjuvant: 1.1
========================= */
function getRhoFromCategorie(catRaw: any): number | null {
  const c = normKey(catRaw);
  if (c === "ciment") return 3.1;
  if (
    c === "granulats" ||
    c === "granulat" ||
    c === "granulas" ||
    c === "granula" ||
    c.includes("granul")
  )
    return 2.65;
  if (c === "adjuvant") return 1.1;
  return null;
}

type ItemDraft = { mpId: string; qty: number };

function normalizeItems(items: ItemDraft[]): ItemDraft[] {
  const map = new Map<string, number>();
  for (const it of items ?? []) {
    const mpId = String(it.mpId ?? "").trim();
    if (!mpId) continue;
    const qty = Number(it.qty ?? 0);
    map.set(mpId, (map.get(mpId) ?? 0) + qty);
  }
  return [...map.entries()].map(([mpId, qty]) => ({ mpId, qty }));
}

function getMpById(mpId: string): any | null {
  const list = store.mpCatalogue ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const found = list.find((x: any) => String(x?.id ?? "") === String(mpId));
  return found ?? null;
}

function compositionStatsFor(r: FormuleRow) {
  const raw = getItemsRaw(r) ?? [];
  const rawItems: Array<ItemDraft & { mpInline?: any }> = raw.map((x: any) => ({
    mpId: String(x?.mpId ?? x?.mp?.id ?? ""),
    qty: toNum(x?.qty ?? 0),
    mpInline: x?.mp ?? null,
  }));

  const withKeys = rawItems.map((x, idx) => ({
    ...x,
    mpId: x.mpId?.trim() ? x.mpId : `__missing_${idx}`,
  }));
  const cleaned = normalizeItems(withKeys);

  let mCiment = 0;
  let vTotal = 0;
  const missing: Array<{ mpId: string; label: string }> = [];

  const inlineById = new Map<string, any>();
  for (const it of withKeys) {
    if (it.mpInline && it.mpId) inlineById.set(String(it.mpId), it.mpInline);
  }

  for (const it of cleaned) {
    const mpFromCatalogue = getMpById(String(it.mpId));
    const mpInline = inlineById.get(String(it.mpId)) ?? null;
    const mp = mpFromCatalogue ?? mpInline ?? null;

    const rho = getRhoFromCategorie(mp?.categorie);

    if (!rho) {
      missing.push({
        mpId: String(it.mpId),
        label: `${mp?.categorie ?? "—"} — ${mp?.label ?? "—"}`,
      });
      continue;
    }

    const m = Number(it.qty ?? 0); // kg
    vTotal += m / rho;

    if (normKey(mp?.categorie) === "ciment") mCiment += m;
  }

  const mEau = mCiment * 0.5;
  const vEau = mEau / 1.0;

  vTotal += vEau;
  vTotal += 15;

  const target = 1000;
  const delta = vTotal - target;
  const deficitPct = target > 0 ? ((target - vTotal) / target) * 100 : 0;

  const isLow = vTotal < target * 0.97;
  const isOk = !isLow;
  const statusLabel = isLow ? `⚠️ -${liters(deficitPct)}%` : `✅ OK`;

  return {
    vTotal,
    target,
    delta,
    vEau,
    missing,
    deficitPct,
    isLow,
    isOk,
    statusLabel,
  };
}

/* =========================
   UI: expand
========================= */
const open = reactive<Record<string, boolean>>({});

function toggle(r: FormuleRow) {
  open[r.id] = !open[r.id];
}
function openAll() {
  for (const r of rows.value) open[r.id] = true;
}
function closeAll() {
  for (const r of rows.value) open[r.id] = false;
}
function isOpen(r: FormuleRow) {
  return !!open[r.id];
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="title">
        <div class="h1">Formules — Composition & CMP</div>
        <div class="muted">
          Composition triée : <b>Ciment</b> → <b>Granulas</b> → <b>Adjuvant</b>. Quantités mises en avant.
        </div>
      </div>

      <div class="topActions">
        <button class="btn" @click="store.loadPnls()">Recharger</button>
        <button class="btnSm" @click="openAll()" :disabled="!variant">Tout ouvrir</button>
        <button class="btnSm" @click="closeAll()" :disabled="!variant">Tout fermer</button>
      </div>
    </div>

    <div v-if="store.loading" class="panel">Chargement…</div>
    <div v-else-if="store.error" class="panel error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div class="panel">
        <div class="meta">
          <div class="metaRow"><span class="muted">P&L:</span> <b class="clip">{{ pnlTitle }}</b></div>
          <div class="metaRow"><span class="muted">Contrat:</span> <b class="clip">{{ contractLabel }}</b></div>
          <div class="metaRow"><span class="muted">Variante:</span> <b class="clip">{{ variantTitle }}</b></div>
        </div>
      </div>

      <div class="panel" v-if="!variant">
        <div class="muted">Aucune variante active. Sélectionne une variante depuis le Dashboard.</div>
      </div>

      <template v-else>
        <div class="panel slim">
          <div class="bar">
            <div class="barLeft">
              <div class="h2">Formules ({{ rows.length }})</div>
              <div class="muted tiny">CMP = Σ((kg/m³ ÷ 1000) × DH/t) • Volume = Σ(kg/ρ) + Eau(C×0,5) + 15L</div>
            </div>
          </div>
        </div>

        <div class="panel" v-if="rows.length === 0">
          <div class="muted">Aucune formule dans la variante.</div>
        </div>

        <div v-else class="cards">
          <div v-for="r in rows" :key="r.id" class="card">
            <button class="rowHead" @click="toggle(r)">
              <div class="left">
                <span class="chev">{{ isOpen(r) ? "▾" : "▸" }}</span>
                <span class="name">{{ r.label || "—" }}</span>
                <span class="chip">{{ r.resistance || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ r.city || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ r.region || "—" }}</span>
              </div>

              <div class="right">
                <div class="cmpBox">
                  <span class="cmpLbl">CMP</span>
                  <span class="cmpVal">{{ n(cmpPerM3(r)) }}</span>
                </div>

                <template v-if="getItemsRaw(r).length">
                  <div class="pills">
                    <span class="pill">V <b>{{ liters(compositionStatsFor(r).vTotal) }}</b>L</span>
                    <span class="pill" :class="{ ok: compositionStatsFor(r).isOk, low: compositionStatsFor(r).isLow }">
                      {{ compositionStatsFor(r).statusLabel }}
                    </span>
                  </div>
                </template>
              </div>
            </button>

            <div v-if="isOpen(r)" class="body">
              <template v-if="getItemsRaw(r).length">
                <div v-if="compositionStatsFor(r).isLow" class="banner error">
                  ⚠️ Volume <b>{{ liters(compositionStatsFor(r).vTotal) }} L</b> &lt; cible <b>{{ compositionStatsFor(r).target }} L</b>
                  (déficit <b>{{ liters(compositionStatsFor(r).deficitPct) }}%</b>).
                </div>
                <div v-else class="banner ok">
                  ✅ Volume OK (±3%) — <b>{{ liters(compositionStatsFor(r).vTotal) }} L</b> pour cible <b>{{ compositionStatsFor(r).target }} L</b>.
                </div>

                <div v-if="compositionStatsFor(r).missing.length" class="banner warn">
                  MP sans ρ :
                  <span v-for="m in compositionStatsFor(r).missing" :key="m.mpId" class="miniTag">{{ m.label }}</span>
                </div>
              </template>

              <div class="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>MP</th>
                      <th class="c">Cat.</th>
                      <!-- ✅ Qty is the main info now -->
                      <th class="r qtyCol">kg/m³</th>
                      <th class="r">DH/t</th>
                      <th class="r">DH/m³</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr v-for="it in sortedItems(r)" :key="it.id">
                      <td class="mpCell">
                        <b class="mpName">{{ it?.mp?.label ?? "—" }}</b>
                        <span class="mpMuted">{{ it?.mp?.fournisseur ?? "" }}</span>
                      </td>

                      <td class="c">
                        <span class="catPill" :data-rank="catRank(it?.mp?.categorie)">
                          {{ it?.mp?.categorie ?? "—" }}
                        </span>
                      </td>

                      <!-- ✅ QUANTITY VERY VISIBLE -->
                      <td class="r qtyCell">
                        <span class="qtyBig">{{ n(it?.qty ?? 0, 0) }}</span>
                        <span class="qtyUnit">kg/m³</span>
                      </td>

                      <td class="r">{{ n(it?.mp?.prix ?? 0) }}</td>

                      <td class="r">
                        <b>{{ n((toNum(it?.qty ?? 0) / 1000) * toNum(it?.mp?.prix ?? 0)) }}</b>
                      </td>
                    </tr>

                    <tr v-if="sortedItems(r).length === 0">
                      <td colspan="5" class="muted pad">Aucune MP dans cette formule.</td>
                    </tr>
                  </tbody>

                  <tfoot>
                    <tr>
                      <td colspan="4" class="tfootLbl">Total CMP (DH/m³)</td>
                      <td class="r"><b>{{ n(cmpPerM3(r)) }}</b></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div class="note">
                Eau (info) : <b>{{ liters(compositionStatsFor(r).vEau) }}</b> L/m³ — Formule calculée depuis la composition (kg/m³) et les prix MP (DH/t).
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

/* top */
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}
.topActions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.h1 {
  font-size: 16px;
  font-weight: 900;
  line-height: 1.1;
  margin: 0;
}
.h2 {
  font-size: 13px;
  font-weight: 900;
  margin: 0;
}
.muted {
  color: #6b7280;
  font-size: 12px;
}
.tiny {
  font-size: 10.5px;
  color: #6b7280;
}

/* panel */
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 10px 12px;
}
.panel.slim {
  padding: 8px 10px;
}
.panel.error {
  border-color: #ef4444;
  background: #fff5f5;
}
.meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
}
.metaRow {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 520px;
}
.clip {
  display: inline-block;
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* buttons */
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}
.btn:hover {
  background: #f9fafb;
}
.btnSm {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}
.btnSm:hover {
  background: #f9fafb;
}

/* cards */
.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}

/* ultra compact row */
.rowHead {
  width: 100%;
  border: 0;
  background: #fff;
  cursor: pointer;
  padding: 8px 10px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
  text-align: left;
}
.rowHead:hover {
  background: #f9fafb;
}
.left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.chev {
  color: #6b7280;
  width: 16px;
  display: inline-block;
  flex: 0 0 auto;
}
.name {
  font-weight: 900;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 380px;
}
.chip {
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fafafa;
  color: #374151;
  font-weight: 900;
  flex: 0 0 auto;
}
.dot {
  opacity: 0.5;
  flex: 0 0 auto;
}
.sub {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

/* right side: pack in one line */
.right {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
}
.cmpBox {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fafafa;
  line-height: 1;
}
.cmpLbl {
  font-size: 10.5px;
  color: #6b7280;
  font-weight: 900;
}
.cmpVal {
  font-size: 12.5px;
  font-weight: 900;
  color: #111827;
}
.pills {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 11px;
  color: #374151;
  font-weight: 900;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  line-height: 1;
}
.pill.ok {
  border-color: rgba(0, 122, 51, 0.55);
  background: rgba(236, 253, 245, 0.65);
  color: #065f46;
}
.pill.low {
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(254, 242, 242, 0.8);
  color: #991b1b;
}

/* body */
.body {
  border-top: 1px solid #e5e7eb;
  padding: 10px;
}

/* banners */
.banner {
  font-size: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.banner.error {
  border-color: #ef4444;
  background: #fff5f5;
}
.banner.warn {
  border-color: #f59e0b;
  background: #fffbeb;
}
.banner.ok {
  border-color: rgba(0, 122, 51, 0.55);
  background: rgba(236, 253, 245, 0.65);
  color: #065f46;
}
.miniTag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 11px;
  margin-left: 6px;
}

/* table */
.tableWrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.table th,
.table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px;
  vertical-align: middle;
}
.table th {
  background: #fafafa;
  color: #6b7280;
  font-size: 11px;
}
.r {
  text-align: right;
}
.c {
  text-align: center;
}
.pad {
  padding: 10px 0;
}
tfoot td {
  background: #fafafa;
  border-bottom: 0;
}
.tfootLbl {
  color: #6b7280;
  font-size: 11px;
  font-weight: 900;
}

/* MP cell compact */
.mpCell {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.mpName {
  font-size: 12px;
}
.mpMuted {
  font-size: 11px;
  color: #6b7280;
}

/* ✅ qty highlight */
.qtyCol {
  width: 150px;
}
.qtyCell {
  white-space: nowrap;
}
.qtyBig {
  font-size: 16px;
  font-weight: 950;
  letter-spacing: -0.2px;
  color: #111827;
}
.qtyUnit {
  font-size: 11px;
  font-weight: 900;
  color: #6b7280;
  margin-left: 6px;
}

/* category pill */
.catPill {
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 11px;
  font-weight: 900;
  color: #374151;
}
.catPill[data-rank="0"] {
  background: #f3f4f6;
}
.catPill[data-rank="1"] {
  background: #fffbeb;
  border-color: rgba(245, 158, 11, 0.35);
}
.catPill[data-rank="2"] {
  background: #eff6ff;
  border-color: rgba(59, 130, 246, 0.25);
}

/* note */
.note {
  margin-top: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  font-size: 12px;
}

/* responsive */
@media (max-width: 980px) {
  .sub {
    display: none;
  }
  .name {
    max-width: 260px;
  }
  .pills {
    display: none;
  }
  .qtyCol {
    width: 130px;
  }
  .qtyBig {
    font-size: 15px;
  }
}
</style>
